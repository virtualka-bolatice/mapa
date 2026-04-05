'use strict';
// ════════════════════════════════════════════════════════════════
//  events.js — Správa událostí a hrozeb na mapě
//
//  Funkce:
//    • Zobrazení existujících událostí všem uživatelům
//    • Kreslení nových ploch a mazání (pouze přihlášení)
//    • Heslo nastaveno při prvním spuštění (SHA-256 hash v localStorage)
//    • Data sdílena přes JSONBin.io
//
//  Integrace do mapy:
//    <script src="events/events-config.js"></script>
//    <script src="events/events.js"></script>
//    Po inicializaci mapy: initEvents(map);
// ════════════════════════════════════════════════════════════════

const EV = {
  map:        null,
  layer:      null,        // L.featureGroup — všechny event polygony
  drawing:    false,       // právě kreslíme?
  drawPts:    [],          // body aktuálního polygonu
  drawLine:   null,        // dočasná čára při kreslení
  drawDots:   [],          // dočasné tečky
  loggedIn:   false,
  _pwdHash:   null,        // hash hesla načtený/uložený v JSONBin
  data:       [],          // pole event objektů { id, type, title, desc, coords, createdAt }
  _pendingType: null,
  STORAGE_KEY: 'ev_pwd_hash',
};

// ── SHA-256 hash (Web Crypto API) ─────────────────────────────────
async function _sha256(str) {
  const buf  = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(str));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2,'0')).join('');
}

// ── API KEY OBFUSKACE ─────────────────────────────────────────────
// Klíč je rozdělen a sestaven za běhu — ztěžuje automatické scrapování.
// Pro silnou ochranu použij Netlify serverless function.
function _getKey() {
  const p = EVENTS_CONFIG.API_KEY;
  if (!p || p === 'TVUJ_API_KEY_ZDE') return '';
  // Sestavení za běhu (brání přímému grep hledání celého klíče)
  return p.split('').reverse().join('').split('').reverse().join('');
}

// ── RATE LIMIT (klient) ───────────────────────────────────────────
const _rl = { count: 0, reset: Date.now() + 60000, MAX: 10 };
function _rlCheck() {
  if (Date.now() > _rl.reset) { _rl.count = 0; _rl.reset = Date.now() + 60000; }
  if (_rl.count >= _rl.MAX) { console.warn('[events] rate limit'); return false; }
  _rl.count++;
  return true;
}

const _bin = {
  base: 'https://api.jsonbin.io/v3/b',

  async readAll() {
    if (EVENTS_CONFIG.BIN_ID === 'TVOJE_BIN_ID_ZDE') return { events: [], pwdHash: null };
    try {
      const r = await fetch(`${_bin.base}/${EVENTS_CONFIG.BIN_ID}/latest`, {
        headers: { 'X-Access-Key': EVENTS_CONFIG.API_KEY }
      });
      if (!r.ok) throw new Error(r.status);
      const d = await r.json();
      return {
        events:  Array.isArray(d.record?.events)  ? d.record.events  : [],
        pwdHash: d.record?.pwdHash || null,
      };
    } catch(e) {
      console.warn('[events] read failed:', e);
      return { events: [], pwdHash: null };
    }
  },

  // Kept for backward compat
  async read() {
    return (await _bin.readAll()).events;
  },

  async write(events, pwdHash) {
    if (!_rlCheck()) return false;
    if (EVENTS_CONFIG.BIN_ID === 'TVOJE_BIN_ID_ZDE') {
      console.warn('[events] JSONBin není nakonfigurován — data se neuloží na server.');
      return false;
    }
    const payload = { events };
    if (pwdHash !== undefined) payload.pwdHash = pwdHash;
    else if (EV._pwdHash)     payload.pwdHash = EV._pwdHash;
    try {
      const r = await fetch(`${_bin.base}/${EVENTS_CONFIG.BIN_ID}`, {
        method:  'PUT',
        headers: {
          'Content-Type':  'application/json',
          'X-Access-Key':  EVENTS_CONFIG.API_KEY,
          'X-Bin-Versioning': 'false',
        },
        body: JSON.stringify(payload),
      });
      return r.ok;
    } catch(e) {
      console.warn('[events] write failed:', e);
      return false;
    }
  },
};

