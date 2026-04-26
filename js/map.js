'use strict';

// ── KONFIGURACE WATERMARKU ────────────────────────────────────────
// WATERMARK_MODE: 'text' = textový watermark (vždy funguje)
//                 'png'  = logo ze css/ikonky/watermark.png
//                          (GitHub Pages: same-origin, PNG načtení funguje)
const WATERMARK_MODE = 'png';
// ─────────────────────────────────────────────────────────────────

// PNG preloader — aktivní pouze při WATERMARK_MODE = 'png'
let _wmCanvas = null;
(function _preloadWatermark() {
  if (WATERMARK_MODE !== 'png') return;
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.onload = () => {
    const dpr = window.devicePixelRatio || 1;
    const h = 70, scale = h / img.naturalHeight, w = img.naturalWidth * scale;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * dpr); c.height = Math.ceil(h * dpr);
    const x = c.getContext('2d');
    x.scale(dpr, dpr);
    x.globalAlpha = 0.88;
    x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 3;
    x.drawImage(img, 0, 0, w, h);
    _wmCanvas = c;
  };
  img.onerror = () => console.info('[watermark] PNG nedostupné, použije se text');
  img.src = 'css/ikonky/watermark.png';
})();

// ════════════════════════════════════════════════════════════════
//  map.js — Inicializace Leaflet mapy a podkladových vrstev
// ════════════════════════════════════════════════════════════════

const mapCRS = L.CRS.EPSG3857;
const _rotatePlugin = (typeof L !== 'undefined') && (typeof L.Map.prototype.getBearing === 'function');

const map = L.map('map', {
  crs:          mapCRS,
  center:       [49.956, 18.078],
  zoom:         14.5,
  zoomControl:  false,
  maxZoom:      20,
  minZoom:      8,
  ...(_rotatePlugin ? {
    rotate:          true,
    bearing:         0,
    touchRotate:     true,
    shiftKeyRotate:  true,
  } : {}),
});

L.control.zoom ({ position: 'bottomright' }).addTo(map);
L.control.scale({ position: 'bottomleft', imperial: false, metric: true }).addTo(map);

map.on('dblclick', (e) => {
  if (typeof msrOn !== 'undefined' && msrOn) return;
  e.originalEvent.preventDefault();
  const z = map.getZoom();
  const zout = e.originalEvent.ctrlKey || e.originalEvent.altKey || e.originalEvent.shiftKey;
  map.setZoomAround(e.containerPoint, z + (zout ? -1 : 1), { animate: true, duration: 0.3 });
});
map.doubleClickZoom.disable();
map.scrollWheelZoom.enable();
if (_rotatePlugin && map.keyboard) map.keyboard.enable();

// ── HIERARCHIE VRSTEV A ROTACE ──────────────────────────────────
// Vytvoření labelsPane a jeho přesun do rotate-pane pro identickou rotaci
map.createPane('labelsPane');
const labelsPane = map.getPane('labelsPane');
labelsPane.style.zIndex = '450'; // Nad fialovou vrstvou (400)
labelsPane.style.pointerEvents = 'none';

// Oprava rotace — přesun labelsPane do stejného rodiče jako overlayPane
const overlayPane = map.getPane('overlayPane');
if (overlayPane && overlayPane.parentNode) {
  overlayPane.parentNode.appendChild(labelsPane);
}

map.createPane('measurePane');
const measureEl = map.getPane('measurePane');
measureEl.style.zIndex = '425';

// Oprava rotace — přesun measurePane do stejného rodiče jako overlayPane
if (overlayPane && overlayPane.parentNode) {
  overlayPane.parentNode.appendChild(measureEl);
}

map.createPane('navPane');
map.getPane('navPane').style.zIndex = '460';
map.getPane('navPane').style.pointerEvents = 'none';

map.getPane('markerPane').style.zIndex = '600';
map.getPane('popupPane').style.zIndex = '700';

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
    { attribution: '© OpenStreetMap © CARTO', subdomains: 'abcd', maxZoom: 20, minZoom: 8, crossOrigin: 'anonymous' }
  ),
  orto: L.tileLayer(
    ORTO_URL,
    {
      attribution: '© <a href="https://www.cuzk.cz" target="_blank" rel="noopener">ČÚZK</a> Ortofotomapa ČR',
      maxZoom: 20, minZoom: 8, crossOrigin: 'anonymous'
    }
  ),
};

