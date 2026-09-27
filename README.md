# 🧹 TikTok Repost Remover

**Remove every repost from your TikTok profile in one go — free, unlimited, bilingual.**
**Eliminá todos los reposts de tu perfil de TikTok de una sola vez — gratis, ilimitado y bilingüe.**

Chrome Extension · Manifest V3 · Vanilla JavaScript · ES / EN

---

## 🇬🇧 English

### What it does

Hundreds of reposts piled up on your profile? Deleting them one by one is torture. This Chrome extension automates the whole process on TikTok's web version: open your profile, hit **Start cleaning**, and watch them disappear.

### Features

- ⛓️ **Chain mode** — removes the repost and jumps to the next video *without closing the player*. Maximum speed, zero manual clicks.
- 🔁 **Smart retries** — up to 3 attempts per item, alternating two strategies (direct repost button ↔ share panel). Stubborn items, and videos whose player doesn't open, go to a **rescue queue** and get up to 2 extra passes at the end. Anything still not removed, or that the rescue couldn't find again in the grid, is reported as pending.
- 🛡️⚡🚀 **Three speeds** — Safe (3–5s), Fast (1.5–2.6s) and Turbo (0.7–1.4s), with randomized anti-rate-limit pauses. Switchable mid-cleaning.
- 🖼️ **Photo posts supported** — handles both video reposts (`/video/`) and photo/carousel reposts (`/photo/`).
- 🌐 **Bilingual UI** — full interface and live status messages in English and Spanish, with a persistent toggle.
- 📊 **Live panel** — animated progress ring with a burst on every removal, real-time status, rescue-queue stats.
- 🛑 **Safety guards** — switches to the Reposts tab by itself and only goes on once TikTok marks it as selected; opens only the items of your Reposts grid, never suggested/related videos, sidebars or your other profile tabs; won't start on an open video it can't close first; and if TikTok's page no longer has the Reposts tab or grid it knows, it stops before touching anything.
- 💯 **Free forever** — no premium tier, no removal cap, no accounts.

### Installation

1. Download or clone this repository.
2. Open `chrome://extensions` in Chrome.
3. Enable **Developer mode** (top-right toggle).
4. Click **Load unpacked** and select the extension folder.
5. Pin the icon to your toolbar.

### Usage

