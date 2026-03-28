'use strict';
// ════════════════════════════════════════════════════════════════
//  weather.js — Počasí widget (Open-Meteo API)
//  Bolatice: 49.9519°N, 18.0794°E
//  Aktualizace každých 15 minut
// ════════════════════════════════════════════════════════════════

const WX = {
  LAT:  49.9519,
  LNG:  18.0794,
  UPDATE_MS: 15 * 60 * 1000,
  _timer: null,
  _open: false,
};

// WMO kódy → ikona + popis
const WMO = {
  0:  { i:'☀️',  t:'Jasno'         },
  1:  { i:'🌤️',  t:'Převážně jasno' },
  2:  { i:'⛅',  t:'Polojasno'     },
  3:  { i:'☁️',  t:'Zataženo'      },
  45: { i:'🌫️',  t:'Mlha'          },
  48: { i:'🌫️',  t:'Mrznoucí mlha' },
  51: { i:'🌦️',  t:'Slabé mrholení'},
  53: { i:'🌦️',  t:'Mrholení'      },
  55: { i:'🌧️',  t:'Silné mrholení'},
  61: { i:'🌧️',  t:'Slabý déšť'   },
  63: { i:'🌧️',  t:'Déšť'         },
  65: { i:'🌧️',  t:'Silný déšť'   },
  66: { i:'🌨️',  t:'Mrznoucí déšť' },
  67: { i:'🌨️',  t:'Silný mrz. déšť'},
  71: { i:'❄️',  t:'Slabé sněžení' },
  73: { i:'❄️',  t:'Sněžení'       },
  75: { i:'❄️',  t:'Silné sněžení' },
  77: { i:'🌨️',  t:'Sněhové vločky'},
  80: { i:'🌦️',  t:'Slabé přeháňky'},
  81: { i:'🌧️',  t:'Přeháňky'     },
  82: { i:'⛈️',  t:'Silné přeháňky'},
  85: { i:'🌨️',  t:'Sněhové přeháňky'},
  86: { i:'🌨️',  t:'Silné sněhové přeháňky'},
  95: { i:'⛈️',  t:'Bouřka',       storm: true },
  96: { i:'⛈️',  t:'Bouřka s krupobitím', storm: true },
  99: { i:'⛈️',  t:'Silná bouřka s krupobitím', storm: true },
};

function _wmo(code) { return WMO[code] || { i:'🌡️', t:'Neznámo' }; }
function _isStorm(code) { return !!(WMO[code]?.storm); }

function _fmt(iso) {
  const d = new Date(iso);
  return d.toLocaleTimeString('cs-CZ', { hour:'2-digit', minute:'2-digit' });
}
function _fmtDay(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('cs-CZ', { weekday:'short', day:'numeric', month:'numeric' });
}
function _tempColor(t) {
  if (t <= 0)  return '#67e8f9';
  if (t <= 10) return '#60a5fa';
  if (t <= 20) return '#86efac';
  if (t <= 28) return '#fbbf24';
  return '#f87171';
}
function _rainBar(mm) {
  // 0-5mm+ → 0-100% width
  const pct = Math.min(100, (mm / 5) * 100);
  const col = mm < 0.5 ? '#3b82f6' : mm < 2 ? '#1d4ed8' : '#7c3aed';
  return `<div style="height:4px;border-radius:2px;background:var(--surf3);margin-top:2px">
    <div style="height:100%;width:${pct}%;background:${col};border-radius:2px;transition:width .4s"></div></div>`;
}