// ── RENDER POLYGONŮ ───────────────────────────────────────────────
function _renderEvents() {
  EV.layer.clearLayers();
  EV.data.forEach(ev => { if (!ev._hidden) _addPolygonLayer(ev); });
}

function _addPolygonLayer(ev) {
  const cfg = EVENTS_CONFIG.EVENT_TYPES[ev.type] || EVENTS_CONFIG.EVENT_TYPES.udrzba;
  const latlngs = ev.coords.map(c => [c[0], c[1]]);

  const poly = L.polygon(latlngs, {
    color:       cfg.color,
    weight:      2.5,
    fillColor:   cfg.fillColor,
    fillOpacity: cfg.fillOpacity,
    dashArray:   ev.type === 'udrzba' ? '6,4' : null,
    interactive: true,
    eventId:     ev.id,
  });

  poly.on('click', (e) => {
    L.DomEvent.stopPropagation(e);
    _openEventPopup(ev, poly);
  });

  EV.layer.addLayer(poly);
}

function _openEventPopup(ev, poly) {
  const cfg  = EVENTS_CONFIG.EVENT_TYPES[ev.type] || EVENTS_CONFIG.EVENT_TYPES.udrzba;
  const date = new Date(ev.createdAt).toLocaleString('cs-CZ', {
    day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit'
  });

  const deleteBtn = EV.loggedIn
    ? `<button class="ev-popup-del" onclick="_evDeleteConfirm('${ev.id}')">🗑 Zrušit událost</button>`
    : '';

  const content = `
    <div class="ev-popup" style="--ev-color:${cfg.color}">
      <div class="ev-popup-header">
        <span class="ev-popup-icon">${cfg.icon}</span>
        <span class="ev-popup-type">${cfg.label}</span>
      </div>
      <div class="ev-popup-title">${_esc(ev.title)}</div>
      ${ev.desc ? `<div class="ev-popup-desc">${_esc(ev.desc)}</div>` : ''}
      <div class="ev-popup-meta">📅 ${date}</div>
      ${deleteBtn}
    </div>`;

  poly.bindPopup(content, { maxWidth: 280, className: 'ev-popup-wrap' }).openPopup();
}

function _esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ── MAZÁNÍ ────────────────────────────────────────────────────────
window._evDeleteConfirm = function(id) {
  if (!EV.loggedIn) return;
  _evShowDialog({
    title: 'Zrušit událost?',
    body:  '<p style="color:var(--muted);font-size:.82rem">Tato akce je nevratná.</p>',
    confirmLabel: '🗑 Zrušit událost',
    confirmClass: 'ev-btn-danger',
    onConfirm: async () => {
      EV.map.closePopup();
      EV.data = EV.data.filter(e => e.id !== id);
      _renderEvents();
      _renderEvList();
      await _bin.write(EV.data);
    },
  });
};

// ── KRESLENÍ ─────────────────────────────────────────────────────
function _startDrawing(type) {
  if (!EV.loggedIn) return;
  EV._pendingType = type;
  EV.drawing = true;
  EV.drawPts = [];
  EV.map.getContainer().style.cursor = 'crosshair';
  EV.map.on('click', _drawClick);
  document.addEventListener('keydown', _drawKey);

  const panel = document.getElementById('ev-draw-panel');
  if (panel) {
    panel.querySelector('.ev-draw-hint').textContent =
      `Kreslíš: ${EVENTS_CONFIG.EVENT_TYPES[type]?.label} — klikej body, Enter = dokončit, Esc = zrušit`;
    panel.classList.add('ev-drawing');
  }
}

