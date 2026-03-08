'use strict';

// ════════════════════════════════════════════════════════════════
//  ui.js — Sidebar/BottomSheet, mobilní search, geolokace, init
// ════════════════════════════════════════════════════════════════

function isMobile() { return window.innerWidth <= 768; }

// ════════════════════════════════════════════════════════════════
//  BOTTOM SHEET — plynulý drag (JS-řízený transform)
// ════════════════════════════════════════════════════════════════

const BS_PEEK = 105;       // px viditelné v peek stavu
let bsCurrentY  = 0;       // aktuální translateY (px)
let bsExpanded  = false;
let sbOpen      = true;

// ── Výpočet Y pozic ─────────────────────────────────────────────
function _bsFullH()  { return document.getElementById('sidebar')?.offsetHeight || 400; }
function _bsPeekY()  { return Math.max(0, _bsFullH() - BS_PEEK); }

// ── Nastavení transformu ─────────────────────────────────────────
function _bsSetY(y, animate = false) {
  const bs = document.getElementById('sidebar');
  if (!bs) return;
  bs.style.transition = animate ? 'transform .32s cubic-bezier(.4,0,.2,1)' : 'none';
  bs.style.transform  = `translateY(${y}px)`;
  bsCurrentY = y;
}

// ── Snap: peek nebo expanded ─────────────────────────────────────
function _bsSnapTo(expanded, animate = true) {
  bsExpanded = expanded;
  _bsSetY(expanded ? 0 : _bsPeekY(), animate);
}

// ── Veřejné toggle funkce ────────────────────────────────────────
function toggleBS()  { if (isMobile()) _bsSnapTo(!bsExpanded); }
function expandBS()  { if (isMobile()) _bsSnapTo(true);  }
function collapseBS(){ if (isMobile()) _bsSnapTo(false); }

// ── Inicializace BS na start ─────────────────────────────────────
function _bsInit() {
  if (!isMobile()) return;
  // Počkej jeden frame, aby se sidebar renderoval a měl výšku
  requestAnimationFrame(() => {
    _bsSetY(_bsPeekY(), false);
  });
}

