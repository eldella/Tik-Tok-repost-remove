"use strict";

// TikTok falso para los tests: reproduce el DOM y el comportamiento que se
// observaron EN VIVO el 2026-09-26 (UI en español, "Cinema Mode"). Cada
// detalle sale de ese relevamiento, no de suposiciones, porque la extensión
// ya falló una vez por programarse contra un DOM imaginado. Lo que NO se
// observó (etiquetas en inglés, el diálogo de confirmación, un grid
// renombrado) está marcado como tal y solo existe como opción.
//
// Hechos modelados:
// - Pestañas del perfil: <p role="tab">, con aria-selected en la pestaña
//   misma (ni en ancestros ni por clases). La de reposts es
//   [data-e2e="repost-tab"], texto "Compartidos".
// - Grilla: [data-e2e="user-repost-item-list"] > ... >
//   [data-e2e="user-repost-item"] > ... > <a href> ABSOLUTO a
//   /@creador/video/<id> o /photo/<id>. Al abrir la pestaña muestra
//   esqueletos sin <a> durante un rato (1-8 s en vivo).
// - Un click sintético en un <a> de la grilla abre el reproductor: la URL pasa
//   a /@creador/video/<id> y se monta [aria-modal="true"] con la fila actual
//   y sus vecinas ([data-cinema-mode-snap-row="<id>"], data-index inestable).
// - Si el video está compartido, su fila tiene [data-e2e="repost-tag"] y
//   [data-e2e="repost-action-tag"]; si no, no tiene ninguno. El texto del tag
//   varía ("Lo compartiste", "2 lo compartió") y no sirve de señal.
// - Un click sintético en repost-action-tag alterna el estado en el servidor
//   ~170 ms después, sin diálogo ni aviso: los tags desaparecen (o vuelven).
// - "Next video" ignora clicks sintéticos; ArrowDown y Escape sintéticos no
//   hacen nada. [data-e2e="cinema-mode-exit"] sí cierra con click sintético
//   y la URL vuelve al perfil, con Compartidos todavía seleccionada.
// - Tras cerrar, la grilla sigue mostrando lo ya quitado hasta recargar.
// - Detrás del reproductor queda todo el perfil montado, incluido el botón
//   de compartir perfil (button[data-e2e="share-btn"]), que es el que
//   agarraban los selectores viejos.
//
// Uso:
//   const { loadTikTok, repostItems } = require("./helpers/tiktok-fixture");
//   const h = await loadTikTok({ items: repostItems(5), initialTab: "reposts" });
//   h.tiktok.server.isReposted(id); h.tiktok.toggleClicks(id); h.tiktok.events
// Para simular un F5: const h2 = await h.reload() — pagehide en la página
// vieja, mismo "servidor", mismo storage, misma URL y el reloj falso sigue
// desde donde quedó. No armarlo a mano con close() + loadTikTok(): el reloj
// nuevo volvería a DEFAULT_NOW y el espejo de la corrida quedaría "en el
// futuro" (readInterruptedRun lo descarta).
//
// Límites conocidos (no se observaron en vivo, así que no se inventan):
// - Scroll infinito: carga la tanda siguiente un scrollTo/scroll/scrollBy que
//   llegue al fondo o un scrollIntoView sobre un item de la última fila.
//   Setear scrollTop o scrollingElement a mano no hace nada.
// - Navegación del historial: history.back()/forward() cambian la URL pero
//   no cierran ni abren el reproductor.

const { loadContent } = require("./harness");

const SVG_NS = "http://www.w3.org/2000/svg";
const ID_RE = /\/(video|photo)\/(\d+)/;

const DEFAULTS = {
  user: "me",
  lang: "es",
  // Pestaña seleccionada al cargar el perfil: "videos" (lo normal) o "reposts".
  initialTab: "videos",
  // Esqueletos sin <a> antes de que aparezca la grilla de reposts.
  skeletonMs: 2000,
  // Items que se renderizan por tanda; un scroll al fondo trae la siguiente.
  pageSize: 19,
  loadMoreMs: 1000,
  openDelayMs: 300,
  closeDelayMs: 300,
  // Lo que tardó en vivo el subárbol del tag en desaparecer tras el click.
  toggleDelayMs: 170,
  // Vecinas montadas junto a la fila actual: "both" | "next" | "prev". En vivo
  // hubo 2 filas al abrir el primer item (la actual con data-index 0) y la
  // actual con data-index 1 al abrir el segundo; "both" cumple las dos cosas.
  adjacent: "both",
  // --- Modos de falla (ninguno se observó; sirven para probar defensas) ---
  // Diálogo de confirmación antes de alternar: true o
  // { confirmText, cancelText, ariaModal (true por defecto), delayMs }.
  confirmDialog: false,
  // La UI cambió: no existe [data-e2e="repost-tab"] (ni el texto).
  missingRepostTab: false,
  // La UI cambió a medias: la pestaña sigue diciendo "Compartidos" pero perdió
  // su data-e2e (el caso del fallback por texto).
  repostTabWithoutE2e: false,
  // La UI cambió: la grilla se renderiza con sus <a> pero sin los data-e2e
  // user-repost-item-list / user-repost-item.
  missingGrid: false,
  // Ningún click de la grilla abre el reproductor (por item: neverOpen).
  neverOpen: false,
  // El botón de cerrar no hace nada.
  closeIgnored: false,
  // La pestaña de reposts aparece recién después de este tiempo (en vivo no
  // estaba en el primer render).
  repostTabDelayMs: 0,
  // Un <button>"Eliminar" en el perfil de fondo, para detectar búsquedas de
  // confirmación que no se limitan al diálogo.
  decoyConfirmButton: false
};

