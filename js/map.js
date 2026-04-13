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

// Popisky ulic nad ortofoto — CartoDB labels-only (průhledné, bez obrysů)
const ORTO_LABELS = L.tileLayer(
  'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png',
  {
    attribution: '',
    subdomains: 'abcd',
    maxZoom: 20, minZoom: 8,
    opacity: 0.8,
    crossOrigin: 'anonymous',
    zIndex: 200,
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

function _parseLeafletTranslate(transform) {
  if (!transform || transform === 'none') return null;

  let m = transform.match(/translate3d\(\s*(-?[\d.]+)px,\s*(-?[\d.]+)px,\s*(-?[\d.]+)px\s*\)/i);
  if (m) return { x: parseFloat(m[1]), y: parseFloat(m[2]) };

  m = transform.match(/translate\(\s*(-?[\d.]+)px(?:,\s*(-?[\d.]+)px)?\s*\)/i);
  if (m) return { x: parseFloat(m[1]), y: parseFloat(m[2] || '0') };

  m = transform.match(/matrix\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(',').map(v => parseFloat(v.trim()));
    if (
      p.length === 6 &&
      Math.abs(p[0] - 1) < 0.0001 &&
      Math.abs(p[1]) < 0.0001 &&
      Math.abs(p[2]) < 0.0001 &&
      Math.abs(p[3] - 1) < 0.0001
    ) {
      return { x: p[4], y: p[5] };
    }
    return null;
  }

  m = transform.match(/matrix3d\(([^)]+)\)/i);
  if (m) {
    const p = m[1].split(',').map(v => parseFloat(v.trim()));
    if (
      p.length === 16 &&
      Math.abs(p[0] - 1) < 0.0001 &&
      Math.abs(p[1]) < 0.0001 &&
      Math.abs(p[4]) < 0.0001 &&
      Math.abs(p[5] - 1) < 0.0001 &&
      Math.abs(p[10] - 1) < 0.0001 &&
      Math.abs(p[15] - 1) < 0.0001
    ) {
      return { x: p[12], y: p[13] };
    }
  }

  return null;
}

function _shiftCloneElement(clonedDoc, el, dx, dy) {
  const view = clonedDoc.defaultView;
  const cs = view ? view.getComputedStyle(el) : el.style;
  el.style.left = `${_toPxNumber(cs.left) + dx}px`;
  el.style.top = `${_toPxNumber(cs.top) + dy}px`;
  el.style.transform = 'none';
}

function _normalizeLeafletClone(clonedDoc, clonedMap, mapW, mapH) {
  const view = clonedDoc.defaultView;
  if (!view) return;

  // 1. Získáme hlavní posun mapy (map-pane)
  const mapPane = clonedMap.querySelector('.leaflet-map-pane');
  let mapDx = 0;
  let mapDy = 0;

  if (mapPane) {
    const tr = _parseLeafletTranslate(view.getComputedStyle(mapPane).transform || mapPane.style.transform);
    if (tr) {
      mapDx = tr.x;
      mapDy = tr.y;
      // Vynulujeme transformaci map-pane, aby html2canvas nepočítal posun dvakrát
      mapPane.style.transform = 'none';
      mapPane.style.left = '0px';
      mapPane.style.top = '0px';
    }
  }

  // 2. Zrušíme ořezy na všech panelech a nastavíme jim velikost mapy
  clonedMap.querySelectorAll('.leaflet-pane, .leaflet-map-pane, .leaflet-tile-pane, .leaflet-overlay-pane, .leaflet-marker-pane, .leaflet-shadow-pane, .leaflet-popup-pane, .leaflet-tooltip-pane')
    .forEach(el => {
      el.style.overflow = 'visible';
      el.style.width = mapW + 'px';
      el.style.height = mapH + 'px';
      el.style.transform = 'none';
      el.style.left = '0px';
      el.style.top = '0px';
    });

  // 3. Oprava pro SVG vrstvy (fialové budovy)
  clonedMap.querySelectorAll('.leaflet-overlay-pane svg').forEach(svg => {
    // Leaflet dává SVG transformaci (posun)
    const tr = _parseLeafletTranslate(svg.style.transform);
    const dx = (tr ? tr.x : 0) + mapDx;
    const dy = (tr ? tr.y : 0) + mapDy;

    // Nastavíme SVG na celou plochu mapy
    svg.setAttribute('width', mapW);
    svg.setAttribute('height', mapH);
    svg.setAttribute('viewBox', `0 0 ${mapW} ${mapH}`);
    svg.style.width = mapW + 'px';
    svg.style.height = mapH + 'px';
    svg.style.left = '0px';
    svg.style.top = '0px';
    svg.style.transform = 'none';
    svg.style.overflow = 'visible';

    // Posuneme vnitřní <g> o součet posunů
    const g = svg.querySelector('g');
    if (g) {
      const gTr = g.getAttribute('transform') || '';
      // Leaflet dává do <g> transform="translate(x,y)". Musíme to zkombinovat.
      let gx = 0, gy = 0;
      const m = gTr.match(/translate\(\s*(-?[\d.]+)px?,\s*(-?[\d.]+)px?\s*\)/i) || 
                gTr.match(/translate\(\s*(-?[\d.]+),\s*(-?[\d.]+)\s*\)/i);
      if (m) {
        gx = parseFloat(m[1]);
        gy = parseFloat(m[2]);
      }
      g.setAttribute('transform', `translate(${gx + dx}, ${gy + dy})`);
    }
  });

  // 4. Oprava pro dlaždice (tiles)
  clonedMap.querySelectorAll('.leaflet-tile-container').forEach(container => {
    const tr = _parseLeafletTranslate(container.style.transform);
    const dx = (tr ? tr.x : 0) + mapDx;
    const dy = (tr ? tr.y : 0) + mapDy;

    // Posuneme každou dlaždici o posun kontejneru + posun mapy
    container.querySelectorAll('.leaflet-tile').forEach(tile => {
      const tileTr = _parseLeafletTranslate(tile.style.transform);
      const tx = (tileTr ? tileTr.x : 0) + dx;
      const ty = (tileTr ? tileTr.y : 0) + dy;
      
      tile.style.left = (parseFloat(tile.style.left) || 0) + tx + 'px';
      tile.style.top = (parseFloat(tile.style.top) || 0) + ty + 'px';
      tile.style.transform = 'none';
    });
    container.style.transform = 'none';
    container.style.left = '0px';
    container.style.top = '0px';
  });

  // 5. Oprava pro markery
  clonedMap.querySelectorAll('.leaflet-marker-icon, .leaflet-marker-shadow').forEach(marker => {
    const tr = _parseLeafletTranslate(marker.style.transform);
    const dx = (tr ? tr.x : 0) + mapDx;
    const dy = (tr ? tr.y : 0) + mapDy;

    marker.style.left = (parseFloat(marker.style.left) || 0) + dx + 'px';
    marker.style.top = (parseFloat(marker.style.top) || 0) + dy + 'px';
    marker.style.transform = 'none';
  });

  // 6. Oprava pro popupy (velmi opatrně, aby se nerozbilo zarovnání)
  clonedMap.querySelectorAll('.leaflet-popup').forEach(popup => {
    const tr = _parseLeafletTranslate(popup.style.transform);
    const dx = (tr ? tr.x : 0) + mapDx;
    const dy = (tr ? tr.y : 0) + mapDy;

    popup.style.display = 'block';
    popup.style.opacity = '1';
    popup.style.visibility = 'visible';
    popup.style.zIndex = '1000';
    
    // Použijeme transformaci pro posun popupu, aby se zachovala jeho vnitřní logika
    popup.style.transform = `translate(${dx}px, ${dy}px)`;
  });
}

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

  const prevVis = hide.map(el => el.style.visibility);
  hide.forEach(el => el.style.visibility = 'hidden');

  try {
    const mapContainer = document.getElementById('map');
    if (!mapContainer) throw new Error('Kontejner mapy nebyl nalezen.');

    const dpr = window.devicePixelRatio || 1;
    const mapW = mapContainer.offsetWidth;
    const mapH = mapContainer.offsetHeight;

    if (typeof html2canvas === 'undefined') {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
      document.head.appendChild(s);
      await new Promise((res, rej) => { s.onload = res; s.onerror = rej; });
    }

    await _waitForLeafletTiles(mapContainer, 4000);
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    // ── JEDINÝ KROK: html2canvas s totální sanitací klonu ──
    const canvas = await html2canvas(mapContainer, {
      useCORS: true,
      allowTaint: false, // Důležité: nesmí být true, jinak to "znečistí" canvas
      backgroundColor: null,
      scale: dpr,
      logging: false,
      width: mapW,
      height: mapH,
      ignoreElements: el => el.id === 'map-screenshot-btn',
      onclone: (clonedDoc) => {
        const clonedMap = clonedDoc.getElementById('map');
        if (!clonedMap) return;

        // 1. Ochrana proti "Tainted canvases" (znečištění canvasu) — SELEKTIVNÍ SANITACE
        // Odstraníme pouze problematické externí obrázky v popupu (CORS ochrana)
        clonedMap.querySelectorAll('.leaflet-popup img').forEach(img => {
          const src = img.src || '';
          const isLocal = src.startsWith('data:') || src.includes(window.location.hostname) || src.startsWith('/') || src.includes('blob:');
          if (!isLocal) img.remove();
        });

        // U všech zbývajících obrázků (dlaždice mapy, markery) vynutíme crossOrigin
        clonedMap.querySelectorAll('img').forEach(img => {
          img.setAttribute('crossOrigin', 'anonymous');
        });

        // 2. Původní normalizace souřadnic
        _normalizeLeafletClone(clonedDoc, clonedMap, mapW, mapH);
      }
    });

    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Nepodařilo se získat 2D kontext canvasu.');

    // Watermark
    ctx.font = `bold ${13 * dpr}px "DM Sans", sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,.8)';
    ctx.shadowColor = 'rgba(0,0,0,.5)';
    ctx.shadowBlur = 2 * dpr;
    ctx.fillText('Interaktivní mapa Bolatic', 10 * dpr, canvas.height - 10 * dpr);
    ctx.shadowBlur = 0;

    // ── BEZPEČNÝ EXPORT S FALLBACKEM ──
    let blob;
    try {
      blob = await new Promise((resolve, reject) => {
        try {
          canvas.toBlob(b => b ? resolve(b) : reject(new Error('Prázdný blob')), 'image/png');
        } catch (err) {
          reject(err);
        }
      });
    } catch (exportError) {
      console.warn('[screenshot] Standardní export selhal (tainted), zkouším nouzový režim bez obrázků...');
      
      // Pokud to selhalo, zkusíme to znovu, ale tentokrát v canvasu "vyluxujeme" vše, co by mohlo vadit.
      // (V reálu už máme canvas hotový, takže musíme zkusit exportovat jen to, co je bezpečné, 
      // nebo informovat uživatele. Ale nejlepší je zkusit toDataURL jako fallback.)
      try {
        const dataUrl = canvas.toDataURL('image/png');
        const resp = await fetch(dataUrl);
        blob = await resp.blob();
      } catch (finalError) {
        throw new Error('Snímek nelze exportovat kvůli zabezpečení prohlížeče (CORS). Zkuste zavřít popup okna s fotkami.');
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `mapa-bolatice-${new Date().toISOString().slice(0,10)}.png`;
    link.href = url;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);

  } catch(e) {
    console.warn('[screenshot]', e);
    console.error('[screenshot] detail:', e.message, e.stack);
    alert('Snímek se nepodařilo pořídit: ' + e.message);
  } finally {
    hide.forEach((el, i) => el.style.visibility = prevVis[i]);
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
