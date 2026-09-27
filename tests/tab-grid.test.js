"use strict";

// T9: la pestaña de reposts y su grilla, contra el TikTok falso armado con lo
// observado en vivo (UI en español: la pestaña dice "Compartidos", el
// aria-selected está en la pestaña misma y la grilla muestra esqueletos un
// rato antes de tener links).
//
// Estos tests no miran cómo se quita un repost (eso es T8): solo qué pestaña
// se activa, cuándo se da la grilla por lista, qué links se abren y cuándo
// la corrida frena sin tocar nada. Donde hace falta que la corrida avance,
// se la detiene apenas abre el primer item de la grilla.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadTikTok, repostItems } = require("./helpers/tiktok-fixture");

const UI_CHANGED = {
  es:
    "TikTok cambió su página: no reconozco la pestaña Compartidos o su grilla. " +
    "No toqué ningún repost. Si todavía tenés reposts, por favor reportalo abriendo un issue.",
  en:
    "TikTok changed its page: I can't recognize the Reposts tab or its grid. " +
    "No repost was touched. If you still have reposts, please report it by opening an issue."
};
const NO_TAB_ES =
  'No pude abrir la pestaña "Compartidos". Abrila manualmente en tu perfil y tocá Iniciar de nuevo.';
const NONE_FOUND_ES =
  "No encontré reposts para quitar. " +
  "Para volver a revisar todo, recargá la página (F5) antes de iniciar de nuevo.";
const STOPPED_ES = "Detenido. 0 reposts eliminados hasta ahora.";
const STARTING_ES = "Iniciando…";

async function profile(t, options = {}) {
  const h = await loadTikTok({ items: repostItems(3), ...options });
  t.after(() => h.close());
  return h;
}

const $ = (h, sel) => h.document.querySelector(sel);
const $$ = (h, sel) => Array.from(h.document.querySelectorAll(sel));
const probe = async (h) => (await h.send({ action: "PROBE" })).report;
const start = (h, extra = {}) => h.send({ action: "START", speed: "turbo", ...extra });

// Todo click que llega al documento. Los de la extensión son sintéticos y
// burbujean desde su objetivo, así que con la fase de captura no se escapa
// ninguno, ni siquiera los que el TikTok falso no registra (p. ej. una
// pestaña de la bandeja de entrada).
function recordClicks(h) {
  const clicks = [];
  h.document.addEventListener(
    "click",
    (event) => {
      const el = event.target;
      clicks.push(
        el.getAttribute("data-e2e") ||
          (el.closest("a[href]") && el.closest("a[href]").getAttribute("href")) ||
          el.tagName.toLowerCase()
      );
    },
    true
  );
  return clicks;
}

// Primer item de la grilla que abrió la extensión.
const firstGridClick = (h, timeoutMs = 60000) =>
  h.until(() => h.tiktok.eventsOf("grid-click")[0], { timeoutMs });

async function stopRun(h) {
  await h.send({ action: "STOP" });
  return h.waitForRunEnd({ timeoutMs: 60000 });
}

// Links de video que NO son de la grilla de reposts, donde TikTok los pone:
// la navegación lateral, un módulo de sugeridos dentro del contenido
// principal, un item con la misma clase que los de la grilla
// (DivItemContainerV2) pero fuera de ella, y uno suelto al lado de la lista.
// El fallback genérico de antes agarraba cualquiera de los dos del medio.
const FOREIGN_IDS = ["7111111111111111111", "7222222222222222222", "7333333333333333333", "7444444444444444444"];
function addForeignLinks(h) {
  const doc = h.document;
  const link = (id) => {
    const a = doc.createElement("a");
    a.setAttribute("href", `https://www.tiktok.com/@someone_else/video/${id}`);
    a.textContent = "sugerido";
    return a;
  };
  const wrap = (attrs, child) => {
    const div = doc.createElement("div");
    for (const [key, value] of Object.entries(attrs)) div.setAttribute(key, value);
    div.append(child);
    return div;
  };
  $(h, '[data-e2e="nav-foryou"]').parentElement.append(link(FOREIGN_IDS[0]));
  const main = doc.getElementById("main-content-others_homepage");
  main.append(wrap({ "data-e2e": "recommend-list" }, link(FOREIGN_IDS[1])));
  main.append(wrap({ class: "css-abc123-7937d88b--DivItemContainerV2 e1abc23" }, link(FOREIGN_IDS[2])));
  $(h, '[data-e2e="user-repost-item-list"]').parentElement.append(wrap({}, link(FOREIGN_IDS[3])));
}