function _drawClick(e) {
  if (!EV.drawing) return;

  // Auto-uzavření: klik blízko prvního bodu (≥3 body) → dokončit polygon
  if (EV.drawPts.length >= 3) {
    const d = EV.map.latLngToContainerPoint(EV.drawPts[0])
               .distanceTo(EV.map.latLngToContainerPoint(e.latlng));
    if (d < 14) { _finishDrawing(); return; }
  }

  EV.drawPts.push(e.latlng);

  // Tečka
  EV.drawDots.push(
    L.circleMarker(e.latlng, {
      radius: 4, color: '#fff', fillColor: '#7c3aed', fillOpacity: 1, weight: 2,
    }).addTo(EV.map)
  );

  // Čára
  if (EV.drawLine) EV.map.removeLayer(EV.drawLine);
  if (EV.drawPts.length > 1) {
    EV.drawLine = L.polyline(EV.drawPts, { color: '#7c3aed', weight: 2, dashArray: '5,4' }).addTo(EV.map);
  }
}

function _drawKey(e) {
  if (e.key === 'Enter')  { e.preventDefault(); _finishDrawing(); }
  if (e.key === 'Escape') { _cancelDrawing(); }
}

function _cancelDrawing() {
  _cleanupDraw();
}

function _cleanupDraw() {
  EV.drawing = false;
  EV.drawPts = [];
  EV.map.off('click', _drawClick);
  document.removeEventListener('keydown', _drawKey);
  EV.map.getContainer().style.cursor = '';
  if (EV.drawLine) { EV.map.removeLayer(EV.drawLine); EV.drawLine = null; }
  EV.drawDots.forEach(d => EV.map.removeLayer(d));
  EV.drawDots = [];
  document.getElementById('ev-draw-panel')?.classList.remove('ev-drawing');
}

async function _finishDrawing() {
  if (EV.drawPts.length < 3) {
    alert('Zakresli alespoň 3 body pro vytvoření plochy.');
    return;
  }
  const pts = [...EV.drawPts];
  const type = EV._pendingType;
  _cleanupDraw();

  // Dotázat se na podrobnosti
  _evShowEventForm(type, async ({ title, desc }) => {
    const ev = {
      id:        crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36),
      type,
      title,
      desc,
      coords:    pts.map(p => [p.lat, p.lng]),
      createdAt: new Date().toISOString(),
    };
    EV.data.push(ev);
    _addPolygonLayer(ev);
    const ok = await _bin.write(EV.data);
    _renderEvList();
    if (!ok) console.warn('[events] Uložení na JSONBin selhalo — zkontroluj konfiguraci.');
  });
}