// Solo el texto de la pestaña de reposts, "Compartidos", y el de cerrar se
// vieron en vivo en español; las etiquetas en inglés son supuestas.
// "Next video"/"Previous video" están en inglés incluso en la UI en español.
const LABELS = {
  es: {
    tabs: { videos: "Vídeos", drama: "Minidramas", reposts: "Compartidos", favorites: "Favoritos", liked: "Me gusta" },
    inbox: ["Toda la actividad", "Me gusta", "Comentarios", "Menciones y etiquetas", "Seguidores"],
    forYou: "Para ti",
    profile: "Perfil",
    profileShare: "Compartir",
    close: "Cerrar",
    more: "más",
    follow: "Seguir",
    like: "Dar me gusta a un vídeo\n461 me gusta",
    comment: "Leer o añadir comentarios\n12 comentarios",
    favorite: "Añadir a Favoritos\n3 favoritos",
    share: "Compartir un vídeo\n6 veces compartido",
    myRepost: "Lo compartiste",
    othersRepost: "2 lo compartió",
    dialogText: "¿Quitar este video de Compartidos?",
    confirm: "Quitar",
    cancel: "Cancelar",
    decoy: "Eliminar"
  },
  en: {
    tabs: { videos: "Videos", drama: "Minidramas", reposts: "Reposts", favorites: "Favorites", liked: "Liked" },
    inbox: ["All activity", "Likes", "Comments", "Mentions and tags", "Followers"],
    forYou: "For You",
    profile: "Profile",
    profileShare: "Share",
    close: "Close",
    more: "More",
    follow: "Follow",
    like: "Like video\n461 likes",
    comment: "Read or add comments\n12 comments",
    favorite: "Add to Favorites\n3 favorites",
    share: "Share video\n6 shares",
    myRepost: "You reposted",
    othersRepost: "2 reposted",
    dialogText: "Remove this video from Reposts?",
    confirm: "Remove",
    cancel: "Cancel",
    decoy: "Delete"
  }
};

const TAB_DEFS = [
  { key: "videos", e2e: "videos-tab", cls: "PPost" },
  { key: "drama", e2e: "drama-tab", cls: "PDrama" },
  { key: "reposts", e2e: "repost-tab", cls: "PRepost" },
  // Favoritos no tiene data-e2e en vivo.
  { key: "favorites", e2e: null, cls: "PFavorite" },
  { key: "liked", e2e: "liked-tab", cls: "PLike" }
];

// Clases con la misma forma que las de TikTok (css-<hash>-7937d88b--Nombre
// e<hash>): el código real a veces busca por substring de clase, y una
// clase "limpia" haría pasar selectores que en vivo fallan o al revés.
function hash(str) {
  let h = 5381;
  for (const ch of str) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return h.toString(36);
}
const cls = (name) => `css-${hash(name).slice(0, 6)}-7937d88b--${name} e${hash(name + "~").slice(0, 7)}`;

const idOf = (href) => {
  const m = ID_RE.exec(href || "");
  return m ? m[2] : null;
};

function makeEl(document) {
  return function el(tag, attrs, ...children) {
    const node =
      tag === "svg" || tag === "path" ? document.createElementNS(SVG_NS, tag) : document.createElement(tag);
    for (const [key, value] of Object.entries(attrs || {})) {
      if (value == null || value === false) continue;
      node.setAttribute(key, value === true ? "" : String(value));
    }
    for (const child of children.flat()) {
      if (child == null || child === false) continue;
      node.append(typeof child === "string" ? document.createTextNode(child) : child);
    }
    return node;
  };
}

// IDs de 19 dígitos como los reales. Cada cuarto item es una foto: en vivo el
// 4.º de la grilla era un /photo/.
function repostItems(count, { startId = "7689540975353416981" } = {}) {
  const base = BigInt(startId);
  return Array.from({ length: count }, (_, i) => ({
    id: String(base - BigInt(i) * 613784437n),
    creator: `creator_${i + 1}`,
    type: i % 4 === 3 ? "photo" : "video"
  }));
}