const ORTO_FALLBACK = L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  { attribution: '© Esri World Imagery (záloha)', maxZoom: 20, minZoom: 8, crossOrigin: 'anonymous' }
);

// Popisky ulic + čísla budov nad ortofoto
const ORTO_LABELS = L.tileLayer(
  'https://tiles.stadiamaps.com/tiles/stamen_toner_labels/{z}/{x}/{y}{r}.png?api_key=94a324d5-95c3-4059-9bbf-abce14f4b362',
  {
    attribution: '© Stamen Design, © OpenStreetMap, © Stadia Maps',
    maxZoom: 20, minZoom: 8,
    opacity: 0.85,
    crossOrigin: 'anonymous',
    pane: 'labelsPane'
  }
);

let activeTile = 'mapa';
let ortoFallbackActive = false;
let ortoRestoreTimer = null;
let ortoRetryDelay = 12000;
let ortoProbeBusy = false;
const ORTO_RETRY_MAX = 60000;

TILES.orto.on('tileerror', () => {
  if (activeTile !== 'orto' || ortoFallbackActive) return;
  console.warn('ČÚZK ortofoto nedostupné, přepínám na Esri zálohu');
  ortoFallbackActive = true;
  map.removeLayer(TILES.orto);
  ORTO_FALLBACK.addTo(map);
  if (typeof badge === 'function') badge('⚠️ ČÚZK ortofoto nedostupné — záloha Esri');
  const scheduleRestoreProbe = () => {
    if (!ortoFallbackActive || activeTile !== 'orto' || ortoRestoreTimer || ortoProbeBusy) return;
    ortoRestoreTimer = setTimeout(() => {
      ortoRestoreTimer = null;
      if (!ortoFallbackActive || activeTile !== 'orto' || ortoProbeBusy) return;
      ortoProbeBusy = true;
      const z = Math.max(map.getZoom(), 8);
      const p = map.project(map.getCenter(), z).divideBy(256).floor();
      const probeUrl = ORTO_URL.replace('{z}', z).replace('{x}', p.x).replace('{y}', p.y);
      const probe = new Image();
      probe.onload = () => {
        ortoProbeBusy = false;
        if (!ortoFallbackActive || activeTile !== 'orto') return;
        map.removeLayer(ORTO_FALLBACK);
        TILES.orto.addTo(map);
        ortoFallbackActive = false;
        ortoRetryDelay = 12000;
        if (typeof badge === 'function') badge('✅ ČÚZK ortofoto obnoveno');
        if (typeof qgisLayers !== 'undefined') qgisLayers.forEach(l => { if (l.visible && l.leaflet) l.leaflet.bringToFront(); });
        if (typeof poiGroup !== 'undefined') poiGroup.bringToFront();
      };
      probe.onerror = () => {
        ortoProbeBusy = false;
        ortoRetryDelay = Math.min(Math.round(ortoRetryDelay * 1.5), ORTO_RETRY_MAX);
        scheduleRestoreProbe();
      };
      probe.src = `${probeUrl}?_=${Date.now()}`;
    }, ortoRetryDelay);
  };
  scheduleRestoreProbe();
});

TILES.mapa.addTo(map);
map.setMaxZoom(20);

function setTile(key) {
  if (activeTile === key) return;
  if (activeTile === 'orto' && ortoFallbackActive) map.removeLayer(ORTO_FALLBACK);
  else map.removeLayer(TILES[activeTile]);
  activeTile = key;
  ortoFallbackActive = false;
  TILES[key].addTo(map);
  map.setMaxZoom(key === 'orto' ? 19 : 20);
  if (key === 'orto') { if (!map.hasLayer(ORTO_LABELS)) ORTO_LABELS.addTo(map); }
  else { if (map.hasLayer(ORTO_LABELS)) map.removeLayer(ORTO_LABELS); }
  if (typeof qgisLayers !== 'undefined') qgisLayers.forEach(l => { if (l.visible && l.leaflet) l.leaflet.bringToFront(); });
  if (typeof poiGroup !== 'undefined') poiGroup.bringToFront();
  document.querySelectorAll('.tbtn').forEach(b => b.className = 'tbtn off');
  const _tbtn = document.getElementById('tbtn-' + key);
  if (_tbtn) _tbtn.className = 'tbtn on';
  if (typeof _syncLsTileBtn === 'function') _syncLsTileBtn();
}