test("START from the Videos tab clicks the Compartidos tab by its data-e2e and opens the first grid item", async (t) => {
  const h = await profile(t, { initialTab: "videos" });
  const ids = h.tiktok.server.reposts.map((it) => it.id);

  const before = await probe(h);
  assert.equal(before.repostTabActive, false);
  assert.deepEqual(before.repostTab, {
    exists: true,
    foundBy: "data-e2e",
    tag: "p",
    role: "tab",
    text: "Compartidos",
    ariaSelected: "false"
  });

  await start(h);
  const click = await firstGridClick(h);
  const tabClicks = h.tiktok.eventsOf("tab-click");
  assert.deepEqual(tabClicks.map((e) => e.tab), ["reposts"]);
  assert.equal(h.tiktok.selectedTab(), "reposts");
  assert.equal(click.id, ids[0]);
  // Recién cuando la grilla dejó de ser esqueletos, no antes.
  assert.ok(click.at >= tabClicks[0].at + h.tiktok.options.skeletonMs);
  assert.equal((await probe(h)).repostTabActive, true);

  const end = await stopRun(h);
  assert.equal(end.message, STOPPED_ES);
});

for (const lang of ["es", "en"]) {
  test(`without its data-e2e, the tab is found by its text (${lang}) and activated`, async (t) => {
    // Solo "Compartidos" se vio en vivo; "Reposts" (inglés) es supuesto.
    const h = await profile(t, { initialTab: "videos", repostTabWithoutE2e: true, lang });
    const label = lang === "es" ? "Compartidos" : "Reposts";

    const before = await probe(h);
    assert.equal(before.repostTabActive, false);
    assert.equal(before.repostTab.foundBy, "text");
    assert.equal(before.repostTab.text, label);

    await start(h);
    const click = await firstGridClick(h);
    assert.deepEqual(h.tiktok.eventsOf("tab-click").map((e) => e.tab), ["reposts"]);
    assert.equal(click.id, h.tiktok.server.reposts[0].id);
    assert.equal((await probe(h)).repostTabActive, true);
    await stopRun(h);
  });
}

test("a tab that shows up late (not in the first render) is still found and activated", async (t) => {
  const h = await profile(t, { initialTab: "videos", repostTabDelayMs: 3000 });
  assert.equal($(h, '[data-e2e="repost-tab"]'), null);

  await start(h);
  const click = await firstGridClick(h);
  const tabClicks = h.tiktok.eventsOf("tab-click");
  assert.deepEqual(tabClicks.map((e) => e.tab), ["reposts"]);
  assert.ok(tabClicks[0].at >= 3000);
  assert.equal(click.id, h.tiktok.server.reposts[0].id);
  await stopRun(h);
});

for (const initialTab of ["reposts", "videos"]) {
  test(`an 8 s skeleton (as seen live) is waited out without scrolling or ending the run (starting on ${initialTab})`, async (t) => {
    const h = await profile(t, { initialTab, skeletonMs: 8000 });

    await start(h);
    await h.advance(7000);
    const during = await h.status();
    assert.equal(during.running, true);
    assert.equal(during.message, STARTING_ES);
    assert.deepEqual(h.tiktok.eventsOf("grid-click"), []);

    const click = await firstGridClick(h);
    const tabClicks = h.tiktok.eventsOf("tab-click");
    // Con la pestaña ya activa no se la vuelve a clickear.
    assert.deepEqual(tabClicks.map((e) => e.tab), initialTab === "videos" ? ["reposts"] : []);
    const skeletonFrom = tabClicks.length > 0 ? tabClicks[0].at : 0;
    assert.ok(click.at >= skeletonFrom + 8000);
    // La espera fue la de los esqueletos, no el camino de "no hay más: scroll".
    assert.deepEqual(h.tiktok.eventsOf("scroll").filter((e) => e.at < click.at), []);
    assert.equal(click.id, h.tiktok.server.reposts[0].id);
    await stopRun(h);
  });
}

