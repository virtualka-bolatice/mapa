'use strict';

// ════════════════════════════════════════════════════════════════
//  nav.js — Navigace: výběr cíle v mapě + OSRM trasa
//
//  FLOW:
//    1. geolocate() → po úspěchu se zobrazí #nav-pick-btn
//    2. Klik na tlačítko → pick mode (cursor crosshair)
//    3. Klik na mapu → reverse geocoding (Nominatim, bez klíče)
//    4. Zobrazí se #nav-confirm s názvem cíle
//    5. Potvrdit → OSRM trasa auto + pěšky vykreslena v mapě
//    6. clearNav() / fab-nav zruší vše
//
//  Deaktivace: zakomentuj <script src="js/nav.js"> v index.html
// ════════════════════════════════════════════════════════════════

const OSRM_BASE = 'https://router.project-osrm.org/route/v1';
const NOM_BASE  = 'https://nominatim.openstreetmap.org/reverse';

// ── Stav ─────────────────────────────────────────────────────────
let _navRouteLayers = [];
let _navDestMarker  = null;
let _navPickActive  = false;
let _pendingLat     = null;
let _pendingLng     = null;
let _pendingName    = null;
let _pickDotMarker  = null;   // dočasný marker při výběru

// ── MAP CLICK HANDLER pro pick mode ──────────────────────────────
async function _onMapPick(e) {
  if (!_navPickActive) return;

  const { lat, lng } = e.latlng;
  _pendingLat = lat;
  _pendingLng = lng;

  // Ukaž dočasný marker na mapě
  _removePick();
  const pickIcon = L.divIcon({
    html: `<div style="width:18px;height:18px;background:#0ea5e9;border:3px solid #fff;border-radius:50%;
                       box-shadow:0 0 14px #0ea5e9bb;animation:pick-pulse 1s ease infinite"></div>`,
    className: '', iconSize: [18,18], iconAnchor: [9,9],
  });
  _pickDotMarker = L.marker([lat, lng], { icon: pickIcon, zIndexOffset: 1000 }).addTo(map);

  // Reverse geocoding
  document.getElementById('nc-dest-name').textContent = '⏳ Hledám…';
  document.getElementById('nav-confirm').classList.add('on');

  try {
    const r = await fetch(
      `${NOM_BASE}?lat=${lat}&lon=${lng}&format=json&zoom=17&addressdetails=0`,
      { headers: { 'Accept-Language': 'cs' } }
    );
    if (r.ok) {
      const d = await r.json();
      _pendingName = d.display_name
        ? d.display_name.split(',').slice(0, 2).join(', ')
        : `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    } else {
      _pendingName = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    }
  } catch(e) {
    _pendingName = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }

  document.getElementById('nc-dest-name').textContent = _pendingName;

  // Zastav pick mode — cursor zpět, ale neodhlašuj click handler (čeká na confirm/cancel)
  map.getContainer().style.cursor = '';
  _navPickActive = false;
  // Aktualizuj label tlačítka
  const lbl = document.getElementById('nav-pick-lbl');
  if (lbl) lbl.textContent = 'Změnit cíl';
  document.getElementById('nav-pick-btn')?.classList.remove('pick-active');
}

function _removePick() {
  if (_pickDotMarker) { try { map.removeLayer(_pickDotMarker); } catch(e){} _pickDotMarker = null; }
}

// ── TOGGLE PICK MODE ─────────────────────────────────────────────
function toggleNavPick() {
  if (_navPickActive) {
    // Zruš pick mode
    _navPickActive = false;
    map.off('click', _onMapPick);
    map.getContainer().style.cursor = '';
    document.getElementById('nav-pick-btn')?.classList.remove('pick-active');
    const lbl = document.getElementById('nav-pick-lbl');
    if (lbl) lbl.textContent = 'Vybrat cíl na mapě';
    return;
  }

  // Zapni pick mode
  _navPickActive = true;
  document.getElementById('nav-confirm')?.classList.remove('on');
  _removePick();
  map.getContainer().style.cursor = 'crosshair';
  document.getElementById('nav-pick-btn')?.classList.add('pick-active');
  const lbl = document.getElementById('nav-pick-lbl');
  if (lbl) lbl.textContent = 'Klikni na cíl…';

  map.once('click', _onMapPick);
  badge('🎯 Klikni na mapu pro výběr cíle');
}

// ── POTVRDIT NAVIGACI ────────────────────────────────────────────
function confirmNav() {
  if (_pendingLat === null) return;
  document.getElementById('nav-confirm')?.classList.remove('on');
  document.getElementById('nav-pick-btn')?.classList.remove('on');
  navigateTo(_pendingLat, _pendingLng, _pendingName);
}

// ── ZRUŠIT VÝBĚR ────────────────────────────────────────────────
function cancelNavPick() {
  _navPickActive = false;
  _pendingLat = _pendingLng = _pendingName = null;
  map.off('click', _onMapPick);
  map.getContainer().style.cursor = '';
  _removePick();
  document.getElementById('nav-confirm')?.classList.remove('on');
  document.getElementById('nav-pick-btn')?.classList.remove('pick-active');
  const lbl = document.getElementById('nav-pick-lbl');
  if (lbl) lbl.textContent = 'Vybrat cíl na mapě';
}

// ── NAVIGACE Z POI POPUPU (přímé volání) ─────────────────────────
async function navigateTo(targetLat, targetLng, targetName) {
  const geoPos = getGeoLatLng?.();

  if (!geoPos) {
    // Nemáme polohu — zjisti ji nejdřív
    badge('📍 Zjišťuji polohu…');
    if (!navigator.geolocation) { badge('❌ Geolokace není dostupná'); return; }

    navigator.geolocation.getCurrentPosition(
      pos => {
        // Ulož polohu do geoMarker (přes ui.js mechanismus)
        // a pak znovu zavolej navigaci
        navigateTo(targetLat, targetLng, targetName);
      },
      err => badge('❌ Poloha nedostupná: ' + err.message),
      { enableHighAccuracy: false, timeout: 8000 }
    );
    return;
  }

  const oLat = geoPos.lat;
  const oLng = geoPos.lng;

  clearNav(); // vymaž předchozí trasu
  badge('🧭 Načítám trasu…');

  try {
    if (!map.getPane('navPane')) {
      map.createPane('navPane');
      map.getPane('navPane').style.zIndex = 350;
    }

    const coord  = `${oLng},${oLat};${targetLng},${targetLat}`;
    const params = '?overview=full&geometries=geojson&steps=false';

    const [driveRes, walkRes] = await Promise.allSettled([
      fetch(`${OSRM_BASE}/driving/${coord}${params}`),
      fetch(`${OSRM_BASE}/walking/${coord}${params}`),
    ]);

    const driveData = driveRes.status === 'fulfilled' && driveRes.value.ok
      ? await driveRes.value.json() : null;
    const walkData  = walkRes.status  === 'fulfilled' && walkRes.value.ok
      ? await walkRes.value.json()  : null;

    if (!driveData?.routes?.length && !walkData?.routes?.length) {
      badge('❌ Trasa nenalezena');
      return;
    }

    const driveRoute = driveData?.routes?.[0];
    const walkRoute  = walkData?.routes?.[0];

    // ── Vykresli auto trasu ──
    if (driveRoute) {
      const shadow = L.geoJSON(driveRoute.geometry, {
        pane: 'navPane',
        style: { color: '#1e40af', weight: 9, opacity: .25, lineCap: 'round', lineJoin: 'round' },
      }).addTo(map);
      const main = L.geoJSON(driveRoute.geometry, {
        pane: 'navPane',
        style: { color: '#3b82f6', weight: 5, opacity: .92, lineCap: 'round', lineJoin: 'round' },
      }).addTo(map);
      _navRouteLayers.push(shadow, main);
    }

    // ── Pěší trasa (jen pokud výrazně kratší) ──
    if (walkRoute && (!driveRoute || walkRoute.distance < driveRoute.distance * 0.72)) {
      const walkLine = L.geoJSON(walkRoute.geometry, {
        pane: 'navPane',
        style: { color: '#10b981', weight: 3, opacity: .75, dashArray: '6,5', lineCap: 'round' },
      }).addTo(map);
      _navRouteLayers.push(walkLine);
    }

    // ── Marker cíle ──
    const destIcon = L.divIcon({
      html: `<div style="
        width:20px;height:20px;background:#f97316;border:3px solid #fff;
        border-radius:50%;box-shadow:0 0 14px #f97316aa;
        display:flex;align-items:center;justify-content:center;
        font-size:.65rem;color:#fff;font-weight:700;">🎯</div>`,
      className: '', iconSize: [20,20], iconAnchor: [10,10],
    });
    _navDestMarker = L.marker([targetLat, targetLng], { icon: destIcon, pane: 'navPane' })
      .addTo(map)
      .bindPopup(`<div style="padding:6px 10px;font-size:.75rem;font-family:DM Sans,sans-serif">
        🎯 <strong>${targetName || 'Cíl'}</strong></div>`);

    // ── Widget ──
    _showNavWidget({
      name:          targetName,
      driveDuration: driveRoute?.duration,
      driveDistance: driveRoute?.distance,
      walkDuration:  walkRoute?.duration,
    });

    // ── Fit bounds ──
    try {
      map.fitBounds(L.featureGroup(_navRouteLayers).getBounds().pad(.12));
    } catch(e) {}

    document.getElementById('fab-nav')?.classList.add('on');
    badge('✅ Trasa načtena');

  } catch(err) {
    console.error('nav.js:', err);
    badge('❌ Chyba trasy — zkontroluj připojení');
  }
}

