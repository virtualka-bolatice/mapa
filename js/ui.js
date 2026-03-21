'use strict';

// ════════════════════════════════════════════════════════════════
//  ui.js — Sidebar/BS, mobile search, geolokace live, init
// ════════════════════════════════════════════════════════════════

function isMobile() {
  return (window.visualViewport ? window.visualViewport.width : window.innerWidth) <= 768;
}
// Landscape mobile: šířka > výška a max 900px — sidebar jako desktop
function isLandscapeMob() {
  const w = window.innerWidth;
  const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  // Desktop mode na mobilu: wider than 900px ale touch zařízení v landscape
  const isTouch = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  const isLandscape = w > h;
  // Normální landscape mobil NEBO desktop mode na touch zařízení v landscape
  return (w <= 900 && isLandscape) || (isTouch && isLandscape && w > 900 && h < 600);
}

// ════════════════════════════════════════════════════════════════
//  BOTTOM SHEET — plynulý JS drag
// ════════════════════════════════════════════════════════════════
const BS_PEEK = 105;
let bsCurrentY  = 0;
let bsExpanded  = false;
let sbOpen      = true;

function _bsFullH() {
  // iOS: sidebar offsetHeight bere inner height bez address baru — použijeme visualViewport
  const sb = document.getElementById('sidebar');
  if (sb) return sb.offsetHeight;
  return _vpHeight();
}
function _bsPeekY()  { return Math.max(0, _bsFullH() - BS_PEEK); }

function _bsSetY(y, animate = false) {
  const bs = document.getElementById('sidebar');
  if (!bs) return;
  bs.style.transition = animate ? 'transform .32s cubic-bezier(.4,0,.2,1)' : 'none';
  bs.style.transform  = `translateY(${y}px)`;
  bsCurrentY = y;
}

function _bsSnapTo(expanded, animate = true) {
  bsExpanded = expanded;
  _bsSetY(expanded ? 0 : _bsPeekY(), animate);
}

function toggleBS()  { if (isMobile()) _bsSnapTo(!bsExpanded); }
function expandBS()  { if (isMobile()) _bsSnapTo(true);  }
function collapseBS(){ if (isMobile()) _bsSnapTo(false); }

function _bsInit() {
  if (!isMobile()) return;
  const scroll = document.getElementById('sb-scroll');
  if (scroll) scroll.style.webkitOverflowScrolling = 'touch';  // iOS momentum
  requestAnimationFrame(() => { _bsSetY(_bsPeekY(), false); });
}

