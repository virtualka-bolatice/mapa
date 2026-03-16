'use strict';

// ════════════════════════════════════════════════════════════════
//  layers.js — IS DMVS vrstvy
//
//  Čerpá ze seznamu DMVS_LAYERS definovaného v config.js.
//  Opacity slidery se zobrazí teprve po zapnutí vrstvy (toggle ON).
// ════════════════════════════════════════════════════════════════

const qgisLayers = [];
// Čítače pro stats panel
let totalBudovy     = 0;  // počet budov
let totalParkoviste = 0;  // počet parkovišť
let totalParkArea   = 0;  // plocha parkovišť v m²
let totalHriste     = 0;  // počet hřišť
let totalCyklostezky = 0;
let totalChodniky   = 0;
let totalKomunikace = 0;
let advancedMode = false;

// ── NAČÍTÁNÍ DATA SOUBORŮ ─────────────────────────────────────────
// Načte všechny soubory z DATA_FILES (config.js) přes <script> tagy.
// Funguje na file:// i http://. Každý soubor nastaví window.json_XXX.
function _loadScriptTag(src) {
  return new Promise(resolve => {
    const s = document.createElement('script');
    s.src     = src;
    s.onload  = () => resolve(true);
    s.onerror = () => { console.warn('data soubor nenalezen:', src); resolve(false); };
    document.head.appendChild(s);
  });
}

async function loadDataFiles() {
  if (typeof DATA_FILES === 'undefined' || !DATA_FILES.length) return;
  await Promise.all(
    DATA_FILES.map(f => {
      // Přeskoč pokud proměnná již existuje (načtena staticky)
      const varName = 'json_' + f.replace(/\.js$/i, '');
      return window[varName] ? Promise.resolve(true) : _loadScriptTag('data/' + f);
    })
  );
}


// ── GEOMETRICKÉ POMOCNÉ FUNKCE ───────────────────────────────────
function calcPolygonArea(coords) {
  if (!coords || coords.length < 3) return 0;
  const R = 6371000; let area = 0; const n = coords.length;
  for (let i = 0; i < n; i++) {
    const j  = (i + 1) % n;
    const xi = coords[i][0] * Math.PI / 180, yi = coords[i][1] * Math.PI / 180;
    const xj = coords[j][0] * Math.PI / 180, yj = coords[j][1] * Math.PI / 180;
    area += (xj - xi) * (2 + Math.sin(yi) + Math.sin(yj));
  }
  return Math.abs(area * R * R / 2);
}

function formatArea(m2) {
  if (m2 < 1)     return '<1 m²';
  if (m2 < 10000) return Math.round(m2) + ' m²';
  return (m2 / 10000).toFixed(2) + ' ha';
}

function calcCentroid(coords) {
  return [
    coords.reduce((s, c) => s + c[1], 0) / coords.length,
    coords.reduce((s, c) => s + c[0], 0) / coords.length,
  ];
}

function formatDate(d) {
  if (!d) return null;
  // Regex parse prioritně — new Date() selhává na DMVS formátu "2024-04-11T17:22:32.000+02"
  const m = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  try {
    const dt = new Date(d);
    if (!isNaN(dt.getTime()))
      return `${String(dt.getDate()).padStart(2,'0')}.${String(dt.getMonth()+1).padStart(2,'0')}.${dt.getFullYear()}`;
  } catch(e) {}
  return null;
}

function genBuildingId(centroid) {
  const str = centroid[0].toFixed(7) + centroid[1].toFixed(7);
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = (h * 16777619) >>> 0; }
  return h.toString().padStart(10, '0');
}