function normalizeItem(raw, index, { own, user }) {
  if (!raw || raw.id == null) throw new Error("tiktok-fixture: every item needs an id");
  const id = String(raw.id);
  if (!/^\d+$/.test(id)) throw new Error(`tiktok-fixture: item id must be numeric, got ${id}`);
  return {
    id,
    creator: raw.creator || (own ? user : `creator_${index + 1}`),
    type: raw.type === "photo" ? "photo" : "video",
    own,
    // Estado "en el servidor". Lo único que lo cambia es un toggle aplicado.
    // Un item stale arranca sin compartir salvo que se pida reposted: true.
    reposted: own ? false : raw.stale ? raw.reposted === true : raw.reposted !== false,
    // En la grilla aunque ya no esté compartido (caché vieja, o quitado desde
    // otro dispositivo): al abrirlo no tiene tags.
    stale: !!raw.stale,
    // Texto del tag; por defecto alterna entre el personal y el agregado.
    tagText: raw.tagText || null,
    tagVariant: index % 2 === 0 ? "mine" : "count",
    desc: raw.desc || `video ${index + 1} #fyp`,
    views: raw.views || String((index + 1) * 1234),
    // Modos de falla por item.
    neverFlip: !!raw.neverFlip, // el click al toggle no cambia nada
    neverOpen: !!raw.neverOpen, // el click en la grilla no abre el reproductor
    opensAs: raw.opensAs != null ? String(raw.opensAs) : null, // abre OTRO item (mis-click visto en vivo)
    rowDelayMs: raw.rowDelayMs == null ? 0 : raw.rowDelayMs, // la fila actual se monta tarde (Infinity: nunca)
    toggleDelayMs: raw.toggleDelayMs == null ? null : raw.toggleDelayMs
  };
}

// El "servidor": qué está compartido de verdad y cada click al toggle. Vive
// fuera de la página para sobrevivir a una recarga simulada.
function createServer({ items = [], ownPosts = null, user = DEFAULTS.user } = {}) {
  const reposts = items.map((raw, i) => normalizeItem(raw, i, { own: false, user }));
  const ownRaw =
    ownPosts ||
    [0, 1, 2].map((i) => ({ id: String(7600000000000000001n + BigInt(i)), desc: `mi video ${i + 1}` }));
  const own = ownRaw.map((raw, i) => normalizeItem(raw, i, { own: true, user }));
  const byId = new Map();
  for (const item of [...reposts, ...own]) {
    if (byId.has(item.id)) throw new Error(`tiktok-fixture: duplicate id ${item.id}`);
    byId.set(item.id, item);
  }
  // Un registro por click al repost-action-tag, se aplique o no:
  // { id (fila clickeada), currentId (id de la URL), isTrusted, at }.
  const toggleLog = [];
  return {
    reposts,
    own,
    toggleLog,
    get: (id) => byId.get(String(id)) || null,
    isReposted: (id) => {
      const item = byId.get(String(id));
      return !!(item && item.reposted);
    },
    repostedIds: () => reposts.filter((it) => it.reposted).map((it) => it.id),
    toggleClicks: (id) =>
      id === undefined ? toggleLog.length : toggleLog.filter((e) => e.id === String(id)).length,
    // Lo que muestra la grilla al cargar la página.
    gridSnapshot: () => reposts.filter((it) => it.reposted || it.stale)
  };
}