// ════════════════════════════════════════════════════════════════
//  SWIPE GESTA — drag na handle, scroll na sb-scroll nezasahuj
// ════════════════════════════════════════════════════════════════
function _initBSSwipe() {
  const handle   = document.getElementById('mob-bs-top');
  const scrollEl = document.getElementById('sb-scroll');
  const bs       = document.getElementById('sidebar');
  if (!bs) return;

  let touchStartY    = 0;
  let touchStartBsY  = 0;
  let lastTouchY     = 0;
  let lastTouchTime  = 0;
  let velY           = 0;
  let dragging       = false;
  let dragSource     = null; // 'handle' | 'scroll'

  function onTouchStart(src, e) {
    if (!isMobile()) return;

    // Na scroll oblasti: zachyť drag jen pokud jsme na vrchu a swipe dolů
    if (src === 'scroll') {
      // Necháme rozhodnout až v touchmove
    }

    touchStartY    = e.touches[0].clientY;
    touchStartBsY  = bsCurrentY;
    lastTouchY     = touchStartY;
    lastTouchTime  = Date.now();
    velY           = 0;
    dragging       = false;  // rozhodne se v touchmove
    dragSource     = src;
    if (bs.style.transition) bs.style.transition = 'none';
  }

  function onTouchMove(src, e) {
    if (!isMobile()) return;

    const y     = e.touches[0].clientY;
    const delta = y - touchStartY;
    const dt    = Date.now() - lastTouchTime;
    if (dt > 0) velY = (y - lastTouchY) / dt;
    lastTouchY    = y;
    lastTouchTime = Date.now();

    // Na scroll oblasti — drag jen pokud:
    //   a) táhneme dolů (delta > 0) A scrollEl je na vrchu
    //   b) BS je expandovaný a táhneme dolů
    if (src === 'scroll') {
      const atTop = (scrollEl?.scrollTop ?? 0) <= 0;
      if (!atTop) return;          // scrollEl má obsah nahoře — nechej scroll
      if (delta < 0) return;       // swipe nahoru → nechej scroll
    }

    dragging = true;
    const newY = Math.max(0, Math.min(_bsPeekY(), touchStartBsY + delta));
    bs.style.transform = `translateY(${newY}px)`;
    bsCurrentY = newY;

    // Zastav browser scroll/overscroll jen pokud opravdu dragujeme BS
    if (Math.abs(delta) > 6) e.preventDefault();
  }

  function onTouchEnd() {
    if (!isMobile()) return;
    if (!dragging) return;
    dragging   = false;
    dragSource = null;

    const peekY = _bsPeekY();
    const midY  = peekY / 2;
    let snapExpanded;
    if (Math.abs(velY) > 0.35) {
      snapExpanded = velY < 0;   // rychlý swipe → směr
    } else {
      snapExpanded = bsCurrentY < midY;  // pomalý → pozice
    }
    _bsSnapTo(snapExpanded, true);
  }

  // Handle — vždy zachycuje drag
  if (handle) {
    handle.addEventListener('touchstart', e => onTouchStart('handle', e), { passive: true });
    handle.addEventListener('touchmove',  e => onTouchMove('handle', e),  { passive: false });
    handle.addEventListener('touchend',   () => onTouchEnd(),              { passive: true });
  }

  // Scroll oblast — conditionally zachycuje drag (jen při swipe dolů z vrchu)
  if (scrollEl) {
    scrollEl.addEventListener('touchstart', e => onTouchStart('scroll', e), { passive: true });
    scrollEl.addEventListener('touchmove',  e => onTouchMove('scroll', e),  { passive: false });
    scrollEl.addEventListener('touchend',   () => onTouchEnd(),              { passive: true });
  }
}

// ════════════════════════════════════════════════════════════════
//  SIDEBAR DESKTOP TOGGLE
// ════════════════════════════════════════════════════════════════
function toggleSB() {
  // Portrait mobile → bottom sheet; landscape mobile → desktop sidebar
  if (isMobile() && !isLandscapeMob()) { toggleBS(); return; }
  sbOpen = !sbOpen;
  const sb = document.getElementById('sidebar');
  sb?.classList.toggle('closed', !sbOpen);
  // Landscape: body class mění CSS var --ml → všechny map elementy se přesunou plynule
  if (isLandscapeMob()) {
    document.body.classList.toggle('ls-sb-closed', !sbOpen);
    // Polyfill: animovat --ml přes JS pro starší iOS/Android bez @property podpory
    _animateML(sbOpen ? 220 : 0);
    // Po ukončení CSS přechodu (.28s) nech Leaflet překreslit dlaždice pro novou velikost
    setTimeout(() => {
      if (typeof map !== 'undefined' && map.invalidateSize) {
        map.invalidateSize({ animate: false });
      }
    }, 300);
  }
  const h = document.getElementById('sb-handle');
  if (h) { h.classList.toggle('closed', !sbOpen); h.textContent = sbOpen ? '◀' : '▶'; }
  document.getElementById('sb-hbtn')?.classList.toggle('on', sbOpen);
  document.getElementById('sb-hbtn-ls')?.classList.toggle('on', sbOpen);
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

// Zavře overlay bez resetování search query ani výsledků
function closeMobSearchKeepQuery() {
  document.getElementById('mob-search')?.classList.remove('open');
}

// ════════════════════════════════════════════════════════════════
//  LAYOUT POSITIONS (desktop)
// ════════════════════════════════════════════════════════════════
function updateLayoutPositions() {
  const landMob = isLandscapeMob();
  // Portrait mobile: přeskočit (pozice řeší CSS)
  if (isMobile() && !landMob) return;
  // Landscape mobile: sidebar vždy 210px (CSS --ls-sw); inline styl nepotřeba —
  // elementy jsou fixovány CSS calc() → pouze scale marginLeft
  if (landMob) {
    const scale = document.querySelector('.leaflet-bottom.leaflet-left');
    if (scale) scale.style.marginLeft = '';
    return;
  }
  // Desktop
  const offset = sbOpen ? 285 : 0;
  const scale  = document.querySelector('.leaflet-bottom.leaflet-left');
  if (scale) scale.style.marginLeft = offset + 'px';
  const cx = sbOpen ? `calc(50% + ${offset / 2}px)` : '50%';
  ['stats-panel', 'poi-overview', 'msr-panel'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.style.left = cx; el.style.transform = 'translateX(-50%)'; }
  });
}