// ── IS DMVS POPUP ────────────────────────────────────────────────
// Popup: datum vkladu → výměra → adresa (načtena async z Nominatim)
// Tlačítko: Google Mapy s adresou parcely (lepší přichycení + Street View)
function buildingPopup(feature, cfg) {
  const geom = feature.geometry;
  let area = 0, centroid = [0, 0];

  if (geom.type === 'Polygon' && geom.coordinates[0]) {
    area     = calcPolygonArea(geom.coordinates[0]);
    centroid = calcCentroid(geom.coordinates[0]);
  } else if (geom.type === 'MultiPolygon' && geom.coordinates[0]?.[0]) {
    area     = calcPolygonArea(geom.coordinates[0][0]);
    centroid = calcCentroid(geom.coordinates[0][0]);
  } else if (geom.type === 'LineString' && geom.coordinates[0]) {
    centroid = calcCentroid(geom.coordinates);
  } else if (geom.type === 'MultiLineString' && geom.coordinates[0]) {
    centroid = calcCentroid(geom.coordinates[0]);
  }

  const props  = feature.properties || {};
  const datVkl = formatDate(props.DatumVkladu || props.datum_vkladu || props.datumVkladu || null);
  const lat    = centroid[0].toFixed(6);
  const lon    = centroid[1].toFixed(6);

  return `
    <div class="bpop">
      <div class="bpop-badge" style="background:${cfg.color}18;color:${cfg.color}">⬡ ${cfg.label}</div>
      <div class="bpop-title" style="color:var(--text)">Objekt IS DMVS</div>
      <div class="bpop-div"></div>
      <div class="bpop-row"><div class="bpop-i">📅</div><div class="bpop-v" style="color:var(--text)">Vloženo: <strong>${datVkl || '<span style="color:var(--muted)">není k dispozici</span>'}</strong></div></div>
      ${area > 0
        ? `<div class="bpop-row"><div class="bpop-i">📐</div><div class="bpop-v" style="color:var(--text)">Výměra: <strong>${formatArea(area)}</strong></div></div>`
        : ''}
    </div>
    <div class="bpop-foot">
      <button class="bpop-btn bpop-btn-maps" data-lat="${lat}" data-lon="${lon}" onclick="void 0">🗺 Google Mapy</button>
    </div>`;
}

// Async doplnění adresy + aktualizace odkazu po otevření popupu
// Async: načte adresu z Nominatim a nastaví správnou Google Maps URL
// Adresa se nezobrazuje v popupu — používá se jen pro přesné přichycení špendlíku
async function _enrichBuildingPopup(popupEl) {
  const btn = popupEl.querySelector('.bpop-btn-maps');
  if (!btn || btn.dataset.loaded) return;
  btn.dataset.loaded = '1';
  const lat = btn.dataset.lat;
  const lon = btn.dataset.lon;
  // Fallback URL okamžitě — place/ formát se špendlíkem
  const fallback = 'https://www.google.com/maps/place/' + lat + ',' + lon
                 + '/@' + lat + ',' + lon + ',19z';
  btn.onclick = () => window.open(fallback, '_blank');
  try {
    const r = await fetch(
      'https://nominatim.openstreetmap.org/reverse?lat=' + lat + '&lon=' + lon
      + '&format=json&zoom=18&addressdetails=1',
      { headers: { 'Accept-Language': 'cs' } }
    );
    if (!r.ok) throw new Error();
    const d = await r.json();
    const a = d.address || {};
    const parts = [a.road, a.house_number].filter(Boolean);
    const street = parts.join(' ');
    // Všechny objekty jsou v Bolaticích — pevné město zabrání záměně s Borovou
    if (street) {
      const query = encodeURIComponent(street + ', Bolatice');
      const url   = 'https://www.google.com/maps/search/' + query + '/@' + lat + ',' + lon + ',19z';
      btn.onclick = () => window.open(url, '_blank');
    }
  } catch(e) { /* fallback platný */ }
}

// ── HIGHLIGHT ────────────────────────────────────────────────────
let hlOrigStyle = null;

function highlight(e) {
  const o = e.target.options;
  hlOrigStyle = { color: o.color, weight: o.weight, fillColor: o.fillColor, fillOpacity: o.fillOpacity, opacity: o.opacity };
  const gt = e.target.feature?.geometry?.type || '';
  if (gt.includes('Line')) e.target.setStyle({ color: '#facc15', weight: 3, opacity: 1 });
  else                     e.target.setStyle({ fillColor: '#facc15', fillOpacity: .88, color: '#facc15' });
}

