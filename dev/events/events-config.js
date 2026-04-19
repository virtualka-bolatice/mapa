'use strict';
// ════════════════════════════════════════════════════════════════
//  events-config.js — NASTAVENÍ SPRÁVY UDÁLOSTÍ
//
//  1. Vytvoř si účet na https://jsonbin.io (zdarma)
//  2. Vytvoř nový BIN → zkopíruj BIN ID
//  3. V Account → API Keys → zkopíruj Master Key
//  4. Vyplň hodnoty níže
//
//  ⚠️  API klíč je viditelný v kódu (GitHub Pages = statické hostování).
//      Doporučení: nastav v JSONBin READ jako veřejné, WRITE bez extra omezení.
//      Pro diplomovou práci je tato úroveň zabezpečení dostačující.
// ════════════════════════════════════════════════════════════════

const EVENTS_CONFIG = {
  // JSONBin.io identifikátory
  BIN_ID:  '69d17e63aaba882197c59650',
  API_KEY: '$2a$10$fWAcGk1/xhNhJch/6rQ2cO6oj/Jb3za3G18GCA/zx2Wh07X3x47We',

  // Typy událostí — barva, ikona, popisek
  EVENT_TYPES: {
    udrzba: {
      label:   'Údržba / Výstraha',
      color:   '#f97316',
      fillColor: '#f97316',
      icon:    '⚠️',
      fillOpacity: 0.22,
    },
    zabava: {
      label:   'Zábavní událost',
      color:   '#22c55e',
      fillColor: '#22c55e',
      icon:    '🎉',
      fillOpacity: 0.20,
    },
    sport: {
      label:   'Sportovní událost',
      color:   '#06b6d4',
      fillColor: '#06b6d4',
      icon:    '🏆',
      fillOpacity: 0.20,
    },
    kulturni: {
      label:       'Kulturní akce',
      color:       '#d946ef',
      fillColor:   '#d946ef',
      icon:        '🎭',
      fillOpacity: 0.18,
    },
    komunitni: {
      label:       'Komunitní akce',
      color:       '#06d6a0',
      fillColor:   '#06d6a0',
      icon:        '🤝',
      fillOpacity: 0.18,
    },
    trasa: {
      label:     'Vyznačená trasa',
      color:     '#a855f7',
      fillColor: '#a855f7',
      icon:      '🛤️',
      fillOpacity: 0.12,
      isRoute:   true,   // speciální režim — polyline místo polygon fill
    },
  },
};