// ════════════════════════════════════════════════════════════════
//  GEOLOKACE — live watchPosition s filtrem přesnosti ≤ 10 m
// ════════════════════════════════════════════════════════════════
const GEO_MAX_ACCURACY = 10;   // m — cílová přesnost
const GEO_TIMEOUT_BEST = 12000; // ms — jak dlouho čekat na lepší fix

let _geoWatchId   = null;   // watchPosition ID pro live update
let _geoMarker    = null;   // modrý tečkový marker
let _geoCircle    = null;   // přesnostní kruh
let _geoActive    = false;
let _geoFirstFix  = false;   // pro jednorázovou zelenou hlášku
let _geoLatLng    = null;   // { lat, lng } — poslední poloha
let _bestAccuracy = Infinity;
let _geoSettleTimer = null;

function geolocate() {
  const btn = document.getElementById('fab-geo');
  if (!navigator.geolocation) { alert('Geolokace není dostupná.'); return; }

  // Toggle: klik znovu = vypni
  if (_geoActive) {
    _stopGeo();
    btn?.classList.remove('on');
    document.getElementById('nav-pick-btn')?.classList.remove('on');
    if (typeof cancelNavPick === 'function') cancelNavPick();
    return;
  }

  btn?.classList.add('on');
  _geoFirstFix = false;
  badge('📍 Zjišťování polohy…');

  // watchPosition — browser posílá aktualizace jak se poloha zpřesňuje
  _geoWatchId = navigator.geolocation.watchPosition(
    pos => _onGeoUpdate(pos),
    err => {
      btn?.classList.remove('on');
      _geoActive = false;
      badge('❌ Geolokace selhala: ' + err.message);
    },
    {
      enableHighAccuracy: true,
      maximumAge:         0,
      timeout:            GEO_TIMEOUT_BEST,
    }
  );
}

function _onGeoUpdate(pos) {
  const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;

  _geoLatLng    = { lat, lng };
  _geoActive    = true;
  _bestAccuracy = Math.min(_bestAccuracy, acc);

  // První fix — zelená hláška
  if (!_geoFirstFix) {
    _geoFirstFix = true;
    badge('✅ Poloha zjištěna', 'ok');
  }

  // Geo marker jen mimo navigaci — nav.js má vlastní position marker
  if (!document.body.classList.contains('nav-on')) {
    _updateGeoMarker(lat, lng, acc);
  }

  // Zobraz nav tlačítko při prvním fixu
  document.getElementById('nav-pick-btn')?.classList.add('on');
}

