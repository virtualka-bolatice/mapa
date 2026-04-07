'use strict';

// ════════════════════════════════════════════════════════════════
//  map.js — Inicializace Leaflet mapy a podkladových vrstev
//
//  Podkladové mapy:
//    "Mapa"    = CartoDB Positron (světlý, minimalistický)
//    "Ortofoto"= ČÚZK ORTOFOTO_WM, záloha Esri World Imagery
//
//  leaflet-rotate plugin: aktivuje se POUZE pokud CDN úspěšně načetl
//    (detekce přes L.Map.prototype.getBearing).
//    BEZ pluginu: touchRotate / 2-prsty rotace nejsou dostupné, ale
//    vše ostatní (trasa, navigace, POI) funguje normálně.
// ════════════════════════════════════════════════════════════════

// ── CRS ──────────────────────────────────────────────────────────
// Standardní Web Mercator — kompatibilní se všemi dlaždicovými službami
// (CartoDB, ČÚZK, Esri). Vlastní L.Proj.CRS způsoboval záporné souřadnice dlaždic.
const mapCRS = L.CRS.EPSG3857;

// ── Detekce leaflet-rotate pluginu ───────────────────────────────
// Plugin přidává setBearing/getBearing na L.Map.prototype.
// Kontrola se provede SYNCHRONNĚ po načtení CDN <script> tagu.
const _rotatePlugin = (typeof L !== 'undefined') &&
                      (typeof L.Map.prototype.getBearing === 'function');

// ── MAPA ─────────────────────────────────────────────────────────
const map = L.map('map', {
  crs:          mapCRS,
  center:       [49.956, 18.078],
  zoom:         14.5,
  zoomControl:  false,
  maxZoom:      20,
  minZoom:      8,
  // leaflet-rotate options — pouze pokud plugin načtený:
  ...(_rotatePlugin ? {
    rotate:          true,
    bearing:         0,
    touchRotate:     true,    // 2 prsty na mobilu = rotace + zoom
    shiftKeyRotate:  true,    // Shift + scroll kolečko = rotace na desktopu
  } : {}),
});

L.control.zoom ({ position: 'bottomright' }).addTo(map);
L.control.scale({ position: 'bottomleft', imperial: false, metric: true }).addTo(map);
// ── DVOJITÉ KLIKNUTÍ — zoom in; na mobilu long-press-dblclick = zoom out ──
// Desktop: dblclick = +1, (Ctrl/Alt)+dblclick = -1
// Mobil: standard dblclick = +1; pro oddálení použij pinch nebo zoom tlačítka
map.on('dblclick', (e) => {
  if (typeof msrOn !== 'undefined' && msrOn) return;
  e.originalEvent.preventDefault();
  const z = map.getZoom();
  const zout = e.originalEvent.ctrlKey || e.originalEvent.altKey || e.originalEvent.shiftKey;
  map.setZoomAround(e.containerPoint, z + (zout ? -1 : 1), { animate: true, duration: 0.3 });
});
map.doubleClickZoom.disable();


// ── DESKTOP WHEEL OPRAVY ─────────────────────────────────────────
// scrollWheelZoom a Shift+wheel rotace musí být explicitně povoleny.
// leaflet-rotate přebírá wheel event pro Shift+rotate, běžný wheel jde na zoom.
map.scrollWheelZoom.enable();
if (_rotatePlugin && map.keyboard) map.keyboard.enable();



// ── Navigační pane — nad tiles (400) i overlayPane, viditelná vždy ─
map.createPane('navPane');
map.getPane('navPane').style.zIndex = '450';
map.getPane('navPane').style.pointerEvents = 'none'; // kliknutí prochází přes trasu

// ── Bearing sync — pro _syncNorthBtn v nav.js ────────────────────
// leaflet-rotate plugin zajistí rotaci markerPane; POI markery mají
// rotateWithView:false takže se neotáčí automaticky.
// Nav marker rotujeme ručně přes heading.
// Proměnná _mapBearing udržuje aktuální bearing pro případné použití.
let _mapBearing = 0;

