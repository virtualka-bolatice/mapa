# 🗺 Interaktivní mapa obce Bolatice

Webová interaktivní mapa obce Bolatice vznikla jako výstup diplomové práce v oboru **Geodézie a kartografie**. Kombinuje data z informačního systému digitální mapy veřejné správy (IS DMVS) s vlastní vrstvou bodů zájmu (POI) a navigačními funkcemi.

Mapa je přístupná přímo v prohlížeči bez nutnosti instalace — funguje na počítači i mobilním zařízení.

---

## Obsah

- [Spuštění](#spuštění)
- [Ovládání — počítač](#ovládání--počítač)
- [Ovládání — mobilní zařízení](#ovládání--mobilní-zařízení)
- [Funkce mapy](#funkce-mapy)
  - [Podkladové mapy](#podkladové-mapy)
  - [Body zájmu (POI)](#body-zájmu-poi)
  - [Navigace](#navigace)
  - [Měření](#měření)
  - [Pokročilý režim — IS DMVS](#pokročilý-režim--is-dmvs)
- [Struktura souborů](#struktura-souborů)

---

## Spuštění

Stačí otevřít soubor `index.html` v moderním prohlížeči (Chrome, Firefox, Edge, Safari). Doporučuje se připojení k internetu — mapa stahuje podkladové dlaždice a geokóduje adresy pro navigaci.

```
index.html              hlavní HTML soubor
css/
  app.css               všechny styly
js/
  config.js             ← EDITOVATELNÝ: seznam DMVS vrstev + kategorie POI
  map.js                inicializace Leaflet mapy, podkladové mapy, přepínání podkladů
  layers.js             IS DMVS vrstvy, popupy, pokročilý režim
  poi.js                POI systém, filtry, vyhledávání, popupy, rozvrhy
  nav.js                navigace OSRM, GPS tracking, heading kužel
  ui.js                 sidebar, bottom sheet, geolokace, layout
  measure.js            měření vzdáleností a ploch
  weather.js            widget počasí (Open-Meteo API)
events/
  events-config.js      ← EDITOVATELNÝ: JSONBin klíče, typy událostí
  events.js             modul správy a zobrazení událostí
  events.css            styly panelu, dialogů a popupů událostí
  README.md             instalace a konfigurace modulu
data/
  *.js                  exporty vrstev z qgis2web
foto/                   fotografie POI
```

---

## Ovládání — počítač

### Pohyb v mapě

| Akce | Ovládání |
|------|----------|
| Posun | Klik a tažení nebo šipkami na klávesnici |
| Přiblížení / oddálení | `Scroll` nebo tlačítka `+` / `−` (vpravo dole) |
| Přiblížení na oblast | `Shift` + tažení — vykreslí výběrový obdélník |
| Rotace mapy | `Shift` + točení kolečkem na myši |
| Reset severu | Tlačítko kompasu (zobrazí se při otočené mapě) |

### Postranní panel

Kliknutím na tlačítko **☰** v záhlaví se panel otevírá a zavírá. Při zavřeném panelu se mapa rozšíří na celou šířku okna.

### Popupy

Kliknutím na jakýkoli objekt na mapě (budovu, POI, vrstvu) se zobrazí informační popup s dostupnými daty a odkazem na Google Maps.

---

## Ovládání — mobilní zařízení

### Portrétní orientace (na výšku)

Ovládací panel je **spodní výsuvný panel** (bottom sheet):

| Akce | Gesto |
|------|-------|
| Rozbalit panel | Tažení panelu nahoru nebo kliknutí na kategorii |
| Skrýt panel | Tažení dolů |
| Posun v mapě | Dotyk a tažení (v oblasti mapy nad panelem) |
| Přiblížení | Sevření / rozevření dvěma prsty (pinch-to-zoom) |
| Rotace mapy | Otočení dvěma prsty |

---

## Funkce mapy

### Podkladové mapy

Přepínání v záhlaví tlačítky **Mapa** / **Ortofoto**:

- **Mapa** — CartoDB Voyager, přehledná vektorová mapa s popiskami
- **Ortofoto** — letecké snímky ČÚZK (Ortofotomapa ČR); při nedostupnosti serveru ČÚZK se automaticky přepne na záložní Esri World Imagery

---

### Body zájmu (POI)

POI jsou rozděleny do kategorií viditelných v bočním panelu:

| Kategorie | Subkategorie |
|-----------|--------------|
| 🍽 Gastronomie | Restaurace, Hospoda, Kavárna, Pizzeria, Fast food |
| 🏥 Zdravotnictví | Praktický lékař, Zubař, Lékárna, Specialista |
| ⚽ Sport & volný čas | Venkovní sport, Hala, Dětské hřiště |
| 🏛 Úřady & instituce | Obecní úřad, Škola, Kostel, Pošta |
| 🛒 Obchody | Potraviny, Smíšené |
| 🔧 Služby | Kadeřnictví, Kosmetika, Auto-moto, Banka, Ubytování, Ostatní |

**Filtrování:**
- Kliknutí na kategorii → zobrazí pouze tuto kategorii (ostatní se skryjí)
- Druhé kliknutí na tutéž kategorii → zobrazí vše
- Kliknutí na jinou kategorii → přepne výběr

**Vyhledávání:**
Do pole *Hledat v mapě* lze psát název místa — výsledky se zobrazují v reálném čase. Na mobilním zařízení je vyhledávání dostupné přes ikonu 🔍 v záhlaví.

**Popup POI** obsahuje:
- Název, kategorii a subkategorii
- Fotografii (pokud je dostupná)
- Tlačítka: 🧭 **Navigovat** · 🗺 **Otevřít v Google Maps** · 🌐 **Webová stránka**

---

### Navigace

Navigace využívá open-source routovací server **OSRM** a polohu zařízení (GPS).

#### Spuštění navigace

1. Zapnout GPS tlačítkem 📍 (FAB vpravo dole) — mapa se vycentruje na aktuální polohu
2. Kliknout **Vybrat cíl na mapě** → kurzor se změní na zaměřovač
3. Kliknout na cíl v mapě → zobrazí se potvrzovací lišta s adresou
4. Potvrdit tlačítkem **Navigovat** → otevře se výběr dopravního prostředku s odhadovanými časy
5. Vybrat **🚗 Auto** nebo **🚶 Pěší** → trasa se vykreslí na mapě

#### Průběh navigace

- Modrá linie = celá trasa, světlejší linie = již ujetý úsek
- Navigační widget (vlevo nahoře) zobrazuje cíl, zbývající čas a vzdálenost
- Šipka / ikona chodce se otáčí dle aktuálního směru jízdy
- Modrobílý kužel před ikonou znázorňuje výhled

| Tlačítko | Funkce |
|----------|--------|
| **🧭 / Vycentrovat** | Vrátí mapu na aktuální polohu (zobrazí se po ručním posunu) |
| **✕** | Ukončí navigaci |

Po dosažení cíle (do 25 m) se zobrazí příjezdový modal se statistikami jízdy (čas, vzdálenost, způsob dopravy).

#### Ukončení navigace

Tlačítkem **✕** v navigačním widgetu nebo FAB tlačítkem 🔴 v pravém dolním rohu.

---

### Měření

Aktivace tlačítkem 📐 (FAB vpravo dole).

| Akce | Ovládání |
|------|----------|
| Přidat bod | Kliknutí na mapu |
| Uzavřít plochu | `Enter` nebo kliknutí blízko prvního bodu |
| Zrušit měření | `Escape` nebo tlačítko Vymazat |

Panel měření průběžně zobrazuje celkovou délku a odhadovanou plochu. Po uzavření polygonu se zobrazí přesná plocha a obvod.

---

### Pokročilý režim — IS DMVS

Aktivace tlačítkem **⚙️ Pokročilý režim** v bočním panelu.

Zobrazí vrstvy z **Informačního systému digitální mapy veřejné správy** rozdělené do skupin:

**Objekty**
- Budovy
- Parkoviště
- Hřiště

**Doprava**
- Chodníky
- Cyklostezky
- Komunikace

Každou vrstvu lze zapnout/vypnout přepínačem. Po zapnutí se zobrazí posuvník průhlednosti (0–100 %).

Kliknutím na objekt se otevře popup s dostupnými atributy z IS DMVS (plocha, datum vkladu).

---


---

### Správa událostí a hrozeb

Funkce dostupná **pouze v pokročilém režimu** slouží pro vyznačení dočasných ploch na mapě — uzavírek, sportovních nebo kulturních akcí.

#### Typy událostí

| Ikona | Typ | Použití |
|-------|-----|---------|
| ⚠️ | Údržba / Výstraha | Uzavírky, opravy vozovky, nebezpečná místa |
| 🎉 | Zábavní událost | Trhy, festivaly, kulturní akce |
| 🏆 | Sportovní událost | Závody, turnaje, průběh tras |

#### Správa událostí

1. Přepnout do **Pokročilého režimu** → tlačítko ⚡ (v postranním panelu a FAB vpravo)
2. **Přihlásit se** — při prvním spuštění nastavit heslo (min. 6 znaků, uloženo jako SHA-256 hash)
3. Vybrat typ události a klikat body na mapě → `Enter` pro dokončení polygonu
4. Vyplnit název, podrobnosti a volitelně **rozsah platnosti** (od–do)
5. Událost se automaticky zobrazí/skryje dle nastaveného termínu

#### Plánování událostí

- Nastavení data a hodiny **zahájení** a **ukončení** přes vestavěný výběr data
- Rychlé předvolby: 1 den · 1 týden · 1 měsíc
- Synchronizace probíhá každých 60 sekund

#### Mazání událostí

Kliknutím na polygon → popup → **🗑 Zrušit událost** (vyžaduje přihlášení správce).

#### Data událostí

Události jsou sdíleny přes [JSONBin.io](https://jsonbin.io) — viditelné na všech zařízeních v reálném čase bez nutnosti serveru.


---


---

### Widget počasí

Minimalistický panel s aktuálním počasím pro oblast Bolatic (Open-Meteo API, bez API klíče).

- **FAB** vpravo nahoře — ikona + teplota, kliknutím otevře panel
- Aktuální stav, 12hodinová předpověď, 2denní výhled
- Detekce bouřky dle WMO kódů s vizuálním varováním ⚡
- Automatická aktualizace každých 15 minut


---

## Struktura souborů

```
index.html              hlavní HTML soubor
css/
  app.css               všechny styly
js/
  config.js             ← EDITOVATELNÝ: seznam DMVS vrstev + kategorie POI
  map.js                inicializace Leaflet mapy, podkladové mapy, přepínání podkladových map
  layers.js             IS DMVS vrstvy, popupy, pokročilý režim
  poi.js                POI systém, filtry, vyhledávání, popupy, otevírací doby
  nav.js                navigace OSRM, GPS tracking, heading kužel
  ui.js                 sidebar, bottom sheet, geolokace, layout
  measure.js            měření vzdáleností a ploch
  weather.js            widget počasí (Open-Meteo API)
events/
  events-config.js      ← EDITOVATELNÝ: JSONBin klíče, typy událostí
  events.js             modul správy a zobrazení událostí
  events.css            styly panelu, dialogů a popupů událostí
  README.md             instalace a konfigurace modulu
data/
  *.js                  exporty vrstev z qgis2web
foto/                   fotografie POI
```

### Přidání nové DMVS vrstvy

1. Zkopírovat `.js` soubor exportovaný z qgis2web do složky `data/`
2. Přidej řádek do `DATA_FILES`:  'NazevSouboru.js'
3. Přidat záznam do pole `DMVS_LAYERS` v `js/config.js`

### Přidání / úprava kategorií POI

Editovat objekt `CAT_CFG` v `js/config.js` — bez zásahu do ostatních souborů.

---

## Použité technologie

- [Leaflet](https://leafletjs.com/) — interaktivní mapa
- [leaflet-rotate](https://github.com/Raruto/leaflet-rotate) — rotace mapy
- [OSRM](https://project-osrm.org/) — open-source routování
- [Nominatim](https://nominatim.org/) — geokódování adres
- [ČÚZK WMS](https://www.cuzk.cz/) — ortofotomapa ČR
- [qgis2web](https://github.com/tomchadwin/qgis2web) — export vrstev z QGIS

---

*Interaktivní mapa obce Bolatice — diplomová práce, obor Geodézie a kartografie.*