test("Stop during the skeleton wait ends as Stopped without opening anything", async (t) => {
  const h = await profile(t, { initialTab: "reposts", skeletonMs: 8000 });
  await start(h);
  await h.advance(3000);

  const stoppedAt = h.clock.now;
  const end = await stopRun(h);
  assert.equal(end.message, STOPPED_ES);
  assert.ok(h.clock.now - stoppedAt <= 1000, "the grid wait notices Stop right away");
  await h.advance(10000);
  assert.deepEqual(h.tiktok.eventsOf("grid-click"), []);
});

// Con items: [] el TikTok falso dibuja la pestaña y la lista vacía. Es un
// supuesto: no se vio en vivo un perfil sin reposts, y TikTok podría no
// mostrar ni la pestaña (entonces la corrida termina en uiChanged).
test("an empty reposts grid ends with 'no reposts found' and never opens a link outside the grid", async (t) => {
  const h = await profile(t, { items: [], initialTab: "reposts" });
  await h.advance(h.tiktok.options.skeletonMs);
  addForeignLinks(h);
  const clicks = recordClicks(h);

  const report = await probe(h);
  assert.equal(report.repostGrid.listExists, true);
  assert.equal(report.repostGrid.links, 0);
  assert.equal(report.repostGrid.unknownLinksInList, false);
  assert.equal(report.repostGrid.contentLinksOutsideGrid, FOREIGN_IDS.length);
  assert.equal(report.nextGridLinkHref, null);

  await start(h);
  const end = await h.waitForRunEnd({ timeoutMs: 120000 });
  assert.equal(end.message, NONE_FOUND_ES);
  assert.equal(end.finished, true);
  assert.deepEqual(clicks, []);
  assert.deepEqual(h.tiktok.eventsOf("link-click"), []);
  assert.deepEqual(h.tiktok.eventsOf("open"), []);
  assert.equal(h.tiktok.toggleClicks(), 0);
});

// Guarda de regresión: el código de antes de T9 también lo pasaba (con la
// grilla específica ya procesada devolvía null). El que prueba que se fue el
// fallback genérico es el de la grilla vacía.
test("once every grid item is processed, the run scrolls and ends instead of opening links outside the grid", async (t) => {
  const h = await profile(t, { items: repostItems(2), initialTab: "reposts" });
  await h.advance(h.tiktok.options.skeletonMs);
  addForeignLinks(h);
  const gridIds = h.tiktok.server.reposts.map((it) => it.id);

  await start(h);
  await h.waitForRunEnd({ timeoutMs: 600000 });

  assert.deepEqual(h.tiktok.eventsOf("link-click"), []);
  const opened = h.tiktok.eventsOf("grid-click").map((e) => e.id);
  assert.ok(opened.length >= gridIds.length);
  for (const id of opened) assert.ok(gridIds.includes(id), `opened ${id}, which is not in the reposts grid`);
  for (const e of h.tiktok.eventsOf("open")) assert.ok(gridIds.includes(e.id));
});

test("a photo post in the reposts grid is picked and opened like a video", async (t) => {
  // En vivo la grilla tenía un /photo/ entre los videos; acá va primero.
  const photo = { id: "7300000000000000001", creator: "photo_creator", type: "photo" };
  const h = await profile(t, { items: [photo, ...repostItems(2)], initialTab: "reposts" });
  await h.advance(h.tiktok.options.skeletonMs);
  assert.match(
    $(h, '[data-e2e="user-repost-item"] a[href]').getAttribute("href"),
    /\/photo\/7300000000000000001$/
  );

  await start(h);
  const click = await firstGridClick(h);
  assert.equal(click.id, photo.id);
  await stopRun(h);
});