function _onMapRotate() {
  _mapBearing = (typeof map.getBearing === 'function') ? (map.getBearing() || 0) : 0;
}
_onMapRotate();

if (_rotatePlugin) {
  map.on('rotate',    _onMapRotate);
  map.on('rotateend', _onMapRotate);
}

// ── PODKLADOVÉ MAPY ──────────────────────────────────────────────
const ORTO_URL = 'https://ags.cuzk.cz/arcgis1/rest/services/ORTOFOTO_WM/MapServer/tile/{z}/{y}/{x}';

const TILES = {
  mapa: L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png',
    { attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 20, minZoom: 8 }
  ),
  orto: L.tileLayer(
    ORTO_URL,
    {
      attribution: '© <a href="https://www.cuzk.cz" target="_blank" rel="noopener">ČÚZK</a> Ortofotomapa ČR',
      maxZoom: 20,
      minZoom: 8
    }
  ),
};

const ORTO_FALLBACK = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { attribution: '© Esri World Imagery (záloha)', maxZoom: 20, minZoom: 8 }
);

let activeTile = 'mapa';
let ortoFallbackActive = false;

// řízení tichého obnovování
let ortoRestoreTimer = null;
let ortoRetryDelay = 12000;   // start: 12 s
let ortoProbeBusy = false;    // proti duplicitním probe requestům
const ORTO_RETRY_MAX = 60000; // max: 60 s

TILES.orto.on('tileerror', () => {
  if (activeTile !== 'orto' || ortoFallbackActive) return;

  console.warn('ČÚZK ortofoto nedostupné, přepínám na Esri zálohu');
  ortoFallbackActive = true;

  map.removeLayer(TILES.orto);
  ORTO_FALLBACK.addTo(map);
  badge('⚠️ ČÚZK ortofoto nedostupné — záloha Esri');

  if (ortoRestoreTimer) {
    clearTimeout(ortoRestoreTimer);
    ortoRestoreTimer = null;
  }

  const scheduleRestoreProbe = () => {
    if (!ortoFallbackActive || activeTile !== 'orto') return;
    if (ortoRestoreTimer || ortoProbeBusy) return;

    ortoRestoreTimer = setTimeout(() => {
      ortoRestoreTimer = null;
      if (!ortoFallbackActive || activeTile !== 'orto' || ortoProbeBusy) return;

      ortoProbeBusy = true;

      const z = Math.max(map.getZoom(), 8);
      const p = map.project(map.getCenter(), z).divideBy(256).floor();
      const probeUrl = ORTO_URL
        .replace('{z}', z)
        .replace('{x}', p.x)
        .replace('{y}', p.y);

      // tichý probe bez zásahu do UI
      const probe = new Image();
      probe.onload = () => {
        ortoProbeBusy = false;
        if (!ortoFallbackActive || activeTile !== 'orto') return;

        if (ortoRestoreTimer) {
          clearTimeout(ortoRestoreTimer);
          ortoRestoreTimer = null;
        }

        map.removeLayer(ORTO_FALLBACK);
        TILES.orto.addTo(map);
        ortoFallbackActive = false;
        ortoRetryDelay = 12000;

        badge('✅ ČÚZK ortofoto obnoveno');
        qgisLayers.forEach(l => { if (l.visible && l.leaflet) l.leaflet.bringToFront(); });
        poiGroup.bringToFront();
      };

      probe.onerror = () => {
        ortoProbeBusy = false;
        if (!ortoFallbackActive || activeTile !== 'orto') return;

        // adaptivní zpomalení, aby se síť zbytečně netahala
        ortoRetryDelay = Math.min(Math.round(ortoRetryDelay * 1.5), ORTO_RETRY_MAX);
        scheduleRestoreProbe();
      };

      probe.src = `${probeUrl}?_=${Date.now()}`;
    }, ortoRetryDelay);
  };

  scheduleRestoreProbe();
});

TILES.mapa.addTo(map);
map.setMaxZoom(20); // počáteční maxZoom pro mapu

