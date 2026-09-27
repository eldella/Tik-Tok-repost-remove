(() => {
  // Guarda contra doble inyección. Conserva el nombre de antes del cambio de
  // marca a propósito: es interno, no se ve en ningún lado.
  if (window.__repostCleanerLoaded) return;
  window.__repostCleanerLoaded = true;

  // El popup cambia el idioma con el mensaje SET_LANG; la elección queda
  // guardada en chrome.storage.local para persistir entre sesiones.
  const I18N = {
    es: {
      starting: () => "Iniciando…",
      openProfile: () => "Abrí tu perfil (tiktok.com/@tu_usuario) antes de iniciar.",
      noTab: () => 'No encontré la pestaña "Republicaciones". Abrila manualmente en tu perfil y tocá Iniciar de nuevo.',
      cantClosePlayer: () =>
        'No pude cerrar el reproductor. Volvé a la pestaña "Republicaciones" de tu perfil y tocá Iniciar de nuevo.',
      scrolling: () => "Buscando más reposts (scroll)…",
      // La nota del F5 es provisoria: sin recargar, una nueva corrida solo
      // reintenta los que fallaron y saltea los que ya contó como eliminados.
      // Sin "✔" cuando quedan pendientes: terminar no es lo mismo que salir
      // bien, y el popup ya no lo muestra como "Completado".
      doneWithPending: (r, p) =>
        `Terminado: ${r} eliminados · ${p} no se pudieron (revisalos a mano). ` +
        "Para volver a revisar todo, recargá la página (F5) antes de iniciar de nuevo.",
      // Fin con 0 eliminados. Con pendientes fallaron todos (antes salía como
      // "Listo ✔ 0 eliminados"); sin pendientes no encontró ninguno para quitar.
      doneNoneRemoved: (p) =>
        (p > 0
          ? `No se pudo quitar ninguno: ${p} quedaron sin eliminar (revisalos a mano). `
          : "No encontré reposts para quitar. ") +
        "Para volver a revisar todo, recargá la página (F5) antes de iniciar de nuevo.",
      done: (r) =>
        `Listo ✔ ${r} reposts eliminados. ` +
        "Para volver a revisar todo, recargá la página (F5) antes de iniciar de nuevo.",
      openingChain: (r) => `Abriendo cadena de videos… (${r} eliminados)`,
      removing: (r) => `Quitando repost… (${r} eliminados)`,
      retrying: (a, m, r) => `Reintento ${a}/${m}… (${r} eliminados)`,
      removedOk: (r) => `Repost eliminado ✔ (total: ${r})`,
      toRescue: (p) => `No pude con este, va a la cola de repesca (${p} pendientes)`,
      next: (r) => `Pasando al siguiente… (${r} eliminados)`,
      chainEnd: () => "Fin de la cadena, re-escaneando la grilla…",
      rescuePass: (n, m) => `Repesca ${n}: reintentando ${m} video(s)…`,
      stopping: () => "Deteniendo…",
      stopped: (r) => `Detenido. ${r} reposts eliminados hasta ahora.`,
      // Pide volver a la pestaña y no solo "tocá Iniciar": si la recarga
      // agarró el reproductor abierto, la pestaña quedó en una página de
      // video cargada directo, y desde ahí Iniciar se frena con openProfile.
      interrupted: (r) =>
        `Se interrumpió (recarga de página): ${r} eliminados antes. ` +
        'Volvé a la pestaña "Republicaciones" de tu perfil y tocá Iniciar para seguir.'
    },
    en: {
      starting: () => "Starting…",
      openProfile: () => "Open your profile (tiktok.com/@your_username) before starting.",
      noTab: () => 'Couldn\'t find the "Reposts" tab. Open it manually on your profile and hit Start again.',
      cantClosePlayer: () =>
        'Couldn\'t close the video player. Go back to the "Reposts" tab on your profile and hit Start again.',
      scrolling: () => "Looking for more reposts (scrolling)…",
      doneWithPending: (r, p) =>
        `Finished: ${r} removed · ${p} couldn't be removed (check them manually). ` +
        "To re-check everything, reload the page (F5) before starting again.",
      doneNoneRemoved: (p) =>
        (p > 0
          ? `Couldn't remove any: ${p} left unremoved (check them manually). `
          : "Found no reposts to remove. ") +
        "To re-check everything, reload the page (F5) before starting again.",
      done: (r) =>
        `Done ✔ ${r} reposts removed. ` +
        "To re-check everything, reload the page (F5) before starting again.",
      openingChain: (r) => `Opening video chain… (${r} removed)`,
      removing: (r) => `Removing repost… (${r} removed)`,
      retrying: (a, m, r) => `Retry ${a}/${m}… (${r} removed)`,
      removedOk: (r) => `Repost removed ✔ (total: ${r})`,
      toRescue: (p) => `Couldn't remove this one, queued for rescue (${p} pending)`,
      next: (r) => `Moving to the next one… (${r} removed)`,
      chainEnd: () => "End of chain, re-scanning the grid…",
      rescuePass: (n, m) => `Rescue pass ${n}: retrying ${m} video(s)…`,
      stopping: () => "Stopping…",
      stopped: (r) => `Stopped. ${r} reposts removed so far.`,
      interrupted: (r) =>
        `Interrupted (page reload): ${r} removed before that. ` +
        'Go back to the "Reposts" tab on your profile and hit Start to continue.'
    }
  };
  let lang = "es";
  const t = (key, ...args) => (I18N[lang] || I18N.es)[key](...args);
  try {
    chrome.storage.local.get({ lang: "es" }, (d) => {
      if (I18N[d.lang]) lang = d.lang;
    });
  } catch (e) {}

  // Presets de velocidad elegibles desde el popup.
  const SPEED_PRESETS = {
    seguro: { min: 3000, max: 5000 },
    rapido: { min: 1500, max: 2600 },
    turbo:  { min: 700,  max: 1400 }
  };

  const CONFIG = {
    speed: "rapido",
    ACTION_WAIT_MS: 900,
    NAV_WAIT_MS: 1400,
    SCROLL_WAIT_MS: 2600,
    MAX_EMPTY_SCROLLS: 4,

    RETRY_ATTEMPTS: 3,
    RETRY_WAIT_BASE_MS: 1200,
    MAX_RESCUE_PASSES: 2,

    // TikTok puede redibujar el layout y hacer "desaparecer" momentáneamente
    // la pestaña de reposts tras varias bajas seguidas.
    TAB_RECHECK_ATTEMPTS: 4,
    TAB_RECHECK_WAIT_MS: 2000,

    // Vueltas seguidas con el reproductor abierto en las que no se pudo ni
    // pasar al siguiente ni cerrarlo. Sin tope, el bucle alternaba "siguiente"
    // y "cerrar" para siempre sin llegar nunca a la repesca ni al final.
    MAX_PLAYER_STUCK: 3,

    ELEMENT_TIMEOUT_MS: 7000
  };

  // Si TikTok cambia el DOM, estos son los selectores a actualizar.
  const SELECTORS = {
    // El hook data-e2e es propio de la pestaña de reposts, así que se confía en
    // él sin mirar el texto (el texto cambia con el idioma de TikTok). Los
    // genéricos (PTabItem) matchean cualquier pestaña del perfil, y por eso
    // solo valen si además su texto pasa repostTabTextRegex.
    repostTab: ['[data-e2e="repost-tab"]'],
    repostTabGeneric: ['p[class*="PTabItem"]'],
    repostTabTextRegex: /republicad|reposts?/i,

    videoItems: [
      '[data-e2e="user-repost-item"] a[href*="/video/"], [data-e2e="user-repost-item"] a[href*="/photo/"]',
      '[data-e2e="user-repost-item-list"] a[href*="/video/"], [data-e2e="user-repost-item-list"] a[href*="/photo/"]',
      'div[class*="DivItemContainer"] a[href*="/video/"], div[class*="DivItemContainer"] a[href*="/photo/"]',
      'a[href*="/video/"], a[href*="/photo/"]'
    ],

    repostButton: [
      '[data-e2e="video-share-repost"]',
      '[data-e2e="browse-repost"]',
      'button[aria-label*="epost"]',
      'span[data-e2e*="repost"]'
    ],
    repostButtonTextRegex: /quitar repost|remove repost|republicado|reposted|repostear|repost/i,

    shareButton: [
      '[data-e2e="video-share-icon"]',
      '[data-e2e="browse-share"]',
      'button[aria-label*="ompartir"]',
      'button[aria-label*="hare"]'
    ],
    shareRepostOptionRegex: /quitar repost|remove repost|repost/i,

    // Acepta palabra sola ("Quitar", "Remove") o frase de dos palabras
    // ("Eliminar publicación", "Quitar repost", "Delete post", "Remove repost"),
    // en ES y EN, porque TikTok no usa un texto fijo para el botón de confirmación.
    confirmTextRegex: /^(quitar|eliminar|remove|delete|confirmar|confirm)(\s+(repost|publicaci[oó]n|post|video|republicaci[oó]n))?$/i,

    nextButton: [
      'button[data-e2e="arrow-right"]',
      'button[data-e2e="browse-video-next"]',
      'button[aria-label*="iguiente"]',
      'button[aria-label*="ext"]'
    ],

    closeButton: [
      '[data-e2e="browse-close"]',
      'button[aria-label*="err"]',
      'button[aria-label*="lose"]'
    ]
  };

  // running es la intención del usuario (Iniciar/Detener); loopActive dice si
  // hay un mainLoop vivo. No son lo mismo: tras Detener, el bucle sigue
  // dormido en algún sleep unos segundos hasta que se entera. Si Iniciar solo
  // mirara running, arrancaría un segundo bucle mientras el viejo sigue vivo,
  // y los dos clickearían el mismo reproductor a la vez.
  let running = false;
  let loopActive = false;
  let finished = false;
  let removed = 0;
  let rescued = 0;
  let statusMessage = "";
  // processedUrls, failedQueue y rescueTargets guardan claves de contentKey()
  // (el ID numérico del video/foto), no URLs; el porqué está en contentKey().
  // unverified sí guarda URLs, porque es para revisarlos a mano.
  const processedUrls = new Set();
  let failedQueue = [];
  // Copia de failedQueue al arrancar cada repesca. startRescuePass vacía
  // failedQueue enseguida, así que sin esta lista los que la repesca todavía
  // no volvió a abrir no figuraban como pendientes en ningún lado.
  let rescueTargets = [];
  let rescuePass = 0;
  // Videos donde un Detener cortó la baja después de que ya salió un click al
  // toggle: no se sabe si quedó con o sin repost. Quedan como procesados y
  // nunca se reclickean solos, porque un segundo click a ciegas puede volver
  // a agregar el repost que el primero ya había quitado.
  let unverified = [];
  // Clicks al toggle de repost en el video actual. mainLoopBody lo pone en 0
  // antes de cada video; solo lo incrementa clickToggle().
  let itemToggleClicks = 0;
  // Números de una corrida que una recarga de la página cortó, leídos del
  // espejo en chrome.storage.local al cargar. Son solo para mostrar en STATUS:
  // no vuelven a removed ni a las colas, y el próximo Iniciar los borra.
  let interruptedRun = null;
  // true desde el primer START de este documento. Si START llega antes que la
  // lectura del espejo, esa lectura ya no toca nada: la corrida nueva manda.
  let startedSinceLoad = false;

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  const randomDelay = () => {
    const p = SPEED_PRESETS[CONFIG.speed] || SPEED_PRESETS.rapido;
    return sleep(p.min + Math.random() * (p.max - p.min));
  };

  function queryFirst(selectorList, root = document) {
    for (const sel of selectorList) {
      try {
        const el = root.querySelector(sel);
        if (el) return el;
      } catch (e) {}
    }
    return null;
  }

  function findByText(regex, tags = ["button", "span", "p", "div"]) {
    for (const tag of tags) {
      for (const el of document.querySelectorAll(tag)) {
        const txt = (el.textContent || "").trim();
        if (txt.length > 0 && txt.length < 40 && regex.test(txt)) return el;
      }
    }
    return null;
  }

  async function waitFor(fn, timeout = CONFIG.ELEMENT_TIMEOUT_MS) {
    const start = Date.now();
    while (Date.now() - start < timeout) {
      if (!running) return null;
      const el = fn();
      if (el) return el;
      await sleep(250);
    }
    return null;
  }

  function humanClick(el) {
    const opts = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new MouseEvent("mousedown", opts));
    el.dispatchEvent(new MouseEvent("mouseup", opts));
    el.dispatchEvent(new MouseEvent("click", opts));
  }

  // Los clicks al toggle que hacen las dos estrategias pasan por acá para
  // saber si en el video actual ya salió alguno: con uno solo el estado puede
  // haber cambiado, y a partir de ahí otro click (la estrategia alternativa,
  // o reprocesarlo tras un Detener) puede volver a agregar el repost en vez
  // de quitarlo. Ojo: handleConfirmModal no pasa por acá, y su regex también
  // matchea el texto "Quitar repost" del propio toggle, así que ese click no
  // se cuenta (queda para el arreglo de baja verificada por estado).
  function clickToggle(el) {
    itemToggleClicks++;
    humanClick(el);
  }

  function hoverOver(el) {
    const opts = { bubbles: true, cancelable: true, view: window };
    el.dispatchEvent(new MouseEvent("mouseover", opts));
    el.dispatchEvent(new MouseEvent("mouseenter", opts));
    el.dispatchEvent(new MouseEvent("mousemove", opts));
  }

  const CONTENT_URL_RE = /\/(video|photo)\//;
  const playerIsOpen = () => CONTENT_URL_RE.test(location.href);

  // Resuelve contra location.href antes de comparar: si TikTok alguna vez
  // renderiza un href relativo en la grilla (en vez de absoluto), esto evita
  // que el mismo video quede con dos claves distintas (una relativa, otra
  // absoluta) y se reprocese en loop. Para la contabilidad se usa
  // contentKey(), que solo cae acá cuando la URL no trae ID.
  const normalizeUrl = (url) => {
    try {
      return new URL(url, location.href).href.split("?")[0];
    } catch (e) {
      return url.split("?")[0];
    }
  };

  // Clave de contabilidad de un item: el ID numérico de /video/<id> o
  // /photo/<id>. El href de la grilla y la URL del reproductor pueden diferir
  // en el @usuario (un repost puede llevar el del autor original), en
  // /photo/ vs /video/, en la barra final o en el #fragmento. Con la URL
  // entera como clave, ese link de la grilla nunca quedaría procesado y se
  // reabriría en loop. Si no hay ID (no debería pasar en la grilla), cae a
  // la URL normalizada.
  const CONTENT_ID_RE = /\/(?:video|photo)\/(\d+)/;
  const contentKey = (url) => {
    const m = CONTENT_ID_RE.exec(url || "");
    return m ? m[1] : normalizeUrl(url || "");
  };

  // Pendientes reales: los que fallaron en esta pasada más los objetivos de
  // la repesca en curso que todavía no se volvieron a abrir. Un objetivo que
  // se reabrió y volvió a fallar ya está en failedQueue y no se cuenta dos
  // veces, porque al reabrirlo queda en processedUrls.
  const pendingCount = () =>
    failedQueue.length + rescueTargets.filter((k) => !processedUrls.has(k)).length;

  // Anota un item como fallido sin duplicarlo en la cola. Queda procesado
  // para que esta pasada no lo vuelva a abrir; la repesca lo reintenta.
  function queueFailed(key) {
    processedUrls.add(key);
    if (!failedQueue.includes(key)) failedQueue.push(key);
    persist();
  }

  function isRepostTabActive() {
    const candidates = [];
    const byE2e = document.querySelector('[data-e2e="repost-tab"]');
    if (byE2e) candidates.push(byE2e);
    for (const el of document.querySelectorAll("p, span, button, div[role='tab']")) {
      const txt = (el.textContent || "").trim();
      if (txt.length > 0 && txt.length < 30 && SELECTORS.repostTabTextRegex.test(txt)) {
        candidates.push(el);
      }
    }

    for (const el of candidates) {
      let node = el;
      for (let i = 0; i < 4 && node; i++) {
        if (node.getAttribute && node.getAttribute("aria-selected") === "true") return true;
        const cls = (node.className && node.className.toString()) || "";
        if (/active|selected/i.test(cls)) return true;
        node = node.parentElement;
      }
    }
    return false;
  }

  // Busca la pestaña entre los selectores genéricos quedándose con la que dice
  // "reposts". Antes se tomaba el primer PTabItem (casi siempre "Videos"), se
  // descartaba por el texto y se caía directo a la búsqueda por texto.
  function findGenericRepostTab() {
    for (const sel of SELECTORS.repostTabGeneric) {
      let nodes;
      try {
        nodes = document.querySelectorAll(sel);
      } catch (e) {
        continue;
      }
      for (const el of nodes) {
        if (SELECTORS.repostTabTextRegex.test(el.textContent || "")) return el;
      }
    }
    return findByText(SELECTORS.repostTabTextRegex, ["p", "span", "button"]);
  }

  async function ensureRepostTab() {
    if (isRepostTabActive()) return true;

    // El data-e2e ya no se re-chequea por texto: con la UI en español
    // ("Republicaciones") el regex lo rechazaba, y la corrida terminaba en
    // noTab pidiendo abrir a mano justo la pestaña que había encontrado.
    // Clickear una pestaña es idempotente, así que confiar en el hook es seguro.
    const tab = queryFirst(SELECTORS.repostTab) || findGenericRepostTab();
    if (!tab) return false;

    for (let i = 0; i < 3; i++) {
      // Chequeo pegado al click (sin await en el medio): tras Detener no sale
      // ningún click más, ni siquiera a la pestaña.
      if (!running) return false;
      humanClick(tab);
      await sleep(CONFIG.ACTION_WAIT_MS + 400);
      if (isRepostTabActive()) return true;
    }
    return false;
  }

  // Reintenta con espera creciente en vez de rendirse a la primera: si TikTok
  // redibuja el layout o frena momentáneamente tras varias bajas seguidas, la
  // pestaña puede "desaparecer" un instante, y antes eso cortaba todo el
  // proceso de inmediato. Deja rastro en consola de cada intento para poder
  // diagnosticar la causa real si el proceso termina rindiéndose.
  async function ensureRepostTabWithRetries() {
    for (let attempt = 1; attempt <= CONFIG.TAB_RECHECK_ATTEMPTS; attempt++) {
      if (!running) return false;
      const ok = await ensureRepostTab();
      if (ok) return true;

      console.warn(
        `[TikTokRepostRemover] No detecto la pestaña de reposts activa ` +
          `(intento ${attempt}/${CONFIG.TAB_RECHECK_ATTEMPTS}). ` +
          `removidos=${removed} rescatados=${rescued} pendientes=${pendingCount()} url=${location.href}`
      );

      if (attempt < CONFIG.TAB_RECHECK_ATTEMPTS) {
        await sleep(CONFIG.TAB_RECHECK_WAIT_MS * attempt);
      }
    }
    return false;
  }

  // Los selectores específicos de la grilla van primero; el fallback genérico
  // queda acotado al contenido principal y excluye sidebars, navegación y
  // módulos de sugerencias, para no abrir jamás un video que no sea un
  // repost del perfil.
  function isExcludedLink(link) {
    return !!link.closest(
      'aside, nav, header, [data-e2e*="suggest"], [data-e2e*="recommend"], [data-e2e*="related"]'
    );
  }

  function getNextVideoLink() {
    const specificSelectors = SELECTORS.videoItems.slice(0, -1);
    for (const sel of specificSelectors) {
      const links = document.querySelectorAll(sel);
      // Si el selector matcheó algo pero era todo de zonas prohibidas
      // (sidebar/sugeridos), no es la grilla real: hay que seguir probando
      // selectores, no rendirse acá.
      let sawEligibleLink = false;
      for (const link of links) {
        if (isExcludedLink(link)) continue;
        sawEligibleLink = true;
        const href = link.getAttribute("href") || "";
        if (CONTENT_URL_RE.test(href) && !processedUrls.has(contentKey(href))) {
          return link;
        }
      }
      if (sawEligibleLink) return null;
    }

    if (!isRepostTabActive()) return null;
    const scope =
      document.querySelector("main") ||
      document.querySelector("#main-content-others_homepage") ||
      document;
    const genericSel = SELECTORS.videoItems[SELECTORS.videoItems.length - 1];
    for (const link of scope.querySelectorAll(genericSel)) {
      if (isExcludedLink(link)) continue;
      const href = link.getAttribute("href") || "";
      if (CONTENT_URL_RE.test(href) && !processedUrls.has(contentKey(href))) {
        return link;
      }
    }
    return null;
  }

  // Hace polling en vez de chequear una sola vez: cuando la página lleva
  // rato corriendo y se pone lenta, el modal puede tardar más en montarse
  // que una espera fija, y un solo chequeo instantáneo lo daba por "no
  // apareció" aunque la baja sí se iba a confirmar.
  async function handleConfirmModal(timeoutMs = CONFIG.ACTION_WAIT_MS + 800) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (!running) return false;
      const confirmBtn = findByText(SELECTORS.confirmTextRegex, ["button"]);
      if (confirmBtn) {
        humanClick(confirmBtn);
        await sleep(CONFIG.ACTION_WAIT_MS);
        return true;
      }
      await sleep(200);
    }
    return false;
  }

  // Cada "if (!running) return false;" va pegado a la acción que sigue, sin
  // ningún await en el medio: Detener puede llegar durante cualquier sleep y
  // ahí no tiene que salir ni un click, hover o tecla más.
  async function strategyDirectButton() {
    let btn = queryFirst(SELECTORS.repostButton);
    if (!btn) btn = findByText(SELECTORS.repostButtonTextRegex, ["button", "span"]);
    if (!btn) return false;

    const clickable = btn.closest("button") || btn;
    if (!running) return false;
    clickable.scrollIntoView({ block: "center", behavior: "instant" });
    hoverOver(clickable);
    await sleep(200);
    if (!running) return false;
    clickToggle(clickable);
    await sleep(CONFIG.ACTION_WAIT_MS);
    return await handleConfirmModal();
  }

  // TikTok a veces esconde el toggle de repost dentro del panel de compartir
  // según el layout, por eso existe esta estrategia alternativa.
  async function strategySharePanel() {
    const shareBtn = queryFirst(SELECTORS.shareButton);
    if (!shareBtn) return false;

    const clickable = shareBtn.closest("button") || shareBtn;
    if (!running) return false;
    hoverOver(clickable);
    await sleep(600);

    let option = findByText(SELECTORS.shareRepostOptionRegex, ["p", "span", "div", "button"]);

    if (!option) {
      if (!running) return false;
      humanClick(clickable);
      await sleep(800);
      option = findByText(SELECTORS.shareRepostOptionRegex, ["p", "span", "div", "button"]);
    }

    if (!option) {
      if (!running) return false;
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await sleep(300);
      return false;
    }

    const optClickable = option.closest("button") || option.closest("a") || option;
    if (!running) return false;
    clickToggle(optClickable);
    await sleep(CONFIG.ACTION_WAIT_MS);
    const confirmed = await handleConfirmModal();

    // Si Detener llegó después de confirmar, la baja ya salió: se informa tal
    // cual, pero sin mandar la tecla para cerrar el panel.
    if (!running) return confirmed;
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(300);
    return confirmed;
  }

  // Alterna estrategias y usa esperas crecientes porque la UI a veces tarda
  // en montar el botón, sobre todo en modo turbo.
  async function removeRepostWithRetries() {
    for (let attempt = 1; attempt <= CONFIG.RETRY_ATTEMPTS; attempt++) {
      if (!running) return false;

      statusMessage =
        attempt === 1
          ? t("removing", removed)
          : t("retrying", attempt, CONFIG.RETRY_ATTEMPTS, removed);

      const directFirst = attempt % 2 === 1;
      const firstStrategy = directFirst ? strategyDirectButton : strategySharePanel;
      const fallbackStrategy = directFirst ? strategySharePanel : strategyDirectButton;

      let ok = await firstStrategy();
      // La alternativa solo corre si en este video todavía no salió ningún
      // click al toggle. Si la primera ya clickeó y no vio confirmación, el
      // repost pudo haberse quitado igual (sin diálogo), y un segundo click
      // enseguida lo volvería a agregar. Antes esto era un "a() || b()" que
      // clickeaba otra vez sin mirar nada, incluso después de Detener.
      if (!ok && running && itemToggleClicks === 0) ok = await fallbackStrategy();

      if (ok) return true;
      if (!running) return false;

      await sleep(CONFIG.RETRY_WAIT_BASE_MS * attempt);

      const videoEl = document.querySelector("video");
      if (!running) return false;
      if (videoEl) hoverOver(videoEl);
    }
    return false;
  }

  async function goToNextVideo() {
    const before = normalizeUrl(location.href);

    const nextBtn = queryFirst(SELECTORS.nextButton);
    // Un "siguiente" deshabilitado es la señal de fin de la lista: la cadena
    // terminó y se vuelve a la grilla. Antes se mandaba ArrowDown igual, que
    // podía seguir de largo más allá de los reposts (o hacia un feed) y abrir
    // videos que no son reposts tuyos.
    if (nextBtn && (nextBtn.disabled || nextBtn.getAttribute("aria-disabled") === "true")) {
      return false;
    }
    if (!running) return false;
    if (nextBtn) {
      humanClick(nextBtn);
    } else {
      const opts = {
        key: "ArrowDown", code: "ArrowDown", keyCode: 40, which: 40,
        bubbles: true, cancelable: true
      };
      document.dispatchEvent(new KeyboardEvent("keydown", opts));
      document.dispatchEvent(new KeyboardEvent("keyup", opts));
    }

    const start = Date.now();
    while (Date.now() - start < CONFIG.NAV_WAIT_MS + 2000) {
      if (!running) return false;
      if (normalizeUrl(location.href) !== before) {
        await sleep(CONFIG.NAV_WAIT_MS);
        return true;
      }
      await sleep(200);
    }
    return false;
  }

  async function closePlayer() {
    const closeBtn = queryFirst(SELECTORS.closeButton);
    if (!running) return;
    if (closeBtn) humanClick(closeBtn);
    else document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    await sleep(CONFIG.ACTION_WAIT_MS);
  }

  // Tras closePlayer, si el reproductor sigue abierto se espera a que se
  // cierre solo, sin volver a clickear. Un cierre lento (la URL tarda en
  // cambiar) no es un cierre fallido: sin esta espera se tomaba como trabado,
  // salía otro cierre en la vuelta siguiente (quizás por los selectores
  // genéricos o Escape) y se sumaba al tope, o al iniciar se abortaba con
  // openProfile. Devuelve enseguida tras Detener, igual que waitFor.
  async function waitPlayerClosed() {
    if (!running || !playerIsOpen()) return;
    await waitFor(() => (playerIsOpen() ? null : true), CONFIG.NAV_WAIT_MS + 2000);
  }

  async function scrollAndCheck() {
    // Excluye sidebar/sugeridos igual que getNextVideoLink(): sin esto, un
    // módulo de recomendados que sigue cargando contenido al scrollear puede
    // hacer creer que "aparecieron más reposts" para siempre y el proceso
    // nunca llega a MAX_EMPTY_SCROLLS.
    const countItems = () => {
      let count = 0;
      for (const link of document.querySelectorAll('a[href*="/video/"], a[href*="/photo/"]')) {
        if (!isExcludedLink(link)) count++;
      }
      return count;
    };
    const before = countItems();
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    await sleep(CONFIG.SCROLL_WAIT_MS);
    const after = countItems();
    return after > before || getNextVideoLink() !== null;
  }

  // Al terminar la pasada principal, los videos que fallaron se sacan del
  // Set de procesados para que vuelvan a estar disponibles y el bucle los
  // recorra de nuevo. rescueTargets se queda con la lista para que sigan
  // contando como pendientes hasta que se vuelvan a abrir.
  function startRescuePass() {
    if (failedQueue.length === 0 || rescuePass >= CONFIG.MAX_RESCUE_PASSES) {
      return false;
    }
    rescuePass++;
    statusMessage = t("rescuePass", rescuePass, failedQueue.length);
    rescueTargets = failedQueue.slice();
    for (const key of failedQueue) processedUrls.delete(key);
    failedQueue = [];
    return true;
  }

  // Al terminar una repesca, los objetivos que no se volvieron a abrir (la
  // grilla ya no los mostraba) vuelven a la cola, así siguen reportándose como
  // pendientes en vez de desaparecer de la cuenta. Puede que ya no existan
  // (TikTok los sacó de la grilla), por eso se registran como "no
  // revisitados" y no como fallos. Nunca se abren por otro camino sin leer
  // antes el estado del repost: un click a ciegas podría volver a agregarlo.
  function requeueUnrevisitedTargets() {
    const notRevisited = rescueTargets.filter((k) => !processedUrls.has(k));
    if (notRevisited.length === 0) return;
    for (const key of notRevisited) queueFailed(key);
    console.warn(
      "[TikTokRepostRemover] No revisitados en la repesca (la grilla no los mostró), siguen pendientes:",
      notRevisited
    );
  }

  // Corta la corrida con un mensaje propio (openProfile, noTab,
  // cantClosePlayer). Se usa como "return abort(...)" desde mainLoopBody:
  // con return, y no con break, el bloque de después del while no llega a
  // pisar el aviso con "Detenido".
  function abort(msgKey) {
    statusMessage = t(msgKey);
    running = false;
  }

  // Estado de una corrida nueva. Lo llama START, y solo cuando no hay bucle
  // vivo. Los fallidos se sacan de processedUrls para reintentarlos; los que
  // se contaron como eliminados se quedan: sin leer el estado del toggle
  // antes de clickear, reabrir un video al que de verdad se le quitó el
  // repost lo volvería a agregar. La lista de sin verificar se vacía (es el
  // reporte de cada corrida), pero sus videos siguen procesados por el mismo
  // motivo. Para revisar todo de nuevo hay que recargar la página, y los
  // mensajes de fin lo dicen.
  function resetRunState() {
    for (const key of failedQueue) processedUrls.delete(key);
    failedQueue = [];
    rescueTargets = [];
    // Quedan en consola antes de vaciar la lista: esta corrida los saltea y
    // el contador de sin verificar vuelve a 0, así que si no se loguean acá
    // desaparecen del reporte.
    if (unverified.length > 0) {
      console.warn(
        "[TikTokRepostRemover] Sin verificar de la corrida anterior (esta corrida los saltea, revisalos a mano):",
        unverified
      );
    }
    unverified = [];
    removed = 0;
    rescued = 0;
    rescuePass = 0;
    finished = false;
    statusMessage = "";
    // El aviso de corrida interrumpida y sus números se van con la corrida
    // nueva: desde acá STATUS vuelve a mostrar los contadores en vivo.
    interruptedRun = null;
  }

  // ---------------------------------------------------------------------------
  // Espejo de la corrida en chrome.storage.local (clave runMirror).
  //
  // Todo el estado vive en la memoria de la página. Una recarga (F5, una
  // página de error o verificación de TikTok, una navegación completa) vuelve
  // a correr este script desde cero, y sin el espejo el popup mostraba
  // "Inactivo" con 0, sin rastro de la corrida cortada ni de cuántos había
  // quitado. Tiene que escribirlo este script y no el popup: el popup se
  // cierra apenas tocás la página, así que casi nunca está abierto cuando
  // pasa la recarga y lo que guardara estaría viejo. Es storage.local y no
  // storage.session porque un content script no puede leer session sin que
  // el service worker llame a setAccessLevel.
  //
  // Solo se guardan números. Las listas (processedUrls, failedQueue,
  // rescueTargets, unverified) nunca van al storage ni se reponen: la grilla
  // recargada viene de TikTok, y reponer esas claves haría saltear o reabrir
  // videos cuyo estado de repost ya no se conoce.
  // ---------------------------------------------------------------------------
  const MIRROR_KEY = "runMirror";
  // Junta en una sola escritura los cambios que llegan seguidos (p. ej. la
  // repesca encolando varios de una vez).
  const MIRROR_THROTTLE_MS = 1000;
  // Un espejo más viejo que esto no se muestra como corrida interrumpida:
  // lo más probable es que la pestaña se haya cerrado hace rato, no recargado.
  const MIRROR_MAX_AGE_MS = 30 * 60 * 1000;
  let mirrorTimer = null;

  // Decide si el espejo guardado describe una corrida que una recarga cortó y
  // devuelve sus números saneados, o null. No toca chrome.* ni el DOM, para
  // poder probarla aparte.
  function readInterruptedRun(mirror, now) {
    if (!mirror || typeof mirror !== "object" || mirror.running !== true) return null;
    const age = now - mirror.updatedAt;
    if (!Number.isFinite(age) || age < 0 || age > MIRROR_MAX_AGE_MS) return null;
    const count = (v) => (Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
    return {
      removed: count(mirror.removed),
      rescued: count(mirror.rescued),
      pending: count(mirror.pending),
      unverified: count(mirror.unverified)
    };
  }

  // Con callback y no con la promesa: si la extensión se recargó o actualizó
  // con la pestaña abierta, este script queda huérfano y chrome.* tira (lo
  // agarra el try) o falla en el callback (se lee lastError para que Chrome
  // no lo reporte). El espejo nunca puede cortar la corrida.
  function writeMirror(snapshot) {
    try {
      chrome.storage.local.set({ [MIRROR_KEY]: snapshot }, () => void chrome.runtime.lastError);
    } catch (e) {}
  }

  // running del espejo es "hay una corrida viva", no solo la intención del
  // usuario: entre Detener y la salida real del bucle todavía pueden salir
  // bajas, y una recarga en ese rato también corta una corrida.
  function flushMirror() {
    if (mirrorTimer !== null) {
      clearTimeout(mirrorTimer);
      mirrorTimer = null;
    }
    writeMirror({
      running: running || loopActive,
      finished,
      removed,
      rescued,
      pending: pendingCount(),
      unverified: unverified.length,
      updatedAt: Date.now(),
      pathname: location.pathname
    });
  }

  // persist() se llama donde cambian los contadores; persist(true) escribe ya
  // (arranque y salida del bucle). El diferido lee los valores al dispararse,
  // así que siempre guarda lo último.
  function persist(now = false) {
    if (now) {
      flushMirror();
      return;
    }
    if (mirrorTimer === null) mirrorTimer = setTimeout(flushMirror, MIRROR_THROTTLE_MS);
  }

  // Una recarga mata el timer del diferido: si había una escritura pendiente
  // se intenta mandarla antes de irse. Es a mejor esfuerzo; si no llega, el
  // espejo queda con hasta un segundo de atraso.
  window.addEventListener("pagehide", () => {
    if (mirrorTimer !== null) persist(true);
  });

  // Al cargar: si el espejo dice que había una corrida viva, esta página es
  // la recarga que la cortó. Se muestra el aviso con sus números y el espejo
  // vuelve a running:false, así no se repite en la próxima recarga. El
  // pathname no se usa para decidir: si la recarga agarró el reproductor
  // abierto, la URL es la de un video y no la del perfil donde arrancó.
  // Lee también el idioma para armar el aviso en el correcto: la lectura del
  // idioma de más arriba es otra llamada y no se sabe cuál vuelve primero.
  try {
    chrome.storage.local.get({ lang: "es", [MIRROR_KEY]: null }, (d) => {
      try {
        // Igual que en writeMirror: se lee lastError para que una lectura
        // fallida (script huérfano) no quede como error sin revisar.
        void chrome.runtime.lastError;
        if (startedSinceLoad) return;
        const mirror = d && d[MIRROR_KEY];
        if (!mirror || mirror.running !== true) return;
        if (I18N[d.lang]) lang = d.lang;
        interruptedRun = readInterruptedRun(mirror, Date.now());
        if (interruptedRun) {
          statusMessage = t("interrupted", interruptedRun.removed);
          console.warn(
            `[TikTokRepostRemover] Corrida interrumpida por una recarga. ` +
              `removidos=${interruptedRun.removed} rescatados=${interruptedRun.rescued} ` +
              `pendientes=${interruptedRun.pending} sin_verificar=${interruptedRun.unverified} ` +
              `url_previa=${mirror.pathname}`
          );
        }
        writeMirror({ ...mirror, running: false });
      } catch (e) {}
    });
  } catch (e) {}

  // El cuerpo del bucle; lo lanza solo mainLoop(), que lleva la cuenta de si
  // hay un bucle vivo.
  async function mainLoopBody() {
    finished = false;
    statusMessage = t("starting");

    if (location.hostname !== "www.tiktok.com") return abort("openProfile");

    // Solo se arranca desde la grilla del perfil, nunca con un video abierto.
    // /@x/video/123 también empieza con /@x, y con el reproductor abierto el
    // bucle se saltea el chequeo de la pestaña de reposts y clickea el toggle
    // del video que esté a la vista, venga de donde venga (For You, Me gusta,
    // un link, una notificación). Si hay uno abierto se intenta cerrarlo una
    // vez; si sigue abierto (p. ej. una página de video cargada directo, que
    // no es un modal) se aborta sin clickear nada. No alcanza con "reproductor
    // abierto + pestaña de reposts activa": isRepostTabActive() es laxa con
    // las clases y no se sabe si el perfil sigue montado debajo del
    // reproductor.
    if (playerIsOpen()) {
      await closePlayer();
      await sleep(CONFIG.NAV_WAIT_MS);
      await waitPlayerClosed();
    }
    // El @usuario se ancla contra pathname, no contra location.href entero:
    // sin anclar daba true con solo tener "tiktok.com/@x" en cualquier parte
    // de la URL. El "sin video" es en negativo (playerIsOpen() mira la URL
    // entera, pathname incluido) para no depender de la URL de la pestaña de
    // reposts, que no está confirmada. Si Detener llegó durante el cierre no
    // se aborta: el while no arranca y la corrida termina como "Detenido".
    const onProfileGrid = /^\/@[^/]+/.test(location.pathname) && !playerIsOpen();
    if (running && !onProfileGrid) return abort("openProfile");

    let emptyScrolls = 0;
    // Vueltas seguidas en las que el reproductor quedó abierto sin poder
    // avanzar ni cerrarse. Se reinicia apenas hay navegación o cierre.
    let playerStuck = 0;

    while (running) {
      // Clave del link de la grilla que abrió el reproductor en esta vuelta
      // (null si el reproductor ya estaba abierto por la cadena).
      let gridKey = null;

      if (!playerIsOpen()) {
        const tabOk = await ensureRepostTabWithRetries();
        // Tras Detener, ensureRepostTabWithRetries devuelve false sin haber
        // perdido la pestaña: no es un "me rindo" ni un noTab, y tiene que
        // terminar como "Detenido".
        if (!running) break;
        if (!tabOk) {
          console.warn(
            `[TikTokRepostRemover] Me rindo: no pude reactivar la pestaña de reposts ` +
              `tras ${CONFIG.TAB_RECHECK_ATTEMPTS} intentos. ` +
              `removidos=${removed} rescatados=${rescued} pendientes=${pendingCount()} url=${location.href}`
          );
          // return y no break: el aviso de noTab es la explicación real y el
          // bloque de "Detenido" del final lo pisaba siempre.
          return abort("noTab");
        }
        const link = getNextVideoLink();

        if (!link) {
          statusMessage = t("scrolling");
          const foundMore = await scrollAndCheck();
          // Sin esto, un Detener durante el último scroll terminaba la corrida
          // como "Listo" (finished) o arrancaba una repesca.
          if (!running) break;
          if (foundMore) { emptyScrolls = 0; continue; }
          emptyScrolls++;
          if (emptyScrolls >= CONFIG.MAX_EMPTY_SCROLLS) {
            // Antes de la siguiente repesca y antes de contar pendientes: los
            // objetivos que esta repesca no llegó a reabrir no se pierden.
            requeueUnrevisitedTargets();
            if (startRescuePass()) {
              emptyScrolls = 0;
              window.scrollTo({ top: 0, behavior: "instant" });
              await sleep(1000);
              continue;
            }
            const pendientes = failedQueue.length;
            if (pendientes > 0) {
              console.warn(
                "[TikTokRepostRemover] Quedaron sin borrar tras la repesca (IDs):",
                failedQueue
              );
            }
            console.log(
              `[TikTokRepostRemover] Pasada terminada. removidos=${removed} rescatados=${rescued} pendientes=${pendientes}`
            );
            // 0 eliminados va primero: si no, una corrida en la que fallaron
            // todos terminaba con el mismo "Listo ✔" que una que salió bien.
            if (removed === 0) statusMessage = t("doneNoneRemoved", pendientes);
            else if (pendientes > 0) statusMessage = t("doneWithPending", removed, pendientes);
            else statusMessage = t("done", removed);
            finished = true;
            running = false;
            break;
          }
          continue;
        }

        emptyScrolls = 0;
        // Se lee antes del click: si TikTok redibuja la grilla al abrir el
        // reproductor, React puede reusar este nodo para otro item y
        // cambiarle el href.
        const linkHref = link.getAttribute("href") || "";
        // Pegado al click de la grilla, sin await en el medio.
        if (!running) break;
        statusMessage = t("openingChain", removed);
        humanClick(link);
        const opened = await waitFor(() => (playerIsOpen() ? true : null), 6000);
        if (!opened) {
          // waitFor también devuelve null tras Detener: ese video no se llegó
          // a abrir, así que no se marca como procesado.
          if (!running) break;
          // El reproductor no abrió a tiempo. Antes quedaba procesado para
          // siempre sin contar como pendiente ni pasar por la repesca, y la
          // corrida terminaba en "Listo" con ese repost todavía ahí. Acá solo
          // salió el click a la grilla, ninguno al toggle, así que mandarlo a
          // la repesca es seguro.
          queueFailed(contentKey(linkHref));
          statusMessage = t("toRescue", pendingCount());
          console.warn("[TikTokRepostRemover] No se abrió el reproductor de:", linkHref);
          continue;
        }
        gridKey = contentKey(linkHref);
        await sleep(CONFIG.NAV_WAIT_MS);
      }

      const currentUrl = normalizeUrl(location.href);
      const currentKey = contentKey(currentUrl);
      // Si el item del reproductor ya estaba procesado, esta vuelta no manda
      // ningún click al toggle. Lo usa el bloque del link de la grilla de más
      // abajo.
      const handledHere = !processedUrls.has(currentKey);

      if (handledHere) {
        processedUrls.add(currentKey);

        itemToggleClicks = 0;
        const ok = await removeRepostWithRetries();
        if (ok) {
          removed++;
          if (rescuePass > 0) rescued++;
          persist();
          statusMessage = t("removedOk", removed);
        } else if (!running) {
          // Detener cortó este video a mitad de camino: no es una baja ni un
          // fallo, así que no suma a removed ni va a la cola de repesca.
          if (itemToggleClicks === 0) {
            // No salió ningún click al toggle: el video quedó como estaba y
            // es seguro volver a intentarlo en la próxima corrida.
            processedUrls.delete(currentKey);
          } else {
            // Ya salió al menos un click: el repost pudo haberse quitado o
            // no. Queda procesado y fuera de la repesca para no reclickearlo
            // a ciegas; se reporta para revisarlo a mano.
            unverified.push(currentUrl);
            console.warn(
              "[TikTokRepostRemover] Detenido a mitad de la baja, estado sin verificar:",
              currentUrl
            );
          }
          break;
        } else {
          queueFailed(currentKey);
          statusMessage = t("toRescue", pendingCount());
          console.warn(
            "[TikTokRepostRemover] No pude quitar el repost de:",
            currentUrl,
            "| tipo:", currentUrl.includes("/photo/") ? "FOTO" : "VIDEO"
          );
        }

        if (running) await randomDelay();
      }

      // Recién ahora, con el item del reproductor ya resuelto, se anota el
      // link de la grilla que lo abrió, y solo si su ID es otro. Anotarlo
      // antes, cuando coinciden, haría que el item actual figurara como
      // procesado y se salteara su baja. Si no coinciden, el reproductor abrió
      // otro item que el clickeado, y el de la grilla no se tocó:
      // - Si esta vuelta no manejó nada (el del reproductor ya estaba
      //   procesado, p. ej. un reproductor que abrió tarde), marcarlo procesado
      //   lo sacaba de la baja y de los pendientes sin haberlo intentado, y la
      //   corrida podía cerrar en "Listo" con ese repost ahí. Va a la repesca.
      // - Si era un objetivo de la repesca, ya contaba como pendiente: sigue
      //   en la cola en vez de desaparecer de la cuenta. Solo si la URL del
      //   reproductor trae su propio ID; sin ID no se sabe a qué item fueron
      //   los clicks de esta vuelta y reabrirlo podría volver a agregarle el
      //   repost.
      // - Si no, se marca procesado para no reabrirlo en loop. Encolarlo
      //   contaría dos veces cada item si el desfase fuera sistemático.
      if (gridKey !== null && gridKey !== currentKey) {
        console.warn(
          "[TikTokRepostRemover] El link de la grilla abrió otro item:",
          `grilla=${gridKey} reproductor=${currentKey}`
        );
        const stillPending =
          !handledHere ||
          (rescueTargets.includes(gridKey) && CONTENT_ID_RE.test(currentUrl));
        if (stillPending) queueFailed(gridKey);
        else processedUrls.add(gridKey);
      }

      // También cubre el camino donde el video ya estaba procesado: sin esto,
      // un Detener durante la apertura igual pisaba "Deteniendo…" con "next".
      if (!running) break;
      statusMessage = t("next", removed);
      const navigated = await goToNextVideo();

      if (!navigated) {
        // goToNextVideo también devuelve false tras Detener: eso no es el
        // fin de la cadena, así que no se cierra el reproductor.
        if (!running) break;
        statusMessage = t("chainEnd");
        await closePlayer();
        await sleep(CONFIG.ACTION_WAIT_MS);
        // Se mira recién después de esperar a que se cierre, no pegado al
        // click: el reproductor puede tardar en desmontarse.
        await waitPlayerClosed();
        // Tras Detener, closePlayer no llega a clickear: que el reproductor
        // siga abierto no es un cierre fallido y no se cuenta.
        if (!running) break;
        if (playerIsOpen()) {
          playerStuck++;
          console.warn(
            `[TikTokRepostRemover] No pude avanzar ni cerrar el reproductor ` +
              `(${playerStuck}/${CONFIG.MAX_PLAYER_STUCK}). url=${location.href}`
          );
          // No se vuelve atrás en el historial: en una página de video cargada
          // directo eso puede sacarte de TikTok o recargar la página y matar
          // el script, y en el modal puede saltar más atrás del perfil. Mejor
          // frenar y avisar.
          if (playerStuck >= CONFIG.MAX_PLAYER_STUCK) return abort("cantClosePlayer");
        } else {
          playerStuck = 0;
        }
      } else {
        playerStuck = 0;
      }
    }

    if (!finished && !running) {
      console.log(
        `[TikTokRepostRemover] Detenido antes de terminar. removidos=${removed} rescatados=${rescued} pendientes=${pendingCount()} sin_verificar=${unverified.length} url=${location.href}`
      );
      statusMessage = t("stopped", removed);
    }
  }

  // Única puerta de entrada al bucle. loopActive se prende de forma síncrona
  // antes del primer await, así que START ya lo ve prendido si llega enseguida,
  // y el finally lo apaga pase lo que pase (incluso si el cuerpo tira una
  // excepción). Los logs de inicio y salida permiten comprobar en la consola
  // que nunca hay dos bucles a la vez.
  async function mainLoop() {
    loopActive = true;
    console.log("[TikTokRepostRemover] loop start");
    try {
      // Ya, sin esperar al diferido: una recarga apenas arrancada también es
      // una corrida cortada (con 0 eliminados), no un "Inactivo" mudo. Va
      // dentro del try para que, si alguna vez tirara, el finally igual
      // apague loopActive y START no quede rechazado hasta recargar.
      persist(true);
      await mainLoopBody();
    } finally {
      // Todas las salidas normales ya dejan running en false. Si quedó en
      // true es porque el cuerpo tiró una excepción: sin esto START lo
      // ignoraría para siempre (cree que sigue corriendo) sin bucle vivo.
      if (running) {
        running = false;
        statusMessage = t("stopped", removed);
      }
      loopActive = false;
      console.log("[TikTokRepostRemover] loop exit");
      // Toda salida del bucle (Listo, Detenido, abort, excepción) deja el
      // espejo en running:false, así una recarga posterior no la muestra
      // como interrumpida.
      persist(true);
    }
  }

  // ---------------------------------------------------------------------------
  // Sonda de diagnóstico de SOLO LECTURA (acción PROBE / __repostRemoverProbe).
  //
  // Existe porque la lógica de borrado depende de hechos del DOM real de TikTok
  // que no se pueden deducir desde el código: dónde queda el control de repost
  // dentro del reproductor, cómo muestra su estado, si la grilla del perfil
  // sigue montada debajo del overlay, qué agarran de verdad los selectores y
  // las búsquedas por texto. La sonda solo lee atributos y texto: nunca hace
  // click, hover ni scroll, ni dispara eventos, así que correrla no puede
  // agregar ni quitar un repost ni mover la página. Tampoco toca el estado de
  // la corrida (contadores, colas, statusMessage).
  // ---------------------------------------------------------------------------
  const PROBE_TEXT_MAX = 80;
  const PROBE_CLASS_MAX = 160;
  const PROBE_URL_MAX = 200;
  const PROBE_LIST_MAX = 20;
  const PROBE_MATCH_MAX = 3;

  // Recorta textos y URLs largos: el reporte se pega en un issue y un
  // textContent de un contenedor grande lo volvería ilegible.
  const probeClip = (value, max) => {
    if (value == null) return null;
    const str = String(value);
    return str.length > max ? str.slice(0, max) + "…" : str;
  };

  // Niveles hasta el ancestro más cercano que contiene un <video>. Distingue
  // un control del reproductor (profundidad chica) de uno del perfil de fondo,
  // que recién comparte ancestro con el video muy arriba, cerca de <body>.
  // Es un valor relativo, no un sí/no: el fondo también da un número porque
  // <body> contiene el video. Solo sirve comparado con la profundidad de los
  // controles del reproductor; la señal principal de "está en el reproductor"
  // es inDialog.
  function probeVideoAncestorDepth(el, maxDepth = 40) {
    let node = el;
    for (let depth = 0; depth <= maxDepth && node && node !== document.documentElement; depth++) {
      if (node.querySelector && node.querySelector("video")) return depth;
      node = node.parentElement;
    }
    return null;
  }

  // Usa getAttribute("class") y no className porque en los <svg> className
  // es un SVGAnimatedString, no un texto.
  function probeDescribe(el) {
    if (!el) return null;
    const attr = (name) => el.getAttribute(name);
    const e2eAncestor = el.parentElement && el.parentElement.closest("[data-e2e]");
    return {
      tag: el.tagName.toLowerCase(),
      dataE2e: attr("data-e2e"),
      role: attr("role"),
      ariaLabel: attr("aria-label"),
      ariaPressed: attr("aria-pressed"),
      ariaSelected: attr("aria-selected"),
      ariaDisabled: attr("aria-disabled"),
      disabled: typeof el.disabled === "boolean" ? el.disabled : null,
      text: probeClip((el.textContent || "").trim(), PROBE_TEXT_MAX),
      className: probeClip(attr("class"), PROBE_CLASS_MAX),
      inDialog: !!el.closest('[role="dialog"], [aria-modal="true"]'),
      // Además de los roles ARIA, los mismos selectores de tab que usa el
      // código (data-e2e "-tab", PTabItem): TikTok puede renderizar el tab
      // sin role y entonces un hit sobre el tab de fondo diría inTab:false.
      inTab: !!el.closest(
        '[role="tab"], [role="tablist"], [data-e2e$="-tab"], [class*="PTabItem"]'
      ),
      videoAncestorDepth: probeVideoAncestorDepth(el),
      ancestorDataE2e: e2eAncestor ? e2eAncestor.getAttribute("data-e2e") : null
    };
  }

  // Describe también el elemento que el código real clickearía (por ejemplo
  // el <button> que envuelve a un <span>), porque el estado del toggle
  // (aria-pressed, clases) puede estar en el contenedor y no en el hijo.
  // Solo lo calcula: no lo toca.
  function probeWithTarget(el, toTarget) {
    if (!el) return null;
    const target = toTarget(el);
    return {
      element: probeDescribe(el),
      clickTarget: target && target !== el ? probeDescribe(target) : "same"
    };
  }

  const probeSafe = (fn) => {
    try {
      return fn();
    } catch (e) {
      return { error: String((e && e.message) || e) };
    }
  };

  function probeDom() {
    // Mismos "qué se clickearía" que usan las estrategias reales, para que el
    // reporte muestre exactamente lo que agarraría cada una.
    const closestButton = (el) => el.closest("button") || el;
    const closestButtonOrLink = (el) => el.closest("button") || el.closest("a") || el;
    const self = (el) => el;

    return {
      probe: "TikTok Repost Remover DOM probe (read-only)",
      at: new Date().toISOString(),
      extensionVersion: probeSafe(() => chrome.runtime.getManifest().version),
      pathname: location.pathname,
      playerOpen: playerIsOpen(),
      documentLang: document.documentElement.lang || null,
      run: { running, finished },
      repostTabActive: probeSafe(isRepostTabActive),

      // Si el tab sigue en el DOM con el reproductor abierto, las búsquedas
      // por texto de todo el documento pueden confundirlo con el control de
      // repost del video. La cadena de 4 niveles replica lo que mira
      // isRepostTabActive() para decidir si está activo.
      repostTab: probeSafe(() => {
        const tab = document.querySelector('[data-e2e="repost-tab"]');
        if (!tab) return { exists: false };
        const classChain = [];
        let node = tab;
        for (let i = 0; i < 4 && node; i++) {
          classChain.push({
            tag: node.tagName.toLowerCase(),
            className: probeClip(node.getAttribute("class"), PROBE_CLASS_MAX),
            ariaSelected: node.getAttribute("aria-selected")
          });
          node = node.parentElement;
        }
        return {
          exists: true,
          tag: tab.tagName.toLowerCase(),
          text: probeClip((tab.textContent || "").trim(), PROBE_TEXT_MAX),
          ariaSelected: tab.getAttribute("aria-selected"),
          classChain
        };
      }),

      tabs: probeSafe(() => {
        const nodes = document.querySelectorAll(
          '[role="tab"], p[class*="PTabItem"], [data-e2e$="-tab"]'
        );
        return {
          count: nodes.length,
          items: Array.from(nodes).slice(0, PROBE_LIST_MAX).map((el) => ({
            tag: el.tagName.toLowerCase(),
            text: probeClip((el.textContent || "").trim(), PROBE_TEXT_MAX),
            dataE2e: el.getAttribute("data-e2e"),
            ariaSelected: el.getAttribute("aria-selected"),
            className: probeClip(el.getAttribute("class"), PROBE_CLASS_MAX)
          }))
        };
      }),

      // hrefs crudos (sin normalizar) para ver si TikTok los renderiza
      // relativos o absolutos; "eligible" descuenta sidebars y sugeridos
      // igual que getNextVideoLink().
      videoItems: probeSafe(() =>
        SELECTORS.videoItems.map((selector) => {
          const links = Array.from(document.querySelectorAll(selector));
          return {
            selector,
            count: links.length,
            eligible: links.filter((link) => !isExcludedLink(link)).length,
            firstHrefs: links
              .slice(0, 3)
              .map((link) => probeClip(link.getAttribute("href"), PROBE_URL_MAX))
          };
        })
      ),
      nextGridLinkHref: probeSafe(() => {
        const link = getNextVideoLink();
        return link ? probeClip(link.getAttribute("href"), PROBE_URL_MAX) : null;
      }),

      // Por cada selector de la lista, qué matchea; "picked" es el que ganaría
      // queryFirst(), o sea el que usaría el código real, y dentro de él
      // matches[0] es el elemento que clickearía. Se describen hasta 3 matches
      // y no solo el primero: si un selector agarra a la vez un elemento del
      // perfil de fondo y uno del reproductor, hay que ver los dos.
      controls: probeSafe(() => {
        const groups = {
          repostButton: closestButton,
          shareButton: closestButton,
          nextButton: self,
          closeButton: self
        };
        const out = {};
        for (const [key, toTarget] of Object.entries(groups)) {
          let picked = null;
          const candidates = SELECTORS[key].map((selector) => {
            let nodes;
            try {
              nodes = document.querySelectorAll(selector);
            } catch (e) {
              return { selector, error: String((e && e.message) || e) };
            }
            const first = nodes[0] || null;
            if (first && picked === null) picked = selector;
            return {
              selector,
              matched: !!first,
              count: nodes.length,
              matches: Array.from(nodes)
                .slice(0, PROBE_MATCH_MAX)
                .map((node) => probeWithTarget(node, toTarget))
            };
          });
          out[key] = { picked, candidates };
        }
        return out;
      }),

      // Las mismas búsquedas por texto (mismo regex y mismas etiquetas) que
      // hacen strategyDirectButton, strategySharePanel, handleConfirmModal y
      // ensureRepostTab. Con el panel de compartir cerrado, lo que devuelvan
      // acá es lo que esas funciones clickearían por error.
      textMatches: probeSafe(() => ({
        repostButtonText: probeWithTarget(
          findByText(SELECTORS.repostButtonTextRegex, ["button", "span"]),
          closestButton
        ),
        shareRepostOption: probeWithTarget(
          findByText(SELECTORS.shareRepostOptionRegex, ["p", "span", "div", "button"]),
          closestButtonOrLink
        ),
        confirmButton: probeWithTarget(
          findByText(SELECTORS.confirmTextRegex, ["button"]),
          self
        ),
        repostTabText: probeWithTarget(
          findByText(SELECTORS.repostTabTextRegex, ["p", "span", "button"]),
          self
        )
      })),

      dialogs: probeSafe(() =>
        Array.from(document.querySelectorAll('[role="dialog"], [aria-modal="true"]'))
          .slice(0, PROBE_LIST_MAX)
          .map((el) => ({
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute("role"),
            ariaModal: el.getAttribute("aria-modal"),
            dataE2e: el.getAttribute("data-e2e"),
            text: probeClip((el.textContent || "").trim(), PROBE_TEXT_MAX)
          }))
      ),

      // El ancestro con data-e2e del <video> ayuda a identificar la raíz del
      // overlay del reproductor.
      videos: probeSafe(() => {
        const videos = Array.from(document.querySelectorAll("video"));
        return {
          count: videos.length,
          items: videos.slice(0, 3).map((video) => {
            const e2eAncestor = video.closest("[data-e2e]");
            return {
              currentSrc: probeClip(video.currentSrc, PROBE_URL_MAX),
              poster: probeClip(video.getAttribute("poster"), PROBE_URL_MAX),
              ancestorDataE2e: e2eAncestor ? e2eAncestor.getAttribute("data-e2e") : null
            };
          })
        };
      }),

      // Candidatos al link del perfil propio (usuario logueado), para poder
      // comprobar después que el perfil abierto es el tuyo y no el de otro.
      profileLinks: probeSafe(() => {
        const seen = new Set();
        const items = [];
        for (const a of document.querySelectorAll("nav a[href], header a[href]")) {
          const href = a.getAttribute("href") || "";
          if (!/^(https:\/\/www\.tiktok\.com)?\/@/.test(href) || seen.has(href)) continue;
          seen.add(href);
          items.push({
            href: probeClip(href, PROBE_URL_MAX),
            dataE2e: a.getAttribute("data-e2e"),
            text: probeClip((a.textContent || "").trim(), PROBE_TEXT_MAX)
          });
          if (items.length >= PROBE_LIST_MAX) break;
        }
        return items;
      })
    };
  }

  // Queda colgada del window del mundo aislado del content script, no del de
  // la página: TikTok no la ve ni la puede llamar, y para usarla desde
  // DevTools hay que elegir el contexto de la extensión en la Consola.
  window.__repostRemoverProbe = probeDom;

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.action) {
      case "START":
        if (msg.speed && SPEED_PRESETS[msg.speed]) CONFIG.speed = msg.speed;
        if (msg.lang && I18N[msg.lang]) lang = msg.lang;
        if (running) {
          // Ya hay una corrida en marcha: no se hace nada.
          sendResponse({ ok: true });
          break;
        }
        if (loopActive) {
          // Detener ya se pidió pero el bucle viejo todavía no salió de su
          // sleep. Arrancar otro ahora dejaría dos bucles clickeando el mismo
          // reproductor, así que se rechaza hasta que termine de frenar.
          statusMessage = t("stopping");
          sendResponse({ ok: false, stopping: true });
          break;
        }
        // Este tiene que seguir siendo el único lugar que vuelve a poner
        // running en true, y solo sin bucle vivo: un bucle viejo que siguiera
        // dormido revive si running vuelve a true por otro lado, y no hay
        // contador de corridas que lo frene.
        running = true;
        startedSinceLoad = true;
        // Corrida nueva: contadores y colas desde cero. Antes solo se
        // reiniciaba rescuePass, y un segundo Iniciar sin recargar mostraba el
        // total acumulado de la corrida anterior como si fuera de esta.
        resetRunState();
        mainLoop();
        sendResponse({ ok: true });
        break;

      case "STOP":
        running = false;
        // El bucle puede tardar unos segundos en enterarse (está en algún
        // sleep): mientras tanto el popup muestra que está frenando.
        if (loopActive) statusMessage = t("stopping");
        sendResponse({ ok: true, stopping: loopActive });
        break;

      case "SET_LANG":
        if (I18N[msg.lang]) {
          lang = msg.lang;
          try { chrome.storage.local.set({ lang }); } catch (e) {}
          // El aviso de corrida interrumpida queda a la vista hasta el próximo
          // Iniciar, así que se rearma en el idioma nuevo.
          if (interruptedRun) statusMessage = t("interrupted", interruptedRun.removed);
        }
        sendResponse({ ok: true, lang });
        break;

      case "SET_SPEED":
        if (SPEED_PRESETS[msg.speed]) CONFIG.speed = msg.speed;
        sendResponse({ ok: true, speed: CONFIG.speed });
        break;

      case "STATUS": {
        // Tras una recarga que cortó una corrida se muestran los números de
        // esa corrida (solo para mostrar) hasta el próximo Iniciar; si no,
        // los contadores en vivo.
        const shown = interruptedRun || {
          removed,
          rescued,
          // Incluye los objetivos de la repesca en curso que todavía no se
          // reabrieron: antes la repesca mostraba 0 mientras seguían ahí.
          pending: pendingCount(),
          unverified: unverified.length
        };
        sendResponse({
          running,
          // true entre Detener y la salida real del bucle: el popup puede
          // usarlo para no ofrecer Iniciar mientras tanto.
          stopping: loopActive && !running,
          finished,
          removed: shown.removed,
          rescued: shown.rescued,
          pending: shown.pending,
          unverified: shown.unverified,
          speed: CONFIG.speed,
          lang,
          message: statusMessage
        });
        break;
      }

      // Solo lectura: devuelve el reporte de probeDom() sin cambiar running,
      // contadores ni statusMessage, así se puede pedir incluso en plena corrida.
      case "PROBE":
        try {
          sendResponse({ ok: true, report: probeDom() });
        } catch (e) {
          sendResponse({ ok: false, error: String((e && e.message) || e) });
        }
        break;
    }
    return true;
  });
})();
