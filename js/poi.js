'use strict';

// ════════════════════════════════════════════════════════════════
//  poi.js — POI systém
// ════════════════════════════════════════════════════════════════

// ── STAV APLIKACE ────────────────────────────────────────────────
const poiGroup = L.featureGroup().addTo(map);

const ST = {
  features:   [],
  catActive:  {},
  subActive:  {},
  searchQ:    '',
  filterMode:    false,
  filterKey:     null,
  subFilterMode: false,
  subFilterKey:  null,
};
Object.keys(CAT_CFG).forEach(k => ST.catActive[k] = true);

// ── IKONY ────────────────────────────────────────────────────────
let _iconSeq = 0;
function makeIcon(emoji, color, sz = 33) {
  const s = sz;
  const fid = 'f' + (++_iconSeq);
  return L.divIcon({
    html: `<div class="poi-pin"><svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s+8}" viewBox="0 0 ${s} ${s+8}">
      <defs><filter id="${fid}"><feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="${color}" flood-opacity=".5"/></filter></defs>
      <circle cx="${s/2}" cy="${s/2}" r="${s/2-1.5}" fill="${color}" filter="url(#${fid})" opacity=".97"/>
      <circle cx="${s/2}" cy="${s/2}" r="${s/2-5.5}" fill="rgba(255,255,255,.14)"/>
      <text x="${s/2}" y="${s/2+5}" text-anchor="middle" font-size="${Math.round(s*.4)}">${emoji}</text>
      <line x1="${s/2}" y1="${s-1.5}" x2="${s/2}" y2="${s+7}" stroke="${color}" stroke-width="2" opacity=".5"/>
    </svg></div>`,
    className: '', iconSize: [s, s+8], iconAnchor: [s/2, s+8], popupAnchor: [0, -(s+8)],
  });
}

// ── NAČTENÍ DAT ──────────────────────────────────────────────────
async function loadPOI() {
  let gj = null;

  // POI_FILE = qgis2web JS export (data/POI_0.js → window.json_POI_0)
  if (typeof POI_FILE !== 'undefined' && POI_FILE) {
    const varName = 'json_' + POI_FILE.replace(/\.js$/i, '');
    if (window[varName]) gj = window[varName];
  }

  if (!gj) {
    console.info('poi.js: POI data nenalezena — nastav POI_FILE v config.js');
    ST.features = [];
    buildSubUI(); renderPOI(); updateCounts(); renderResults(); renderMobSubcats();
    document.getElementById('st-poi').textContent = '0';
    return;
  }

  ST.features = (gj.features || []).filter(f => f.geometry?.type === 'Point' && f.geometry.coordinates)
    .map(f => {
      // Sanitizace: "NULL" / "null" → null (QGIS/GeoJSONL export)
      const p = {};
      for (const [k, v] of Object.entries(f.properties || {})) {
        p[k] = (v === 'NULL' || v === 'null' || v === '') ? null : v;
      }
      return { ...f, properties: p };
    });

  // Inicializuj subActive pro VŠECHNY podkategorie na true
  // (bez tohoto by první klik na toggle nastavil z undefined na true místo false)
  ST.features.forEach(f => {
    const k = f.properties.podkategorie;
    if (k && ST.subActive[k] === undefined) ST.subActive[k] = true;
  });
  Object.entries(CAT_CFG).forEach(([, cat]) => {
    if (cat.subs) Object.keys(cat.subs).forEach(k => { if (ST.subActive[k] === undefined) ST.subActive[k] = true; });
  });

  ST.features.forEach(f => {
    const p = f.properties;
    if (p.kategorie === 'sluzby' && p.podkategorie && !CAT_CFG.sluzby.subs[p.podkategorie]) {
      CAT_CFG.sluzby.subs[p.podkategorie] = { label: p.podkategorie, icon: '⚙️', color: '#94a3b8' };
    }
  });

  buildSubUI();
  renderPOI();
  updateCounts();
  renderResults();
  renderMobSubcats();
  document.getElementById('st-poi').textContent = ST.features.length;
}

