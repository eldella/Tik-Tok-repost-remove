# 🧹 Reposts Cleaner for TikTok

**Remove every repost from your TikTok profile in one go — free, unlimited, bilingual.**
**Eliminá todos los reposts de tu perfil de TikTok de una sola vez — gratis, ilimitado y bilingüe.**

Chrome Extension · Manifest V3 · Vanilla JavaScript · ES / EN

---

## 🇬🇧 English

### What it does

Hundreds of reposts piled up on your profile? Deleting them one by one is torture. This Chrome extension automates the whole process on TikTok's web version: open your profile, hit **Start cleaning**, and watch them disappear.

### Features

- ⛓️ **Chain mode** — removes the repost and jumps to the next video *without closing the player*. Maximum speed, zero manual clicks.
- 🔁 **Smart retries** — up to 3 attempts per item, alternating two strategies (direct repost button ↔ share panel). Stubborn items go to a **rescue queue** and get up to 2 extra full passes at the end.
- 🛡️⚡🚀 **Three speeds** — Safe (3–5s), Fast (1.5–2.6s) and Turbo (0.7–1.4s), with randomized anti-rate-limit pauses. Switchable mid-cleaning.
- 🖼️ **Photo posts supported** — handles both video reposts (`/video/`) and photo/carousel reposts (`/photo/`).
- 🌐 **Bilingual UI** — full interface and live status messages in English and Spanish, with a persistent toggle.
- 📊 **Live panel** — animated progress ring with a burst on every removal, real-time status, rescue-queue stats.
- 🛑 **Safety guards** — refuses to run unless the Reposts tab is verifiably active; never touches suggested/related videos or sidebars.
- 💯 **Free forever** — no premium tier, no removal cap, no accounts.

### Installation

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the extension folder.
5. Pin the icon to your toolbar.

### Usage