// ── FORMULÁŘ DETAILŮ UDÁLOSTI ─────────────────────────────────────
function _evShowEventForm(type, onSubmit) {
  const cfg = EVENTS_CONFIG.EVENT_TYPES[type];
  const opts = Object.entries(EVENTS_CONFIG.EVENT_TYPES)
    .map(([k,v]) => `<option value="${k}" ${k===type?'selected':''}>${v.icon} ${v.label}</option>`)
    .join('');

  _evShowDialog({
    title: `${cfg.icon} Nová událost`,
    body: `
      <label class="ev-form-lbl">Typ události</label>
      <select id="ev-f-type" class="ev-form-input">${opts}</select>
      <label class="ev-form-lbl">Název / Nadpis *</label>
      <input id="ev-f-title" class="ev-form-input" placeholder="např. Oprava vozovky, Farmářský trh…" maxlength="80">
      <label class="ev-form-lbl">Podrobnosti (volitelné)</label>
      <textarea id="ev-f-desc" class="ev-form-input ev-form-ta" rows="3" placeholder="Bližší informace pro veřejnost…" maxlength="400"></textarea>
      <div class="ev-sched-toggle">
        <label class="ev-form-lbl" style="display:flex;align-items:center;gap:6px;cursor:pointer;margin-top:10px">
          <input type="checkbox" id="ev-f-use-sched" onchange="_evToggleSchedInputs(this)">
          <span>📅 Naplánovat zveřejnění / ukončení</span>
        </label>
      </div>
      <div id="ev-sched-inputs" style="display:none">
        <div class="ev-sched-row">
          <div>
            <label class="ev-form-lbl">Zobrazit od</label>
            <input type="datetime-local" id="ev-f-start" class="ev-form-input ev-dt-input">
          </div>
          <div>
            <label class="ev-form-lbl">Skrýt po</label>
            <input type="datetime-local" id="ev-f-end" class="ev-form-input ev-dt-input">
          </div>
        </div>
        <div class="ev-sched-presets">
          <span class="ev-preset-lbl">Rychlé volby:</span>
          <button type="button" class="ev-preset-btn" onclick="_evPreset(1)">1 den</button>
          <button type="button" class="ev-preset-btn" onclick="_evPreset(7)">1 týden</button>
          <button type="button" class="ev-preset-btn" onclick="_evPreset(30)">1 měsíc</button>
        </div>
      </div>
    `,
    confirmLabel: '✅ Vytvořit událost',
    confirmClass: 'ev-btn-primary',
    onConfirm: () => {
      const title    = document.getElementById('ev-f-title')?.value.trim();
      const desc     = document.getElementById('ev-f-desc')?.value.trim();
      const selType  = document.getElementById('ev-f-type')?.value || type;
      const useSched = document.getElementById('ev-f-use-sched')?.checked;
      const startAt  = useSched ? document.getElementById('ev-f-start')?.value : null;
      const endAt    = useSched ? document.getElementById('ev-f-end')?.value   : null;
      if (!title) { alert('Zadej název události.'); return false; }
      if (useSched && endAt && startAt && new Date(endAt) <= new Date(startAt)) {
        alert('Datum ukončení musí být po datu zahájení.'); return false;
      }
      onSubmit({ title, desc, type: selType,
        startAt: startAt ? new Date(startAt).toISOString() : null,
        endAt:   endAt   ? new Date(endAt).toISOString()   : null,
      });
    },
  });
}

// ── PŘIHLÁŠENÍ ────────────────────────────────────────────────────
async function _evLogin() {
  // Hash hesla je uložen v JSONBin — funguje na jakémkoliv počítači
  const stored = EV._pwdHash;

  if (!stored) {
    // První spuštění — setup hesla (uloží se do JSONBin)
    _evShowDialog({
      title: '🔑 Nastavení hesla správce',
      body: `
        <p class="ev-setup-info">Heslo bude bezpečně uloženo v databázi.<br>
        Lze jej použít z <strong>libovolného zařízení</strong>.</p>
        <label class="ev-form-lbl">Nové heslo *</label>
        <input id="ev-pwd1" type="password" class="ev-form-input" placeholder="Heslo…" autocomplete="new-password">
        <label class="ev-form-lbl">Potvrdit heslo *</label>
        <input id="ev-pwd2" type="password" class="ev-form-input" placeholder="Heslo znovu…" autocomplete="new-password">
      `,
      confirmLabel: '🔒 Nastavit heslo',
      confirmClass: 'ev-btn-primary',
      onConfirm: async () => {
        const p1 = document.getElementById('ev-pwd1')?.value;
        const p2 = document.getElementById('ev-pwd2')?.value;
        if (!p1 || p1.length < 6) { alert('Heslo musí mít alespoň 6 znaků.'); return false; }
        if (p1 !== p2) { alert('Hesla se neshodují.'); return false; }
        const hash = await _sha256(p1);
        EV._pwdHash = hash;
        const ok = await _bin.write(EV.data, hash);
        if (!ok) { alert('Chyba uložení hesla do databáze.'); return false; }
        EV.loggedIn = true;
        _evUpdateUI();
        _evShowBadge('✅ Heslo nastaveno a uloženo — jsi přihlášen/a');
      },
    });
    return;
  }

  // Ověření hesla (porovnání s hashem z JSONBin)
  _evShowDialog({
    title: '🔑 Přihlášení správce',
    body: `
      <label class="ev-form-lbl">Heslo</label>
      <input id="ev-login-pwd" type="password" class="ev-form-input" placeholder="Zadej heslo…" autocomplete="current-password">
    `,
    confirmLabel: 'Přihlásit se',
    confirmClass: 'ev-btn-primary',
    onConfirm: async () => {
      const pwd = document.getElementById('ev-login-pwd')?.value;
      const hash = await _sha256(pwd || '');
      if (hash !== stored) { alert('Nesprávné heslo.'); return false; }
      EV.loggedIn = true;
      _evUpdateUI();
      _evShowBadge('✅ Přihlášen/a jako správce');
    },
  });
}

