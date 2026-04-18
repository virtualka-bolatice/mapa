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



// ── HIERARCHIE VRSTEV (PANES) ────────────────────────────────────
// Leaflet výchozí panes (v pořadí z-index):
//   tilePane(200) < overlayPane(400) < shadowPane(500) < markerPane(600) < popupPane(700)
//
// Naše vrstvení:
//   IS DMVS polygony = overlayPane (400)
//   Stadia Maps popisky = shadowPane (500) — rotuje s mapou, nad IS DMVS, pod popupy
//   Navigace = navPane (550) — mezi shadowPane a markerPane
//   Měření = measurePane (650) — nad markery, pod popupy
//   Popupy = popupPane (700) — vždy navrchu
//
// shadowPane je vestavěný Leaflet pane — leaflet-rotate ho rotuje automaticky.
// Tile layer v shadowPane rotuje správně bez hacků.

map.getPane('overlayPane').style.zIndex = '400';
map.getPane('popupPane').style.zIndex   = '700';

// labelsPane: custom pane uvnitř leaflet-map-pane → rotuje s mapou (leaflet-rotate)
// z-index 450: nad overlayPane(400), pod markerPane(600) a popupPane(700)
map.createPane('labelsPane');
const _labelsEl  = map.getPane('labelsPane');
const _overlayEl = map.getPane('overlayPane');
// Přesuň labelsPane do stejného containeru jako overlayPane (leaflet-rotate-pane)
// aby rotoval s mapou stejně jako ostatní vrstvy
if (_overlayEl && _overlayEl.parentNode) {
  _overlayEl.parentNode.appendChild(_labelsEl);
}
_labelsEl.style.zIndex = '450';
_labelsEl.style.pointerEvents = 'none';

map.createPane('navPane');
map.getPane('navPane').style.zIndex = '500';
map.getPane('navPane').style.pointerEvents = 'none';

map.createPane('measurePane');
map.getPane('measurePane').style.zIndex = '650';
// ─────────────────────────────────────────────────────────────────

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
    {
      attribution: '© OpenStreetMap © CARTO',
      subdomains: 'abcd',
      maxZoom: 20,
      minZoom: 8,
      crossOrigin: 'anonymous'
    }
  ),
  orto: L.tileLayer(
    ORTO_URL,
    {
      attribution: '© <a href="https://www.cuzk.cz" target="_blank" rel="noopener">ČÚZK</a> Ortofotomapa ČR',
      maxZoom: 20,
      minZoom: 8,
      crossOrigin: 'anonymous'
    }
  ),
};

const ORTO_FALLBACK = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  {
    attribution: '© Esri World Imagery (záloha)',
    maxZoom: 20,
    minZoom: 8,
    crossOrigin: 'anonymous'
  }
);

