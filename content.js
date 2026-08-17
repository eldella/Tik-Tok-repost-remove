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

  let running = false;
  let finished = false;
  let removed = 0;
  let rescued = 0;
  let statusMessage = "";
  const processedUrls = new Set();
  let failedQueue = [];
  let rescuePass = 0;

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

  async function strategyDirectButton() {
    let btn = queryFirst(SELECTORS.repostButton);
    if (!btn) btn = findByText(SELECTORS.repostButtonTextRegex, ["button", "span"]);
    if (!btn) return false;

    const clickable = btn.closest("button") || btn;
    clickable.scrollIntoView({ block: "center", behavior: "instant" });
    hoverOver(clickable);
    await sleep(200);
    humanClick(clickable);
    await sleep(CONFIG.ACTION_WAIT_MS);
    return await handleConfirmModal();
  }

  // TikTok a veces esconde el toggle de repost dentro del panel de compartir
  // según el layout, por eso existe esta estrategia alternativa.
  async function strategySharePanel() {
    const shareBtn = queryFirst(SELECTORS.shareButton);
    if (!shareBtn) return false;

    const clickable = shareBtn.closest("button") || shareBtn;
    hoverOver(clickable);
    await sleep(600);

    let option = findByText(SELECTORS.shareRepostOptionRegex, ["p", "span", "div", "button"]);

    if (!option) {
      humanClick(clickable);
      await sleep(800);
      option = findByText(SELECTORS.shareRepostOptionRegex, ["p", "span", "div", "button"]);
    }

    if (!option) {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      await sleep(300);
      return false;
    }

    const optClickable = option.closest("button") || option.closest("a") || option;
    humanClick(optClickable);
    await sleep(CONFIG.ACTION_WAIT_MS);
    const confirmed = await handleConfirmModal();

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

      const ok =
        attempt % 2 === 1
          ? await strategyDirectButton() || await strategySharePanel()
          : await strategySharePanel() || await strategyDirectButton();

      if (ok) return true;

      await sleep(CONFIG.RETRY_WAIT_BASE_MS * attempt);

      const videoEl = document.querySelector("video");
      if (videoEl) hoverOver(videoEl);
    }
    return false;
  }

  async function goToNextVideo() {
    const before = normalizeUrl(location.href);

    const nextBtn = queryFirst(SELECTORS.nextButton);
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

  async function mainLoop() {
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
        statusMessage = t("openingChain", removed);
        humanClick(link);
        const opened = await waitFor(() => (playerIsOpen() ? true : null), 6000);
        if (!opened) {
          processedUrls.add(normalizeUrl(link.getAttribute("href") || ""));
          continue;
        }
        await sleep(CONFIG.NAV_WAIT_MS);
      }

      const currentUrl = normalizeUrl(location.href);

      if (!processedUrls.has(currentUrl)) {
        processedUrls.add(currentUrl);

        const ok = await removeRepostWithRetries();
        if (ok) {
          removed++;
          if (rescuePass > 0) rescued++;
          statusMessage = t("removedOk", removed);
        } else {
          failedQueue.push(currentUrl);
          statusMessage = t("toRescue", failedQueue.length);
          console.warn(
            "[RepostsCleaner] No pude quitar el repost de:",
            currentUrl,
            "| tipo:", currentUrl.includes("/photo/") ? "FOTO" : "VIDEO"
          );
        }

        await randomDelay();
        if (!running) break;
      }

      statusMessage = t("next", removed);
      const navigated = await goToNextVideo();

      if (!navigated) {
        statusMessage = t("chainEnd");
        await closePlayer();
        await sleep(CONFIG.ACTION_WAIT_MS);
      }
    }

    if (!finished && !running) {
      console.log(
        `[RepostsCleaner] Detenido antes de terminar. removidos=${removed} rescatados=${rescued} pendientes=${failedQueue.length} url=${location.href}`
      );
      statusMessage = t("stopped", removed);
    }
  }

  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    switch (msg.action) {
      case "START":
        if (msg.speed && SPEED_PRESETS[msg.speed]) CONFIG.speed = msg.speed;
        if (msg.lang && I18N[msg.lang]) lang = msg.lang;
        if (!running) {
          running = true;
          rescuePass = 0;
          mainLoop();
        }
        sendResponse({ ok: true });
        break;

      case "STOP":
        running = false;
        sendResponse({ ok: true });
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
          finished,
          removed,
          rescued,
          pending: failedQueue.length,
          speed: CONFIG.speed,
          lang,
          message: statusMessage
        });
        break;
    }
    return true;
  });
})();