1. Log in to [tiktok.com](https://www.tiktok.com) and open **your own profile**.
2. Go to the **Reposts** tab (**Compartidos** when TikTok is in Spanish). If another tab is open, the extension switches to Reposts by itself when you hit Start. Right after the tab opens, the grid can show empty placeholders for several seconds; the extension waits up to 12 seconds for it to fill.
3. Click the extension icon, pick a speed, and hit **Start cleaning**.
4. Keep the tab visible (Chrome throttles background tabs). Stop anytime with **Stop**; while the popup shows "Stopping…", **Start** stays disabled until the current step finishes.

For large cleanups (hundreds of reposts), prefer **Safe** mode. Turbo is best for short bursts — TikTok may temporarily rate-limit accounts performing too many actions too fast.

### Troubleshooting

- **Some items get skipped** → open DevTools (F12) → Console. The extension logs every failed item with its URL and type (`[TikTokRepostRemover] ...`).
- **Reposts still there after a run, or you want to run it again** → reload the TikTok tab (F5) before hitting Start again. Without a reload, a new run starts its counter at 0, retries the items that failed and continues with any it hadn't reached; items already counted as removed, or left unverified by a Stop, are skipped (the unverified ones are listed in the Console). Reloading is the way to re-check everything.
- **"Finished with pending" or "None removed: check them"** → the run ended, but the videos counted under **Not removed** couldn't be removed. Check them by hand on your profile (the Console lists their IDs), or reload the tab (F5) and hit Start to try them again. "None removed" means not a single removal worked: if it keeps happening, run the diagnostic probe described below and attach its report to an issue.
- **"Interrupted (page reload): N removed before that"** → the TikTok tab reloaded while a run was going (you pressed F5, or TikTok reloaded the page itself, for example for an error or verification page). It also shows up if you closed the tab mid-run and open TikTok again. The reload stopped the run; N is how many it had removed before that. The number is saved as the run goes, so the last removal or so before the reload may be missing from it. Go back to your profile's **Reposts** tab and hit Start: the new run starts from 0 and goes through whatever the reloaded grid shows. The message appears once, only if the run was active in the last 30 minutes, and goes away when you hit Start. If TikTok is open in more than one tab while a run is going, opening or reloading another TikTok tab can show it too; the run in the first tab keeps going. Don't hit Start in that other tab while the first one is still running: two runs at once would go through the same reposts.
- **Removals fail or the counter doesn't match your profile** → run the built-in diagnostic probe and attach its report to an issue. The probe is **read-only**: it clicks nothing, hovers nothing, scrolls nothing, sends nothing anywhere and doesn't touch the running cleanup. It only reports what the extension sees on the page.
  1. On tiktok.com, open DevTools (F12) → **Console**.
  2. In the context dropdown at the top of the Console (it says `top`), pick the extension's entry (the name shown in `chrome://extensions`). The probe lives in the extension's isolated context, so it doesn't exist in `top`.
  3. Run `__repostRemoverProbe()` to see the report, or `copy(JSON.stringify(__repostRemoverProbe(), null, 2))` to copy it to the clipboard as JSON.
  4. Run it twice: once on your **Reposts** grid, and once with a reposted video open in the player.

  If the extension's entry is missing or the function is undefined, reload the TikTok tab. The report includes your @username and video links: review it before sharing it. Developers can get the same report by sending `{ action: "PROBE" }` to the tab with `chrome.tabs.sendMessage`.
- **"Open your profile…" or "Couldn't close the video player"** → start from your profile's **Reposts** grid, not from an open video. If a video is open when you hit Start, the extension closes it first; a video page loaded directly (from a link, a notification or a refresh) usually can't be closed that way, and then the run stops before touching any repost. If the run keeps going on someone else's profile instead, hit **Stop**. "Couldn't close the video player" can also show up mid-run, when the player can neither move on nor close. Go to tiktok.com/@your_username, open the Reposts tab and hit Start again.
- **"Couldn't open the Reposts tab"** → the tab is there, but it didn't get selected after several clicks (TikTok sometimes shows a "Something went wrong" page in its place). Open the Reposts tab manually, wait for the grid to load and hit Start again.
- **"TikTok changed its page"** → after waiting for them, the extension couldn't find the Reposts tab or its grid the way it knows them, so it stopped without opening or clicking any more reposts (the message says how many it had removed before, if any). If you do have reposts, TikTok probably changed its page: run the diagnostic probe described above on your profile and attach its report to an issue. If you have no reposts left, TikTok may not show the tab at all, and then there's nothing to remove.
- **Buttons stop responding after many removals** → that's TikTok's temporary rate limit, not a bug. Pause, wait a while, switch to Safe mode.
- **TikTok changed its layout** → all selectors live in the `SELECTORS` object at the top of `content.js`. The Reposts tab and grid are found only by their `data-e2e` hooks (`repost-tab`, `user-repost-item-list`, `user-repost-item`); the tab's visible text (Compartidos / Reposts) is only a fallback when its hook is missing. The player controls use a cascading strategy (data-e2e → aria-label → visible text). Update there.

### Project structure

```
├── manifest.json    # Manifest V3, permissions, icons
├── content.js       # All automation logic (chain mode, retries, rescue, i18n status)
├── popup.html       # UI: animated panel, speed selector, language toggle
├── popup.js         # UI logic, i18n dictionaries, messaging with content script
├── _locales/        # Localized extension name and description (en, es)
├── icon16/48/128/512.png
├── package.json     # Dev only: test script and devDependencies (not shipped)
├── package-lock.json # Dev only: locked versions of the test dependencies (not shipped)
└── tests/           # Dev only: regression tests (not shipped)
```

Key configuration points (all commented in code):

| What | Where |
|---|---|
| Speed presets (ms) | `SPEED_PRESETS` in `content.js` |
| Retry attempts / rescue passes | `CONFIG` in `content.js` |
| TikTok DOM selectors | `SELECTORS` in `content.js` |
| Donation links | `DONATION_URL` / `DOLARAPP_ALIAS` in `popup.js` |
| UI translations | `UI` in `popup.js`, `I18N` in `content.js` |
| Chrome Web Store name and description | `_locales/en` and `_locales/es` (`messages.json`) |

### Development / tests

The extension itself has no dependencies. The regression tests need Node.js 22.13+ or 24+ (Node 23 is not supported by jsdom):

```
npm install
npm test
```

`npm test` runs `node --test` on `tests/**/*.test.js`. Each test loads the real `content.js` into a [jsdom](https://github.com/jsdom/jsdom) page with fake timers (`@sinonjs/fake-timers`), so a full run takes milliseconds, and drives it through the runtime messages `content.js` handles (`START`, `STOP`, `STATUS`, `SET_LANG`, `SET_SPEED`, `PROBE`), the same ones the popup and the diagnostic probe use. The page is a fake TikTok (`tests/helpers/tiktok-fixture.js`) that copies the Cinema Mode DOM observed live on 2026-09-26: profile tabs, the Reposts grid, the player rows, the repost tags and how they react to synthetic clicks. Set `HARNESS_ECHO=1` to print the page's console output. `package.json`, `package-lock.json`, `tests/` and `node_modules/` are not part of the Chrome Web Store zip.

### Privacy

Everything runs **locally in your browser tab**. The extension never asks for your password and never sends your data anywhere: it makes **zero network requests** to external servers. It stores two things in `chrome.storage.local`, on your computer only: your language preference, and the counters of the latest run (removed, rescued, pending, unverified, whether it's running or finished, the time of the last update and the page path, which includes an @username). They stay there until the next run replaces them, so a page reload can show that a run was interrupted. The optional diagnostic probe (see Troubleshooting) is read-only: only when you run it, it reads your @username and the video links on the page, locally, and shows them only in your own console; nothing is sent anywhere.

### Disclaimer

This extension automates actions on TikTok's web interface. Use it **only with your own account**, at your own discretion — automation may conflict with TikTok's Terms of Service, and excessive speed can trigger temporary action limits. This project is **not affiliated with TikTok**.

---

## 🇦🇷 Español

### Qué hace

¿Cientos de reposts acumulados en tu perfil? Borrarlos uno por uno es una tortura. Esta extensión de Chrome automatiza todo el proceso en la versión web de TikTok: abrí tu perfil, tocá **Iniciar limpieza**, y mirá cómo desaparecen solos.

### Características

- ⛓️ **Modo cadena** — quita el repost y pasa al siguiente video *sin cerrar el reproductor*.
- 🔁 **Reintentos inteligentes** — hasta 3 intentos por video alternando dos estrategias. Los que se resisten, y los videos cuyo reproductor no abre, van a una **cola de repesca** con hasta 2 pasadas extra al final. Lo que siga sin borrarse, o que la repesca no vuelva a encontrar en la grilla, queda reportado como pendiente.
- 🛡️⚡🚀 **Tres velocidades** — Seguro, Rápido y Turbo, con pausas aleatorias anti-bloqueo, cambiables en plena limpieza.
- 🖼️ **Soporta posts de fotos** — maneja reposts de videos (`/video/`) y de fotos/carrusel (`/photo/`).
- 🌐 **Bilingüe** — interfaz y mensajes de estado en español e inglés, con elección persistente.
- 📊 **Panel en vivo** — anillo de progreso con onda expansiva por cada borrado, estado en tiempo real y estadísticas de repesca.
- 🛑 **Protecciones** — pasa sola a la pestaña Compartidos y sigue recién cuando TikTok la marca como seleccionada; abre únicamente los items de tu grilla de Compartidos, nunca videos sugeridos, sidebars ni tus otras pestañas del perfil; no arranca sobre un video abierto que no pueda cerrar antes; y si la página de TikTok ya no tiene la pestaña o la grilla que conoce, frena antes de tocar nada.
- 💯 **Gratis para siempre** — sin versión premium, sin tope de borrados.

### Instalación

1. Descargá o cloná este repositorio.
2. Abrí `chrome://extensions` en Chrome.
3. Activá el **Modo desarrollador** (arriba a la derecha).
4. Tocá **Cargar descomprimida** y elegí la carpeta de la extensión.

### Uso

1. Iniciá sesión en [tiktok.com](https://www.tiktok.com) y abrí **tu propio perfil**.
2. Entrá a la pestaña **Compartidos** (**Reposts** si TikTok está en inglés). Si tenés otra abierta, la extensión pasa sola a Compartidos al tocar Iniciar. Recién abierta, la grilla puede mostrar recuadros vacíos durante varios segundos; la extensión espera hasta 12 segundos a que se llene.
3. Abrí el popup, elegí velocidad y tocá **Iniciar limpieza**.
4. Dejá la pestaña visible (Chrome ralentiza las pestañas en segundo plano). Podés frenar cuando quieras con **Detener**; mientras el popup muestra "Deteniendo…", **Iniciar** queda desactivado hasta que termine el paso en curso.

Para limpiezas grandes usá el modo **Seguro**. Turbo es para tandas cortas: TikTok puede limitar temporalmente cuentas con demasiadas acciones seguidas.

### Solución de problemas

- **Saltea algunos videos** → abrí DevTools (F12) → Consola: la extensión registra cada item fallido con su URL y tipo.
- **Quedaron reposts después de una corrida, o querés volver a correrla** → recargá la pestaña de TikTok (F5) antes de tocar Iniciar de nuevo. Sin recargar, una corrida nueva arranca el contador en 0, reintenta los que fallaron y sigue con los que no había llegado a abrir; los que ya contó como eliminados, o que un Detener dejó sin verificar, los saltea (los sin verificar quedan listados en la Consola). Recargar es la forma de revisar todo de nuevo.
- **"Terminado con pendientes" o "Sin eliminar: revisá a mano"** → la corrida terminó, pero los videos que cuenta **No eliminados** no se pudieron quitar. Revisalos a mano en tu perfil (la Consola lista sus IDs), o recargá la pestaña (F5) y tocá Iniciar para reintentarlos. "Sin eliminar" quiere decir que no funcionó ni una baja: si se repite, corré la sonda de diagnóstico que se explica más abajo y adjuntá su reporte en un issue.
- **"Se interrumpió (recarga de página): N eliminados antes"** → la pestaña de TikTok se recargó en plena corrida (apretaste F5, o TikTok recargó la página por su cuenta, por ejemplo por una página de error o de verificación). También aparece si cerraste la pestaña en plena corrida y volvés a abrir TikTok. La recarga cortó la corrida; N es cuántos había quitado hasta ese momento. El número se va guardando durante la corrida, así que puede faltarle la última baja antes de la recarga. Volvé a la pestaña **Compartidos** de tu perfil y tocá Iniciar: la corrida nueva arranca de 0 y recorre lo que muestre la grilla recargada. El aviso aparece una sola vez, solo si la corrida estuvo activa en los últimos 30 minutos, y se va al tocar Iniciar. Si tenés TikTok abierto en más de una pestaña mientras corre, abrir o recargar otra pestaña de TikTok también puede mostrarlo; la corrida de la primera pestaña sigue igual. No toques Iniciar en esa otra pestaña mientras la primera siga corriendo: dos corridas a la vez recorrerían los mismos reposts.
- **Las bajas fallan o el contador no coincide con tu perfil** → corré la sonda de diagnóstico que trae la extensión y adjuntá su reporte en un issue. La sonda es **de solo lectura**: no hace clicks, no pasa el mouse, no scrollea, no envía nada a ningún lado y no toca la limpieza en curso. Solo reporta lo que la extensión ve en la página.
  1. En tiktok.com, abrí DevTools (F12) → **Consola**.
  2. En el desplegable de contexto arriba de la Consola (dice `top`), elegí la entrada de la extensión (el nombre que figura en `chrome://extensions`). La sonda vive en el contexto aislado de la extensión, así que en `top` no existe.
  3. Ejecutá `__repostRemoverProbe()` para ver el reporte, o `copy(JSON.stringify(__repostRemoverProbe(), null, 2))` para copiarlo como JSON al portapapeles.
  4. Correla dos veces: una en tu grilla de **Compartidos** y otra con un video compartido abierto en el reproductor.

  Si la entrada de la extensión no aparece o la función no está definida, recargá la pestaña de TikTok. El reporte incluye tu @usuario y links de videos: revisalo antes de compartirlo. Quien desarrolle puede pedir el mismo reporte enviando `{ action: "PROBE" }` a la pestaña con `chrome.tabs.sendMessage`.
- **"Abrí tu perfil…" o "No pude cerrar el reproductor"** → arrancá desde la grilla de **Compartidos** de tu perfil, no desde un video abierto. Si al tocar Iniciar hay un video abierto, la extensión primero lo cierra; una página de video cargada directo (desde un link, una notificación o tras recargar) normalmente no se puede cerrar así, y entonces la corrida se frena antes de tocar ningún repost. Si en cambio la corrida sigue en el perfil de otra persona, tocá **Detener**. "No pude cerrar el reproductor" también puede aparecer en plena corrida, cuando el reproductor no puede ni avanzar ni cerrarse. Entrá a tiktok.com/@tu_usuario, abrí la pestaña Compartidos y tocá Iniciar de nuevo.
- **"No pude abrir la pestaña Compartidos"** → la pestaña está, pero no quedó seleccionada después de varios clicks (a veces TikTok muestra "Hubo un problema" en su lugar). Abrila a mano, esperá a que cargue la grilla y volvé a tocar Iniciar.
- **"TikTok cambió su página"** → después de esperarlas, la extensión no encontró la pestaña Compartidos o su grilla como las conoce, así que frenó sin abrir ni clickear ningún repost más (si ya había quitado alguno, el mensaje dice cuántos). Si tenés reposts, lo más probable es que TikTok haya cambiado su página: corré la sonda de diagnóstico que se explica más arriba en tu perfil y adjuntá su reporte en un issue. Si ya no te queda ningún repost, puede que TikTok ni muestre la pestaña, y entonces no hay nada para quitar.
- **TikTok cambió su diseño** → todos los selectores están en el objeto `SELECTORS` al inicio de `content.js`, listos para actualizar. La pestaña y la grilla de Compartidos se buscan solo por sus hooks `data-e2e` (`repost-tab`, `user-repost-item-list`, `user-repost-item`); el texto de la pestaña (Compartidos / Reposts) es solo un respaldo si falta su hook.

### Privacidad

Todo corre **localmente en tu pestaña**. La extensión no pide tu contraseña y nunca envía tus datos a ningún lado: no hace ninguna petición a servidores externos. Guarda dos cosas en `chrome.storage.local`, solo en tu computadora: tu preferencia de idioma y los contadores de la última corrida (eliminados, rescatados, pendientes, sin verificar, si está corriendo o terminó, la hora de la última actualización y la ruta de la página, que incluye un @usuario). Quedan ahí hasta que la corrida siguiente los reemplaza, para que una recarga pueda avisar que la corrida se interrumpió. La sonda de diagnóstico opcional (ver Solución de problemas) es de solo lectura: solo cuando la corrés, lee tu @usuario y los links de videos de la página, localmente, y los muestra solo en tu propia consola; no se envía nada a ningún lado.

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