// ════════════════════════════════════════════════════════════════
//  SWIPE GESTA — plynulý drag kdekoliv na BS, zastav prstem
// ════════════════════════════════════════════════════════════════
function _initBSSwipe() {
  const bs = document.getElementById('sidebar');
  if (!bs) return;

  let touchStartY   = 0;
  let touchStartBsY = 0;   // bsCurrentY na začátku dotyku
  let lastTouchY    = 0;
  let lastTouchTime = 0;
  let velY          = 0;   // rychlost px/ms
  let dragging      = false;

  // Drag funguje na celém BS — ale scroll oblasti nechceme zachytit
  // Proto posloucháme na mob-bs-top (handle) bez omezení,
  // a na sb-scroll jen pokud je na vrchu (scrollTop === 0 a swipe dolů)
  const handle  = document.getElementById('mob-bs-top');
  const scrollEl = document.getElementById('sb-scroll');

  function onTouchStart(e) {
    if (!isMobile()) return;
    // Na sb-scroll zachyť drag jen pokud je scrollTop == 0 a táhneme dolů
    if (e.currentTarget === scrollEl) {
      if (scrollEl.scrollTop > 2) return; // nechej scroll fungovat normálně
    }
    touchStartY   = e.touches[0].clientY;
    touchStartBsY = bsCurrentY;
    lastTouchY    = touchStartY;
    lastTouchTime = Date.now();
    velY          = 0;
    dragging      = true;
    // Zastav animaci — prstem plně ovládáme
    if (bs.style.transition) bs.style.transition = 'none';
  }

  function onTouchMove(e) {
    if (!dragging || !isMobile()) return;
    const y   = e.touches[0].clientY;
    const dt  = Date.now() - lastTouchTime;
    if (dt > 0) velY = (y - lastTouchY) / dt;  // px/ms
    lastTouchY    = y;
    lastTouchTime = Date.now();

    const delta  = y - touchStartY;
    const newY   = Math.max(0, Math.min(_bsPeekY(), touchStartBsY + delta));
    // Real-time pohyb — žádná animace
    bs.style.transform = `translateY(${newY}px)`;
    bsCurrentY = newY;

    // Zabraň scrollu stránky při dragování BS
    if (Math.abs(delta) > 8) e.preventDefault();
  }

  function onTouchEnd() {
    if (!dragging || !isMobile()) return;
    dragging = false;
    const peekY = _bsPeekY();
    // Rozhodnutí podle pozice + rychlosti
    // velY > 0 = táhne dolů (kolaps), velY < 0 = táhne nahoru (expand)
    const midY = peekY / 2;
    let snapExpanded;
    if (Math.abs(velY) > 0.4) {
      // Rychlý swipe → rozhoduje směr
      snapExpanded = velY < 0;
    } else {
      // Pomalý pohyb → rozhoduje pozice
      snapExpanded = bsCurrentY < midY;
    }
    _bsSnapTo(snapExpanded, true);
  }

  // Attach na handle (vždy zachycuje drag)
  handle?.addEventListener('touchstart', onTouchStart, { passive: true });
  handle?.addEventListener('touchmove',  onTouchMove,  { passive: false });
  handle?.addEventListener('touchend',   onTouchEnd,   { passive: true });

  // Attach na scroll oblast (jen pokud scrollTop == 0)
  scrollEl?.addEventListener('touchstart', onTouchStart, { passive: true });
  scrollEl?.addEventListener('touchmove',  onTouchMove,  { passive: false });
  scrollEl?.addEventListener('touchend',   onTouchEnd,   { passive: true });
}

// ════════════════════════════════════════════════════════════════
//  SIDEBAR DESKTOP TOGGLE
// ════════════════════════════════════════════════════════════════
function toggleSB() {
  if (isMobile()) { toggleBS(); return; }

  sbOpen = !sbOpen;
  const sb = document.getElementById('sidebar');
  sb?.classList.toggle('closed', !sbOpen);

  const h = document.getElementById('sb-handle');
  if (h) { h.classList.toggle('closed', !sbOpen); h.textContent = sbOpen ? '◀' : '▶'; }
  document.getElementById('sb-hbtn')?.classList.toggle('on', sbOpen);

  updateLayoutPositions();
}

// ════════════════════════════════════════════════════════════════
//  MOBILNÍ HLEDÁNÍ
// ════════════════════════════════════════════════════════════════
function openMobSearch() {
  document.getElementById('mob-search')?.classList.add('open');
  setTimeout(() => document.getElementById('mob-search-inp')?.focus(), 150);
}

function closeMobSearch() {
  document.getElementById('mob-search')?.classList.remove('open');
  const inp = document.getElementById('mob-search-inp');
  if (inp) { inp.value = ''; doSearch(''); }
  const res = document.getElementById('mob-results');
  if (res) res.innerHTML = '';
}

// ════════════════════════════════════════════════════════════════
//  LAYOUT POSITIONS (desktop)
// ════════════════════════════════════════════════════════════════
function updateLayoutPositions() {
  if (isMobile()) return;
  const offset = sbOpen ? 285 : 0;

  const scale = document.querySelector('.leaflet-bottom.leaflet-left');
  if (scale) scale.style.marginLeft = offset + 'px';

  const centerLeft = sbOpen ? `calc(50% + ${offset / 2}px)` : '50%';
  ['stats-panel', 'poi-overview', 'msr-panel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.left = centerLeft; el.style.transform = 'translateX(-50%)'; }
  });
}

// ════════════════════════════════════════════════════════════════
//  GEOLOKACE — bez spamu kruhů
// ════════════════════════════════════════════════════════════════
let _geoMarker  = null;
let _geoCircle  = null;   // pouze JEDEN kruh najednou
let _geoActive  = false;

