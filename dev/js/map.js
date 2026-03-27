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

// ── PŘEPNUTÍ PODKLADU ────────────────────────────────────────────
function setTile(key) {
  if (activeTile === key) return;

  if (activeTile === 'orto' && ortoFallbackActive) map.removeLayer(ORTO_FALLBACK);
  else map.removeLayer(TILES[activeTile]);

  activeTile         = key;
  ortoFallbackActive = false;
  TILES[key].addTo(map);

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