// ── FETCH DATA ──────────────────────────────────────────────────
async function _fetchWeather() {
  const url = `https://api.open-meteo.com/v1/forecast?` +
    `latitude=${WX.LAT}&longitude=${WX.LNG}` +
    `&current=temperature_2m,weather_code,wind_speed_10m,relative_humidity_2m,apparent_temperature,precipitation` +
    `&hourly=temperature_2m,precipitation,weather_code,wind_speed_10m` +
    `&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,wind_speed_10m_max,sunrise,sunset` +
    `&timezone=Europe%2FPrague&forecast_days=3`;

  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

// ── RENDER ──────────────────────────────────────────────────────
function _render(data) {
  const c = data.current;
  const h = data.hourly;
  const d = data.daily;
  const wmo = _wmo(c.weather_code);
  const storm = _isStorm(c.weather_code);
  const now = new Date();
  const nowH = now.getHours();

  // Hodinový forecast: příštích 24h od teď
  const hStart = h.time.findIndex(t => new Date(t) >= now);
  const h24 = Array.from({length: 24}, (_, i) => hStart + i)
    .filter(i => i < h.time.length)
    .map(i => ({
      t: h.time[i], temp: h.temperature_2m[i],
      rain: h.precipitation[i], code: h.weather_code[i],
      wind: h.wind_speed_10m[i]
    }));

  // Najdi max srážky v příštích 6h pro storm warning
  const nearRain = h24.slice(0, 6).reduce((acc, x) => acc + (x.rain || 0), 0);
  const nearStorm = h24.slice(0, 6).some(x => _isStorm(x.code));
  const stormWarning = storm || nearStorm || nearRain > 8;

  // Daily: 2 dny dopředu
  const days = [1, 2].map(i => ({
    date: d.time[i], max: d.temperature_2m_max[i], min: d.temperature_2m_min[i],
    rain: d.precipitation_sum[i], code: d.weather_code[i],
    wind: d.wind_speed_10m_max[i]
  }));

  const stormHtml = stormWarning ? `
    <div class="wx-storm">
      <span class="wx-storm-bolt">⚡</span>
      <span>${storm ? 'BOUŘKA' : nearStorm ? 'BOUŘKA DO 6H' : 'SILNÉ SRÁŽKY'}</span>
      <span class="wx-storm-bolt">⚡</span>
    </div>` : '';

  const hoursHtml = h24.slice(0, 12).map(x => {
    const hh = new Date(x.t).getHours();
    const w = _wmo(x.code);
    const s = _isStorm(x.code);
    const tipTxt = `${w.t}${x.rain > 0 ? ', '+x.rain.toFixed(1)+'mm' : ''}, vítr ${Math.round(x.wind)} km/h`;
    return `<div class="wx-hour ${s ? 'wx-hour-storm' : ''}" data-wx-tip="${tipTxt}">
      <span class="wx-hour-t">${String(hh).padStart(2,'0')}:00</span>
      <span>${w.i}</span>
      <span style="color:${_tempColor(x.temp)};font-weight:600">${Math.round(x.temp)}°</span>
      <span class="wx-hour-r">${x.rain > 0 ? x.rain.toFixed(1)+'mm' : ''}</span>
    </div>`;
  }).join('');

  const daysHtml = days.map(x => {
    const w = _wmo(x.code);
    const s = _isStorm(x.code);
    const tip = `${w.t} · max ${Math.round(x.max)}° / min ${Math.round(x.min)}° · ${x.rain > 0 ? x.rain.toFixed(1)+'mm srážek · ' : ''}vítr ${Math.round(x.wind)} km/h`;
    return `<div class="wx-day ${s ? 'wx-day-storm' : ''}" data-wx-tip="${tip}">
      <span class="wx-day-name">${_fmtDay(x.date)}</span>
      <span class="wx-day-ico">${w.i}</span>
      <span class="wx-day-temps">
        <span style="color:${_tempColor(x.max)};font-weight:700">${Math.round(x.max)}°</span>
        <span style="color:var(--muted)">/ ${Math.round(x.min)}°</span>
      </span>
      <span class="wx-day-rain">${x.rain > 0 ? '💧'+x.rain.toFixed(1)+'mm' : ''}</span>
      <span class="wx-day-wind">💨${Math.round(x.wind)}km/h</span>
    </div>`;
  }).join('');

  const el = document.getElementById('wx-widget');
  if (!el) return;

  el.className = `wx-widget${storm ? ' wx-storm-active' : ''}`;
  el.innerHTML = `
    <button class="wx-close" onclick="wxClose()" title="Zavřít">✕</button>
    <div class="wx-current">
      <span class="wx-ico ${storm ? 'wx-ico-storm' : ''}" data-wx-tip="${wmo.t}">${wmo.i}</span>
      <div class="wx-vals">
        <div class="wx-temp" style="color:${_tempColor(c.temperature_2m)}" data-wx-tip="${wmo.t}">
      ${Math.round(c.temperature_2m)}
      <div class="wx-deg-unit">
        <span class="wx-deg">°C</span>
      </div>
    </div>
        <div class="wx-feel">Pocitově ${Math.round(c.apparent_temperature)}°</div>
        <div class="wx-desc">${wmo.t}</div>
      </div>
      <div class="wx-side">
        <div class="wx-wind" data-wx-tip="Rychlost větru">💨 ${Math.round(c.wind_speed_10m)} <span class="wx-unit">km/h</span></div>
        <div class="wx-hum" data-wx-tip="Relativní vlhkost">💧 ${c.relative_humidity_2m}<span class="wx-unit">%</span></div>
      </div>
    </div>
    ${stormHtml}
    <div class="wx-section-lbl">Příštích 12 hodin</div>
    <div class="wx-hours">${hoursHtml}</div>
    <div class="wx-section-lbl">Výhled</div>
    <div class="wx-days">${daysHtml}</div>
    <div class="wx-footer">🕐 ${now.toLocaleTimeString('cs-CZ',{hour:'2-digit',minute:'2-digit'})} · Open-Meteo</div>
  `;
}

// ── TOGGLE ──────────────────────────────────────────────────────
function wxToggle() {
  const panel = document.getElementById('wx-panel');
  if (!panel) return;
  WX._open = !WX._open;
  panel.classList.toggle('wx-open', WX._open);
  document.getElementById('wx-fab')?.classList.toggle('wx-fab-open', WX._open);
}
function wxClose() {
  WX._open = false;
  document.getElementById('wx-panel')?.classList.remove('wx-open');
  document.getElementById('wx-fab')?.classList.remove('wx-fab-open');
}

// ── INIT ────────────────────────────────────────────────────────
async function initAladinWeather() {
  _wxInitMapClose();
  _wxInitTooltips();
  _wxFixScroll();
  // Fetch + render
  async function refresh() {
    try {
      const data = await _fetchWeather();
      // Ukáž mini ikonu na FABu
      const wmo = _wmo(data.current.weather_code);
      const fab = document.getElementById('wx-fab-ico');
      if (fab) fab.textContent = wmo.i;
      const tmpEl = document.getElementById('wx-fab-temp');
      if (tmpEl) tmpEl.textContent = Math.round(data.current.temperature_2m) + '°';
      // Sync landscape bottom bar button
      const lsIco = document.getElementById('ls-wx-ico');
      if (lsIco) lsIco.textContent = wmo.i;
      const lsTmp = document.getElementById('ls-wx-temp');
      if (lsTmp) lsTmp.textContent = Math.round(data.current.temperature_2m) + '°';
      _render(data);
    } catch(e) {
      console.warn('Weather fetch failed:', e);
      const w = document.getElementById('wx-widget');
      if (w) w.innerHTML = '<div style="padding:12px;color:var(--muted);font-size:.75rem">Počasí nedostupné</div>';
    }
  }

  await refresh();
  WX._timer = setInterval(refresh, WX.UPDATE_MS);
}

// Zavřít widget při kliknutí na mapu
function _wxInitMapClose() {
  if (typeof map === 'undefined') return;
  map.on('click', () => { if (WX._open) wxClose(); });
}

// Oprav scroll kolečkem — wx-panel (vertikální) + wx-hours (horizontální)
function _wxFixScroll() {
  const panel = document.getElementById('wx-panel');
  if (!panel) return;
  // Panel: zabrání Leafletu, povolí vertikální scroll
  panel.addEventListener('wheel', e => {
    e.stopPropagation();
    e.preventDefault();
    // Detekuj zda je kurzor nad wx-hours → horizontální scroll
    const hoursEl = e.target.closest('.wx-hours');
    if (hoursEl) {
      hoursEl.scrollLeft += e.deltaY !== 0 ? e.deltaY : e.deltaX;
    } else {
      panel.scrollTop += e.deltaY;
    }
  }, { passive: false });
}

// ── JS Tooltip for wx elements (overflow-safe) ──────────────────
function _wxInitTooltips() {
  let tip = document.getElementById('wx-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'wx-tooltip';
    document.body.appendChild(tip);
  }
  document.addEventListener('mouseover', e => {
    const el = e.target.closest('[data-wx-tip]');
    if (!el) { tip.style.opacity = '0'; return; }
    tip.textContent = el.dataset.wxTip;
    tip.style.opacity = '1';
  });
  document.addEventListener('mousemove', e => {
    if (tip.style.opacity === '0') return;
    const x = e.clientX + 12, y = e.clientY - 30;
    const maxX = window.innerWidth  - tip.offsetWidth  - 8;
    const maxY = window.innerHeight - tip.offsetHeight - 8;
    tip.style.left = Math.min(x, maxX) + 'px';
    tip.style.top  = Math.max(8, Math.min(y, maxY)) + 'px';
  });
  document.addEventListener('mouseout', e => {
    if (!e.target.closest('[data-wx-tip]')) tip.style.opacity = '0';
  });
}