function unhighlight(e) {
  if (hlOrigStyle) e.target.setStyle(hlOrigStyle);
}

// ── INICIALIZACE VRSTEV ──────────────────────────────────────────
function initQGISLayers() {
  const listEl = document.getElementById('qgis-list');

  const available = DMVS_LAYERS.filter(cfg => {
    const ok = window[cfg.varName] &&
               typeof window[cfg.varName] === 'object' &&
               Array.isArray(window[cfg.varName].features);
    if (!ok) console.warn(`layers.js: '${cfg.varName}' nenalezena — zkontroluj index.html + config.js`);
    return ok;
  });

  if (!available.length) {
    listEl.innerHTML = `<div class="qgis-empty">
      Žádná IS DMVS data.<br>
      Zkontroluj <code>&lt;script src="data/..."&gt;</code> v index.html<br>
      a <code>varName</code> v <code>js/config.js</code>.
    </div>`;
    document.getElementById('qgis-cnt').textContent = '0 vrstev';
    return;
  }

  const grpOrder = ['Objekty', 'Doprava'];
  const grouped  = {};
  available.forEach(cfg => {
    const g = cfg.group || 'Ostatní';
    if (!grouped[g]) grouped[g] = [];
    grouped[g].push(cfg);
  });
  Object.values(grouped).forEach(arr => arr.sort((a, b) => (a.prio ?? 99) - (b.prio ?? 99)));

  let totalCount = 0;

  grpOrder.forEach(grp => {
    const items = grouped[grp];
    if (!items?.length) return;

    const gh = document.createElement('div');
    gh.className = 'ql-grp'; gh.textContent = grp;
    listEl.appendChild(gh);

    items.forEach(cfg => {
      // Skryté vrstvy (např. Parkoviště linie) — nepřidávat do mapy ani UI
      if (cfg.hidden) return;

      const data     = window[cfg.varName];
      const features = (data.features || []).filter(f => f.geometry?.coordinates);
      if (!features.length) return;

      // Čítače dle varName
      if (cfg.varName === 'json_Budovy_2')           totalBudovy      += features.length;
      else if (cfg.varName === 'json_Parkoviste_plocha_5') {
        totalParkoviste += features.length;
        features.forEach(f => {
          const coords = f.geometry?.type === 'Polygon' ? f.geometry.coordinates[0]
                       : f.geometry?.type === 'MultiPolygon' ? f.geometry.coordinates[0]?.[0] : null;
          if (coords) totalParkArea += calcPolygonArea(coords);
        });
      }
      else if (cfg.varName === 'json_Hit_0')          totalHriste      += features.length;
      else if (cfg.varName === 'json_Cyklostezka_1')  totalCyklostezky += features.length;
      else if (cfg.varName === 'json_Chodniky_4')     totalChodniky    += features.length;
      else if (cfg.varName === 'json_Komunikace_3')   totalKomunikace  += features.length;

      const styleObj = {
        color:       cfg.color,
        weight:      cfg.weight      ?? 1,
        fillColor:   cfg.color,
        fillOpacity: cfg.fillOpacity ?? 0.35,
        opacity:     0.92,
        interactive: true,
      };

      const ll = L.geoJSON({ type: 'FeatureCollection', features }, {
        style: () => ({ ...styleObj }),
        pointToLayer: (f, latlng) => L.circleMarker(latlng, { ...styleObj, radius: 5 }),
        onEachFeature(feature, layer) {
          layer.on({ mouseover: highlight, mouseout: unhighlight });
          const props   = feature.properties || {};
          const hasData = Object.values(props).some(v => v !== null && v !== '');

          // Formátovaný popup + async adresa/odkaz
          layer.bindPopup(() => buildingPopup(feature, cfg), { maxWidth: 280 });
          layer.on('popupopen', () => {
            const el = layer.getPopup()?.getElement();
            if (el) _enrichBuildingPopup(el);
          });
        },
      });

      const entry = { cfg, leaflet: ll, visible: false };
      qgisLayers.push(entry);
      buildLayerUI(entry, listEl);
      totalCount++;
    });
  });

  const s = totalCount === 1 ? '1 vrstva' : totalCount < 5 ? `${totalCount} vrstvy` : `${totalCount} vrstev`;
  document.getElementById('qgis-cnt').textContent = s;

  // ── Stats panel — formátované countery ──
  const _st = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  _st('st-budovy',      totalBudovy.toLocaleString());
  _st('st-parkoviste',  totalParkoviste.toLocaleString());
  _st('st-hriste',      totalHriste.toLocaleString());
  _st('st-cyklostezky', totalCyklostezky.toLocaleString());
  _st('st-chodnik',     totalChodniky.toLocaleString());
  _st('st-komunikace',  totalKomunikace.toLocaleString());
  // Ostatní — součet pro hover badge
  _st('st-ostatni-sum', (totalHriste + totalCyklostezky + totalChodniky + totalKomunikace).toLocaleString());
  // POI counter se plní v poi.js

  // Pohled řízen center+zoom v map.js — fitBounds odstraněn
}