1. Log in to [tiktok.com](https://www.tiktok.com) and open **your own profile**.
2. Go to the **Reposts** tab.
3. Click the extension icon, pick a speed, and hit **Start cleaning**.
4. Keep the tab visible (Chrome throttles background tabs). Stop anytime with **Stop**.

For large cleanups (hundreds of reposts), prefer **Safe** mode. Turbo is best for short bursts — TikTok may temporarily rate-limit accounts performing too many actions too fast.

### Troubleshooting

- **Some items get skipped** → open DevTools (F12) → Console. The extension logs every failed item with its URL and type (`[RepostsCleaner] ...`).
- **Removals fail or the counter doesn't match your profile** → run the built-in diagnostic probe and attach its report to an issue. The probe is **read-only**: it clicks nothing, hovers nothing, scrolls nothing, sends nothing anywhere and doesn't touch the running cleanup. It only reports what the extension sees on the page.
  1. On tiktok.com, open DevTools (F12) → **Console**.
  2. In the context dropdown at the top of the Console (it says `top`), pick the extension's entry (the name shown in `chrome://extensions`). The probe lives in the extension's isolated context, so it doesn't exist in `top`.
  3. Run `__repostCleanerProbe()` to see the report, or `copy(JSON.stringify(__repostCleanerProbe(), null, 2))` to copy it to the clipboard as JSON.
  4. Run it twice: once on your **Reposts** grid, and once with a reposted video open in the player.

  If the extension's entry is missing or the function is undefined, reload the TikTok tab. The report includes your @username and video links: review it before sharing it. Developers can get the same report by sending `{ action: "PROBE" }` to the tab with `chrome.tabs.sendMessage`.
- **"Couldn't find the Reposts tab"** → open the Reposts tab manually and hit Start again. If your TikTok UI is in a language other than ES/EN, the tab text won't match — open an issue with the exact tab label.
- **Buttons stop responding after many removals** → that's TikTok's temporary rate limit, not a bug. Pause, wait a while, switch to Safe mode.
- **TikTok changed its layout** → all selectors live in the `SELECTORS` object at the top of `content.js`, with a cascading strategy (data-e2e → aria-label → visible text). Update there.

### Project structure

```
├── manifest.json    # Manifest V3, permissions, icons
├── content.js       # All automation logic (chain mode, retries, rescue, i18n status)
├── popup.html       # UI: animated panel, speed selector, language toggle
├── popup.js         # UI logic, i18n dictionaries, messaging with content script
└── icon16/48/128/512.png
```

Key configuration points (all commented in code):

| What | Where |
|---|---|
| Speed presets (ms) | `SPEED_PRESETS` in `content.js` |
| Retry attempts / rescue passes | `CONFIG` in `content.js` |
| TikTok DOM selectors | `SELECTORS` in `content.js` |
| Donation links | `DONATION_URL` / `DOLARAPP_ALIAS` in `popup.js` |
| UI translations | `UI` in `popup.js`, `I18N` in `content.js` |

### Privacy

Everything runs **locally in your browser tab**. The extension never asks for your password, never collects or sends personal data, and makes **zero network requests** to external servers. The only stored value is your language preference (`chrome.storage.local`). The optional diagnostic probe (see Troubleshooting) shows your @username and video links only in your own console, and only when you run it; nothing is sent anywhere.

### Disclaimer

This extension automates actions on TikTok's web interface. Use it **only with your own account**, at your own discretion — automation may conflict with TikTok's Terms of Service, and excessive speed can trigger temporary action limits. This project is **not affiliated with TikTok**.

---

## 🇦🇷 Español

### Qué hace

¿Cientos de reposts acumulados en tu perfil? Borrarlos uno por uno es una tortura. Esta extensión de Chrome automatiza todo el proceso en la versión web de TikTok: abrí tu perfil, tocá **Iniciar limpieza**, y mirá cómo desaparecen solos.

### Características

- ⛓️ **Modo cadena** — quita el repost y pasa al siguiente video *sin cerrar el reproductor*.
- 🔁 **Reintentos inteligentes** — hasta 3 intentos por video alternando dos estrategias, más una **cola de repesca** con hasta 2 pasadas extra al final.
- 🛡️⚡🚀 **Tres velocidades** — Seguro, Rápido y Turbo, con pausas aleatorias anti-bloqueo, cambiables en plena limpieza.
- 🖼️ **Soporta posts de fotos** — maneja reposts de videos (`/video/`) y de fotos/carrusel (`/photo/`).
- 🌐 **Bilingüe** — interfaz y mensajes de estado en español e inglés, con elección persistente.
- 📊 **Panel en vivo** — anillo de progreso con onda expansiva por cada borrado, estado en tiempo real y estadísticas de repesca.
- 🛑 **Protecciones** — no arranca si la pestaña de Republicaciones no está verificada como activa; nunca toca videos sugeridos ni sidebars.
- 💯 **Gratis para siempre** — sin versión premium, sin tope de borrados.

### Instalación

1. Descargá o cloná este repositorio.
2. Abrí `chrome://extensions` en Chrome.
3. Activá el **Modo desarrollador** (arriba a la derecha).
4. Tocá **Cargar descomprimida** y elegí la carpeta de la extensión.

### Uso

1. Iniciá sesión en [tiktok.com](https://www.tiktok.com) y abrí **tu propio perfil**.
2. Entrá a la pestaña **Republicaciones**.
3. Abrí el popup, elegí velocidad y tocá **Iniciar limpieza**.
4. Dejá la pestaña visible (Chrome ralentiza las pestañas en segundo plano). Podés frenar cuando quieras con **Detener**.

Para limpiezas grandes usá el modo **Seguro**. Turbo es para tandas cortas: TikTok puede limitar temporalmente cuentas con demasiadas acciones seguidas.

### Solución de problemas

- **Saltea algunos videos** → abrí DevTools (F12) → Consola: la extensión registra cada item fallido con su URL y tipo.
- **Las bajas fallan o el contador no coincide con tu perfil** → corré la sonda de diagnóstico que trae la extensión y adjuntá su reporte en un issue. La sonda es **de solo lectura**: no hace clicks, no pasa el mouse, no scrollea, no envía nada a ningún lado y no toca la limpieza en curso. Solo reporta lo que la extensión ve en la página.
  1. En tiktok.com, abrí DevTools (F12) → **Consola**.
  2. En el desplegable de contexto arriba de la Consola (dice `top`), elegí la entrada de la extensión (el nombre que figura en `chrome://extensions`). La sonda vive en el contexto aislado de la extensión, así que en `top` no existe.
  3. Ejecutá `__repostCleanerProbe()` para ver el reporte, o `copy(JSON.stringify(__repostCleanerProbe(), null, 2))` para copiarlo como JSON al portapapeles.
  4. Correla dos veces: una en tu grilla de **Republicaciones** y otra con un video republicado abierto en el reproductor.

  Si la entrada de la extensión no aparece o la función no está definida, recargá la pestaña de TikTok. El reporte incluye tu @usuario y links de videos: revisalo antes de compartirlo. Quien desarrolle puede pedir el mismo reporte enviando `{ action: "PROBE" }` a la pestaña con `chrome.tabs.sendMessage`.
- **"No encontré la pestaña Republicaciones"** → abrila a mano y volvé a iniciar. Si tu TikTok está en otro idioma que no sea ES/EN, reportá el texto exacto de la pestaña.
- **TikTok cambió su diseño** → todos los selectores están en el objeto `SELECTORS` al inicio de `content.js`, listos para actualizar.

### Privacidad

Todo corre **localmente en tu pestaña**. La extensión no pide tu contraseña, no recopila ni envía datos personales y no hace ninguna petición a servidores externos. Lo único que guarda es tu preferencia de idioma. La sonda de diagnóstico opcional (ver Solución de problemas) muestra tu @usuario y links de videos solo en tu propia consola y solo cuando la corrés; no se envía nada a ningún lado.

### Aviso

Esta extensión automatiza acciones sobre la interfaz web de TikTok. Usala **solo con tu propia cuenta** y bajo tu criterio: la automatización puede entrar en conflicto con los Términos de Servicio de TikTok, y el exceso de velocidad puede activar límites temporales. Proyecto **no afiliado a TikTok**.

---

## ☕ Support / Apoyá el proyecto

This tool is and will always be free. If it saved you hours of clicking:
Esta herramienta es y será siempre gratuita. Si te ahorró horas de clicks:

- 💛 **PayPal:** [paypal.com/paypalme/aledellabianca](https://www.paypal.com/paypalme/aledellabianca)
- 💵 **DolarApp** (USD/EUR from any country): alias `eldella123.dolarapp`

## 📄 License

MIT — do whatever you want, just keep the notice. / Hacé lo que quieras, solo mantené el aviso.

---

Made with 🧉 in Olavarría, Argentina by [Ale Della Bianca](https://dellabianca.com.ar)
