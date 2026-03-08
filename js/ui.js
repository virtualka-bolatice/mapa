'use strict';

// ════════════════════════════════════════════════════════════════
//  ui.js — Sidebar, layout, geolokace, inicializace
// ════════════════════════════════════════════════════════════════

// ── SIDEBAR ──────────────────────────────────────────────────────
let sbOpen = true;

function toggleSB() {
  sbOpen = !sbOpen;
  document.getElementById('sidebar').classList.toggle('closed', !sbOpen);

  const handle = document.getElementById('sb-handle');
  handle.classList.toggle('closed', !sbOpen);
  handle.textContent = sbOpen ? '◀' : '▶';

  document.getElementById('sb-hbtn').classList.toggle('on', sbOpen);
  updateLayoutPositions();
}

// Posun měřítka a středu statistik dle šířky sidebaru
function updateLayoutPositions() {
  const offset = sbOpen ? 285 : 0;

  // Leaflet scale (bottomleft)
  const scale = document.querySelector('.leaflet-bottom.leaflet-left');
  if (scale) scale.style.marginLeft = offset + 'px';

  // Stats panel
  const stats = document.getElementById('stats-panel');
  if (stats) {
    stats.style.left      = sbOpen ? `calc(50% + ${offset / 2}px)` : '50%';
    stats.style.transform = 'translateX(-50%)';
  }

  // Měřicí panel — stejná logika
  const msr = document.getElementById('msr-panel');
  if (msr) {
    msr.style.left      = sbOpen ? `calc(50% + ${offset / 2}px)` : '50%';
    msr.style.transform = 'translateX(-50%)';
  }
}

// ── GEOLOKACE ────────────────────────────────────────────────────
let geoMarker = null;

function geolocate() {
  const btn = document.getElementById('fab-geo');
  if (!navigator.geolocation) { alert('Geolokace není v tomto prohlížeči dostupná.'); return; }

  btn.classList.add('on');
  navigator.geolocation.getCurrentPosition(
    pos => {
      const { latitude: lat, longitude: lng, accuracy: acc } = pos.coords;
      if (geoMarker) map.removeLayer(geoMarker);

      const ico = L.divIcon({
        html: `<div style="width:13px;height:13px;background:#3b82f6;border:3px solid #fff;border-radius:50%;box-shadow:0 0 10px #3b82f6aa"></div>`,
        className: '', iconSize: [13,13], iconAnchor: [6.5, 6.5],
      });

      geoMarker = L.marker([lat, lng], { icon: ico }).addTo(map)
        .bindPopup(`<div style="padding:8px 10px;font-size:.75rem">📍 Vaše poloha<br><span style="color:var(--muted);font-size:.68rem">±${Math.round(acc)} m</span></div>`);

      L.circle([lat, lng], {
        radius: acc, color: '#3b82f6', fillColor: '#3b82f6', fillOpacity: .07, weight: 1,
      }).addTo(map);

      map.setView([lat, lng], 16);
      btn.classList.remove('on');
    },
    err => {
      btn.classList.remove('on');
      alert('Chyba geolokace: ' + err.message);
    }
  );
}

// ── BADGE ─────────────────────────────────────────────────────────
let badgeTimer;
function badge(msg) {
  const el = document.getElementById('dbadge');
  el.textContent = msg;
  el.classList.remove('fade');
  clearTimeout(badgeTimer);
  badgeTimer = setTimeout(() => el.classList.add('fade'), 5000);
}

function ld(msg) {
  const el = document.getElementById('ld-sub');
  if (el) el.textContent = msg;
}

// ── INICIALIZACE ──────────────────────────────────────────────────
window.addEventListener('load', async () => {
  ld('Registruji IS DMVS vrstvy…');
  initQGISLayers();

  ld('Načítám POI data…');
  await loadPOI();

  poiGroup.bringToFront();
  updateLayoutPositions();

  ld('Hotovo ✓');
  document.getElementById('loading').classList.add('out');
  setTimeout(() => document.getElementById('loading').remove(), 500);
});