// ── UI ŘÁDEK VRSTVY ──────────────────────────────────────────────
function buildLayerUI(entry, container) {
  const { cfg } = entry;
  const opPct   = Math.round((cfg.fillOpacity ?? 0.35) * 100);
  const eid     = entry._uid = 'l' + qgisLayers.length; // unikátní kratký ID

  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <div class="ql-row" id="qlrow-${eid}">
      <div class="ql-sw" style="background:${cfg.color}"></div>
      <span class="ql-nm dim" id="qln-${eid}">${cfg.label}</span>
      <div class="tog sm" id="qtog-${eid}"></div>
    </div>
    ${cfg.fillOpacity > 0 ? `
    <div class="ql-opacity" id="qop-${eid}">
      <input type="range" min="0" max="100" value="${opPct}" id="qopr-${eid}">
      <span id="qopv-${eid}">${opPct}%</span>
    </div>` : ''}`;

  // Toggle layer on/off
  wrap.querySelector('.ql-row').addEventListener('click', () => toggleLayer(entry));

  // Opacity slider event (čistý JS, bez inline oninput)
  const slider = wrap.querySelector(`#qopr-${eid}`);
  if (slider) {
    slider.addEventListener('input', () => {
      setLayerOpacity(entry, slider.value / 100);
      const valEl = wrap.querySelector(`#qopv-${eid}`);
      if (valEl) valEl.textContent = slider.value + '%';
    });
  }

  container.appendChild(wrap);
}

function toggleLayer(entry) {
  entry.visible = !entry.visible;
  const eid = entry._uid;

  document.getElementById('qtog-'  + eid)?.classList.toggle('on',  entry.visible);
  document.getElementById('qln-'   + eid)?.classList.toggle('dim', !entry.visible);
  document.getElementById('qlrow-' + eid)?.classList.toggle('layer-on', entry.visible);

  // Opacity slider — zobraz pouze když je vrstva zapnutá
  const opEl = document.getElementById('qop-' + eid);
  if (opEl) opEl.classList.toggle('show', entry.visible);

  if (entry.visible) {
    entry.leaflet.addTo(map);
    entry.leaflet.bringToFront();
    setTimeout(() => {
      if (entry.visible) entry.leaflet.redraw?.();
      _patchSVGWheelZoom(); // oprava scroll-zoom přes SVG výplně
    }, 80);
  } else {
    map.removeLayer(entry.leaflet);
  }
}

function setLayerOpacity(entry, opacity) {
  if (entry) entry.leaflet.setStyle({ fillOpacity: opacity });
}

// ── POKROČILÝ REŽIM ──────────────────────────────────────────────
// Uloží stav viditelnosti POI skupin před vstupem do adv. režimu
let _poiStateBeforeAdv = null;

