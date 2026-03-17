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
const TILES = {
  mapa: L.tileLayer(
    'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_labels_under/{z}/{x}/{y}{r}.png',
    { attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 20, minZoom: 8 }
  ),
  orto: L.tileLayer(
    'https://ags.cuzk.cz/arcgis1/rest/services/ORTOFOTO_WM/MapServer/tile/{z}/{y}/{x}',
    { attribution: '© <a href="https://www.cuzk.cz" target="_blank">ČÚZK</a> Ortofotomapa ČR', maxZoom: 20, minZoom: 8 }
  ),
};

const ORTO_FALLBACK = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { attribution: '© Esri World Imagery (záloha)', maxZoom: 20, minZoom: 8 }
);

let activeTile         = 'mapa';
let ortoFallbackActive = false;

// Automatický fallback pokud ČÚZK nereaguje
TILES.orto.on('tileerror', () => {
  if (!ortoFallbackActive && activeTile === 'orto') {
    console.warn('ČÚZK ortofoto nedostupné, přepínám na Esri zálohu');
    ortoFallbackActive = true;
    map.removeLayer(TILES.orto);
    ORTO_FALLBACK.addTo(map);
    badge('⚠️ ČÚZK ortofoto nedostupné — použit Esri World Imagery');
  }
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
  document.getElementById('tbtn-' + key).className = 'tbtn on';
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
