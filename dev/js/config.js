'use strict';

// ════════════════════════════════════════════════════════════════
//  config.js — EDITUJ POUZE TENTO SOUBOR
//
//  Přidání nové IS DMVS vrstvy:
//    1. Zkopíruj .js soubor z qgis2web do složky data/
//    2. Přidej řádek do DATA_FILES:  'NazevSouboru.js'
//    3. Přidej záznam do DMVS_LAYERS s varName = json_NazevSouboru
//
//  Přidání POI:
//    1. Exportuj vrstvu POI z QGIS přes qgis2web do data/POI.js
//    2. Nastav POI_FILE = 'NazevSouboru.js'  (var název = json_ + basename)
// ════════════════════════════════════════════════════════════════

// ── DATA FILES — seznam všech .js souborů ve složce data/ ────────
//  layers.js je načte automaticky přes <script> tagy.
//  Stačí přidat filename sem — nic jiného měnit nepotřebuješ.
const DATA_FILES = [
  'Budovy_2.js',
  'Parkoviste_plocha_5.js',
  'Cyklostezka_1.js',
  'Hriste_0.js',
  'Chodniky_4.js',
  'Komunikace_3.js',
  'Parkoviste_linie_6.js',
  // 'NovySoubor.js',  ← přidej sem nový soubor
];

// ── POI VRSTVA ───────────────────────────────────────────────────
//  Název qgis2web JS exportu v data/ (var json_POI = {...})
const POI_FILE = 'POI_0.js';  // qgis2web export → var json_POI_0 = {...}

// ── IS DMVS VRSTVY — vizuální konfigurace ────────────────────────
//  varName = proměnná uvnitř .js souboru (json_ + basename)
//  Příklad: Hriste_0.js → var json_Hit_0 = {...} → varName: 'json_Hit_0'
const DMVS_LAYERS = [

  // ── BUDOVY ──────────────────────────────────────────────────────
  {
    varName:     'json_Budovy_2',
    label:       'Budovy',
    group:       'Objekty',
    color:       '#8b5cf6',
    weight:      1,
    fillOpacity: 0.45,
    ltype:       'polygon',
    prio:        1,
  },

  // ── DOPRAVA ─────────────────────────────────────────────────────
  {
    varName:     'json_Parkoviste_plocha_5',
    label:       'Parkoviště',
    group:       'Objekty',
    color:       '#64748b',
    weight:      0.8,
    fillOpacity: 0.4,
    ltype:       'polygon',
    prio:        1,
  },
  {
    varName:     'json_Cyklostezka_1',
    label:       'Cyklostezky',
    group:       'Doprava',
    color:       '#059669',
    weight:      1.5,
    fillOpacity: 0.25,
    ltype:       'polygon',
    prio:        2,
  },
  {
    varName:     'json_Hit_0',
    label:       'Hřiště',
    group:       'Objekty',
    color:       '#10b981',
    weight:      1,
    fillOpacity: 0.35,
    ltype:       'polygon',
    prio:        3,
  },
  {
    varName:     'json_Chodniky_4',
    label:       'Chodníky',
    group:       'Doprava',
    color:       '#94a3b8',
    weight:      0.8,
    fillOpacity: 0.3,
    ltype:       'polygon',
    prio:        4,
  },
  {
    varName:     'json_Komunikace_3',
    label:       'Komunikace',
    group:       'Doprava',
    color:       '#d97706',
    weight:      1,
    fillOpacity: 0.25,
    ltype:       'polygon',
    prio:        5,
  },
  {
    varName:     'json_Parkoviste_linie_6',
    hidden:      true,
    label:       'Parkoviště (linie)',
    group:       'Doprava',
    color:       '#64748b',
    weight:      1.2,
    fillOpacity: 0,
    ltype:       'line',
    prio:        6,
  },
];

// ── POI KATEGORIE ────────────────────────────────────────────────
//
//  Přidej / odeber subkategorie dle potřeby.
//  Pole `foto` v GeoJSON odkazuje na soubor relativní k index.html.
//
const CAT_CFG = {
  gastro: { label:'Gastronomie',       color:'#f97316', icon:'🍽️', subs:{
    restaurace: { label:'Restaurace', icon:'🍽️', color:'#fb923c' },
    hospoda:    { label:'Hospoda',    icon:'🍺', color:'#f97316' },
    kavarna:    { label:'Kavárna',    icon:'☕', color:'#d97706' },
    pizzeria:   { label:'Pizzeria',   icon:'🍕', color:'#ef4444' },
    fast_food:  { label:'Fast food',  icon:'🍔', color:'#fbbf24' },
  }},
  zdravi: { label:'Zdravotnictví',     color:'#06b6d4', icon:'🏥', subs:{
    lekar:       { label:'Praktický lékař', icon:'👨‍⚕️', color:'#06b6d4' },
    zubar:       { label:'Zubař',           icon:'🦷',   color:'#22d3ee' },
    lekarna:     { label:'Lékárna',         icon:'💊',   color:'#67e8f9' },
    specialista: { label:'Specialista',     icon:'🩺',   color:'#0ea5e9' },
    veterina:    { label:'Veterinář',       icon:'🐾',   color:'#84cc16' },
  }},
  sport:  { label:'Sport & volný čas', color:'#10b981', icon:'⚽', subs:{
    sport_ven: { label:'Venkovní sport', icon:'⚽', color:'#10b981' },
    sport_hal: { label:'Hala',           icon:'🏋️', color:'#059669' },
    posilovna: { label:'Posilovna', icon:'🏋️', color:'#f97316' },
    detske:    { label:'Dětské hřiště',  icon:'🎠', color:'#34d399' },
    turistika: { label:'Turistika',      icon:'🥾', color:'#f59e0b' },
    bar:        { label:'Bar & koktejly',  icon:'🍸', color:'#a855f7' },
    motocross: { label:'Motocross', icon:'🏍️', color:'#ef4444' },
  }},
  urad:   { label:'Úřady & instituce', color:'#3b82f6', icon:'🏛️', subs:{
    urad_obec: { label:'Obecní úřad', icon:'🏛️', color:'#3b82f6' },
    skola:     { label:'Škola',       icon:'🏫', color:'#60a5fa' },
    cirkev:    { label:'Kostel',      icon:'⛪', color:'#93c5fd' },
    posta:     { label:'Pošta',       icon:'📮', color:'#6366f1' },
    hrbitov: { label:'Hřbitov', icon:'⚰️', color:'#6b7280' },
  }},
  obchod: { label:'Obchody',           color:'#f59e0b', icon:'🛒', subs:{
    potraviny: { label:'Potraviny', icon:'🛒', color:'#f59e0b' },
    smisene:   { label:'Smíšené',  icon:'🏪', color:'#fbbf24' },
  }},
  sluzby: { label:'Služby',            color:'#8b5cf6', icon:'🔧', subs:{
    kadernictvi: { label:'Kadeřnictví', icon:'✂️', color:'#a78bfa' },
    kosmetika:   { label:'Kosmetika',   icon:'💄', color:'#c084fc' },
    auto:        { label:'Auto-moto',   icon:'🔧', color:'#f97316' },
    finance:     { label:'Banka',       icon:'🏦', color:'#60a5fa' },
    ubytovani:   { label:'Ubytování',   icon:'🏨', color:'#34d399' },
    socialni: { label:'Sociální služby', icon:'🤝', color:'#a78bfa' },
    doprava: { label:'Doprava', icon:'🚉', color:'#0ea5e9' },
    ostatni:     { label:'Ostatní',     icon:'⚙️', color:'#94a3b8' },
  }},
};