function lsTileToggle() {
  const next = (activeTile === 'mapa') ? 'orto' : 'mapa';
  setTile(next);
  _syncLsTileBtn();
}
function _syncLsTileBtn() {
  const btn = document.getElementById('ls-tile-btn');
  if (btn) btn.textContent = (activeTile === 'mapa') ? '🗺 Mapa' : '🛰 Ortofoto';
}

// ── WATERMARK — canvas-drawn, bottom-left, designer quality ──────
function _drawWatermark(ctx, canvasW, canvasH, dpr) {
  ctx.save();

  const pad   = 14 * dpr;
  const r     = 8  * dpr;  // border-radius
  const lineH = 15 * dpr;

  // Fonts
  const fzMain = 11 * dpr;
  const fzSub  =  9 * dpr;
  const txtMain = 'BOLATICE';
  const txtSub  = 'interaktivní mapa obce';
  const txtYear = String(new Date().getFullYear());

  ctx.font = `800 ${fzMain}px "Syne", "DM Sans", Arial, sans-serif`;
  const wMain = ctx.measureText(txtMain).width;
  ctx.font = `400 ${fzSub}px "DM Sans", Arial, sans-serif`;
  const wSub  = ctx.measureText(txtSub).width;
  ctx.font = `600 ${fzSub}px "DM Sans", Arial, sans-serif`;
  const wYear = ctx.measureText(txtYear).width;

  const innerW = Math.max(wMain, wSub + wYear + 8 * dpr) + 20 * dpr;
  const innerH = lineH * 2 + 14 * dpr;

  const bx = pad;
  const by = canvasH - innerH - pad;

  // Pill background — frosted glass feel
  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.lineTo(bx + innerW - r, by);
  ctx.quadraticCurveTo(bx + innerW, by, bx + innerW, by + r);
  ctx.lineTo(bx + innerW, by + innerH - r);
  ctx.quadraticCurveTo(bx + innerW, by + innerH, bx + innerW - r, by + innerH);
  ctx.lineTo(bx + r, by + innerH);
  ctx.quadraticCurveTo(bx, by + innerH, bx, by + innerH - r);
  ctx.lineTo(bx, by + r);
  ctx.quadraticCurveTo(bx, by, bx + r, by);
  ctx.closePath();
  ctx.fillStyle = 'rgba(10, 14, 26, 0.72)';
  ctx.fill();

  // Accent left bar
  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(bx, by + r, 3 * dpr, innerH - 2 * r);

  // Main title
  ctx.font = `800 ${fzMain}px "Syne", "DM Sans", Arial, sans-serif`;
  ctx.letterSpacing = `${1.5 * dpr}px`;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = 'rgba(0,0,0,0.5)';
  ctx.shadowBlur  = 2 * dpr;
  ctx.fillText(txtMain, bx + 12 * dpr, by + lineH + 4 * dpr);

  // Subtitle
  ctx.font = `400 ${fzSub}px "DM Sans", Arial, sans-serif`;
  ctx.letterSpacing = '0px';
  ctx.fillStyle = 'rgba(148,163,184,0.9)';
  ctx.shadowBlur = 0;
  ctx.fillText(txtSub, bx + 12 * dpr, by + lineH * 2 + 3 * dpr);

  // Year — right side of subtitle
  ctx.font = `600 ${fzSub}px "DM Sans", Arial, sans-serif`;
  ctx.fillStyle = '#3b82f6';
  ctx.fillText(txtYear, bx + innerW - wYear - 10 * dpr, by + lineH * 2 + 3 * dpr);

  ctx.restore();
}

// ── POMOCNÉ FUNKCE PRO SCREENSHOT ────────────────────────────────