function geolocate() {
  const btn = document.getElementById('fab-geo');
  if (!navigator.geolocation) { alert('Geolokace není dostupná.'); return; }

  // Pokud je geolokace aktivní — toggle: vypni
  if (_geoActive) {
    _clearGeo();
    btn?.classList.remove('on');
    // Schovej nav-pick-btn
    document.getElementById('nav-pick-btn')?.classList.remove('on');
    cancelNavPick?.();
    return;
  }

  btn?.classList.add('on');

  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;

      // Smaž předchozí kruh + marker (anti-spam)
      _clearGeo();

      const ico = L.divIcon({
        html: `<div style="width:13px;height:13px;background:#3b82f6;border:3px solid #fff;border-radius:50%;box-shadow:0 0 10px #3b82f6aa"></div>`,
        className: '', iconSize: [13,13], iconAnchor: [6.5,6.5],
      });

      _geoMarker = L.marker([lat, lng], { icon: ico })
        .addTo(map)
        .bindPopup(`<div style="padding:8px 10px;font-size:.75rem">📍 Vaše poloha<br>
          <span style="color:var(--muted);font-size:.68rem">±${Math.round(acc)} m</span></div>`);

      _geoCircle = L.circle([lat, lng], {
        radius: acc, color: '#3b82f6', fillColor: '#3b82f6',
        fillOpacity: .07, weight: 1,
      }).addTo(map);

      _geoActive = true;
      map.setView([lat, lng], 16);

      // Zobraz tlačítko výběru cíle navigace
      document.getElementById('nav-pick-btn')?.classList.add('on');
      badge('📍 Poloha nalezena — klikni 🎯 pro navigaci');
    },
    err => {
      btn?.classList.remove('on');
      alert('Chyba geolokace: ' + err.message);
    },
    { enableHighAccuracy: true, timeout: 10000 }
  );
}

function _clearGeo() {
  if (_geoMarker) { try { map.removeLayer(_geoMarker); } catch(e){} _geoMarker = null; }
  if (_geoCircle) { try { map.removeLayer(_geoCircle); } catch(e){} _geoCircle = null; }
  _geoActive = false;
}

// Vrátí aktuální polohu (pokud je k dispozici)
function getGeoLatLng() {
  if (!_geoMarker) return null;
  return _geoMarker.getLatLng();
}

// ════════════════════════════════════════════════════════════════
//  BADGE + LOADING
// ════════════════════════════════════════════════════════════════
let _badgeTimer;
function badge(msg) {
  const el = document.getElementById('dbadge');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('fade');
  clearTimeout(_badgeTimer);
  _badgeTimer = setTimeout(() => el.classList.add('fade'), 5000);
}

function ld(msg) {
  const el = document.getElementById('ld-sub');
  if (el) el.textContent = msg;
}

// ════════════════════════════════════════════════════════════════
//  INICIALIZACE
// ════════════════════════════════════════════════════════════════
window.addEventListener('load', async () => {
  ld('Registruji IS DMVS vrstvy…');
  initQGISLayers();

  ld('Načítám POI data…');
  await loadPOI();

  poiGroup.bringToFront();
  updateLayoutPositions();

  // Bottom sheet init + swipe
  _bsInit();
  _initBSSwipe();

  ld('Hotovo ✓');
  document.getElementById('loading').classList.add('out');
  setTimeout(() => document.getElementById('loading').remove(), 500);
});

window.addEventListener('resize', () => {
  updateLayoutPositions();
  if (!isMobile()) {
    // Na desktopu resetuj BS stav
    const bs = document.getElementById('sidebar');
    if (bs) { bs.style.transform = ''; bs.style.transition = ''; }
  } else {
    // Při otočení znovu spočítej peek pozici
    _bsSnapTo(bsExpanded, false);
  }
});