test("aria-selected on an ancestor, or an 'inactive' class, does not make the Reposts tab active", async (t) => {
  const h = await profile(t, { initialTab: "videos" });
  const tab = $(h, '[data-e2e="repost-tab"]');
  // La heurística vieja subía 4 niveles y aceptaba cualquiera de estas dos.
  tab.parentElement.classList.add("tab-inactive");
  tab.parentElement.parentElement.setAttribute("aria-selected", "true");
  const ownIds = h.tiktok.server.own.map((it) => it.id);
  // La grilla de Vídeos es la que está a la vista, con items DivItemContainerV2.
  assert.ok($(h, '[data-e2e="user-post-item-list"] [class*="DivItemContainer"] a[href*="/video/"]'));

  assert.equal((await probe(h)).repostTabActive, false);

  await start(h);
  const click = await firstGridClick(h);
  assert.deepEqual(h.tiktok.eventsOf("tab-click").map((e) => e.tab), ["reposts"]);
  assert.equal(click.id, h.tiktok.server.reposts[0].id);
  for (const e of h.tiktok.eventsOf("grid-click")) assert.ok(!ownIds.includes(e.id));
  await stopRun(h);
});

for (const lang of ["es", "en"]) {
  test(`a missing Reposts tab ends with uiChanged (${lang}) and zero clicks`, async (t) => {
    const h = await profile(t, { initialTab: "videos", missingRepostTab: true, lang });
    const clicks = recordClicks(h);

    await start(h, { lang });
    const startedAt = h.clock.now;
    const end = await h.waitForRunEnd({ timeoutMs: 60000 });
    assert.equal(end.message, UI_CHANGED[lang]);
    assert.equal(end.finished, false);
    assert.equal(end.removed, 0);
    // Antes de rendirse le da tiempo a una pestaña que tarda en aparecer.
    assert.ok(h.clock.now - startedAt >= 12000);
    // Ni otra pestaña del perfil ni las de la bandeja de entrada (también
    // role="tab"): el fallback por texto no confunde ninguna.
    assert.deepEqual(clicks, []);
    assert.equal(h.tiktok.toggleClicks(), 0);
    assert.equal(h.storage.runMirror.running, false);
  });
}

test("a Reposts grid without its data-e2e hooks ends with uiChanged and opens nothing", async (t) => {
  const h = await profile(t, { initialTab: "videos", missingGrid: true });
  const clicks = recordClicks(h);

  await start(h);
  const end = await h.waitForRunEnd({ timeoutMs: 60000 });
  assert.equal(end.message, UI_CHANGED.es);
  // Solo el click a la pestaña; los links seguían ahí, sin sus hooks.
  assert.deepEqual(clicks, ["repost-tab"]);
  assert.equal(h.tiktok.gridIds().length, 3);
  assert.deepEqual(h.tiktok.eventsOf("grid-click"), []);
  assert.equal(h.tiktok.toggleClicks(), 0);
});

test("grid links outside any user-repost-item end with uiChanged instead of 'no reposts found'", async (t) => {
  const h = await profile(t, { initialTab: "reposts" });
  await h.advance(h.tiktok.options.skeletonMs);
  // La lista conserva su data-e2e pero sus items lo perdieron.
  for (const item of $$(h, '[data-e2e="user-repost-item"]')) item.removeAttribute("data-e2e");
  const clicks = recordClicks(h);

  const report = await probe(h);
  assert.equal(report.repostGrid.listExists, true);
  assert.equal(report.repostGrid.links, 0);
  assert.equal(report.repostGrid.unknownLinksInList, true);
  // Los links sin item conocido siguen dentro de la lista: no son "de afuera".
  assert.equal(report.repostGrid.contentLinksOutsideGrid, 0);

  await start(h);
  const end = await h.waitForRunEnd({ timeoutMs: 60000 });
  assert.equal(end.message, UI_CHANGED.es);
  assert.deepEqual(clicks, []);
  assert.equal(h.tiktok.toggleClicks(), 0);
});

test("a tab that is there but never gets selected ends with noTab, not uiChanged", async (t) => {
  const h = await profile(t, { initialTab: "videos" });
  const tab = $(h, '[data-e2e="repost-tab"]');
  let tabClicks = 0;
  // El click le llega a la pestaña pero TikTok no la selecciona.
  tab.addEventListener("click", (event) => {
    tabClicks++;
    event.stopPropagation();
  });

  await start(h);
  const end = await h.waitForRunEnd({ timeoutMs: 120000 });
  assert.equal(end.message, NO_TAB_ES);
  assert.equal(end.finished, false);
  assert.ok(tabClicks > 0);
  assert.equal(tab.getAttribute("aria-selected"), "false");
  assert.deepEqual(h.tiktok.eventsOf("grid-click"), []);
  assert.equal(h.tiktok.toggleClicks(), 0);
});
