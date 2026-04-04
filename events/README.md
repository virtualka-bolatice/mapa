# events/ — Modul správy událostí pro interaktivní mapu Bolatice

## Přehled

Tento modul přidává do mapy možnost vyznačovat **barevné polygony událostí**:
- 🟠 **Údržba / Výstraha** — uzavírky, opravy, nebezpečí
- 🟢 **Zábavní událost** — trhy, festivaly, koncerty
- 🔵 **Sportovní událost** — závody, turnaje, závody

Přístup k editaci je chráněn heslem nastaveným při prvním spuštění.

---

## Soubory

| Soubor | Popis |
|--------|-------|
| `events-config.js` | Konfigurace (JSONBin klíče, typy událostí) |
| `events.js` | Hlavní logika modulu |
| `events.css` | Styly panelu, dialogů a popupů |

---

## Instalace do mapy

### 1. Konfigurace JSONBin.io

1. Registruj se na [jsonbin.io](https://jsonbin.io) (zdarma)
2. Vytvoř nový BIN s obsahem `{"events":[]}`
3. Zkopíruj **BIN ID** (z URL: `https://api.jsonbin.io/v3/b/XXXX`)
4. V **Account → API Keys** zkopíruj **Master Key**
5. Vyplň do `events-config.js`:

```js
BIN_ID:  '6614a3f0acd3cb34a84b1234',
API_KEY: '$2a$10$your_api_key_here',
```

### 2. Přidání do index.html

Před `</head>` přidej CSS:
```html
<link rel="stylesheet" href="events/events.css">
```

Před `</body>` přidej scripty (po `config.js`, před `ui.js`):
```html
<script src="events/events-config.js"></script>
<script src="events/events.js"></script>
```

### 3. Inicializace po načtení mapy

V `ui.js` ve `window.addEventListener('load', ...)` přidej za inicializaci mapy:
```js
if (typeof initEvents === 'function') initEvents(map);
```

---

## Jak to funguje

### Pro běžné návštěvníky
- Události jsou viditelné jako barevné průhledné plochy
- Kliknutím na plochu → popup s názvem a podrobnostmi

### Pro správce (přihlášení)
1. Přepni mapu do **Pokročilého režimu** → zobrazí se tlačítko ⚡
2. Klikni na ⚡ → otevře se panel správy
3. Při prvním spuštění → nastav heslo (min. 6 znaků)
4. Zvol typ události → klikej body na mapě → **Enter** pro dokončení
5. Vyplň název a podrobnosti → uložení na JSONBin
6. Mazání: klikni na polygon → popup → **🗑 Zrušit událost**

### Klávesové zkratky při kreslení
- `Enter` — dokončit polygon (min. 3 body)
- `Escape` — zrušit kreslení

---

## Bezpečnost

> ⚠️ GitHub Pages = statické hostování. API klíč JSONBin je viditelný v kódu.

**Mitigation:**
- JSONBin Master Key umožňuje čtení i zápis — nastav v JSONBin jen nutná oprávnění
- Heslo správce je uloženo jako SHA-256 hash v `localStorage` — plaintext nikde
- Pro diplomovou práci je tato úroveň zabezpečení dostačující

**Resetování hesla:**
Otevři DevTools → Application → Local Storage → smaž klíč `ev_pwd_hash` → při příštím přihlášení proběhne setup znovu.

---

## Typy událostí (rozšíření)

V `events-config.js` v sekci `EVENT_TYPES` přidej nový typ:

```js
kulturni: {
  label:       'Kulturní akce',
  color:       '#a855f7',
  fillColor:   '#a855f7',
  icon:        '🎭',
  fillOpacity: 0.18,
},
```