// ── WIDGET ───────────────────────────────────────────────────────
function _showNavWidget({ name, driveDuration, driveDistance, walkDuration }) {
  document.getElementById('nav-dest-name').textContent  = name || 'Cíl';
  document.getElementById('nav-drive-time').textContent = driveDuration ? _fmtDur(driveDuration) : '–';
  document.getElementById('nav-walk-time').textContent  = walkDuration  ? _fmtDur(walkDuration)  : '–';
  document.getElementById('nav-dist').textContent       = driveDistance ? _fmtDist(driveDistance) : '';
  document.getElementById('nav-widget').classList.add('on');
}

// ── VYMAZAT TRASU ────────────────────────────────────────────────
function clearNav() {
  _navRouteLayers.forEach(l => { try { map.removeLayer(l); } catch(e){} });
  _navRouteLayers = [];
  if (_navDestMarker) { try { map.removeLayer(_navDestMarker); } catch(e){} _navDestMarker = null; }
  _removePick();
  _navPickActive = false;
  map.off('click', _onMapPick);
  map.getContainer().style.cursor = '';

  document.getElementById('nav-widget')?.classList.remove('on');
  document.getElementById('fab-nav')?.classList.remove('on');
  document.getElementById('nav-confirm')?.classList.remove('on');
  document.getElementById('nav-pick-btn')?.classList.remove('pick-active');
  const lbl = document.getElementById('nav-pick-lbl');
  if (lbl) lbl.textContent = 'Vybrat cíl na mapě';

  _pendingLat = _pendingLng = _pendingName = null;
}

// ── FORMÁTOVÁNÍ ──────────────────────────────────────────────────
function _fmtDur(sec) {
  if (!sec) return '–';
  const h = Math.floor(sec / 3600);
  const m = Math.ceil((sec % 3600) / 60);
  return h > 0 ? `${h} h ${m} min` : `${m} min`;
}

function _fmtDist(m) {
  if (!m) return '';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`;
}