function createTikTok(window, options = {}) {
  const opts = { ...DEFAULTS, ...options };
  const { document } = window;
  const L = LABELS[opts.lang] || LABELS.es;
  const server = opts.server || createServer({ items: opts.items || [], ownPosts: opts.ownPosts, user: opts.user });
  const el = makeEl(document);
  const profilePath = `/@${opts.user}`;

  const t0 = window.Date.now();
  const events = [];
  const record = (type, detail = {}) => events.push({ type, at: window.Date.now() - t0, ...detail });
  // Siempre el setTimeout de la ventana (el del reloj falso). Infinity = nunca.
  const later = (ms, fn) => (ms === Infinity ? null : window.setTimeout(fn, ms));

  const currentId = () => idOf(window.location.pathname);
  const rowIdOf = (node) => {
    const row = node.closest("[data-cinema-mode-snap-row]");
    return row ? row.getAttribute("data-cinema-mode-snap-row") : null;
  };
  const svgIcon = () => el("svg", { viewBox: "0 0 48 48", width: "1em", height: "1em" }, el("path", { d: "M4 4h40v40H4z" }));

  document.documentElement.lang = opts.lang;
  document.title = `${opts.user} (@${opts.user}) | TikTok`;

  // ---------------------------------------------------------------- perfil
  const onProfile = window.location.pathname.replace(/\/$/, "") === profilePath;

  const nav = el(
    "div",
    { class: cls("DivSideNavContainer") },
    el(
      "nav",
      { class: cls("NavContainer") },
      el("a", { href: "/foryou", "data-e2e": "nav-foryou" }, L.forYou),
      el("a", { href: profilePath, "data-e2e": "nav-profile", "aria-label": L.profile }, L.profile)
    )
  );
  // Las pestañas de la bandeja de entrada también son role="tab" (en vivo las
  // agarraba un selector de pestañas demasiado amplio).
  const inbox = el(
    "div",
    { class: cls("DivInboxContainer"), hidden: true },
    ["all", "likes", "comments", "mentions", "followers"].map((key, i) =>
      el("button", { role: "tab", "data-e2e": key, "aria-selected": i === 0 ? "true" : "false", type: "button" }, L.inbox[i])
    )
  );

  let decoyButton = null;
  const tabNodes = new Map();
  let tabBar = null;
  let contentArea = null;

  if (onProfile) {
    for (const def of TAB_DEFS) {
      if (def.key === "reposts" && opts.missingRepostTab) continue;
      const e2e = def.key === "reposts" && opts.repostTabWithoutE2e ? null : def.e2e;
      tabNodes.set(
        def.key,
        el("p", { role: "tab", "data-e2e": e2e, class: cls(def.cls), "aria-selected": "false", tabindex: "0" }, L.tabs[def.key])
      );
    }
    tabBar = el("div", { class: cls("DivVideoFeedTab") }, Array.from(tabNodes.values()));
    contentArea = el("div", { class: cls("DivVideoFeedContainer") });
    if (opts.decoyConfirmButton) decoyButton = el("button", { type: "button", class: cls("ButtonManage") }, L.decoy);

    const header = el(
      "div",
      { class: cls("DivShareLayoutHeader") },
      el("h1", { "data-e2e": "user-title" }, opts.user),
      el(
        "div",
        { class: `${cls("DivShareTitleContainer")} ${cls("CreatorPageHeaderShareContainer")}` },
        el("button", { "data-e2e": "share-btn", "aria-label": L.profileShare, type: "button" }, svgIcon())
      ),
      decoyButton ? el("div", { class: cls("DivManageMenu") }, decoyButton) : null
    );

    // Anidamiento de las pestañas tal como se vio: DivShareLayoutContentV2 >
    // DivShareLayoutMain > DivFeedTabWrapper > DivVideoFeedTab > p[role=tab].
    const main = el(
      "div",
      { id: "main-content-others_homepage", class: cls("DivMainContainer") },
      el(
        "div",
        { "data-e2e": "user-page", class: cls("DivShareLayoutV2") },
        header,
        el(
          "div",
          { class: cls("DivShareLayoutContentV2") },
          el("div", { class: cls("DivShareLayoutMain") }, el("div", { class: cls("DivFeedTabWrapper") }, tabBar), contentArea)
        )
      )
    );
    document.body.replaceChildren(
      el("div", { id: "app" }, el("div", { class: cls("DivHeaderWrapper") }, inbox), el("div", { class: cls("DivBodyContainer") }, nav, main))
    );
  } else {
    // Fuera del perfil (p. ej. /foryou) alcanza con la navegación: los tests
    // de ahí solo miran que la extensión no arranque.
    document.body.replaceChildren(el("div", { id: "app" }, el("div", { class: cls("DivBodyContainer") }, nav)));
  }

  // ----------------------------------------------------------------- grilla
  let selectedTab = null;
  let postList = null;
  let repostList = null;
  // La caché de la grilla: se arma una sola vez por carga de página y no
  // cambia aunque se quiten reposts (en vivo, hasta recargar).
  let repostSnapshot = null;
  let rendered = 0;
  let gridReady = false;
  let loadingMore = false;
  let gridGeneration = 0;

  function gridItem(item, itemE2e) {
    const href = `https://www.tiktok.com/@${item.creator}/${item.type}/${item.id}`;
    // Profundidad vista en vivo: el <a> está 3 niveles debajo del item con
    // data-e2e, y el item 3 niveles debajo del hijo directo de la lista.
    return el(
      "div",
      {},
      el(
        "div",
        { class: cls("DivWrapper") },
        el(
          "div",
          {},
          el(
            "div",
            { "data-e2e": itemE2e, class: cls("DivContainer") },
            el(
              "div",
              { class: cls("DivItemContainerV2") },
              el(
                "div",
                {},
                el(
                  "a",
                  { href, class: cls("AVideoContainer"), tabindex: "-1" },
                  el("div", { class: cls("DivPlayerContainer") }, el("img", { alt: item.desc })),
                  el("strong", { class: cls("StrongVideoCount") }, item.views)
                )
              )
            )
          )
        )
      )
    );
  }

  function renderContent(key) {
    gridGeneration++;
    const gen = gridGeneration;
    contentArea.replaceChildren();
    postList = null;
    repostList = null;
    gridReady = false;
    loadingMore = false;

    if (key === "videos") {
      postList = el(
        "div",
        { "data-e2e": "user-post-item-list", class: cls("DivVideoFeedV2") },
        server.own.map((item) => gridItem(item, "user-post-item"))
      );
      contentArea.append(postList);
      return;
    }
    if (key !== "reposts") {
      contentArea.append(el("div", { class: cls("DivVideoFeedV2") }));
      return;
    }

    const firstRender = repostSnapshot === null;
    if (firstRender) {
      repostSnapshot = server.gridSnapshot();
      rendered = Math.min(opts.pageSize, repostSnapshot.length);
    }
    const itemE2e = opts.missingGrid ? null : "user-repost-item";
    repostList = el("div", { "data-e2e": opts.missingGrid ? null : "user-repost-item-list", class: cls("DivVideoFeedV2") });
    contentArea.append(repostList);

    const populate = () => {
      if (gen !== gridGeneration) return;
      repostList.replaceChildren(...repostSnapshot.slice(0, rendered).map((item) => gridItem(item, itemE2e)));
      gridReady = true;
      record("grid-populated", { count: rendered });
    };
    if (!firstRender) {
      // Volver a la pestaña muestra la caché enseguida.
      populate();
      return;
    }
    // Esqueletos: hijos <div> sin <a> ni data-e2e.
    const skeletons = Math.min(16, Math.max(3, rendered));
    repostList.append(...Array.from({ length: skeletons }, () => el("div", {}, el("div", { class: cls("DivPlaceholderItem") }))));
    later(opts.skeletonMs, populate);
  }

  function selectTab(key) {
    if (selectedTab === key) return;
    selectedTab = key;
    for (const [k, node] of tabNodes) node.setAttribute("aria-selected", k === key ? "true" : "false");
    renderContent(key);
  }

  // jsdom no hace layout: el alto de la página sale de lo renderizado, así un
  // scrollTo al fondo (top = scrollHeight) dispara la carga de la tanda
  // siguiente y un scrollTo(0) no.
  const pageHeight = () => {
    const count = repostList ? rendered : server.own.length;
    return 600 + Math.ceil(Math.max(count, 1) / 4) * 420;
  };
  Object.defineProperty(document.body, "scrollHeight", { configurable: true, get: pageHeight });
  Object.defineProperty(document.documentElement, "scrollHeight", { configurable: true, get: pageHeight });

  function loadMore() {
    if (!repostList || !gridReady || loadingMore || rendered >= repostSnapshot.length) return;
    loadingMore = true;
    const gen = gridGeneration;
    later(opts.loadMoreMs, () => {
      loadingMore = false;
      if (gen !== gridGeneration) return;
      const next = repostSnapshot.slice(rendered, rendered + opts.pageSize);
      rendered += next.length;
      repostList.append(...next.map((item) => gridItem(item, opts.missingGrid ? null : "user-repost-item")));
      record("load-more", { count: next.length, rendered });
    });
  }

  // En vivo carga más cualquier scroll que llegue al fondo, no una API en
  // particular: se lleva la posición a mano para que scrollBy también cuente.
  let scrollTop = 0;
  const topOf = (a, b) => (a && typeof a === "object" ? Number(a.top) || 0 : Number(b) || 0);
  const scrolledTo = (top, via) => {
    scrollTop = Math.max(0, top);
    record("scroll", { top: scrollTop, via });
    if (scrollTop >= pageHeight() - window.innerHeight) loadMore();
  };
  const baseScrollTo = window.scrollTo;
  const scrollTo = function scrollTo(a, b) {
    baseScrollTo.call(window, a, b);
    scrolledTo(topOf(a, b), "scrollTo");
  };
  window.scrollTo = scrollTo;
  window.scroll = scrollTo;
  window.scrollBy = function scrollBy(a, b) {
    scrolledTo(scrollTop + topOf(a, b), "scrollBy");
  };
  // Llevar a la vista un item de la última fila (4 columnas) deja el fondo de
  // la grilla en pantalla, que es lo que dispara la carga en vivo.
  const baseScrollIntoView = window.Element.prototype.scrollIntoView;
  window.Element.prototype.scrollIntoView = function scrollIntoView(...args) {
    baseScrollIntoView.apply(this, args);
    if (!repostList || !repostList.contains(this)) return;
    const cells = Array.from(repostList.children);
    const index = cells.findIndex((cell) => cell.contains(this));
    if (index < 0 || index < cells.length - 4) return;
    record("scroll", { index, via: "scrollIntoView" });
    loadMore();
  };

  // ------------------------------------------------------------ reproductor
  let player = null;
  let dialog = null;

  function renderTags(container, item) {
    if (!item.reposted) {
      container.replaceChildren();
      return;
    }
    const text = item.tagText || (item.tagVariant === "mine" ? L.myRepost : L.othersRepost);
    // Cadena vista en vivo: repost-tag > div > DivPriorityTagsContainer, y
    // repost-action-tag > TUXTooltip-reference > DivPriorityTagsContainer.
    // Ninguno es <button> ni tiene role/aria; solo cursor:pointer.
    container.replaceChildren(
      el(
        "div",
        {},
        el(
          "div",
          { "data-e2e": "repost-tag", class: cls("TagChipContainer") },
          el("div", { class: cls("DivRepostAvatarListContainer") }, el("img", { alt: "" })),
          el("p", { class: "TUXText TUXText--tiktok-sans" }, text)
        )
      ),
      el("div", { class: "TUXTooltip-reference" }, el("div", { "data-e2e": "repost-action-tag", class: cls("TagChipContainer") }, svgIcon()))
    );
  }

  const tagsContainerOf = (row) => row.querySelector('[class*="DivPriorityTagsContainer"]');

  function buildRow(item, position) {
    const media =
      item.type === "photo"
        ? el("div", { class: cls("DivPhotoSwiper") }, el("img", { alt: item.desc }), el("img", { alt: item.desc }))
        : el(
            "div",
            { class: cls("DivVideoContainer") },
            el("video", { src: `blob:https://www.tiktok.com/${hash(item.id)}-0000-4000-8000-${item.id.slice(-12)}`, playsinline: true, loop: true })
          );
    const tags = el("div", { class: cls("DivPriorityTagsContainer") });
    renderTags(tags, item);
    // 11 niveles entre repost-tag y la fila, como en vivo. Ningún <a> de la
    // fila lleva el id del video: el único enlace fila-id es el atributo.
    return el(
      "div",
      { class: "css-wgopqr", "data-cinema-mode-snap-row": item.id, "data-index": String(position) },
      el(
        "div",
        { class: cls("DivItemWrapper") },
        el(
          "div",
          { class: cls("DivPlayerSection") },
          el(
            "div",
            { class: cls("DivMediaCard") },
            media,
            el(
              "div",
              { class: cls("DivMediaCardBottom") },
              el(
                "div",
                { class: cls("DivVideoInfoOverlay") },
                el(
                  "div",
                  { class: cls("DivBottomVideoInfoRoot") },
                  el(
                    "div",
                    { class: cls("DivBottomVideoInfoContent") },
                    el(
                      "div",
                      { "data-e2e": "cinema-creator-identity" },
                      el("a", { "data-e2e": "cinema-creator-avatar", href: `/@${item.creator}` }, el("span", { "data-e2e": "video-author-avatar" }, item.creator)),
                      el("button", { "data-e2e": "cinema-video-info-follow", type: "button" }, L.follow)
                    ),
                    el("div", { class: cls("DivOverlayBottomLeadingTagsContainer") }, tags),
                    el("div", { "data-e2e": "video-desc" }, item.desc.replace(/#\w+/g, "").trim() + " ", el("a", { href: "/tag/fyp" }, "#fyp"))
                  )
                )
              )
            )
          )
        )
      )
    );
  }

  function mountPlayerShell() {
    const swiper = el("div", { class: cls("DivCinemaModeSwiper") });
    // Una sola barra de acciones y una sola navegación para todo el
    // reproductor, sobre el video actual.
    const root = el(
      "div",
      { role: "dialog", "aria-modal": "true" },
      el(
        "div",
        { class: cls("DivCinemaModeRoot") },
        el(
          "div",
          { class: cls("DivCinemaModeHeader") },
          el("button", { "data-e2e": "cinema-mode-exit", "aria-label": L.close, type: "button" }, svgIcon())
        ),
        swiper,
        el(
          "section",
          { class: cls("SectionActionBarContainer") },
          el("div", { role: "button", "data-e2e": "like-icon", "aria-pressed": "false", "aria-label": L.like }, svgIcon()),
          el("div", { role: "button", "data-e2e": "comment-icon", "aria-label": L.comment }, svgIcon()),
          el("div", { role: "button", "data-e2e": "favorite-icon", "aria-pressed": "false", "aria-label": L.favorite }, svgIcon()),
          el("div", { role: "button", "data-e2e": "share-icon", "aria-label": L.share }, svgIcon()),
          el("button", { "data-e2e": "cinema-more-menu-trigger", "aria-label": L.more, type: "button" }, svgIcon())
        ),
        el(
          "div",
          { class: cls("DivCinemaModeNav") },
          el("button", { "aria-label": "Previous video", type: "button" }, svgIcon()),
          el("button", { "aria-label": "Next video", type: "button" }, svgIcon())
        )
      )
    );
    document.body.append(root);
    player = { root, swiper, rows: new Map(), queue: [], index: 0, generation: 0 };
  }

  function neighbours(queue, index) {
    const out = [];
    const wantPrev = opts.adjacent === "both" || opts.adjacent === "prev";
    const wantNext = opts.adjacent === "both" || opts.adjacent === "next";
    if (wantPrev && index > 0) out.push(queue[index - 1]);
    out.push(queue[index]);
    if (wantNext && index < queue.length - 1) out.push(queue[index + 1]);
    // Siempre al menos una vecina si la hay, aunque sea del otro lado.
    if (out.length === 1 && queue.length > 1) {
      if (index < queue.length - 1) out.push(queue[index + 1]);
      else out.unshift(queue[index - 1]);
    }
    return out;
  }

  function showItem(queue, id) {
    const item = server.get(id);
    if (!item) return;
    let index = queue.findIndex((it) => it.id === item.id);
    if (index < 0) {
      queue = [item];
      index = 0;
    }
    window.history.pushState({}, "", `/@${item.creator}/${item.type}/${item.id}`);
    if (!player) mountPlayerShell();
    player.generation++;
    const gen = player.generation;
    player.queue = queue;
    player.index = index;
    player.rows.clear();
    player.swiper.replaceChildren();

    const windowItems = neighbours(queue, index);
    const rows = windowItems.map((it, position) => {
      const row = buildRow(it, position);
      player.rows.set(it.id, row);
      return row;
    });
    windowItems.forEach((it, position) => {
      if (it.id === item.id && item.rowDelayMs > 0) return;
      player.swiper.append(rows[position]);
    });
    record("open", { id: item.id, rows: windowItems.map((it) => it.id) });

    if (item.rowDelayMs > 0) {
      const position = windowItems.indexOf(item);
      later(item.rowDelayMs, () => {
        if (!player || player.generation !== gen) return;
        const after = rows[position + 1];
        player.swiper.insertBefore(rows[position], after && after.isConnected ? after : null);
        record("row-mounted", { id: item.id });
      });
    }
  }

  function openFromGrid(anchor) {
    const id = idOf(anchor.getAttribute("href"));
    const inReposts = !!repostList && repostList.contains(anchor);
    const queue = inReposts ? repostSnapshot : server.own;
    const item = id && server.get(id);
    record("grid-click", { id, playerOpen: !!player });
    if (!item) return;
    if (opts.neverOpen || item.neverOpen) {
      record("open-ignored", { id });
      return;
    }
    const targetId = item.opensAs || item.id;
    later(opts.openDelayMs, () => showItem(queue, targetId));
  }

  function closeDialog() {
    if (!dialog) return;
    dialog.root.remove();
    dialog = null;
  }

  function closePlayer() {
    if (!player) return;
    if (opts.closeIgnored) {
      record("close-ignored");
      return;
    }
    record("close-click");
    const gen = player.generation;
    later(opts.closeDelayMs, () => {
      if (!player || player.generation !== gen) return;
      player.root.remove();
      player = null;
      closeDialog();
      window.history.pushState({}, "", profilePath);
      record("closed");
    });
  }

  function applyToggleLater(item) {
    if (item.neverFlip) {
      record("toggle-no-effect", { id: item.id });
      return;
    }
    const delay = item.toggleDelayMs == null ? opts.toggleDelayMs : item.toggleDelayMs;
    later(delay, () => {
      item.reposted = !item.reposted;
      const row = player && player.rows.get(item.id);
      if (row) renderTags(tagsContainerOf(row), item);
      record("toggle-applied", { id: item.id, reposted: item.reposted });
    });
  }

  function showDialog(item) {
    const conf = typeof opts.confirmDialog === "object" && opts.confirmDialog ? opts.confirmDialog : {};
    later(conf.delayMs == null ? 150 : conf.delayMs, () => {
      closeDialog();
      const confirm = el("button", { type: "button", class: cls("ButtonConfirm") }, conf.confirmText || L.confirm);
      const cancel = el("button", { type: "button", class: cls("ButtonCancel") }, conf.cancelText || L.cancel);
      const root = el(
        "div",
        { role: "dialog", "aria-modal": conf.ariaModal === false ? null : "true", class: `TUXModal ${cls("DivModalContainer")}` },
        el("p", {}, L.dialogText),
        el("div", { class: cls("DivButtonRow") }, cancel, confirm)
      );
      document.body.append(root);
      dialog = { root, confirm, cancel, item };
      record("dialog-shown", { id: item.id });
    });
  }

  function onToggle(node, event) {
    const id = rowIdOf(node);
    const entry = { id, currentId: currentId(), isTrusted: event.isTrusted, dialogOpen: !!dialog, at: window.Date.now() - t0 };
    server.toggleLog.push(entry);
    record("toggle-click", { id, currentId: entry.currentId });
    const item = id && server.get(id);
    if (!item) return;
    if (opts.confirmDialog) showDialog(item);
    else applyToggleLater(item);
  }

  // React delega los clicks en la raíz: acá, en document. Un click sobre un
  // nodo ya desmontado no llega, igual que en TikTok.
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!target || typeof target.closest !== "function") return;
    const hit = (sel) => target.closest(sel);
    let node;

    if (dialog && dialog.root.contains(target)) {
      const btn = hit("button");
      if (btn === dialog.confirm) {
        const { item } = dialog;
        closeDialog();
        record("dialog-confirm", { id: item.id });
        applyToggleLater(item);
      } else if (btn === dialog.cancel) {
        const { item } = dialog;
        closeDialog();
        record("dialog-cancel", { id: item.id });
      }
      return;
    }
    // Un click sintético fuera del diálogo igual llega a su nodo:
    // dispatchEvent no pasa por la capa que tapa la página, y en vivo no se
    // sabe qué haría TikTok con él. Se procesa, pero queda marcado para que
    // un test pueda exigir que la extensión no toque nada mientras tanto.
    if (dialog) record("click-outside-dialog", { e2e: (hit("[data-e2e]") || target).getAttribute("data-e2e") });
    if ((node = hit('[data-e2e="repost-action-tag"]'))) return onToggle(node, event);
    if ((node = hit('[data-e2e="repost-tag"]'))) return record("repost-tag-click", { id: rowIdOf(node) });
    if (hit('[data-e2e="cinema-mode-exit"]')) return closePlayer();
    // Solo un click real navega (en vivo, y con ~2 s de retraso en la URL).
    // jsdom no puede generar clicks confiables, así que acá nunca navega.
    if (hit('button[aria-label="Next video"]')) return record("next-ignored", { isTrusted: event.isTrusted });
    if (hit('button[aria-label="Previous video"]')) return record("prev-ignored", { isTrusted: event.isTrusted });
    if (hit('[data-e2e="share-icon"]')) return record("share-icon-click");
    if (hit('[data-e2e="cinema-more-menu-trigger"]')) return record("more-menu-click");
    if (hit('[data-e2e="share-btn"]')) return record("profile-share-click");
    if ((node = hit('[data-e2e="like-icon"], [data-e2e="comment-icon"], [data-e2e="favorite-icon"], [data-e2e="cinema-video-info-follow"]'))) {
      return record("forbidden-click", { e2e: node.getAttribute("data-e2e") });
    }
    if (decoyButton && hit("button") === decoyButton) return record("decoy-confirm-click");
    if (tabBar && (node = hit('p[role="tab"]')) && tabBar.contains(node)) {
      const key = Array.from(tabNodes).find(([, n]) => n === node)[0];
      record("tab-click", { tab: key });
      return selectTab(key);
    }
    const anchor = hit("a[href]");
    if (anchor) {
      // El router de TikTok navega sin recargar; sin esto jsdom intentaría una
      // navegación real (que no implementa).
      event.preventDefault();
      if ((repostList && repostList.contains(anchor)) || (postList && postList.contains(anchor))) {
        return openFromGrid(anchor);
      }
      return record("link-click", { href: anchor.getAttribute("href") });
    }
    return undefined;
  });

  // Teclas sintéticas: TikTok no reacciona a ninguna (ni ArrowDown ni Escape).
  document.addEventListener("keydown", (event) => record("key-ignored", { key: event.key, isTrusted: event.isTrusted }), true);

  // ------------------------------------------------------------ arranque
  if (onProfile) {
    const repostTab = tabNodes.get("reposts");
    if (repostTab && opts.repostTabDelayMs > 0) {
      const after = repostTab.nextSibling;
      repostTab.remove();
      later(opts.repostTabDelayMs, () => tabBar.insertBefore(repostTab, after && after.isConnected ? after : null));
    }
    const initial = opts.initialTab === "reposts" && repostTab ? "reposts" : "videos";
    selectTab(initial);
  }

  return {
    server,
    events,
    profilePath,
    options: opts,
    eventsOf: (type) => events.filter((e) => e.type === type),
    toggleClicks: (id) => server.toggleClicks(id),
    isPlayerOpen: () => !!player && player.root.isConnected,
    currentId,
    rowIds: () =>
      player
        ? Array.from(player.swiper.querySelectorAll("[data-cinema-mode-snap-row]")).map((r) => r.getAttribute("data-cinema-mode-snap-row"))
        : [],
    selectedTab: () => selectedTab,
    gridIds: () => (repostList ? Array.from(repostList.querySelectorAll("a[href]")).map((a) => idOf(a.getAttribute("href"))) : []),
    dialogOpen: () => !!dialog
  };
}