function _updateGeoMarker(lat, lng, acc) {
  // Dvojitá pojistka: nikdy nevykresli geo marker během navigace
  if (document.body.classList.contains('nav-on')) return;
  const accR = Math.min(acc, 200); // nezobrazuj obří kruhy

  if (!_geoMarker) {
    const ico = L.divIcon({
      html: `<div style="width:14px;height:14px;background:#3b82f6;border:3px solid #fff;
               border-radius:50%;box-shadow:0 0 10px #3b82f6aa"></div>`,
      className: '', iconSize: [14,14], iconAnchor: [7,7],
    });
    _geoMarker = L.marker([lat, lng], {
        icon: ico, zIndexOffset: 700,
        rotateWithView: true,   // zůstane vzpřímený při rotaci mapy
      })
      .addTo(map)
      .bindPopup(`
        <div style="display:flex;align-items:center;gap:8px;padding:7px 12px;white-space:nowrap;font-family:'DM Sans',sans-serif">
          <span style="font-size:.78rem;font-weight:700;color:#e2e8f0">📍 Vaše poloha</span>
          <span id="geo-acc-txt" style="font-size:.65rem;font-weight:600;color:#0ea5e9;background:rgba(14,165,233,.15);border:1px solid rgba(14,165,233,.3);padding:2px 7px;border-radius:20px">±${Math.round(acc)} m</span>
        </div>`,
        { maxWidth: 240, minWidth: 0, className: 'geo-popup' }
      );

    _geoCircle = L.circle([lat, lng], {
      radius: accR, color: '#3b82f6', fillColor: '#3b82f6',
      fillOpacity: .07, weight: 1, interactive: false,
    }).addTo(map);

    map.setView([lat, lng], 16);
  } else {
    _geoMarker.setLatLng([lat, lng]);
    _geoCircle.setLatLng([lat, lng]);
    _geoCircle.setRadius(accR);
    // Aktualizuj text v popupu pokud je otevřený
    const accEl = document.getElementById('geo-acc-txt');
    if (accEl) accEl.textContent = `±${Math.round(acc)} m`;
  }
}

// Skryj geo vizuály (marker + kruh) bez zastavení watche
// Volá se při startu navigace — poloha dál existuje pro nav.js
function hideGeoVisuals() {
  if (_geoMarker) { try { map.removeLayer(_geoMarker); } catch(e){} _geoMarker = null; }
  if (_geoCircle) { try { map.removeLayer(_geoCircle); } catch(e){} _geoCircle = null; }
  // _geoActive zůstane true, watchPosition pokračuje
}

// Obnov geo marker + kruh po ukončení navigace
function showGeoVisuals() {
  if (!_geoActive || !_geoLatLng) return;
  // Delay 180ms — nav-on musí být pryč dříve než zobrazíme marker
  // Guard uvnitř: clearNav() voláno i z _startNav, tam nav-on přibyde znovu
  setTimeout(() => {
    if (_geoLatLng && !document.body.classList.contains('nav-on')) {
      // Ujisti se, že starý marker je odstraněn (hideGeoVisuals ho smazal)
      _geoMarker = null; _geoCircle = null;
      _updateGeoMarker(_geoLatLng.lat, _geoLatLng.lng,
        _bestAccuracy < Infinity ? _bestAccuracy : 25);
    }
  }, 180);
}

function _stopGeo() {
  if (_geoWatchId !== null) {
    navigator.geolocation.clearWatch(_geoWatchId);
    _geoWatchId = null;
  }
  clearTimeout(_geoSettleTimer);
  if (_geoMarker) { try { map.removeLayer(_geoMarker); } catch(e){} _geoMarker = null; }
  if (_geoCircle) { try { map.removeLayer(_geoCircle); } catch(e){} _geoCircle = null; }
  _geoActive    = false;
  _geoLatLng    = null;
  _bestAccuracy = Infinity;
}

// Vrátí aktuální LatLng pro nav.js
function getGeoLatLng() {
  if (!_geoLatLng) return null;
  return L.latLng(_geoLatLng.lat, _geoLatLng.lng);
}

// ════════════════════════════════════════════════════════════════
//  BADGE + LOADING
// ════════════════════════════════════════════════════════════════
let _badgeTimer;
function badge(msg, variant) {
  const el = document.getElementById('dbadge');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('fade', 'badge-ok');
  if (variant === 'ok') el.classList.add('badge-ok');
  clearTimeout(_badgeTimer);
  // OK badge zmizí rychleji — 3 s
  const delay = variant === 'ok' ? 3000 : 5000;
  _badgeTimer = setTimeout(() => {
    el.classList.add('fade');
    setTimeout(() => {
      el.classList.remove('badge-ok', 'fade');
      el.textContent = '';  // prázdný → :not(:empty) skryje box
    }, 1300);
  }, delay);
}
function ld(msg) {
  const el = document.getElementById('ld-sub');
  if (el) el.textContent = msg;
}

