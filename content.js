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
      // La pestaña está pero no quedó seleccionada. Si ni siquiera aparece,
      // el aviso es uiChanged. "Compartidos" es el texto que se vio en vivo.
      noTab: () => 'No pude abrir la pestaña "Compartidos". Abrila manualmente en tu perfil y tocá Iniciar de nuevo.',
      // Falta la pestaña de reposts o su grilla con los hooks que usa la
      // extensión. Sin la grilla no hay forma segura de saber qué video es un
      // repost tuyo, así que la corrida frena antes de abrir ninguno. Con
      // bajas previas no se puede decir "no toqué nada". El pedido de reporte
      // va condicionado: en vivo la pestaña apareció recién cuando cargaron
      // los datos de reposts, y no se vio un perfil sin reposts. Si TikTok la
      // oculta ahí, una corrida después de limpiar todo cae acá sin que haya
      // nada roto.
      uiChanged: (r) =>
        "TikTok cambió su página: no reconozco la pestaña Compartidos o su grilla. " +
        (r > 0
          ? `Frené sin tocar ningún repost más (${r} eliminados antes). `
          : "No toqué ningún repost. ") +
        "Si todavía tenés reposts, por favor reportalo abriendo un issue.",
      cantClosePlayer: () =>
        'No pude cerrar el reproductor. Volvé a la pestaña "Compartidos" de tu perfil y tocá Iniciar de nuevo.',
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
      // Sin confirmar: les salió el único click y el tag siguió en su fila.
      // No se reintentan nunca en esta página (el tag alterna: un segundo
      // click puede volver a agregar el repost), así que la única forma de
      // saber cómo quedaron es mirarlos a mano o recargar, porque la grilla
      // sigue mostrando lo ya quitado hasta una recarga.
      doneUnverified: (r, p, u) =>
        `Terminado: ${r} eliminados` +
        (p > 0 ? ` · ${p} no se pudieron` : "") +
        ` · ${u} sin confirmar (les hice un click y el repost siguió ahí; no los vuelvo a tocar). ` +
        "Revisalos a mano: recargá la página (F5) para ver la lista real antes de iniciar de nuevo.",
      // Ya no hay "cadena": cada item se abre desde la grilla, se lee y se
      // cierra, porque el botón Siguiente ignora los clicks sintéticos.
      opening: (r) => `Abriendo el siguiente repost… (${r} eliminados)`,
      removing: (r) => `Quitando repost… (${r} eliminados)`,
      removedOk: (r) => `Repost eliminado ✔ (total: ${r})`,
      // La fila del video no tiene el tag: ya no estaba compartido (quitado
      // desde otro lado, o la grilla lo muestra de caché). No se clickea ni
      // cuenta como eliminado.
      alreadyGone: (r) => `Este ya no estaba compartido, lo salteo (${r} eliminados)`,
      unverifiedItem: (u) => `No pude confirmar esta baja; no lo vuelvo a tocar (${u} sin confirmar)`,
      toRescue: (p) => `No pude con este, va a la cola de repesca (${p} pendientes)`,
      rescuePass: (n, m) => `Repesca ${n}: reintentando ${m} video(s)…`,
      stopping: () => "Deteniendo…",
      // Un Detener justo después del click deja ese item sin confirmar: se
      // avisa acá porque el popup no muestra ese número aparte.
      stopped: (r, u = 0) =>
        `Detenido. ${r} reposts eliminados hasta ahora.` +
        (u > 0 ? ` ${u} sin confirmar: revisalos a mano.` : ""),
      // Pide volver a la pestaña y no solo "tocá Iniciar": si la recarga
      // agarró el reproductor abierto, la pestaña quedó en una página de
      // video cargada directo, y desde ahí Iniciar se frena con openProfile.
      interrupted: (r) =>
        `Se interrumpió (recarga de página): ${r} eliminados antes. ` +
        'Volvé a la pestaña "Compartidos" de tu perfil y tocá Iniciar para seguir.'
    },
    en: {
      starting: () => "Starting…",
      openProfile: () => "Open your profile (tiktok.com/@your_username) before starting.",
      noTab: () => 'Couldn\'t open the "Reposts" tab. Open it manually on your profile and hit Start again.',
      uiChanged: (r) =>
        "TikTok changed its page: I can't recognize the Reposts tab or its grid. " +
        (r > 0
          ? `I stopped without touching any more reposts (${r} removed before that). `
          : "No repost was touched. ") +
        "If you still have reposts, please report it by opening an issue.",
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
      doneUnverified: (r, p, u) =>
        `Finished: ${r} removed` +
        (p > 0 ? ` · ${p} couldn't be removed` : "") +
        ` · ${u} unconfirmed (I clicked once and the repost stayed; I won't touch them again). ` +
        "Check them by hand: reload the page (F5) to see the real list before starting again.",
      opening: (r) => `Opening the next repost… (${r} removed)`,
      removing: (r) => `Removing repost… (${r} removed)`,
      removedOk: (r) => `Repost removed ✔ (total: ${r})`,
      alreadyGone: (r) => `This one was no longer reposted, skipping it (${r} removed)`,
      unverifiedItem: (u) => `Couldn't confirm this removal; I won't touch it again (${u} unconfirmed)`,
      toRescue: (p) => `Couldn't remove this one, queued for rescue (${p} pending)`,
      rescuePass: (n, m) => `Rescue pass ${n}: retrying ${m} video(s)…`,
      stopping: () => "Stopping…",
      stopped: (r, u = 0) =>
        `Stopped. ${r} reposts removed so far.` +
        (u > 0 ? ` ${u} unconfirmed: check them by hand.` : ""),
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
    SCROLL_WAIT_MS: 2600,
    MAX_EMPTY_SCROLLS: 4,

    // Solo reintenta los items que no recibieron ningún click al toggle (el
    // reproductor no abrió, o abrió otro item). Los clickeados nunca vuelven.
    MAX_RESCUE_PASSES: 2,

    // TikTok puede redibujar el layout y hacer "desaparecer" momentáneamente
    // la pestaña de reposts tras varias bajas seguidas.
    TAB_RECHECK_ATTEMPTS: 4,
    TAB_RECHECK_WAIT_MS: 2000,

    // Al abrir la pestaña de reposts, la grilla muestra esqueletos sin <a>
    // durante un rato (en vivo, de 1 a ~8 s). Antes de este tope, una grilla
    // sin links no quiere decir "no hay reposts".
    GRID_READY_TIMEOUT_MS: 12000,

    // Tope para que, tras el click en la grilla, la URL tenga el ID de ese
    // item y su fila del reproductor esté montada. Si no, el item no recibe
    // ningún click al toggle y va a la repesca.
    OPEN_TIMEOUT_MS: 8000,
    // Pausa con la fila ya montada antes de leer el estado: el click al tag
    // en vivo funcionó con el reproductor abierto hacía un rato, no apenas
    // montado, y un click que se pierde deja el item sin confirmar para
    // siempre (no se reintenta).
    ROW_SETTLE_MS: 1000,
    // Si la fila no muestra el tag, se la sigue mirando este rato antes de
    // darla por "ya no estaba compartido": un tag que tarda en dibujarse
    // no tiene que saltear un repost que sí está.
    TAG_WAIT_MS: 1500,
    // Tope para que el tag desaparezca de la fila tras el único click. En
    // vivo tardó ~170 ms, sin diálogo ni aviso.
    VERIFY_TIMEOUT_MS: 4000,
    VERIFY_POLL_MS: 200,
    // Tope para que la URL deje /video|photo/ tras el click en cerrar.
    CLOSE_TIMEOUT_MS: 5000,

    // Cierres seguidos del reproductor que no lograron sacar la URL de
    // /video|photo/. Sin tope, el bucle intentaba cerrarlo para siempre sin
    // llegar nunca a la repesca ni al final.
    MAX_PLAYER_STUCK: 3,

    ELEMENT_TIMEOUT_MS: 7000
  };

  // Si TikTok cambia el DOM, estos son los selectores a actualizar.
  const SELECTORS = {
    // El hook data-e2e es propio de la pestaña de reposts, así que se confía en
    // él sin mirar el texto (el texto cambia con el idioma de TikTok: en vivo,
    // con la UI en español, dice "Compartidos"). Solo si ese hook no existe
    // se busca por texto, y únicamente entre pestañas de verdad (role="tab"):
    // las de la bandeja de entrada también lo son, pero sus textos no pasan
    // el regex. Las pestañas del perfil ya no usan la clase PTabItem.
    repostTab: ['[data-e2e="repost-tab"]'],
    repostTabFallback: '[role="tab"]',
    repostTabTextRegex: /compartid|republica(?:d|ci)|reposts?/i,

    // La grilla de reposts del perfil. Solo cuentan los <a> que están dentro
    // de un item de esta lista: fuera de ella hay videos que no son reposts
    // tuyos (sidebar, sugeridos, la grilla de otra pestaña del perfil).
    repostGridList: '[data-e2e="user-repost-item-list"]',
    repostGridItem: '[data-e2e="user-repost-item"]',

    // El reproductor ("Cinema Mode", visto en vivo). Su raíz es un
    // [aria-modal="true"] que monta la fila del item actual y al menos una
    // vecina, y cada fila lleva el ID del item en este atributo (data-index
    // no es estable). El estado se lee y se clickea SOLO dentro de la fila
    // cuyo ID es el de la URL y el del item abierto: la vecina también puede
    // estar compartida, y un query sobre la raíz entera agarraba su tag.
    cinemaRoot: '[aria-modal="true"]',
    cinemaRowAttr: "data-cinema-mode-snap-row",
    // La PRESENCIA de estos dos en la fila es la señal de "compartido por
    // vos"; sin repost no existen. El texto del tag varía ("Lo compartiste",
    // "2 lo compartió") y nunca se usa como señal.
    repostTag: '[data-e2e="repost-tag"]',
    // El único control que quita el repost: un <div> sin role ni aria. Es un
    // toggle, así que un segundo click puede volver a agregarlo.
    repostActionTag: '[data-e2e="repost-action-tag"]',
    // Cerrar sí acepta un click sintético. El respaldo por aria-label se
    // busca solo dentro de la raíz del reproductor.
    cinemaExit: '[data-e2e="cinema-mode-exit"]',
    closeLabelRegex: /cerrar|close/i,

    // En vivo la baja no mostró ningún diálogo. Por si TikTok agrega uno,
    // se busca uno NUEVO (que no estaba antes del click y no es la raíz del
    // reproductor) y su botón de confirmar solo dentro de él: fuera del
    // diálogo, el mismo texto puede ser un botón cualquiera del perfil.
    dialog: '[role="dialog"], [aria-modal="true"]',
    // Acepta palabra sola ("Quitar", "Remove") o frase de dos palabras
    // ("Eliminar publicación", "Quitar repost", "Delete post", "Remove repost"),
    // en ES y EN, porque TikTok no usa un texto fijo para el botón de confirmación.
    confirmTextRegex: /^(quitar|eliminar|remove|delete|confirmar|confirm)(\s+(repost|publicaci[oó]n|post|video|republicaci[oó]n))?$/i
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
  // processedUrls, failedQueue, rescueTargets y toggleClickedKeys guardan
  // claves de contentKey() (el ID numérico del video/foto), no URLs; el
  // porqué está en contentKey(). unverified sí guarda URLs, porque es para
  // revisarlos a mano.
  const processedUrls = new Set();
  // Solo items que no recibieron ningún click al toggle (el reproductor no
  // abrió o abrió otro): son los únicos que la repesca puede reintentar.
  let failedQueue = [];
  // Copia de failedQueue al arrancar cada repesca. startRescuePass vacía
  // failedQueue enseguida, así que sin esta lista los que la repesca todavía
  // no volvió a abrir no figuraban como pendientes en ningún lado.
  let rescueTargets = [];
  let rescuePass = 0;
  // Items a los que ya les salió el click al toggle y cuyo tag no se vio
  // desaparecer (no se confirmó a tiempo, o un Detener cortó la espera): no
  // se sabe si quedaron con o sin repost. Quedan como procesados y nunca se
  // reclickean solos, porque un segundo click puede volver a agregar el
  // repost que el primero ya había quitado.
  let unverified = [];
  // Items abiertos cuya fila ya no tenía el tag: no estaban compartidos (la
  // grilla los muestra de caché, o se quitaron desde otro lado). Ni se
  // clickean ni cuentan como eliminados; solo van al log del final.
  let alreadyGone = 0;
  // Todos los items a los que les salió un click al toggle desde que se
  // cargó la página. Nunca se vacía (ni al terminar, ni al Iniciar de
  // nuevo): solo una recarga lo borra, junto con la caché de la grilla.
  // removeCurrentRepost lo mira pegado al click, así un mismo item nunca
  // recibe un segundo click en otro intento, repesca o corrida.
  const toggleClickedKeys = new Set();
  // Clicks al toggle en el item actual (0 o 1). mainLoopBody lo pone en 0
  // antes de cada item; solo lo incrementa removeCurrentRepost().
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
  // Un item que ya recibió un click al toggle nunca entra a la cola: la
  // repesca lo volvería a abrir y a clickear. Hoy ningún camino lo manda
  // acá; la guarda es por si alguno lo hiciera.
  function queueFailed(key) {
    processedUrls.add(key);
    if (toggleClickedKeys.has(key)) {
      console.warn("[TikTokRepostRemover] No se encola un item ya clickeado:", key);
      return;
    }
    if (!failedQueue.includes(key)) failedQueue.push(key);
    persist();
  }

  // Fallback por texto, solo para cuando falta el data-e2e: la primera
  // pestaña (role="tab") cuyo texto corto pasa el regex. Es la misma que se
  // mira para saber si está activa y la que se clickea, así las dos cosas
  // hablan siempre del mismo elemento.
  function findRepostTabByText() {
    for (const el of document.querySelectorAll(SELECTORS.repostTabFallback)) {
      const txt = (el.textContent || "").trim();
      if (txt.length > 0 && txt.length < 30 && SELECTORS.repostTabTextRegex.test(txt)) return el;
    }
    return null;
  }

  // El data-e2e manda: si existe, el texto no se mira (con la UI en español
  // el regex viejo no reconocía "Compartidos" y la corrida terminaba en noTab
  // pidiendo abrir a mano justo la pestaña que había encontrado).
  function findRepostTab() {
    return queryFirst(SELECTORS.repostTab) || findRepostTabByText();
  }

  // Activa solo si la pestaña misma tiene aria-selected="true", que es donde
  // TikTok lo pone. Antes también valía un ancestro con aria-selected o con
  // una clase que dijera active/selected, y "inactive" o "unselected" pasan
  // ese regex: con otra pestaña abierta se daba la de reposts por activa.
  function isRepostTabActive() {
    const tab = findRepostTab();
    return !!tab && tab.getAttribute("aria-selected") === "true";
  }

  // Devuelve { state, clicked }. state es "active", "inactive" (la pestaña
  // está pero no quedó seleccionada) o "missing" (no aparece ni por data-e2e
  // ni por texto). clicked dice si salió algún click a la pestaña: al
  // activarla, la grilla vuelve a mostrar esqueletos un rato.
  async function ensureRepostTab() {
    if (isRepostTabActive()) return { state: "active", clicked: false };

    let clicked = false;
    for (let i = 0; i < 3; i++) {
      // Se busca de nuevo en cada vuelta: si React redibujó la pestaña, un
      // click al nodo viejo (ya desmontado) no llega a ningún lado.
      const tab = findRepostTab();
      if (!tab) return { state: "missing", clicked };
      // Chequeo pegado al click (sin await en el medio): tras Detener no sale
      // ningún click más, ni siquiera a la pestaña.
      if (!running) return { state: "inactive", clicked };
      humanClick(tab);
      clicked = true;
      await sleep(CONFIG.ACTION_WAIT_MS + 400);
      if (isRepostTabActive()) return { state: "active", clicked };
    }
    return { state: "inactive", clicked };
  }

  // Reintenta con espera creciente en vez de rendirse a la primera: si TikTok
  // redibuja el layout o frena momentáneamente tras varias bajas seguidas, la
  // pestaña puede "desaparecer" un instante, y en vivo tampoco estaba en el
  // primer render del perfil (apareció ~3 s después). Deja rastro en consola
  // de cada intento para poder diagnosticar la causa real si se rinde.
  // Devuelve el mismo { state, clicked } que ensureRepostTab: "missing" solo
  // si la pestaña no apareció en ningún intento (la página ya no es la que
  // conocemos), "inactive" si estuvo pero no se pudo activar.
  async function ensureRepostTabWithRetries() {
    let sawTab = false;
    let clicked = false;
    for (let attempt = 1; attempt <= CONFIG.TAB_RECHECK_ATTEMPTS; attempt++) {
      if (!running) break;
      const result = await ensureRepostTab();
      clicked = clicked || result.clicked;
      if (result.state === "active") return { state: "active", clicked };
      // Tras Detener no es un intento fallido: sin esto quedaba un aviso de
      // "no detecto la pestaña" en consola y hasta 6 s más de espera.
      if (!running) break;
      if (result.state === "inactive" || result.clicked) sawTab = true;

      console.warn(
        `[TikTokRepostRemover] No detecto la pestaña de reposts activa ` +
          `(intento ${attempt}/${CONFIG.TAB_RECHECK_ATTEMPTS}, ${result.state}). ` +
          `removidos=${removed} rescatados=${rescued} pendientes=${pendingCount()} url=${location.href}`
      );

      if (attempt < CONFIG.TAB_RECHECK_ATTEMPTS) {
        await sleep(CONFIG.TAB_RECHECK_WAIT_MS * attempt);
      }
    }
    return { state: sawTab ? "inactive" : "missing", clicked };
  }

  // Links de contenido (video o foto) de la grilla de reposts, en el orden de
  // la grilla. Solo los que están dentro de un item de la lista: ya no hay
  // fallback a "cualquier link de video del contenido principal", que con la
  // grilla vacía o toda procesada terminaba abriendo videos que no son
  // reposts tuyos (sugeridos, la grilla de Vídeos, un link suelto).
  function repostGridLinks() {
    const sel = `${SELECTORS.repostGridList} ${SELECTORS.repostGridItem} a[href]`;
    return Array.from(document.querySelectorAll(sel)).filter((link) =>
      CONTENT_URL_RE.test(link.getAttribute("href") || "")
    );
  }

  // El primer link de la grilla sin procesar. Tras cerrar el reproductor la
  // grilla sigue mostrando los ya quitados hasta una recarga (caché de
  // TikTok, visto en vivo), así que se saltean por clave. Los ya clickeados
  // se saltean aparte aunque alguien los sacara de processedUrls.
  function getNextVideoLink() {
    for (const link of repostGridLinks()) {
      const key = contentKey(link.getAttribute("href"));
      if (!processedUrls.has(key) && !toggleClickedKeys.has(key)) return link;
    }
    return null;
  }

  // Links de video o foto que están dentro de la lista pero fuera de todo
  // item con data-e2e. Los esqueletos no tienen ningún <a>, así que si hay
  // links así la grilla se sigue dibujando, pero con otros hooks: tratarla
  // como vacía terminaba la corrida en "no encontré reposts" con los reposts
  // a la vista.
  function repostGridHasUnknownLinks(list) {
    return Array.from(list.querySelectorAll("a[href]")).some(
      (link) =>
        CONTENT_URL_RE.test(link.getAttribute("href") || "") &&
        !link.closest(SELECTORS.repostGridItem)
    );
  }

  // Espera a que la grilla de reposts tenga links. Devuelve "ready" (hay al
  // menos uno), "empty" (la lista está pero sin links), "missing" (la lista
  // no apareció, o sus links ya no están en items conocidos: TikTok cambió
  // la página) o null tras Detener.
  // Con fullWait, una lista sin links se sigue esperando hasta el tope: recién
  // activada la pestaña son esqueletos, y darla por vacía ahí terminaba la
  // corrida en "no encontré reposts" con la grilla a punto de cargar. Sin
  // fullWait (la espera ya se hizo), una lista vacía vuelve enseguida. Si
  // falta la lista entera siempre se espera, porque puede estar redibujándose.
  async function waitRepostGrid(fullWait) {
    const start = Date.now();
    for (;;) {
      if (!running) return null;
      const list = document.querySelector(SELECTORS.repostGridList);
      if (list && repostGridLinks().length > 0) return "ready";
      const timedOut = Date.now() - start >= CONFIG.GRID_READY_TIMEOUT_MS;
      if (list && (timedOut || !fullWait)) {
        return repostGridHasUnknownLinks(list) ? "missing" : "empty";
      }
      if (timedOut) return "missing";
      await sleep(250);
    }
  }

  // ---------------------------------------------------------------------------
  // Baja de un item, siempre desde la grilla.
  //
  // Por cada item: click en su link de la grilla, esperar a que el
  // reproductor muestre ESE item (la URL con su ID y su fila montada), leer
  // el estado solo en esa fila, un único click al tag si está compartido,
  // confirmar que el tag desaparece de esa fila, y cerrar. Nada de
  // "Siguiente", teclado ni panel de compartir: en vivo los dos primeros
  // ignoran los eventos sintéticos, y el panel ya no existe (los selectores
  // viejos agarraban el botón de compartir perfil que queda de fondo).
  //
  // Invariante de seguridad: el tag se clickea solo cuando la fila actual
  // (ID de la URL = ID del item abierto) lo muestra, a lo sumo una vez por
  // item, y nunca más para un item ya clickeado, en ningún intento, repesca
  // ni corrida sin recargar. Una baja cuenta solo si el tag desaparece de
  // esa fila.
  // ---------------------------------------------------------------------------

  // Solo IDs numéricos: son los que llevan las filas del reproductor, y así
  // el ID entra tal cual en el selector sin escapar nada.
  const NUMERIC_KEY_RE = /^\d+$/;

  // La raíz del reproductor: el [aria-modal="true"] que tiene filas o el
  // botón de cerrar. Si hay uno solo sin esas marcas, es ese. Un diálogo de
  // confirmación también podría ser aria-modal, y no es la raíz.
  function getCinemaRoot() {
    const roots = Array.from(document.querySelectorAll(SELECTORS.cinemaRoot));
    const marked = roots.find(
      (el) => el.querySelector(`[${SELECTORS.cinemaRowAttr}]`) || el.querySelector(SELECTORS.cinemaExit)
    );
    if (marked) return marked;
    return roots.length === 1 ? roots[0] : null;
  }

  // La fila del item <key> dentro del reproductor, buscada de cero en cada
  // llamada: React puede reemplazar el nodo, y uno guardado de antes puede
  // estar desmontado o ser de otro item. Si hay más de una con ese ID no se
  // elige ninguna.
  function getCurrentRow(key) {
    if (!NUMERIC_KEY_RE.test(key || "")) return null;
    const rows = document.querySelectorAll(
      `${SELECTORS.cinemaRoot} [${SELECTORS.cinemaRowAttr}="${key}"]`
    );
    return rows.length === 1 ? rows[0] : null;
  }

  // Los dos tags de la fila de <key>, o null si la fila no está.
  function readRepostTags(key) {
    const row = getCurrentRow(key);
    if (!row) return null;
    return {
      row,
      tag: row.querySelector(SELECTORS.repostTag),
      action: row.querySelector(SELECTORS.repostActionTag)
    };
  }

  // "reposted" si la fila tiene alguno de los dos tags, "notReposted" si no
  // tiene ninguno, "unknown" si la fila no está: sin fila no se sabe nada, y
  // nunca se cae a mirar la raíz entera (ahí están las vecinas).
  function readRepostState(key) {
    const tags = readRepostTags(key);
    if (!tags) return "unknown";
    return tags.tag || tags.action ? "reposted" : "notReposted";
  }

  // El reproductor muestra el item <key>: su ID en la URL y su fila montada.
  const isShowingItem = (key) => contentKey(location.href) === key && getCurrentRow(key) !== null;

  // Click en el link de la grilla y espera a que el reproductor muestre ese
  // item. Devuelve la clave, "notReady" (no abrió, abrió otro item o su fila
  // no se montó a tiempo) o "stopped". En ningún caso sale un click al
  // toggle, así que un "notReady" puede ir a la repesca.
  async function openGridItem(link, key) {
    if (!running) return "stopped";
    humanClick(link);
    const ready = await waitFor(() => (isShowingItem(key) ? true : null), CONFIG.OPEN_TIMEOUT_MS);
    if (ready) return key;
    return running ? "notReady" : "stopped";
  }

  // Espera a que la fila muestre los dos tags. Devuelve "ready" (los dos:
  // se puede clickear), "notReposted" (ninguno en toda la espera),
  // "partial" (uno solo, estado que no se vio en vivo: no se clickea) o
  // "unknown" (la fila ya no está). Tras Detener devuelve lo último leído.
  async function settleRepostTags(key) {
    await sleep(CONFIG.ROW_SETTLE_MS);
    const start = Date.now();
    for (;;) {
      const tags = readRepostTags(key);
      if (tags && tags.tag && tags.action) return "ready";
      if (!running || Date.now() - start >= CONFIG.TAG_WAIT_MS) {
        if (!tags) return "unknown";
        return tags.tag || tags.action ? "partial" : "notReposted";
      }
      await sleep(250);
    }
  }

  // Un diálogo que no estaba antes del click y que no es (ni contiene) la
  // raíz del reproductor.
  function findNewDialog(before) {
    const cinema = getCinemaRoot();
    for (const el of document.querySelectorAll(SELECTORS.dialog)) {
      if (before.has(el) || el === cinema) continue;
      if (cinema && el.contains(cinema)) continue;
      return el;
    }
    return null;
  }

  // El botón de confirmar, buscado SOLO dentro de ese diálogo. La búsqueda
  // de antes recorría todo el documento, y su regex también podía agarrar
  // un botón del perfil de fondo.
  function findConfirmIn(dialog) {
    for (const el of dialog.querySelectorAll('button, [role="button"]')) {
      const txt = (el.textContent || "").trim();
      if (txt.length > 0 && txt.length < 40 && SELECTORS.confirmTextRegex.test(txt)) return el;
    }
    return null;
  }

  // Tras el único click: espera a que los dos tags desaparezcan de la fila,
  // releída en cada vuelta. Hacen falta dos lecturas seguidas sin tags para
  // dar la baja por buena, así un redibujo momentáneo de la fila no cuenta
  // como baja. Si aparece un diálogo nuevo se lo confirma una sola vez, pero
  // confirmar nunca cuenta por sí solo: manda el tag.
  // Devuelve "verified", "unverified" o, tras Detener, "stopped".
  async function verifyRemoval(key, dialogsBefore) {
    const deadline = Date.now() + CONFIG.VERIFY_TIMEOUT_MS;
    let goneReads = 0;
    let confirmClicked = false;
    while (Date.now() < deadline) {
      await sleep(CONFIG.VERIFY_POLL_MS);
      if (readRepostState(key) === "notReposted") {
        goneReads++;
        if (goneReads >= 2) return "verified";
      } else {
        goneReads = 0;
      }
      // Tras Detener no sale ni el click de confirmar.
      if (!running) break;
      if (!confirmClicked) {
        const dialog = findNewDialog(dialogsBefore);
        const confirmBtn = dialog && findConfirmIn(dialog);
        if (confirmBtn) {
          confirmClicked = true;
          console.warn("[TikTokRepostRemover] Apareció un diálogo al quitar el repost; lo confirmo una vez:", key);
          humanClick(confirmBtn);
        }
      }
    }
    // Una última lectura: si la vuelta anterior ya vio la fila sin tags y
    // esta también, la baja está confirmada aunque se haya acabado el tiempo
    // o haya llegado Detener. Leer no es clickear.
    if (goneReads >= 1 && readRepostState(key) === "notReposted") return "verified";
    return running ? "unverified" : "stopped";
  }

  // Quita el repost del item <key>, que el reproductor ya muestra. Devuelve:
  // - "verified": salió el click y el tag desapareció de su fila.
  // - "unverified": salió el click y el tag no desapareció a tiempo.
  // - "alreadyGone": la fila no tiene tags; no se clickea.
  // - "notReady": la URL o la fila dejaron de ser las del item, o tiene un
  //   solo tag; no se clickea, así que puede ir a la repesca.
  // - "alreadyClicked": el item ya recibió un click en esta página; no se
  //   vuelve a clickear (no debería pasar: getNextVideoLink ya lo saltea).
  // - "stopped": Detener; itemToggleClicks dice si llegó a salir el click.
  async function removeCurrentRepost(key) {
    const settled = await settleRepostTags(key);
    if (!running) return "stopped";
    if (settled === "notReposted") return "alreadyGone";
    if (settled !== "ready") return "notReady";

    // Todo lo que decide el click se relee acá, sin ningún await entre estos
    // chequeos y el click: Detener, que el item no haya recibido ya uno, que
    // la URL siga en su ID y que SU fila tenga los dos tags. El click va al
    // tag de esa misma lectura, nunca a un nodo guardado de antes.
    if (!running) return "stopped";
    if (toggleClickedKeys.has(key)) return "alreadyClicked";
    if (contentKey(location.href) !== key) return "notReady";
    const tags = readRepostTags(key);
    if (!tags || !tags.tag || !tags.action) return "notReady";
    const dialogsBefore = new Set(document.querySelectorAll(SELECTORS.dialog));
    statusMessage = t("removing", removed);
    toggleClickedKeys.add(key);
    itemToggleClicks++;
    humanClick(tags.action);
    return verifyRemoval(key, dialogsBefore);
  }

  // El botón de cerrar del reproductor: por su data-e2e dentro de un
  // [aria-modal="true"], o un botón de la raíz del reproductor cuyo
  // aria-label diga cerrar. Nunca afuera: el selector viejo por aria-label
  // podía agarrar cualquier botón del documento.
  function findCinemaExit() {
    const byE2e = document.querySelector(`${SELECTORS.cinemaRoot} ${SELECTORS.cinemaExit}`);
    if (byE2e) return byE2e;
    const root = getCinemaRoot();
    if (!root) return null;
    for (const btn of root.querySelectorAll("button")) {
      if (SELECTORS.closeLabelRegex.test(btn.getAttribute("aria-label") || "")) return btn;
    }
    return null;
  }

  // Cierra el reproductor y espera a que la URL deje /video|photo/. Un
  // cierre lento no es un cierre fallido: se espera sin volver a clickear.
  // Sin botón de cerrar (p. ej. una página de video cargada directo, que no
  // es un modal) no se manda nada más: un Escape sintético no lo cierra
  // (visto en vivo). Devuelve true si quedó cerrado. Tras Detener no
  // clickea y vuelve enseguida.
  async function closeCinema() {
    if (!playerIsOpen()) return true;
    const exit = findCinemaExit();
    if (!running) return false;
    if (exit) humanClick(exit);
    await waitFor(() => (playerIsOpen() ? null : true), CONFIG.CLOSE_TIMEOUT_MS);
    return !playerIsOpen();
  }

  async function scrollAndCheck() {
    // Cuenta solo los links de la grilla de reposts, igual que
    // getNextVideoLink(): un módulo de recomendados que sigue cargando
    // contenido al scrollear haría creer que "aparecieron más reposts" para
    // siempre y el proceso nunca llegaría a MAX_EMPTY_SCROLLS.
    const before = repostGridLinks().length;
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
    await sleep(CONFIG.SCROLL_WAIT_MS);
    const after = repostGridLinks().length;
    return after > before || getNextVideoLink() !== null;
  }

  // Al terminar la pasada principal, los videos que fallaron se sacan del
  // Set de procesados para que vuelvan a estar disponibles y el bucle los
  // recorra de nuevo. rescueTargets se queda con la lista para que sigan
  // contando como pendientes hasta que se vuelvan a abrir. En failedQueue
  // solo hay items sin ningún click al toggle (queueFailed rechaza los
  // clickeados), así que la repesca nunca reclickea uno.
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
  // revisitados" y no como fallos. Solo se abren desde la grilla, y ahí se
  // lee el estado del repost en su fila antes de cualquier click.
  function requeueUnrevisitedTargets() {
    const notRevisited = rescueTargets.filter((k) => !processedUrls.has(k));
    if (notRevisited.length === 0) return;
    for (const key of notRevisited) queueFailed(key);
    console.warn(
      "[TikTokRepostRemover] No revisitados en la repesca (la grilla no los mostró), siguen pendientes:",
      notRevisited
    );
  }

  // Corta la corrida con un mensaje propio (openProfile, noTab, uiChanged,
  // cantClosePlayer). Se usa como "return abort(...)" desde mainLoopBody:
  // con return, y no con break, el bloque de después del while no llega a
  // pisar el aviso con "Detenido".
  function abort(msgKey, ...args) {
    statusMessage = t(msgKey, ...args);
    running = false;
  }

  // Estado de una corrida nueva. Lo llama START, y solo cuando no hay bucle
  // vivo. Los fallidos (todos sin ningún click al toggle) se sacan de
  // processedUrls para reintentarlos. Los eliminados, los sin confirmar y
  // los que ya no estaban se quedan procesados: la grilla los sigue
  // mostrando de caché hasta una recarga, y toggleClickedKeys (que nunca se
  // vacía acá) impide que un item ya clickeado reciba otro click, que podría
  // volver a agregar el repost. La lista de sin verificar se vacía (es el
  // reporte de cada corrida). Para revisar todo de nuevo hay que recargar la
  // página, y los mensajes de fin lo dicen.
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
    alreadyGone = 0;
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

    // Solo se arranca desde la grilla del perfil, nunca con un video abierto:
    // el video a la vista no tiene por qué ser uno de la grilla de reposts
    // (For You, Me gusta, un link, una notificación), aunque el perfil siga
    // montado debajo del reproductor (visto en vivo). Si hay uno abierto se
    // intenta cerrarlo una vez; si sigue abierto (p. ej. una página de video
    // cargada directo, que no es un modal) se aborta sin clickear nada.
    if (playerIsOpen()) await closeCinema();
    // El @usuario se ancla contra pathname, no contra location.href entero:
    // sin anclar daba true con solo tener "tiktok.com/@x" en cualquier parte
    // de la URL. El "sin video" es en negativo (playerIsOpen() mira la URL
    // entera, pathname incluido) para no depender de la URL de la pestaña de
    // reposts. Si Detener llegó durante el cierre no se aborta: el while no
    // arranca y la corrida termina como "Detenido".
    const onProfileGrid = /^\/@[^/]+/.test(location.pathname) && !playerIsOpen();
    if (running && !onProfileGrid) return abort("openProfile");

    let emptyScrolls = 0;
    // Cierres seguidos que no sacaron al reproductor de la URL del video. Se
    // reinicia apenas uno funciona.
    let playerStuck = 0;
    // Queda en true mientras se deba la espera de los esqueletos de la
    // grilla: al arrancar y cada vez que se vuelve a clickear la pestaña. Una
    // vez hecha, una grilla vacía ya no se vuelve a esperar en cada vuelta
    // del scroll (serían 12 s por vuelta para concluir "no hay reposts").
    let gridWaitOwed = true;

    while (running) {
      // Cada item termina con el reproductor abierto, y se cierra acá, antes
      // de mirar la pestaña y la grilla. También cubre un reproductor que
      // abrió tarde (después de darlo por "no abrió") o que no se pudo cerrar
      // en la vuelta anterior. Si uno abre tan tarde que aparece recién
      // mientras se espera al item siguiente, su URL y su fila no son las de
      // ese item: openGridItem da "notReady" y no sale ningún click al toggle.
      if (playerIsOpen()) {
        const closed = await closeCinema();
        // Tras Detener, closeCinema no llega a clickear: que siga abierto no
        // es un cierre fallido y no se cuenta.
        if (!running) break;
        if (!closed) {
          playerStuck++;
          console.warn(
            `[TikTokRepostRemover] No pude cerrar el reproductor ` +
              `(${playerStuck}/${CONFIG.MAX_PLAYER_STUCK}). url=${location.href}`
          );
          // No se vuelve atrás en el historial: en una página de video
          // cargada directo eso puede sacarte de TikTok o recargar la página
          // y matar el script, y en el modal puede saltar más atrás del
          // perfil. Mejor frenar y avisar.
          if (playerStuck >= CONFIG.MAX_PLAYER_STUCK) return abort("cantClosePlayer");
          continue;
        }
        playerStuck = 0;
      }

      const tab = await ensureRepostTabWithRetries();
      // Tras Detener, ensureRepostTabWithRetries vuelve sin haber perdido
      // la pestaña: no es un "me rindo" ni un noTab, y tiene que terminar
      // como "Detenido".
      if (!running) break;
      if (tab.state !== "active") {
        console.warn(
          `[TikTokRepostRemover] Me rindo: ` +
            (tab.state === "missing"
              ? "la pestaña de reposts no aparece (ni por data-e2e ni por texto)"
              : "no pude reactivar la pestaña de reposts") +
            ` tras ${CONFIG.TAB_RECHECK_ATTEMPTS} intentos. ` +
            `removidos=${removed} rescatados=${rescued} pendientes=${pendingCount()} url=${location.href}`
        );
        // return y no break: el aviso es la explicación real y el bloque
        // de "Detenido" del final lo pisaba siempre. Sin pestaña no se
        // clickeó nada; que exista pero no se active es otro problema
        // (noTab: abrirla a mano suele alcanzar).
        return tab.state === "missing" ? abort("uiChanged", removed) : abort("noTab");
      }
      if (tab.clicked) gridWaitOwed = true;
      const grid = await waitRepostGrid(gridWaitOwed);
      if (!running) break;
      if (grid === "missing") {
        // La pestaña está activa pero su grilla no tiene los hooks
        // conocidos. Sin ellos no hay forma segura de saber qué link es un
        // repost tuyo, así que no se abre ninguno.
        console.warn(
          `[TikTokRepostRemover] Me rindo: pestaña de reposts activa pero sin ` +
            `${SELECTORS.repostGridList} con links en ${SELECTORS.repostGridItem} ` +
            `(espera de hasta ${CONFIG.GRID_READY_TIMEOUT_MS} ms). ` +
            `removidos=${removed} url=${location.href}`
        );
        return abort("uiChanged", removed);
      }
      gridWaitOwed = false;
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
          const sinConfirmar = unverified.length;
          if (pendientes > 0) {
            console.warn(
              "[TikTokRepostRemover] Quedaron sin borrar tras la repesca (IDs):",
              failedQueue
            );
          }
          if (sinConfirmar > 0) {
            console.warn(
              "[TikTokRepostRemover] Sin confirmar (1 click cada uno, revisalos a mano):",
              unverified
            );
          }
          console.log(
            `[TikTokRepostRemover] Pasada terminada. removidos=${removed} rescatados=${rescued} ` +
              `pendientes=${pendientes} sin_confirmar=${sinConfirmar} ya_no_estaban=${alreadyGone}`
          );
          // Los sin confirmar van primero: son los que hay que mirar a mano,
          // y ni "Listo ✔" ni "no encontré reposts" pueden taparlos. Después,
          // 0 eliminados: si no, una corrida en la que fallaron todos
          // terminaba con el mismo "Listo ✔" que una que salió bien.
          if (sinConfirmar > 0) statusMessage = t("doneUnverified", removed, pendientes, sinConfirmar);
          else if (removed === 0) statusMessage = t("doneNoneRemoved", pendientes);
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
      const key = contentKey(linkHref);
      const itemUrl = normalizeUrl(linkHref);
      // Pegado al click de la grilla, sin await en el medio.
      if (!running) break;
      statusMessage = t("opening", removed);
      // Procesado desde ya: ningún camino lo vuelve a abrir mientras tanto.
      // Si Detener lo corta antes del click al toggle, se deshace abajo.
      processedUrls.add(key);
      itemToggleClicks = 0;
      const opened = await openGridItem(link, key);
      const outcome = opened === key ? await removeCurrentRepost(key) : opened;

      switch (outcome) {
        case "verified":
          removed++;
          if (rescuePass > 0) rescued++;
          persist();
          statusMessage = t("removedOk", removed);
          break;
        case "unverified":
          // Salió el click y el tag siguió en su fila. Queda procesado y
          // fuera de la repesca para siempre (toggleClickedKeys), y se
          // reporta para revisarlo a mano.
          unverified.push(itemUrl);
          persist();
          statusMessage = t("unverifiedItem", unverified.length);
          console.warn(
            "[TikTokRepostRemover] Sin confirmar: 1 click y el tag siguió en su fila; no se vuelve a tocar:",
            itemUrl
          );
          break;
        case "alreadyGone":
          alreadyGone++;
          statusMessage = t("alreadyGone", removed);
          console.log("[TikTokRepostRemover] Ya no estaba compartido (su fila no tiene el tag):", itemUrl);
          break;
        case "notReady":
          // El reproductor no mostró este item (no abrió, abrió otro, o su
          // fila no se montó) y no salió ningún click al toggle: es seguro
          // mandarlo a la repesca. Antes un reproductor que no abría dejaba
          // el item procesado para siempre sin contar como pendiente.
          queueFailed(key);
          statusMessage = t("toRescue", pendingCount());
          console.warn(
            "[TikTokRepostRemover] El reproductor no mostró este item a tiempo (sin clicks al toggle):",
            itemUrl,
            `| url=${location.href}`
          );
          break;
        case "alreadyClicked":
          console.warn("[TikTokRepostRemover] Ya recibió un click en esta página, no se vuelve a clickear:", itemUrl);
          break;
        default:
          // "stopped": Detener cortó este item a mitad de camino. No es una
          // baja ni un fallo, así que no suma a removed ni va a la repesca.
          if (itemToggleClicks === 0) {
            // No salió ningún click al toggle: el item quedó como estaba y
            // es seguro volver a intentarlo en la próxima corrida.
            processedUrls.delete(key);
          } else {
            // Ya salió el click y el tag no se vio desaparecer: el repost
            // pudo haberse quitado o no. Queda procesado y nunca se
            // reclickea; se reporta para revisarlo a mano.
            unverified.push(itemUrl);
            persist();
            console.warn(
              "[TikTokRepostRemover] Detenido a mitad de la baja, estado sin verificar:",
              itemUrl
            );
          }
      }

      if (!running) break;
      await randomDelay();
    }

    if (!finished && !running) {
      console.log(
        `[TikTokRepostRemover] Detenido antes de terminar. removidos=${removed} rescatados=${rescued} pendientes=${pendingCount()} sin_verificar=${unverified.length} url=${location.href}`
      );
      statusMessage = t("stopped", removed, unverified.length);
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
        statusMessage = t("stopped", removed, unverified.length);
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
  // que no se pueden deducir desde el código: si la pestaña y la grilla de
  // reposts tienen sus hooks, si el reproductor monta la fila del item de la
  // URL, qué filas tienen los tags de repost y qué botón de cerrar usaría la
  // corrida. La sonda solo lee atributos y texto: nunca hace click, hover ni
  // scroll, ni dispara eventos, así que correrla no puede agregar ni quitar
  // un repost ni mover la página. Tampoco toca el estado de la corrida
  // (contadores, colas, statusMessage).
  // ---------------------------------------------------------------------------
  const PROBE_TEXT_MAX = 80;
  const PROBE_CLASS_MAX = 160;
  const PROBE_URL_MAX = 200;
  const PROBE_LIST_MAX = 20;

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
      // Además de los roles ARIA, otras formas de reconocer una pestaña
      // (data-e2e "-tab", la clase PTabItem de antes): TikTok puede
      // renderizar el tab sin role y entonces un hit sobre el tab de fondo
      // diría inTab:false.
      inTab: !!el.closest(
        '[role="tab"], [role="tablist"], [data-e2e$="-tab"], [class*="PTabItem"]'
      ),
      videoAncestorDepth: probeVideoAncestorDepth(el),
      ancestorDataE2e: e2eAncestor ? e2eAncestor.getAttribute("data-e2e") : null
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
    return {
      probe: "TikTok Repost Remover DOM probe (read-only)",
      at: new Date().toISOString(),
      extensionVersion: probeSafe(() => chrome.runtime.getManifest().version),
      pathname: location.pathname,
      playerOpen: playerIsOpen(),
      documentLang: document.documentElement.lang || null,
      run: { running, finished },
      repostTabActive: probeSafe(isRepostTabActive),

      // La pestaña que usaría el código y por qué camino la encontró:
      // foundBy "data-e2e", o "text" (el fallback, solo si falta el hook).
      // isRepostTabActive() mira únicamente su aria-selected, así que ese es
      // el dato que decide; si falta la pestaña, la corrida termina en
      // uiChanged.
      repostTab: probeSafe(() => {
        const byE2e = queryFirst(SELECTORS.repostTab);
        const tab = byE2e || findRepostTabByText();
        if (!tab) return { exists: false };
        return {
          exists: true,
          foundBy: byE2e ? "data-e2e" : "text",
          tag: tab.tagName.toLowerCase(),
          role: tab.getAttribute("role"),
          text: probeClip((tab.textContent || "").trim(), PROBE_TEXT_MAX),
          ariaSelected: tab.getAttribute("aria-selected")
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

      // La grilla de reposts tal como la ve el código: si está la lista,
      // cuántos items con data-e2e tiene y cuántos links de contenido hay
      // adentro (lista sin links = todavía son esqueletos). hrefs crudos (sin
      // normalizar) para ver si TikTok los renderiza relativos o absolutos.
      // Los links de video fuera de la lista se cuentan aparte: el código
      // nunca los abre. Se cuentan por contención en la lista y no restando
      // los de la grilla, porque si no los links de adentro sin item conocido
      // (justo el caso uiChanged) figurarían como de afuera.
      // unknownLinksInList en true es la grilla con otros hooks, que termina
      // la corrida en uiChanged.
      repostGrid: probeSafe(() => {
        const list = document.querySelector(SELECTORS.repostGridList);
        const links = repostGridLinks();
        const allContentLinks = Array.from(document.querySelectorAll("a[href]")).filter((a) =>
          CONTENT_URL_RE.test(a.getAttribute("href") || "")
        );
        return {
          listExists: !!list,
          items: list ? list.querySelectorAll(SELECTORS.repostGridItem).length : 0,
          links: links.length,
          unknownLinksInList: list ? repostGridHasUnknownLinks(list) : false,
          contentLinksOutsideGrid: allContentLinks.filter((a) => !list || !list.contains(a)).length,
          firstHrefs: links
            .slice(0, 3)
            .map((link) => probeClip(link.getAttribute("href"), PROBE_URL_MAX))
        };
      }),
      nextGridLinkHref: probeSafe(() => {
        const link = getNextVideoLink();
        return link ? probeClip(link.getAttribute("href"), PROBE_URL_MAX) : null;
      }),

      // El reproductor tal como lo usa la baja: su raíz, la fila del ID de la
      // URL (la única donde se lee el estado y se hace el click) con el
      // estado que leería readRepostState, y cada fila montada con sus tags.
      // Las vecinas también pueden tenerlos: por eso nunca se mira la raíz
      // entera. currentRowMatches distinto de 1 deja al código sin fila (no
      // clickea). tagsOutsideRows cuenta los tags que ninguna fila contiene:
      // si hay y no hay filas, TikTok cambió el reproductor.
      cinema: probeSafe(() => {
        const root = getCinemaRoot();
        const urlId = CONTENT_ID_RE.test(location.href) ? contentKey(location.href) : null;
        const current = urlId ? getCurrentRow(urlId) : null;
        const rowSel = `${SELECTORS.cinemaRoot} [${SELECTORS.cinemaRowAttr}]`;
        const rows = Array.from(document.querySelectorAll(rowSel));
        const count = (node, sel) => node.querySelectorAll(sel).length;
        const tagsOutsideRows = Array.from(
          document.querySelectorAll(`${SELECTORS.repostTag}, ${SELECTORS.repostActionTag}`)
        ).filter((el) => !el.closest(`[${SELECTORS.cinemaRowAttr}]`)).length;
        return {
          rootFound: !!root,
          ariaModalCount: document.querySelectorAll(SELECTORS.cinemaRoot).length,
          urlId,
          currentRowFound: !!current,
          currentRowMatches: urlId
            ? rows.filter((row) => row.getAttribute(SELECTORS.cinemaRowAttr) === urlId).length
            : 0,
          repostState: urlId ? readRepostState(urlId) : null,
          rowCount: rows.length,
          rows: rows.slice(0, PROBE_LIST_MAX).map((row) => ({
            id: probeClip(row.getAttribute(SELECTORS.cinemaRowAttr), PROBE_TEXT_MAX),
            current: row === current,
            dataIndex: row.getAttribute("data-index"),
            videos: count(row, "video"),
            repostTag: count(row, SELECTORS.repostTag),
            repostActionTag: count(row, SELECTORS.repostActionTag),
            // Solo para leer en el issue: el código nunca usa este texto.
            repostTagText: probeClip(
              ((row.querySelector(SELECTORS.repostTag) || {}).textContent || "").trim() || null,
              PROBE_TEXT_MAX
            )
          })),
          tagsOutsideRows,
          // El elemento que recibiría el único click en el item actual, y el
          // botón de cerrar que usaría closeCinema.
          currentActionTag: current ? probeDescribe(current.querySelector(SELECTORS.repostActionTag)) : null,
          exitButton: probeDescribe(findCinemaExit())
        };
      }),

      // El fallback de la pestaña por texto (findRepostTabByText, que solo se
      // usa si falta su data-e2e).
      textMatches: probeSafe(() => ({
        repostTabText: probeDescribe(findRepostTabByText())
      })),

      // Todos los diálogos, con cuál es la raíz del reproductor. En los
      // demás, el botón de confirmar que encontraría la baja si ese diálogo
      // apareciera recién después del click (se busca solo adentro de él).
      dialogs: probeSafe(() => {
        const cinema = getCinemaRoot();
        return Array.from(document.querySelectorAll(SELECTORS.dialog))
          .slice(0, PROBE_LIST_MAX)
          .map((el) => ({
            tag: el.tagName.toLowerCase(),
            role: el.getAttribute("role"),
            ariaModal: el.getAttribute("aria-modal"),
            dataE2e: el.getAttribute("data-e2e"),
            cinemaRoot: el === cinema,
            text: probeClip((el.textContent || "").trim(), PROBE_TEXT_MAX),
            confirmButton: el === cinema ? null : probeDescribe(findConfirmIn(el))
          }));
      }),

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