// ── PŘEPNUTÍ PODKLADU ────────────────────────────────────────────
function setTile(key) {
  if (activeTile === key) return;

  if (activeTile === 'orto' && ortoFallbackActive) map.removeLayer(ORTO_FALLBACK);
  else map.removeLayer(TILES[activeTile]);

  activeTile         = key;
  ortoFallbackActive = false;
  TILES[key].addTo(map);

  // Dynamické maxZoom podle vrstvy — ortofoto omezeno na 18
  map.setMaxZoom(key === 'orto' ? 19 : 20);

  // QGIS vrstvy zpět navrch
  qgisLayers.forEach(l => { if (l.visible && l.leaflet) l.leaflet.bringToFront(); });
  poiGroup.bringToFront();

  document.querySelectorAll('.tbtn').forEach(b => b.className = 'tbtn off');
  const _tbtn = document.getElementById('tbtn-' + key);
  if (_tbtn) _tbtn.className = 'tbtn on';
  if (typeof _syncLsTileBtn === 'function') _syncLsTileBtn();
}


// ── LANDSCAPE TILE TOGGLE ─────────────────────────────────────────
function lsTileToggle() {
  const next = (activeTile === 'mapa') ? 'orto' : 'mapa';
  setTile(next);
  _syncLsTileBtn();
}
function _syncLsTileBtn() {
  const btn = document.getElementById('ls-tile-btn');
  if (btn) btn.textContent = (activeTile === 'mapa') ? '🗺 Mapa' : '🛰 Ortofoto';
}

// ── SCREENSHOT MAPY ──────────────────────────────────────────────
// Pořídí čistý snímek bez UI prvků pomocí Leaflet canvas/SVG capture
async function mapScreenshot() {
  const btn = document.getElementById('map-screenshot-btn');
  if (btn) { btn.style.opacity = '.3'; btn.style.pointerEvents = 'none'; }

  // Skryj všechny UI prvky nad mapou
  const hide = [
    'header', '#sidebar', '#fab-col', '#dbadge', '#msr-panel',
    '#nav-widget', '#nav-pick-btn', '#nav-confirm', '#nav-recenter-btn',
    '#stats-panel', '#wx-fab', '#wx-panel', '#ev-draw-panel', '#ev-fab',
    '#map-screenshot-btn', '#lightbox', '.leaflet-control-zoom',
    '.leaflet-control-scale', '#sb-handle', '#mob-search',
  ].map(s => document.querySelector(s)).filter(Boolean);

  const prevVis = hide.map(el => el.style.visibility);
  hide.forEach(el => el.style.visibility = 'hidden');

  // Krátká pauza pro rerender
  await new Promise(r => setTimeout(r, 120));

  try {
    // leaflet-image není dostupný — použijeme html2canvas přes CDN nebo nativní approach
    // Nejspolehlivější: tileLayer canvas kombinace
    const mapContainer = document.getElementById('map');
    const w = mapContainer.offsetWidth;
    const h = mapContainer.offsetHeight;

    // Zkusíme html2canvas dynamicky načíst
    if (typeof html2canvas === 'undefined') {
      const script = document.createElement('script');
      script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      document.head.appendChild(script);
      await new Promise((res, rej) => { script.onload = res; script.onerror = rej; });
    }

    const canvas = await html2canvas(mapContainer, {
      useCORS:       true,
      allowTaint:    false,
      backgroundColor: null,
      scale:         window.devicePixelRatio || 1,
      logging:       false,
      ignoreElements: el => el.id === 'map-screenshot-btn',
    });

    // Přidej watermark
    const ctx = canvas.getContext('2d');
    ctx.font = 'bold 13px DM Sans, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.fillText('Interaktivní mapa Bolatic', 10, canvas.height - 10);

    // Stáhnout
    const link = document.createElement('a');
    link.download = `mapa-bolatice-${new Date().toISOString().slice(0,10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();

  } catch(e) {
    console.warn('[screenshot] Chyba:', e);
    alert('Snímek se nepodařilo pořídit. Použij Ctrl+PrintScreen pro ruční snímek.');
  } finally {
    hide.forEach((el, i) => el.style.visibility = prevVis[i]);
    if (btn) { btn.style.opacity = ''; btn.style.pointerEvents = ''; }
  }
}