function toggleAdvanced() {
  advancedMode = !advancedMode;

  // Tlačítko stav
  document.getElementById('adv-btn').classList.toggle('on', advancedMode);
  document.getElementById('adv-pill').textContent = advancedMode ? 'ZAPNUTO' : 'VYPNUTO';
  // body class pro CSS cílení (mobil: skryj ikony kategorií + search)
  document.body.classList.toggle('adv-on', advancedMode);

  // IS DMVS sekce
  document.getElementById('qgis-sec').classList.toggle('visible', advancedMode);

  // Kategorie + výsledky — skryj v pokročilém
  document.getElementById('poi-cats-sec')?.classList.toggle('sec-hidden', advancedMode);
  document.getElementById('poi-res-sec')?.classList.toggle('sec-hidden', advancedMode);

  // V pokročilém režimu: vymaž search input + výsledky (POI search nedává smysl)
  if (advancedMode) {
    const si = document.getElementById('search-inp');
    if (si) si.value = '';
    if (typeof doSearch === 'function') doSearch('');
    // Skryj mobilní subkategorie
    if (typeof renderMobSubcats === 'function') renderMobSubcats();
  }

  // Stats panel — jen pokročilý (desktop + mobile)
  document.getElementById('stats-panel')?.classList.toggle('adv-show', advancedMode);

  // POI přehled widget — jen základní
  document.getElementById('poi-overview')?.classList.toggle('adv-hide', advancedMode);

  // ── ROTACE MAPY ──────────────────────────────────────────────────
  // Pokročilý režim: zakázat rotaci + vyrovnat na sever
  // Základní režim: obnovit rotaci
  if (typeof map.touchRotate !== 'undefined' && map.touchRotate) {
    advancedMode ? map.touchRotate.disable() : map.touchRotate.enable();
  }
  if (typeof map.shiftKeyRotate !== 'undefined' && map.shiftKeyRotate) {
    advancedMode ? map.shiftKeyRotate.disable() : map.shiftKeyRotate.enable();
  }
  if (advancedMode && typeof map.setBearing === 'function') {
    // Vyrovnej mapu na sever s animací
    map.setBearing(0, { animate: true, duration: 0.4 });
    // Schovej north-FAB (mapa je rovná)
    document.body.classList.remove('map-rotated');
  }

  // POI markery na mapě — skryj v pokročilém, obnov po vypnutí
  if (advancedMode) {
    // Ulož aktuální stav catActive a vymaž skupiny z mapy
    _poiStateBeforeAdv = JSON.parse(JSON.stringify(typeof ST !== 'undefined' ? ST.catActive : {}));
    if (typeof poiGroup !== 'undefined') poiGroup.clearLayers();
    document.getElementById('sb-scroll').scrollTop = 0;
  } else {
    // Obnov POI markery — stav před vstupem do pokročilého
    if (_poiStateBeforeAdv && typeof ST !== 'undefined') {
      ST.catActive = { ..._poiStateBeforeAdv };
    }
    if (typeof renderPOI === 'function') renderPOI();

    // Vypni všechny DMVS vrstvy při opuštění pokročilého režimu
    qgisLayers.forEach(entry => {
      if (!entry.visible) return;
      entry.visible = false;
      map.removeLayer(entry.leaflet);
      const eid = entry._uid;
      document.getElementById('qtog-'  + eid)?.classList.remove('on');
      document.getElementById('qln-'   + eid)?.classList.add('dim');
      document.getElementById('qlrow-' + eid)?.classList.remove('layer-on');
      const opEl = document.getElementById('qop-' + eid);
      if (opEl) opEl.classList.remove('show');
    });
  }
}

// ── SVG WHEEL PASSTHROUGH ─────────────────────────────────────────
// Pokud jsou aktivní IS DMVS vrstvy (SVG polygony s výplní), jejich SVG plochy
// pohlcují scroll wheel eventy a brání zoomu na desktopu.
// Oprava: přeposlat wheel eventy z Leaflet SVG panelu na mapu.
function _patchSVGWheelZoom() {
  const svgEl = map.getPane('overlayPane')?.querySelector('svg');
  if (!svgEl || svgEl._wheelPatched) return;
  svgEl._wheelPatched = true;
  svgEl.addEventListener('wheel', function(e) {
    // Přepošli wheel event na map container aby Leaflet mohl zoomovat
    map.getContainer().dispatchEvent(new WheelEvent('wheel', e));
  }, { passive: false });
}