function _parseLeafletTranslate(transformStr) {
  if (!transformStr || transformStr === 'none') return null;
  const m3d = transformStr.match(/translate3d\(\s*(-?[\d.]+)px?,\s*(-?[\d.]+)px?,\s*(-?[\d.]+)px?\s*\)/i);
  if (m3d) return { x: parseFloat(m3d[1]), y: parseFloat(m3d[2]) };
  const m2d = transformStr.match(/translate\(\s*(-?[\d.]+)px?,\s*(-?[\d.]+)px?\s*\)/i);
  if (m2d) return { x: parseFloat(m2d[1]), y: parseFloat(m2d[2]) };
  const mMat = transformStr.match(/matrix\(\s*1,\s*0,\s*0,\s*1,\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\)/i);
  if (mMat) return { x: parseFloat(mMat[1]), y: parseFloat(mMat[2]) };
  return null;
}

/**
 * Normalizace pro pokročilý režim (IS DMVS)
 * Opravuje posun dlaždic, SVG vrstvy a markerů.
 */
function _normalizeForISDMVS(clonedDoc, clonedMap, mapW, mapH) {
  const view = clonedDoc.defaultView;
  const mapPane = clonedMap.querySelector('.leaflet-map-pane');
  let mapDx = 0, mapDy = 0;
  
  if (mapPane) {
    const tr = _parseLeafletTranslate(view.getComputedStyle(mapPane).transform || mapPane.style.transform);
    if (tr) {
      mapDx = tr.x; mapDy = tr.y;
      mapPane.style.transform = 'none'; mapPane.style.left = '0px'; mapPane.style.top = '0px';
    }
  }

  // Oprava tile pane (dlaždice)
  const tilePane = clonedMap.querySelector('.leaflet-tile-pane');
  if (tilePane) {
    const tr = _parseLeafletTranslate(tilePane.style.transform);
    const dx = (tr ? tr.x : 0) + mapDx; const dy = (tr ? tr.y : 0) + mapDy;
    tilePane.style.transform = 'none'; tilePane.style.left = '0px'; tilePane.style.top = '0px';
    tilePane.querySelectorAll('img').forEach(img => {
      const iTr = _parseLeafletTranslate(img.style.transform);
      img.style.left = (parseFloat(img.style.left) || 0) + (iTr ? iTr.x : 0) + dx + 'px';
      img.style.top = (parseFloat(img.style.top) || 0) + (iTr ? iTr.y : 0) + dy + 'px';
      img.style.transform = 'none';
    });
  }

  // Oprava overlay pane (SVG vrstvy)
  const overlayPane = clonedMap.querySelector('.leaflet-overlay-pane');
  if (overlayPane) {
    const tr = _parseLeafletTranslate(overlayPane.style.transform);
    const dx = (tr ? tr.x : 0) + mapDx; const dy = (tr ? tr.y : 0) + mapDy;
    overlayPane.style.transform = 'none'; overlayPane.style.left = '0px'; overlayPane.style.top = '0px';
    overlayPane.querySelectorAll('svg').forEach(svg => {
      const sTr = _parseLeafletTranslate(svg.style.transform);
      const svgDx = (sTr ? sTr.x : 0) + dx; const svgDy = (sTr ? sTr.y : 0) + dy;
      svg.setAttribute('width', mapW); svg.setAttribute('height', mapH);
      svg.setAttribute('viewBox', `0 0 ${mapW} ${mapH}`);
      svg.style.width = mapW + 'px'; svg.style.height = mapH + 'px';
      svg.style.left = '0px'; svg.style.top = '0px'; svg.style.transform = 'none';
      const g = svg.querySelector('g');
      if (g) {
        const gTr = g.getAttribute('transform') || '';
        let gx = 0, gy = 0;
        const m = gTr.match(/translate\(\s*(-?[\d.]+)px?,\s*(-?[\d.]+)px?\s*\)/i) || gTr.match(/translate\(\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\)/i);
        if (m) { gx = parseFloat(m[1]); gy = parseFloat(m[2]); }
        g.setAttribute('transform', `translate(${gx + svgDx}, ${gy + svgDy})`);
      }
    });
  }

  // Oprava markerů
  clonedMap.querySelectorAll('.leaflet-marker-icon, .leaflet-marker-shadow').forEach(marker => {
    const tr = _parseLeafletTranslate(marker.style.transform);
    marker.style.left = (parseFloat(marker.style.left) || 0) + (tr ? tr.x : 0) + mapDx + 'px';
    marker.style.top = (parseFloat(marker.style.top) || 0) + (tr ? tr.y : 0) + mapDy + 'px';
    marker.style.transform = 'none';
  });

  // Odstranění popupů v pokročilém režimu
  clonedMap.querySelectorAll('.leaflet-popup').forEach(p => p.remove());
}