// ── SUBKATEGORIE SLUŽBY ──────────────────────────────────────────
function buildSubUI() {
  for (const [catKey, cat] of Object.entries(CAT_CFG)) {
    if (!cat.subs || Object.keys(cat.subs).length === 0) continue;
    const el = document.getElementById('sub-' + catKey);
    if (!el) continue;
    el.innerHTML = '';
    // Spočítej POI pro každou subkat
    const subCounts = {};
    ST.features.filter(f => f.properties.kategorie === catKey)
               .forEach(f => { const s = f.properties.podkategorie; if (s) subCounts[s] = (subCounts[s]||0)+1; });

    for (const [k, sub] of Object.entries(cat.subs)) {
      if (!subCounts[k]) continue;  // skryj prázdné subkategorie
      if (ST.subActive[k] === undefined) ST.subActive[k] = true;
      const d = document.createElement('div');
      d.className   = 'sub-chip' + (ST.subActive[k] ? ' active' : '');
      d.id          = 'subchip-' + k;
      d.style.color = sub.color;
      d.innerHTML   = `<div class="sub-dot"></div><span>${sub.icon} ${sub.label}</span>`;
      d.onclick     = () => toggleSub(k);
      el.appendChild(d);
    }
    // Skryj šipku pokud žádné subkategorie nemají POI
    const arr = document.getElementById('cat-arr-' + catKey);
    if (arr) arr.style.display = el.children.length ? '' : 'none';
  }
}

function toggleSubList(catKey) {
  const el = document.getElementById('sub-' + (catKey || 'sluzby'));
  if (el) el.classList.toggle('x');
}

// ── RENDEROVÁNÍ ──────────────────────────────────────────────────
function renderPOI() {
  // Standardní cleanup — poiGroup.clearLayers() odstraní všechny markery
  poiGroup.clearLayers();

  if (typeof advancedMode !== 'undefined' && advancedMode) return;

  ST.features.forEach(f => {
    const p   = f.properties;
    const cat = CAT_CFG[p.kategorie];
    if (!cat || !ST.catActive[p.kategorie]) return;
    if (p.podkategorie && ST.subActive[p.podkategorie] === false) return;
    if (ST.searchQ) {
      const q = ST.searchQ.toLowerCase();
      if (![(p.nazev||''),(p.adresa||''),(p.typ||'')].some(s => s.toLowerCase().includes(q))) return;
    }

    let color = cat.color, icon = cat.icon;
    const sc  = cat.subs?.[p.podkategorie];
    if (sc) { color = sc.color; icon = sc.icon; }

    const [lng, lat] = f.geometry.coordinates;
    const m = L.marker([lat, lng], {
      icon: makeIcon(icon, color),
      rotateWithView: false,   // leaflet-rotate: PIN vždy vzpřímeně bez ohledu na bearing
      interactive: true,
    });
    m.feature = f;
    m.bindPopup(buildPOIPopup(p, color, icon, lat, lng), { maxWidth: 280, minWidth: 220 });
    poiGroup.addLayer(m);
  });

  // Žádná counter-rotace není potřeba — rotateWithView:false to řeší
}

// ── POI POPUP ────────────────────────────────────────────────────
function prow(i, v) {
  return `<div class="ppop-row"><div class="ppop-i">${i}</div><div class="ppop-v">${v}</div></div>`;
}