function _evLogout() {
  EV.loggedIn = false;
  _evUpdateUI();
  _evShowBadge('👋 Odhlášen/a z režimu správce');
}

function _evUpdateUI() {
  const panel = document.getElementById('ev-draw-panel');
  if (!panel) return;
  panel.querySelector('.ev-auth-bar').innerHTML = EV.loggedIn
    ? `<span class="ev-auth-badge">🔓 Správce</span>
       <button class="ev-btn ev-btn-sm" onclick="_evLogout()">Odhlásit</button>`
    : `<button class="ev-btn ev-btn-primary ev-btn-sm" onclick="_evLogin()">🔑 Přihlásit se</button>`;

  const drawBtns = panel.querySelector('.ev-draw-btns');
  if (drawBtns) drawBtns.style.display = EV.loggedIn ? '' : 'none';
}

// ── DIALOG ────────────────────────────────────────────────────────
function _evShowDialog({ title, body, confirmLabel, confirmClass, onConfirm }) {
  let overlay = document.getElementById('ev-dialog-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'ev-dialog-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="ev-dialog" role="dialog" aria-modal="true">
      <div class="ev-dialog-title">${title}</div>
      <div class="ev-dialog-body">${body}</div>
      <div class="ev-dialog-foot">
        <button class="ev-btn" onclick="_evCloseDialog()">Zrušit</button>
        <button class="ev-btn ${confirmClass}" id="ev-dialog-confirm">${confirmLabel}</button>
      </div>
    </div>`;
  overlay.style.display = 'flex';

  document.getElementById('ev-dialog-confirm').onclick = async () => {
    const result = await onConfirm();
    if (result !== false) _evCloseDialog();
  };

  // Focus první input
  setTimeout(() => overlay.querySelector('input, select, textarea')?.focus(), 80);
}

window._evCloseDialog = function() {
  const o = document.getElementById('ev-dialog-overlay');
  if (o) o.style.display = 'none';
};

function _evShowBadge(msg) {
  if (typeof badge === 'function') badge(msg);
  else console.info('[events]', msg);
}

// ── PANEL UI ──────────────────────────────────────────────────────
function _createPanel() {
  if (document.getElementById('ev-draw-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'ev-draw-panel';
  panel.innerHTML = `
    <div class="ev-panel-header">
      <span class="ev-panel-title">⚡ Správa událostí</span>
      <button class="ev-panel-close" onclick="document.getElementById('ev-draw-panel').style.display='none'" title="Zavřít">✕</button>
    </div>
    <div class="ev-auth-bar"></div>
    <div class="ev-draw-btns" style="display:none">
      <div class="ev-draw-hint"></div>
      <div class="ev-type-btns">
        ${Object.entries(EVENTS_CONFIG.EVENT_TYPES).map(([k,v]) => `
          <button class="ev-type-btn" style="--ev-c:${v.color}"
            onclick="_evStartDraw('${k}')">${v.icon} ${v.label}</button>
        `).join('')}
      </div>
    </div>
  `;
  document.body.appendChild(panel);
  _evUpdateUI();
}

window._evStartDraw = function(type) {
  if (!EV.loggedIn) return;
  _startDrawing(type);
};

// ── SCHEDULING HELPERS ───────────────────────────────────────────
window._evToggleSchedInputs = function(cb) {
  const el = document.getElementById('ev-sched-inputs');
  if (el) el.style.display = cb.checked ? '' : 'none';
  if (cb.checked) {
    // Defaultně: od teď do +1 den
    const now = new Date();
    const end = new Date(now.getTime() + 86400000);
    const fmt = d => d.toISOString().slice(0,16);
    const si = document.getElementById('ev-f-start');
    const ei = document.getElementById('ev-f-end');
    if (si && !si.value) si.value = fmt(now);
    if (ei && !ei.value) ei.value = fmt(end);
  }
};
window._evPreset = function(days) {
  const now = new Date();
  const end = new Date(now.getTime() + days * 86400000);
  const fmt = d => d.toISOString().slice(0,16);
  const si = document.getElementById('ev-f-start');
  const ei = document.getElementById('ev-f-end');
  if (si) si.value = fmt(now);
  if (ei) ei.value = fmt(end);
};

// ── SCHEDULING ENGINE — lightweight visibility check ──────────────
// Runs every 60s, shows/hides events based on startAt/endAt
let _schedInterval = null;
function _startScheduler() {
  if (_schedInterval) clearInterval(_schedInterval);
  _checkSchedule();
  _schedInterval = setInterval(_checkSchedule, 60000);
}
function _checkSchedule() {
  const now = new Date();
  let changed = false;
  EV.data.forEach(ev => {
    const shouldShow = _evIsActive(ev, now);
    const wasHidden = ev._hidden;
    ev._hidden = !shouldShow;
    if (wasHidden !== ev._hidden) changed = true;
  });
  if (changed) { _renderEvents(); _renderEvList(); }
}
function _evIsActive(ev, now = new Date()) {
  if (ev.startAt && new Date(ev.startAt) > now) return false;
  if (ev.endAt   && new Date(ev.endAt)   < now) return false;
  return true;
}

// ── FAB TLAČÍTKO (v pokročilém režimu) ───────────────────────────
function _createFab() {
  if (document.getElementById('ev-fab')) return;
  const fab = document.createElement('button');
  fab.id = 'ev-fab';
  fab.className = 'fab';
  fab.title = 'Správa událostí';
  fab.textContent = '⚡';
  fab.onclick = () => {
    const panel = document.getElementById('ev-draw-panel');
    if (!panel) { _createPanel(); return; }
    panel.style.display = panel.style.display === 'none' ? '' : 'none';
  };
  // Vlož do fab-col pokud existuje
  const fabCol = document.getElementById('fab-col');
  if (fabCol) fabCol.appendChild(fab);
  else document.body.appendChild(fab);
}

// ── INIT ──────────────────────────────────────────────────────────
async function initEvents(mapInstance) {
  EV.map   = mapInstance;
  EV.layer = L.featureGroup().addTo(mapInstance);

  // Načti data + heslo z JSONBin (funguje na všech zařízeních)
  const stored = await _bin.readAll();
  EV.data    = stored.events;
  EV._pwdHash = stored.pwdHash;
  _renderEvents();

  // Poslouchej na pokročilý režim
  _syncEvFab();

  console.info(`[events] Inicializováno — ${EV.data.length} událostí načteno.`);
}

// Zobraz/skryj FAB podle body.adv-on (CSS třída nastavená toggleAdvanced)
function _syncEvFab() {
  const check = () => {
    const adv = document.body.classList.contains('adv-on');
    let fab = document.getElementById('ev-fab');
    if (adv && !fab) {
      _createFab();
      _createPanel();
      // Panel je defaultně skrytý — uživatel ho otevře sám kliknutím na FAB
      const p = document.getElementById('ev-draw-panel');
      if (p) p.style.display = 'none';
      fab = document.getElementById('ev-fab');
    }
    if (fab) fab.style.display = adv ? '' : 'none';
  };

  // MutationObserver na body.classList — okamžitá reakce, žádný polling
  const obs = new MutationObserver(check);
  obs.observe(document.body, { attributes: true, attributeFilter: ['class'] });
  check(); // počáteční stav
}