/**
 * Normalizace pro výchozí režim
 * Opravuje posun dlaždic, overlay vrstev, markerů a popupů.
 */
function _normalizeForDefault(clonedDoc, clonedMap, mapW, mapH) {
  const view = clonedDoc.defaultView;
  const mapPane = clonedMap.querySelector('.leaflet-map-pane');
  let mapDx = 0, mapDy = 0;
  
  if (mapPane) {
    const tr = _parseLeafletTranslate(view.getComputedStyle(mapPane).transform || mapPane.style.transform);
    if (tr) { 
      mapDx = tr.x; mapDy = tr.y; 
      mapPane.style.transform = 'none'; mapPane.style.left = '0px'; mapPane.style.top = '0px'; 
    }
  }

  // Oprava tile pane (dlaždice)
  const tilePane = clonedMap.querySelector('.leaflet-tile-pane');
  if (tilePane) {
    const tr = _parseLeafletTranslate(tilePane.style.transform);
    const dx = (tr ? tr.x : 0) + mapDx; const dy = (tr ? tr.y : 0) + mapDy;
    tilePane.style.transform = 'none'; tilePane.style.left = '0px'; tilePane.style.top = '0px';
    tilePane.querySelectorAll('img').forEach(img => {
      const iTr = _parseLeafletTranslate(img.style.transform);
      img.style.left = (parseFloat(img.style.left) || 0) + (iTr ? iTr.x : 0) + dx + 'px';
      img.style.top = (parseFloat(img.style.top) || 0) + (iTr ? iTr.y : 0) + dy + 'px';
      img.style.transform = 'none';
    });
  }

  // Oprava overlay pane (SVG vrstvy)
  const overlayPane = clonedMap.querySelector('.leaflet-overlay-pane');
  if (overlayPane) {
    const tr = _parseLeafletTranslate(overlayPane.style.transform);
    const dx = (tr ? tr.x : 0) + mapDx; const dy = (tr ? tr.y : 0) + mapDy;
    overlayPane.style.transform = 'none'; overlayPane.style.left = '0px'; overlayPane.style.top = '0px';
    overlayPane.querySelectorAll('svg').forEach(svg => {
      const sTr = _parseLeafletTranslate(svg.style.transform);
      svg.style.left = (parseFloat(svg.style.left) || 0) + (sTr ? sTr.x : 0) + dx + 'px';
      svg.style.top = (parseFloat(svg.style.top) || 0) + (sTr ? sTr.y : 0) + dy + 'px';
      svg.style.transform = 'none';
    });
  }

  // Oprava markerů a popupů
  clonedMap.querySelectorAll('.leaflet-marker-icon, .leaflet-marker-shadow, .leaflet-popup').forEach(el => {
    const tr = _parseLeafletTranslate(el.style.transform);
    if (el.classList.contains('leaflet-popup')) { 
      el.style.display = 'block'; el.style.opacity = '1'; el.style.visibility = 'visible'; 
    }
    el.style.left = (parseFloat(el.style.left) || 0) + (tr ? tr.x : 0) + mapDx + 'px';
    el.style.top = (parseFloat(el.style.top) || 0) + (tr ? tr.y : 0) + mapDy + 'px';
    el.style.transform = 'none';
  });
}