// ════════════════════════════════════════════════════════════════
//  INICIALIZACE
// ════════════════════════════════════════════════════════════════
window.addEventListener('load', async () => {
  // Desktop/mobil class na body — pro CSS cílení
  function _syncMobileClass() {
    document.body.classList.toggle('is-mobile', isMobile());
  }
  _syncMobileClass();
  window.addEventListener('resize', _syncMobileClass);
  ld('Načítám datové vrstvy…');
  // Načtení všech souborů z DATA_FILES (config.js) přes script tagy
  if (typeof loadDataFiles === 'function') await loadDataFiles();

  ld('Načítám data…');
  try { initQGISLayers(); } catch(e) { console.error('initQGISLayers:', e); }

  try { await loadPOI(); } catch(e) { console.warn('loadPOI:', e); }

  poiGroup.bringToFront();
  updateLayoutPositions();
  _syncCatsAccordion();

  _bsInit();
  _initBSSwipe();

  ld('Hotovo ✓');
  document.getElementById('loading').classList.add('out');
  setTimeout(() => document.getElementById('loading').remove(), 500);
});

// ── Kategorie accordion — landscape default zavřený ─────────────
// Při přechodu do landscape se <details> zavře; při opuštění zůstane otevřený (open attr v HTML).
let _catsOpen = true;

function toggleCatsAccordion() {
  _catsOpen = !_catsOpen;
  const body = document.getElementById('ls-cat-body');
  const btn  = document.getElementById('cats-toggle-btn');
  if (body) body.classList.toggle('cats-collapsed', !_catsOpen);
  if (btn)  btn.classList.toggle('on', !_catsOpen);
}

function _syncCatsAccordion() {
  const body = document.getElementById('ls-cat-body');
  if (!body) return;
  if (isLandscapeMob()) {
    _catsOpen = false;
    body.classList.add('cats-collapsed');
  } else {
    _catsOpen = true;
    body.classList.remove('cats-collapsed');
  }
  const btn = document.getElementById('cats-toggle-btn');
  if (btn) btn.classList.toggle('on', !_catsOpen);
}

let _wasLandscape = false;
function _onViewportResize() {
  // Spustí se při změně visualViewport (iOS address bar, keyboard)
  if (isMobile() && !isLandscapeMob()) {
    requestAnimationFrame(() => _bsSetY(_bsPeekY(), false));
  }
}
if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', _onViewportResize);
}
window.addEventListener('resize', () => {
  const nowLandscape = isLandscapeMob();
  if (_wasLandscape && !nowLandscape && isMobile()) {
    document.body.classList.remove('ls-sb-closed');
    sbOpen = true;
    const sbar = document.getElementById('sidebar');
    if (sbar) { sbar.style.transform = ''; sbar.classList.remove('closed'); }
    bsExpanded = false;
    requestAnimationFrame(() => requestAnimationFrame(() => _bsInit()));
  }
  _wasLandscape = nowLandscape;
  _syncCatsAccordion();
  _syncMobileClass();
  updateLayoutPositions();
  if (isMobile()) {
    _bsSnapTo(bsExpanded, false);
  } else {
    const bs = document.getElementById('sidebar');
    if (bs) { bs.style.transform = ''; bs.style.transition = ''; }
  }
});

// ── --ml POLYFILL ANIMACE ────────────────────────────────────────
// Zajistí pohyb prvků mapy i na iOS < 16.4 a Android Chrome < 111
// kde @property není podporován.
let _mlAnimFrame = null;
function _animateML(targetPx) {
  // Pokud @property funguje, CSS transition se postará sama
  // JS animace slouží jako záloha
  const duration = 280; // ms — shodné s CSS transition
  const start    = performance.now();
  const from     = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--ml') || '0'
  ) || (targetPx === 0 ? 210 : 0);

  if (_mlAnimFrame) cancelAnimationFrame(_mlAnimFrame);

  function step(now) {
    const t = Math.min((now - start) / duration, 1);
    // ease: cubic-bezier(.4,0,.2,1) aproximace
    const ease = t < .5 ? 2*t*t : -1+(4-2*t)*t;
    const val  = from + (targetPx - from) * ease;
    document.documentElement.style.setProperty('--ml', val.toFixed(1) + 'px');
    if (t < 1) _mlAnimFrame = requestAnimationFrame(step);
  }
  _mlAnimFrame = requestAnimationFrame(step);
}
