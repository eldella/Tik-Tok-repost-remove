(() => {
  if (window.__repostCleanerLoaded) return;
  window.__repostCleanerLoaded = true;

  // El popup cambia el idioma con el mensaje SET_LANG; la elección queda
  // guardada en chrome.storage.local para persistir entre sesiones.
  const I18N = {
    es: {
      starting: () => "Iniciando…",
      openProfile: () => "Abrí tu perfil (tiktok.com/@tu_usuario) antes de iniciar.",
      noTab: () => 'No encontré la pestaña "Republicaciones". Abrila manualmente en tu perfil y tocá Iniciar de nuevo.',
      scrolling: () => "Buscando más reposts (scroll)…",
      doneWithPending: (r, p) => `Listo ✔ ${r} eliminados · ${p} no se pudieron (revisalos a mano).`,
      done: (r) => `Listo ✔ ${r} reposts eliminados.`,
      openingChain: (r) => `Abriendo cadena de videos… (${r} eliminados)`,
      removing: (r) => `Quitando repost… (${r} eliminados)`,
      retrying: (a, m, r) => `Reintento ${a}/${m}… (${r} eliminados)`,
      removedOk: (r) => `Repost eliminado ✔ (total: ${r})`,
      toRescue: (p) => `No pude con este, va a la cola de repesca (${p} pendientes)`,
      next: (r) => `Pasando al siguiente… (${r} eliminados)`,
      chainEnd: () => "Fin de la cadena, re-escaneando la grilla…",
      rescuePass: (n, m) => `Repesca ${n}: reintentando ${m} video(s)…`,
      stopping: () => "Deteniendo…",
      stopped: (r) => `Detenido. ${r} reposts eliminados hasta ahora.`
    },
    en: {
      starting: () => "Starting…",
      openProfile: () => "Open your profile (tiktok.com/@your_username) before starting.",
      noTab: () => 'Couldn\'t find the "Reposts" tab. Open it manually on your profile and hit Start again.',
      scrolling: () => "Looking for more reposts (scrolling)…",
      doneWithPending: (r, p) => `Done ✔ ${r} removed · ${p} couldn't be removed (check them manually).`,
      done: (r) => `Done ✔ ${r} reposts removed.`,
      openingChain: (r) => `Opening video chain… (${r} removed)`,
      removing: (r) => `Removing repost… (${r} removed)`,
      retrying: (a, m, r) => `Retry ${a}/${m}… (${r} removed)`,
      removedOk: (r) => `Repost removed ✔ (total: ${r})`,
      toRescue: (p) => `Couldn't remove this one, queued for rescue (${p} pending)`,
      next: (r) => `Moving to the next one… (${r} removed)`,
      chainEnd: () => "End of chain, re-scanning the grid…",
      rescuePass: (n, m) => `Rescue pass ${n}: retrying ${m} video(s)…`,
      stopping: () => "Stopping…",
      stopped: (r) => `Stopped. ${r} reposts removed so far.`
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

    ELEMENT_TIMEOUT_MS: 7000
  };

  // Si TikTok cambia el DOM, estos son los selectores a actualizar.
  const SELECTORS = {
    repostTab: ['[data-e2e="repost-tab"]', 'p[class*="PTabItem"]'],
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
  const processedUrls = new Set();
  let failedQueue = [];
  let rescuePass = 0;
  // Videos donde un Detener cortó la baja después de que ya salió un click al
  // toggle: no se sabe si quedó con o sin repost. Quedan como procesados y
  // nunca se reclickean solos, porque un segundo click a ciegas puede volver
  // a agregar el repost que el primero ya había quitado.
  let unverified = [];
  // Clicks al toggle de repost en el video actual. mainLoopBody lo pone en 0
  // antes de cada video; solo lo incrementa clickToggle().
  let itemToggleClicks = 0;

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
  // que el mismo video quede registrado dos veces distintas en processedUrls
  // (una como relativo, otra como absoluto) y se reprocese en loop.
  const normalizeUrl = (url) => {
    try {
      return new URL(url, location.href).href.split("?")[0];
    } catch (e) {
      return url.split("?")[0];
    }
  };

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

  async function ensureRepostTab() {
    if (isRepostTabActive()) return true;

    let tab = queryFirst(SELECTORS.repostTab);
    if (!tab || !SELECTORS.repostTabTextRegex.test(tab.textContent || "")) {
      tab = findByText(SELECTORS.repostTabTextRegex, ["p", "span", "button"]);
    }
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
        `[RepostsCleaner] No detecto la pestaña de reposts activa ` +
          `(intento ${attempt}/${CONFIG.TAB_RECHECK_ATTEMPTS}). ` +
          `removidos=${removed} rescatados=${rescued} pendientes=${failedQueue.length} url=${location.href}`
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
        if (CONTENT_URL_RE.test(href) && !processedUrls.has(normalizeUrl(href))) {
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
      if (CONTENT_URL_RE.test(href) && !processedUrls.has(normalizeUrl(href))) {
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
    if (!running) return false;
    if (nextBtn && !nextBtn.disabled) {
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
  // recorra de nuevo.
  function startRescuePass() {
    if (failedQueue.length === 0 || rescuePass >= CONFIG.MAX_RESCUE_PASSES) {
      return false;
    }
    rescuePass++;
    statusMessage = t("rescuePass", rescuePass, failedQueue.length);
    for (const url of failedQueue) processedUrls.delete(url);
    failedQueue = [];
    return true;
  }

  // El cuerpo del bucle; lo lanza solo mainLoop(), que lleva la cuenta de si
  // hay un bucle vivo.
  async function mainLoopBody() {
    finished = false;
    statusMessage = t("starting");

    // Ancla contra hostname/pathname, no contra location.href entero: un
    // regex sin anclar podía dar true con solo tener "tiktok.com/@x" en
    // cualquier parte de la URL (query string, etc.), incluso en otro sitio.
    const onProfile =
      location.hostname === "www.tiktok.com" && /^\/@[^/]+/.test(location.pathname);
    if (!onProfile) {
      statusMessage = t("openProfile");
      running = false;
      return;
    }

    let emptyScrolls = 0;

    while (running) {
      if (!playerIsOpen()) {
        const tabOk = await ensureRepostTabWithRetries();
        // Tras Detener, ensureRepostTabWithRetries devuelve false sin haber
        // perdido la pestaña: no es un "me rindo" ni un noTab.
        if (!running) break;
        if (!tabOk) {
          console.warn(
            `[RepostsCleaner] Me rindo: no pude reactivar la pestaña de reposts ` +
              `tras ${CONFIG.TAB_RECHECK_ATTEMPTS} intentos. ` +
              `removidos=${removed} rescatados=${rescued} pendientes=${failedQueue.length} url=${location.href}`
          );
          statusMessage =
            t("noTab");
          running = false;
          break;
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
            if (startRescuePass()) {
              emptyScrolls = 0;
              window.scrollTo({ top: 0, behavior: "instant" });
              await sleep(1000);
              continue;
            }
            const pendientes = failedQueue.length;
            if (pendientes > 0) {
              console.warn(
                "[RepostsCleaner] Quedaron sin borrar tras la repesca:",
                failedQueue
              );
            }
            console.log(
              `[RepostsCleaner] Pasada terminada. removidos=${removed} rescatados=${rescued} pendientes=${pendientes}`
            );
            statusMessage =
              pendientes > 0
                ? t("doneWithPending", removed, pendientes)
                : t("done", removed);
            finished = true;
            running = false;
            break;
          }
          continue;
        }

        emptyScrolls = 0;
        // Pegado al click de la grilla, sin await en el medio.
        if (!running) break;
        statusMessage = t("openingChain", removed);
        humanClick(link);
        const opened = await waitFor(() => (playerIsOpen() ? true : null), 6000);
        if (!opened) {
          // waitFor también devuelve null tras Detener: ese video no se llegó
          // a abrir, así que no se marca como procesado.
          if (!running) break;
          processedUrls.add(normalizeUrl(link.getAttribute("href") || ""));
          continue;
        }
        await sleep(CONFIG.NAV_WAIT_MS);
      }

      const currentUrl = normalizeUrl(location.href);

      if (!processedUrls.has(currentUrl)) {
        processedUrls.add(currentUrl);

        itemToggleClicks = 0;
        const ok = await removeRepostWithRetries();
        if (ok) {
          removed++;
          if (rescuePass > 0) rescued++;
          statusMessage = t("removedOk", removed);
        } else if (!running) {
          // Detener cortó este video a mitad de camino: no es una baja ni un
          // fallo, así que no suma a removed ni va a la cola de repesca.
          if (itemToggleClicks === 0) {
            // No salió ningún click al toggle: el video quedó como estaba y
            // es seguro volver a intentarlo en la próxima corrida.
            processedUrls.delete(currentUrl);
          } else {
            // Ya salió al menos un click: el repost pudo haberse quitado o
            // no. Queda procesado y fuera de la repesca para no reclickearlo
            // a ciegas; se reporta para revisarlo a mano.
            unverified.push(currentUrl);
            console.warn(
              "[RepostsCleaner] Detenido a mitad de la baja, estado sin verificar:",
              currentUrl
            );
          }
          break;
        } else {
          failedQueue.push(currentUrl);
          statusMessage = t("toRescue", failedQueue.length);
          console.warn(
            "[RepostsCleaner] No pude quitar el repost de:",
            currentUrl,
            "| tipo:", currentUrl.includes("/photo/") ? "FOTO" : "VIDEO"
          );
        }

        if (running) await randomDelay();
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
      }
    }

    if (!finished && !running) {
      console.log(
        `[RepostsCleaner] Detenido antes de terminar. removidos=${removed} rescatados=${rescued} pendientes=${failedQueue.length} sin_verificar=${unverified.length} url=${location.href}`
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
    console.log("[RepostsCleaner] loop start");
    try {
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
      console.log("[RepostsCleaner] loop exit");
    }
  }

  // ---------------------------------------------------------------------------
  // Sonda de diagnóstico de SOLO LECTURA (acción PROBE / __repostCleanerProbe).
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
      probe: "RepostsCleaner DOM probe (read-only)",
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
  window.__repostCleanerProbe = probeDom;

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
        rescuePass = 0;
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
        }
        sendResponse({ ok: true, lang });
        break;

      case "SET_SPEED":
        if (SPEED_PRESETS[msg.speed]) CONFIG.speed = msg.speed;
        sendResponse({ ok: true, speed: CONFIG.speed });
        break;

      case "STATUS":
        sendResponse({
          running,
          // true entre Detener y la salida real del bucle: el popup puede
          // usarlo para no ofrecer Iniciar mientras tanto.
          stopping: loopActive && !running,
          finished,
          removed,
          rescued,
          pending: failedQueue.length,
          unverified: unverified.length,
          speed: CONFIG.speed,
          lang,
          message: statusMessage
        });
        break;

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