// Popisky ulic + čísla budov nad ortofoto
// Stamen Toner Labels — černý text, bílý obrys, průhledné pozadí = max čitelnost nad ortofotem
const ORTO_LABELS = L.tileLayer(
  'https://tiles.stadiamaps.com/tiles/stamen_toner_labels/{z}/{x}/{y}{r}.png?api_key=94a324d5-95c3-4059-9bbf-abce14f4b362',
  {
    attribution: '© Stamen Design, © OpenStreetMap, © Stadia Maps',
    maxZoom: 20, minZoom: 8,
    crossOrigin: 'anonymous',
    pane: 'labelsPane',  // 450: nad IS DMVS (400), pod popupy (700), rotuje s mapou
  }
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

      probe.src = '' + probeUrl + '?_=${Date.now()}';
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

  // Popisky ulic — přidat pro ortofoto, odebrat pro mapu
  if (key === 'orto') {
    if (!map.hasLayer(ORTO_LABELS)) ORTO_LABELS.addTo(map);
  } else {
    if (map.hasLayer(ORTO_LABELS)) map.removeLayer(ORTO_LABELS);
  }

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

// ── SCREENSHOT MAPY — OPRAVA PRO LEAFLET TILES + OVERLAYE ──────────
// Leaflet při posunu používá CSS transformace. html2canvas ale některé
// vrstvy ořezává ještě před aplikací transformací. Proto v naklonované DOM
// převádíme čisté translate transformace na left/top a teprve potom renderujeme.
function _waitForLeafletTiles(root, timeout = 4000) {
  const tiles = [...root.querySelectorAll('img.leaflet-tile')]
    .filter(img => {
      const st = getComputedStyle(img);
      return st.display !== 'none' && st.visibility !== 'hidden';
    });

  if (!tiles.length) return Promise.resolve();

  return new Promise(resolve => {
    let pending = 0;
    let settled = false;
    const cleanup = [];

    const finish = () => {
      if (settled) return;
      settled = true;
      cleanup.forEach(fn => fn());
      resolve();
    };

    const doneOne = () => {
      pending -= 1;
      if (pending <= 0) finish();
    };

    tiles.forEach(img => {
      if (img.complete && img.naturalWidth > 0) return;
      pending += 1;
      const onLoad = () => doneOne();
      const onError = () => doneOne();
      img.addEventListener('load', onLoad, { once: true });
      img.addEventListener('error', onError, { once: true });
      cleanup.push(() => {
        img.removeEventListener('load', onLoad);
        img.removeEventListener('error', onError);
      });
    });

    if (pending === 0) {
      finish();
      return;
    }

    setTimeout(finish, timeout);
  });
}

function _toPxNumber(value) {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : 0;
}


async function mapScreenshot() {
  const btn = document.getElementById('map-screenshot-btn');
  if (btn) { btn.style.opacity = '.3'; btn.style.pointerEvents = 'none'; }

  const mapEl = document.getElementById('map');
  const mapW  = mapEl.offsetWidth;
  const mapH  = mapEl.offsetHeight;
  const dpr   = window.devicePixelRatio || 1;

  const hide = [
    'header','#sidebar','#fab-col','#dbadge','#msr-panel',
    '#nav-widget','#nav-pick-btn','#nav-confirm','#nav-recenter-btn',
    '#stats-panel','#wx-fab','#wx-panel','#ev-draw-panel','#ev-fab',
    '#map-screenshot-btn','#lightbox','.leaflet-control-zoom',
    '.leaflet-control-scale','#sb-handle','#mob-search',
  ].map(s => document.querySelector(s)).filter(Boolean);
  const prevVis = hide.map(el => el.style.visibility);
  hide.forEach(el => el.style.visibility = 'hidden');

  // V pokročilém režimu: skryj IS DMVS overlay před screenshotem — pozice nesedí s html2canvas
  const advOn = document.body.classList.contains('adv-on');
  let hiddenOverlay = null;
  if (advOn) {
    const overlay = mapEl.querySelector('.leaflet-overlay-pane');
    if (overlay) { hiddenOverlay = overlay; overlay.style.visibility = 'hidden'; }
  }

  try {
    if (typeof html2canvas === 'undefined') {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      document.head.appendChild(s);
      await new Promise((res, rej) => { s.onload = res; s.onerror = rej; });
    }

    const canvas = await html2canvas(mapEl, {
      useCORS:         true,
      allowTaint:      false,
      backgroundColor: null,
      scale:           dpr,
      logging:         false,
      x:               0,
      y:               0,
      scrollX:         0,
      scrollY:         0,
      width:           mapW,
      height:          mapH,
      ignoreElements:  el => el.id === 'map-screenshot-btn',
      onclone: (clonedDoc, clonedEl) => {
        // map-pane translate3d → left/top (html2canvas nezvládá translate3d)
        const mapPane = clonedEl.querySelector('.leaflet-map-pane');
        if (mapPane) {
          const m = (mapPane.style.transform || '').match(/translate3d\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px/);
          if (m) {
            mapPane.style.transform = 'none';
            mapPane.style.left = m[1] + 'px';
            mapPane.style.top  = m[2] + 'px';
          }
        }
        // Fotky v popupech — CORS
        clonedEl.querySelectorAll('.ppop-photo, .ppop-photo-wrap').forEach(el => el.remove());
        // #map overflow:hidden — popup nepřeteče
        clonedEl.style.width = mapW + 'px'; clonedEl.style.height = mapH + 'px';
        clonedEl.style.overflow = 'hidden'; clonedEl.style.position = 'relative';
      }
    });

    // Watermark s lokálním datem (ne UTC)
    const ctx = canvas.getContext('2d');
    ctx.font         = 'bold ' + (13 * dpr) + 'px "DM Sans", sans-serif';
    ctx.fillStyle    = 'rgba(255,255,255,.85)';
    ctx.shadowColor  = 'rgba(0,0,0,.55)';
    ctx.shadowBlur   = 3 * dpr;
    ctx.fillText('Interaktivní mapa Bolatic', 10 * dpr, canvas.height - 10 * dpr);
    ctx.shadowBlur   = 0;

    // Lokální datum (CET/CEST)
    const now  = new Date();
    const pad  = n => String(n).padStart(2, '0');
    const date = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate());

    canvas.toBlob(blob => {
      const url  = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = 'mapa-bolatice-' + date + '.png';
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    }, 'image/png');

  } catch(e) {
    console.error('[screenshot]', e);
    alert('Snímek se nepodařilo pořídit: ' + e.message);
  } finally {
    hide.forEach((el, i) => el.style.visibility = prevVis[i]);
    if (hiddenOverlay) hiddenOverlay.style.visibility = '';
    if (btn) { btn.style.opacity = ''; btn.style.pointerEvents = ''; }
  }
}

// Předem načti html2canvas
(function() {
  if (typeof html2canvas !== 'undefined') return;
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  s.async = true; document.head.appendChild(s);
})();