// loadContent() con el TikTok falso armado antes de que corra content.js.
// Acepta las opciones de loadContent (url, storage, now, echo, contentPath)
// y las de la página (DEFAULTS, más items / ownPosts / server).
async function loadTikTok(options = {}) {
  const { url, storage, now, echo, contentPath, allowJsdomErrors, ...pageOptions } = options;
  const user = pageOptions.user || DEFAULTS.user;
  const lang = pageOptions.lang || DEFAULTS.lang;
  const server = pageOptions.server || createServer({ items: pageOptions.items || [], ownPosts: pageOptions.ownPosts, user });
  const h = await loadContent({
    url: url || `https://www.tiktok.com/@${user}`,
    html: `<!DOCTYPE html><html lang="${lang}"><head><title>TikTok</title></head><body></body></html>`,
    storage,
    now,
    echo,
    contentPath,
    allowJsdomErrors,
    beforeLoad: ({ window }) => createTikTok(window, { ...pageOptions, server })
  });
  h.tiktok = h.fixture;

  // F5 simulado. Cierra esta página (close() dispara pagehide, donde
  // content.js manda el espejo pendiente) y carga otra sobre el mismo
  // servidor y el mismo storage, en la URL donde estaba (si el reproductor
  // estaba abierto, la de un video, como en Chrome). El reloj nuevo arranca
  // gapMs después del viejo: si volviera a DEFAULT_NOW, el espejo guardado
  // quedaría en el futuro y readInterruptedRun lo ignoraría. overrides
  // cambia cualquier opción de la carga nueva (p. ej. initialTab, url).
  h.reload = (overrides = {}, { gapMs = 1000 } = {}) => {
    const currentUrl = h.window.location.href;
    const nextNow = h.clock.now + gapMs;
    h.close();
    return loadTikTok({ ...options, server, url: currentUrl, storage: h.storage, now: nextNow, ...overrides });
  };
  return h;
}

module.exports = {
  loadTikTok,
  createTikTok,
  createServer,
  repostItems,
  LABELS,
  DEFAULTS
};