// ── SCREENSHOT MAPY ──────────────────────────────────────────────
async function mapScreenshot() {
  const btn = document.getElementById('map-screenshot-btn');
  if (btn) { btn.style.opacity = '.3'; btn.style.pointerEvents = 'none'; }

  const hide = [
    'header', '#sidebar', '#fab-col', '#dbadge', '#msr-panel',
    '#nav-widget', '#nav-pick-btn', '#nav-confirm', '#nav-recenter-btn',
    '#stats-panel', '#wx-fab', '#wx-panel', '#ev-draw-panel', '#ev-fab',
    '#map-screenshot-btn', '#lightbox', '.leaflet-control-zoom',
    '.leaflet-control-scale', '#sb-handle', '#mob-search',
  ].map(s => document.querySelector(s)).filter(Boolean);

  // Skryj vrstvu událostí vždy — poloha polygonů se na snímku neshoduje
  const evHiddenLayers = [];
  if (typeof EV !== 'undefined' && EV.layer && map.hasLayer(EV.layer)) {
    map.removeLayer(EV.layer); evHiddenLayers.push(EV.layer);
  }
  if (typeof _plannedLayer !== 'undefined' && _plannedLayer && map.hasLayer(_plannedLayer)) {
    map.removeLayer(_plannedLayer); evHiddenLayers.push(_plannedLayer);
  }

  const prevVis = hide.map(el => el.style.visibility);
  hide.forEach(el => el.style.visibility = 'hidden');

  try {
    const mapContainer = document.getElementById('map');
    const dpr = window.devicePixelRatio || 1;
    const mapW = mapContainer.offsetWidth;
    const mapH = mapContainer.offsetHeight;

    // 1. Ujistíme se, že html2canvas je načten
    if (typeof html2canvas === 'undefined') {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      document.head.appendChild(s);
      await new Promise((res, rej) => { s.onload = res; s.onerror = rej; });
    }

    // 2. (watermark se kreslí na canvas textově po generování)

    // 3. Počkáme na dlaždice
    const tiles = Array.from(mapContainer.querySelectorAll('.leaflet-tile-pane img'));
    await Promise.all(tiles.map(img => {
      if (img.complete) return Promise.resolve();
      return new Promise(res => { img.onload = res; img.onerror = res; });
    }));

    // 4. Generování canvasu
    const canvas = await html2canvas(mapContainer, {
      useCORS: true, allowTaint: false, backgroundColor: null, scale: dpr, logging: false,
      width: mapW, height: mapH, ignoreElements: el => el.id === 'map-screenshot-btn',
      onclone: (clonedDoc) => {
        const clonedMap = clonedDoc.getElementById('map');
        if (!clonedMap) return;

        clonedMap.querySelectorAll('.leaflet-popup img').forEach(img => {
          const src = img.src || '';
          const isLocal = src.startsWith('data:') || src.includes(window.location.hostname) || src.startsWith('/') || src.includes('blob:');
          if (!isLocal) img.remove();
        });
        clonedMap.querySelectorAll('img').forEach(img => img.setAttribute('crossOrigin', 'anonymous'));

        const advBtn = document.getElementById('adv-btn');
        const isAdvancedMode = advBtn && advBtn.classList.contains('active');

        if (isAdvancedMode) _normalizeForISDMVS(clonedDoc, clonedMap, mapW, mapH);
        else _normalizeForDefault(clonedDoc, clonedMap, mapW, mapH);
      }
    });

    const ctx = canvas.getContext('2d');

    // 5. Watermark — text přímo na canvas
    // Watermark dle WATERMARK_MODE
    if (WATERMARK_MODE === 'png' && _wmCanvas) {
      const pad = 12 * dpr;
      ctx.drawImage(_wmCanvas, pad, canvas.height - _wmCanvas.height - pad);
    } else {
      _drawWatermark(ctx, canvas.width, canvas.height, dpr);
    }

    canvas.toBlob(blob => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `mapa-bolatice-${new Date().toISOString().slice(0,10)}.png`;
      link.href = url;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }, 'image/png');

  } catch(e) {
    console.error('[screenshot]', e);
    alert('Snímek se nepodařilo pořídit: ' + e.message);
  } finally {
    hide.forEach((el, i) => el.style.visibility = prevVis[i]);
    // Obnov vrstvy událostí
    evHiddenLayers.forEach(l => l.addTo(map));
    if (btn) { btn.style.opacity = ''; btn.style.pointerEvents = ''; }
  }
}

(function() {
  if (typeof html2canvas !== 'undefined') return;
  const s = document.createElement('script');
  s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
  s.async = true; document.head.appendChild(s);
})();