function buildPOIPopup(p, color, icon, lat, lng) {
  const cat  = CAT_CFG[p.kategorie];
  const sc   = cat?.subs?.[p.podkategorie];
  const typ  = p.typ || sc?.label || cat?.label || '';
  // Foto: podporuje jedno nebo více oddělených čárkou (foto1.jpg,foto2.webp)
  const _fotoValid = (s) => s && /\.(png|jpg|jpeg|webp|webm|mp4|mov)$/i.test(s.trim());
  const _fotoUrl   = (s) => {
    s = s.trim();
    return (s.includes('/') || s.startsWith('http')) ? s : `foto/${s}`;
  };
  const fotoList = (p.foto || '').split(',').map(s=>s.trim()).filter(_fotoValid).map(_fotoUrl);
  const fotoIdx  = `ppf-${Math.random().toString(36).slice(2,7)}`;

  const _isVideo = (s) => /\.(webm|mp4|mov)$/i.test(s);
  let foto = '';
  if (fotoList.length > 0) {
    const arrows = fotoList.length > 1
      ? `<button class="ppop-ph-prev" onclick="ppopFoto('${fotoIdx}',-1,event)">‹</button>
         <button class="ppop-ph-next" onclick="ppopFoto('${fotoIdx}',1,event)">›</button>
         <span class="ppop-ph-cnt" id="${fotoIdx}-cnt">1/${fotoList.length}</span>`
      : '';
    const firstMedia = _isVideo(fotoList[0])
      ? `<video class="ppop-photo ppop-video" src="${fotoList[0]}" muted playsinline loop autoplay
              onclick="event.stopPropagation();openLBGallery('${fotoIdx}')"></video>`
      : `<img class="ppop-photo" src="${fotoList[0]}" alt="${p.nazev||''}"
              onclick="openLBGallery('${fotoIdx}')"
              onload="if(this.naturalHeight>this.naturalWidth){this.style.objectPosition='center 15%';this.style.maxHeight='200px'}"
              onerror="this.outerHTML='<div class=ppop-ph>${icon}</div>'">`;
    foto = `<div class="ppop-photo-wrap" id="${fotoIdx}" data-imgs='${JSON.stringify(fotoList)}' data-idx="0">
      ${firstMedia}
      ${arrows}
    </div>`;
  }

  let rows = '';
  if (p.adresa) rows += prow('📍', p.adresa);
  if (p.tel)    rows += prow('📞', `<a href="tel:${p.tel}">${p.tel}</a>`);
  if (p.provoz) rows += prow('🕐', p.provoz);
  if (p.web)    rows += prow('🌐', `<a href="${p.web}" target="_blank">${p.web.replace(/https?:\/\//,'')}</a>`);
  if (p.email)  rows += prow('✉️', `<a href="mailto:${p.email}">${p.email}</a>`);
  if (p.ico)    rows += prow('🏢', 'IČO: ' + p.ico);
  if (p.popis)  rows += prow('ℹ️', p.popis);

  const navGoogle = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent((p.nazev||'') + ' Bolatice')}`;
  // Bezpečně escapuj název pro inline onclick
  const safeName = (p.nazev||'Cíl').replace(/'/g, "\\'").replace(/"/g, '&quot;');

  return `
    ${foto}
    <div class="ppop-head">
      <div class="ppop-badge" style="background:${color}18;color:${color}">${icon} ${typ}</div>
      <div class="ppop-name">${p.nazev || 'Bez názvu'}</div>
    </div>
    ${rows ? `<div class="ppop-div"></div><div style="padding-bottom:6px">${rows}</div>` : ''}
    <div class="ppop-action-bar">
      <button class="ppop-action-btn nav" onclick="navigateTo(${lat},${lng},'${safeName}')" title="Navigovat">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>
        <span>Navigovat</span>
      </button>
      <button class="ppop-action-btn" onclick="window.open('${navGoogle}','_blank')" title="Google Mapy">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
        <span>Mapa</span>
      </button>
      ${p.web ? `<button class="ppop-action-btn" onclick="window.open('${p.web}','_blank')" title="Web">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
        <span>Web</span>
      </button>` : ''}
    </div>`;
}

// ── LIGHTBOX ─────────────────────────────────────────────────────
let _lbGallery = [], _lbIdx = 0;

function openLBGallery(wrapId) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  _lbGallery = JSON.parse(wrap.dataset.imgs || '[]');
  _lbIdx     = parseInt(wrap.dataset.idx || '0');
  _lbShow();
}
function openLB(src) {
  _lbGallery = [src]; _lbIdx = 0; _lbShow();
}
const _lbIsVideo = (s) => /\.(webm|mp4|mov)$/i.test(s || '');

function _lbShow() {
  const lb  = document.getElementById('lightbox');
  const cnt = document.getElementById('lb-counter');
  const src = _lbGallery[_lbIdx];
  cnt.textContent = _lbGallery.length > 1 ? `${_lbIdx + 1} / ${_lbGallery.length}` : '';
  lb.classList.toggle('lb-multi', _lbGallery.length > 1);

  // Odstraň předchozí media element a vlož správný typ
  const existing = lb.querySelector('#lb-img, #lb-video');
  const isVid = _lbIsVideo(src);

  if (isVid) {
    const vid = document.createElement('video');
    vid.id = 'lb-video'; vid.src = src;
    vid.style.cssText = 'max-width:90vw;max-height:86vh;border-radius:8px;box-shadow:0 8px 40px rgba(0,0,0,.8);cursor:zoom-out';
    vid.controls = true; vid.autoplay = true; vid.loop = false; vid.playsInline = true;
    vid.onclick = (e) => { e.stopPropagation(); };
    if (existing) existing.replaceWith(vid); else lb.appendChild(vid);
  } else {
    let img = document.getElementById('lb-img');
    if (!img) { img = document.createElement('img'); img.id = 'lb-img'; if (existing) existing.replaceWith(img); else lb.appendChild(img); }
    else if (existing && existing.id !== 'lb-img') existing.replaceWith(img);
    img.style.opacity = '0';
    img.src = src;
    img.onclick = (e) => { e.stopPropagation(); closeLB(); };
    img.style.cursor = 'zoom-out';
    img.onload = () => { img.style.opacity = '1'; };
  }

  lb.classList.add('on');
  _lbAttachSwipe(lb);
}

let _lbSwipeX = null;
function _lbAttachSwipe(lb) {
  if (lb._swipeAttached) return;
  lb._swipeAttached = true;
  lb.addEventListener('touchstart', e => { _lbSwipeX = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', e => {
    if (_lbSwipeX === null) return;
    const dx = e.changedTouches[0].clientX - _lbSwipeX;
    _lbSwipeX = null;
    if (Math.abs(dx) < 40) return;
    dx < 0 ? lbNext() : lbPrev();
  }, { passive: true });
}
function lbPrev(e) { e?.stopPropagation(); _lbIdx = (_lbIdx - 1 + _lbGallery.length) % _lbGallery.length; _lbShow(); }
function lbNext(e) { e?.stopPropagation(); _lbIdx = (_lbIdx + 1) % _lbGallery.length; _lbShow(); }
function closeLB() {
  document.getElementById('lightbox').classList.remove('on', 'lb-multi');
  _lbGallery = []; _lbIdx = 0;
}

// Popup foto slider
function ppopFoto(wrapId, dir, e) {
  e?.stopPropagation();
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  const imgs = JSON.parse(wrap.dataset.imgs);
  const _isVid = (s) => /\.(webm|mp4|mov)$/i.test(s);
  let idx = (parseInt(wrap.dataset.idx) + dir + imgs.length) % imgs.length;
  wrap.dataset.idx = idx;
  const src = imgs[idx];
  const cnt = document.getElementById(`${wrapId}-cnt`);
  if (cnt) cnt.textContent = `${idx+1}/${imgs.length}`;
  // Nahraď media element správným typem
  const old = wrap.querySelector('.ppop-photo');
  if (!old) return;
  if (_isVid(src)) {
    const vid = document.createElement('video');
    vid.className = 'ppop-photo ppop-video'; vid.src = src;
    vid.muted = true; vid.autoplay = true; vid.loop = true; vid.playsInline = true;
    vid.onclick = (ev) => { ev.stopPropagation(); openLBGallery(wrapId); };
    old.replaceWith(vid);
  } else {
    const img = document.createElement('img');
    img.className = 'ppop-photo'; img.src = src; img.style.opacity = '.4';
    img.onload = () => { img.style.opacity = '1'; };
    img.onclick = () => openLBGallery(wrapId);
    img.onerror = () => { img.outerHTML = '<div class="ppop-ph">🖼️</div>'; };
    old.replaceWith(img);
  }
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape')      { closeLB(); }
  if (e.key === 'ArrowRight')  { lbNext(); }
  if (e.key === 'ArrowLeft')   { lbPrev(); }
});

// ── POČTY + POI PŘEHLED ──────────────────────────────────────────
function updateCounts() {
  const c = {};
  Object.keys(CAT_CFG).forEach(k => c[k] = 0);
  ST.features.forEach(f => { const k = f.properties.kategorie; if (k in c) c[k]++; });

  Object.entries(c).forEach(([k, v]) => {
    const el = document.getElementById('cnt-' + k);
    if (el) el.textContent = v;
  });

  renderPOIOverview(c);
  renderMobCatIcons(c);
}

// ── POI PŘEHLED WIDGET (základní režim) ──────────────────────────
function renderPOIOverview(counts) {
  const el = document.getElementById('poi-overview');
  if (!el) return;

  const c = counts || (() => {
    const cc = {}; Object.keys(CAT_CFG).forEach(k => cc[k] = 0);
    ST.features.forEach(f => { const k = f.properties.kategorie; if (k in cc) cc[k]++; });
    return cc;
  })();

  const total = Object.values(c).reduce((s, v) => s + v, 0);

  el.innerHTML = `
    <span class="poi-ov-total">📍 ${total} míst</span>
    ${Object.entries(CAT_CFG).map(([k, cat]) => c[k] > 0 ? `
      <span class="poi-ov-cat" style="color:${cat.color}" title="${cat.label}">
        ${cat.icon}<span>${c[k]}</span>
      </span>` : ''
    ).join('')}`;
}

// ── MOBILNÍ KATEGORIE IKONY v peek pruhu ─────────────────────────
function renderMobCatIcons(counts) {
  const el = document.getElementById('mob-cat-icons');
  if (!el) return;

  const c = counts || (() => {
    const cc = {}; Object.keys(CAT_CFG).forEach(k => cc[k] = 0);
    ST.features.forEach(f => { const k = f.properties.kategorie; if (k in cc) cc[k]++; });
    return cc;
  })();

  const entries = Object.entries(CAT_CFG);

  // ── Pokud ikony již existují: jen aktualizuj třídy (NO BLINK!) ──
  if (el.children.length === entries.length) {
    Array.from(el.children).forEach(ico => {
      const k = ico.dataset.cat;
      if (!k) return;
      const isActive = !!ST.catActive[k];
      const isDimmed = ST.filterMode && ST.filterKey !== k;
      ico.classList.toggle('active', isActive && !isDimmed);
      ico.classList.toggle('dimmed', isDimmed);
      const cnt = ico.querySelector('.mob-cat-cnt');
      if (cnt) cnt.textContent = c[k] ?? 0;
    });
    return;
  }

  // ── První render: postav celé DOM ─────────────────────────────
  el.innerHTML = entries.map(([k, cat]) => {
    const isActive = !!ST.catActive[k];
    const isDimmed = ST.filterMode && ST.filterKey !== k;
    return `<div class="mob-cat-ico${isActive && !isDimmed ? ' active' : ''}${isDimmed ? ' dimmed' : ''}"
                 data-cat="${k}" style="--cat-color:${cat.color}"
                 onclick="toggleCat('${k}')">
      <div class="mob-cat-bubble">${cat.icon}</div>
      <div class="mob-cat-lbl">${cat.label.split(/[ &]/)[0]}</div>
      <div class="mob-cat-cnt">${c[k] ?? 0}</div>
    </div>`;
  }).join('');
}


// ── MOBILNÍ SUBKATEGORIE — pills nad výsledky ────────────────────
function renderMobSubcats() {
  const el = document.getElementById('mob-subcat-wrap');
  if (!el) return;
  el.innerHTML = '';

  // Skryj v pokročilém režimu
  if (typeof advancedMode !== 'undefined' && advancedMode) return;

  // Zobrazit jen pokud filtrujeme solo kategorii se subkategoriemi
  if (!ST.filterMode || !ST.filterKey) return;
  const cat = CAT_CFG[ST.filterKey];
  if (!cat?.subs || Object.keys(cat.subs).length === 0) return;

  // Spočítej POI v každé subkategorii aktivní kategorie
  const subCounts = {};
  ST.features
    .filter(f => f.properties.kategorie === ST.filterKey)
    .forEach(f => {
      const s = f.properties.podkategorie;
      if (s) subCounts[s] = (subCounts[s] || 0) + 1;
    });

  for (const [k, sub] of Object.entries(cat.subs)) {
    // Přeskoč prázdné subkategorie
    if (!subCounts[k]) continue;

    if (ST.subActive[k] === undefined) ST.subActive[k] = true;
    const pill = document.createElement('span');
    pill.className   = 'mob-sub-pill' + (ST.subActive[k] ? ' active' : '');
    pill.dataset.key = k;                           // pro sync
    pill.style.color = sub.color || cat.color;
    pill.innerHTML   = `<span class="mob-sub-pill-ico">${sub.icon}</span>${sub.label}`;
    pill.onclick     = () => toggleSub(k);
    el.appendChild(pill);
  }
}

// ── VÝSLEDKY ─────────────────────────────────────────────────────
function renderResults() {
  _renderResultsInto('res-list', 'res-cnt');
}

function renderMobResults() {
  _renderResultsInto('mob-results', null);
}

function _renderResultsInto(listId, cntId) {
  const list = document.getElementById(listId);
  if (!list) return;
  list.innerHTML = '';

  const visible = ST.features.filter(f => {
    const p = f.properties;
    if (!ST.catActive[p.kategorie]) return false;
    // Filtr subkategorií — všechny kategorie
    if (p.podkategorie && ST.subActive[p.podkategorie] === false) return false;
    if (ST.searchQ) {
      const q = ST.searchQ.toLowerCase();
      if (![(p.nazev||''),(p.adresa||''),(p.typ||'')].some(s => s.toLowerCase().includes(q))) return false;
    }
    return true;
  });

  if (cntId) {
    const ce = document.getElementById(cntId);
    if (ce) ce.textContent = visible.length;
  }

  visible.forEach(f => {
    const p   = f.properties;
    const cat = CAT_CFG[p.kategorie];
    let color = cat?.color || '#888', icon = cat?.icon || '📍';
    const sc  = cat?.subs?.[p.podkategorie];
    if (sc) { color = sc.color; icon = sc.icon; }

    const [lng, lat] = f.geometry.coordinates;
    const d = document.createElement('div');
    d.className = 'res-row';
    d.innerHTML = `
      <div class="res-ico" style="background:${color}18">${icon}</div>
      <div class="res-info">
        <div class="res-name">${p.nazev || 'Bez názvu'}</div>
        <div class="res-sub">${p.typ || sc?.label || cat?.label || ''}${p.adresa ? ' · ' + p.adresa : ''}</div>
      </div>`;
    d.onclick = () => {
      map.setView([lat, lng], 17);
      setTimeout(() => {
        poiGroup.eachLayer(m => {
          if (m.feature?.properties?.nazev === p.nazev) {
            m.openPopup();
            const pin = m.getElement()?.querySelector('.poi-pin') || m.getElement();
            if (pin) {
              pin.classList.remove('poi-pulse');
              void pin.offsetWidth;
              pin.classList.add('poi-pulse');
              setTimeout(() => pin.classList.remove('poi-pulse'), 1600);
            }
          }
        });
      }, 320);
      if (typeof closeMobSearchKeepQuery === 'function') closeMobSearchKeepQuery();
      else closeMobSearch();
    };
    list.appendChild(d);
  });
}

// ── FILTROVÁNÍ KATEGORIÍ — exclusive-filter ──────────────────────
function toggleCat(k) {
  if (!ST.filterMode) {
    ST.filterMode = true; ST.filterKey = k;
    Object.keys(CAT_CFG).forEach(c => {
      ST.catActive[c] = (c === k);
      document.getElementById('chip-' + c)?.classList.toggle('active', c === k);
      document.getElementById('chip-' + c)?.classList.toggle('dimmed', c !== k);
    });
  } else if (ST.filterKey === k) {
    // Deselect — reset subActive pro všechny subkategorie vyfiltrované kategorie
    const prevCat = CAT_CFG[k];
    if (prevCat?.subs) Object.keys(prevCat.subs).forEach(s => { ST.subActive[s] = true; });
    ST.filterMode = false; ST.filterKey = null;
    Object.keys(CAT_CFG).forEach(c => {
      ST.catActive[c] = true;
      document.getElementById('chip-' + c)?.classList.add('active');
      document.getElementById('chip-' + c)?.classList.remove('dimmed');
    });
  } else {
    ST.filterKey = k;
    Object.keys(CAT_CFG).forEach(c => {
      ST.catActive[c] = (c === k);
      document.getElementById('chip-' + c)?.classList.toggle('active', c === k);
      document.getElementById('chip-' + c)?.classList.toggle('dimmed', c !== k);
    });
  }
  renderPOI();
  renderResults();
  renderMobCatIcons();
  renderMobSubcats();

  // Na mobilu: vyjeď BS nahoru plynule (výsledky jsou viditelné)
  if (typeof isMobile === 'function' && isMobile()) {
    expandBS();
  }
}

function toggleSub(k) {
  const parentKey = Object.keys(CAT_CFG).find(c => CAT_CFG[c].subs?.[k]);
  const subs = parentKey ? Object.keys(CAT_CFG[parentKey].subs) : [k];

  if (!ST.subFilterMode) {
    // Zapni exclusive sub-filter + skryj ostatní kategorie
    ST.subFilterMode = true; ST.subFilterKey = k;
    subs.forEach(s => {
      ST.subActive[s] = (s === k);
      document.getElementById('subchip-' + s)?.classList.toggle('active', s === k);
      document.getElementById('subchip-' + s)?.classList.toggle('dimmed', s !== k);
    });
    // Skryj ostatní kategorie
    if (parentKey) {
      Object.keys(CAT_CFG).forEach(c => {
        ST.catActive[c] = (c === parentKey);
        document.getElementById('chip-' + c)?.classList.toggle('active', c === parentKey);
        document.getElementById('chip-' + c)?.classList.toggle('dimmed', c !== parentKey);
      });
    }
  } else if (ST.subFilterKey === k) {
    // Reset
    ST.subFilterMode = false; ST.subFilterKey = null;
    subs.forEach(s => {
      ST.subActive[s] = true;
      document.getElementById('subchip-' + s)?.classList.add('active');
      document.getElementById('subchip-' + s)?.classList.remove('dimmed');
    });
    // Obnov všechny kategorie
    Object.keys(CAT_CFG).forEach(c => {
      ST.catActive[c] = true;
      document.getElementById('chip-' + c)?.classList.add('active');
      document.getElementById('chip-' + c)?.classList.remove('dimmed');
    });
  } else {
    // Přepni — může být jiná subkat jiné kategorie
    const prevParent = Object.keys(CAT_CFG).find(c => CAT_CFG[c].subs?.[ST.subFilterKey]);
    if (prevParent && prevParent !== parentKey) {
      // Plný reset předchozí kategorie: všechny subkategorie zapnout, kategorie oddimnout
      if (CAT_CFG[prevParent]?.subs) {
        Object.keys(CAT_CFG[prevParent].subs).forEach(s => {
          ST.subActive[s] = true;
          document.getElementById('subchip-' + s)?.classList.add('active');
          document.getElementById('subchip-' + s)?.classList.remove('dimmed');
        });
      }
      // Zavři rozvinutý sub-wrap předchozí kategorie
      document.getElementById('sub-' + prevParent)?.classList.remove('x');
    }
    ST.subFilterKey = k;
    // Aktivuj novou kategorii, skryj ostatní
    subs.forEach(s => {
      ST.subActive[s] = (s === k);
      document.getElementById('subchip-' + s)?.classList.toggle('active', s === k);
      document.getElementById('subchip-' + s)?.classList.toggle('dimmed', s !== k);
    });
    if (parentKey) {
      Object.keys(CAT_CFG).forEach(c => {
        ST.catActive[c] = (c === parentKey);
        document.getElementById('chip-' + c)?.classList.toggle('active', c === parentKey);
        document.getElementById('chip-' + c)?.classList.toggle('dimmed', c !== parentKey);
      });
    }
  }
  renderPOI(); renderResults(); renderMobSubcats();
}

function doSearch(q) {
  // V pokročilém režimu vyhledávání POI nedostupné
  if (typeof advancedMode !== 'undefined' && advancedMode) {
    ST.searchQ = '';
    renderResults();
    return;
  }
  ST.searchQ = q.trim();
  renderPOI();
  renderResults();
}
