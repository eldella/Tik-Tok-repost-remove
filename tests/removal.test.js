"use strict";

// T8: la baja de cada repost, contra el TikTok falso armado con lo observado
// en vivo (Cinema Mode, UI en español). Cada item se abre desde la grilla,
// su estado se lee SOLO en la fila cuyo ID es el de la URL, el tag recibe a
// lo sumo un click, y la baja cuenta solo si el tag desaparece de esa fila.
//
// Casi todos los tests miran dos cosas además de su caso:
// - watchToggleClicks: cada click al repost-action-tag, visto en la fase de
//   captura (antes de que el TikTok falso lo procese). Todos tienen que caer
//   en la fila del item de la URL, que es el que se abrió desde la grilla,
//   con los dos tags a la vista y el repost todavía puesto en el "servidor".
// - recordClicks: todo click que llega al documento, por tipo. La extensión
//   solo puede clickear la pestaña, links de la grilla, el tag, cerrar y (si
//   aparece) el botón de confirmar de un diálogo.

const test = require("node:test");
const assert = require("node:assert/strict");
const { syntheticClick } = require("./helpers/harness");
const { loadTikTok, repostItems } = require("./helpers/tiktok-fixture");

const TOGGLE = '[data-e2e="repost-action-tag"]';
const TAG = '[data-e2e="repost-tag"]';
const ROW_ATTR = "data-cinema-mode-snap-row";

const MSG = {
  es: {
    done: (r) =>
      `Listo ✔ ${r} reposts eliminados. ` +
      "Para volver a revisar todo, recargá la página (F5) antes de iniciar de nuevo.",
    withPending: (r, p) =>
      `Terminado: ${r} eliminados · ${p} no se pudieron (revisalos a mano). ` +
      "Para volver a revisar todo, recargá la página (F5) antes de iniciar de nuevo.",
    noneRemoved: (p) =>
      `No se pudo quitar ninguno: ${p} quedaron sin eliminar (revisalos a mano). ` +
      "Para volver a revisar todo, recargá la página (F5) antes de iniciar de nuevo.",
    noneFound:
      "No encontré reposts para quitar. " +
      "Para volver a revisar todo, recargá la página (F5) antes de iniciar de nuevo.",
    stopped: "Detenido. 0 reposts eliminados hasta ahora.",
    stoppedUnverified: "Detenido. 0 reposts eliminados hasta ahora. 1 sin confirmar: revisalos a mano."
  },
  en: {
    done: (r) =>
      `Done ✔ ${r} reposts removed. ` +
      "To re-check everything, reload the page (F5) before starting again.",
    noneFound:
      "Found no reposts to remove. " +
      "To re-check everything, reload the page (F5) before starting again."
  }
};
// Con pendientes y sin confirmar a la vez, y solo sin confirmar.
const UNVERIFIED_ES_1_1_1 =
  "Terminado: 1 eliminados · 1 no se pudieron · 1 sin confirmar " +
  "(les hice un click y el repost siguió ahí; no los vuelvo a tocar). " +
  "Revisalos a mano: recargá la página (F5) para ver la lista real antes de iniciar de nuevo.";
const UNVERIFIED = {
  es: (r, u) =>
    `Terminado: ${r} eliminados · ${u} sin confirmar ` +
    "(les hice un click y el repost siguió ahí; no los vuelvo a tocar). " +
    "Revisalos a mano: recargá la página (F5) para ver la lista real antes de iniciar de nuevo.",
  en: (r, u) =>
    `Finished: ${r} removed · ${u} unconfirmed ` +
    "(I clicked once and the repost stayed; I won't touch them again). " +
    "Check them by hand: reload the page (F5) to see the real list before starting again."
};

// Eventos del TikTok falso que la extensión nunca tiene que provocar: el
// botón Siguiente/Anterior, teclas, el panel o botón de compartir, el menú
// "más", like/comentar/favorito/seguir, un click sobre el texto del tag, un
// botón "Eliminar" del perfil de fondo, un link fuera de la grilla, o
// cualquier click fuera de un diálogo abierto.
const FORBIDDEN_EVENTS = [
  "next-ignored",
  "prev-ignored",
  "key-ignored",
  "share-icon-click",
  "more-menu-click",
  "profile-share-click",
  "forbidden-click",
  "repost-tag-click",
  "decoy-confirm-click",
  "link-click",
  "click-outside-dialog",
  "dialog-cancel"
];

async function profile(t, options = {}) {
  const h = await loadTikTok({ items: repostItems(3), initialTab: "reposts", ...options });
  t.after(() => h.close());
  h.toggles = watchToggleClicks(h);
  h.clicks = recordClicks(h);
  return h;
}

const start = (h, extra = {}) => h.send({ action: "START", speed: "turbo", ...extra });
const runToEnd = (h, timeoutMs = 600000) => h.waitForRunEnd({ timeoutMs });
const idsOf = (h) => h.tiktok.server.reposts.map((it) => it.id);
const gridClicks = (h, id) => h.tiktok.eventsOf("grid-click").filter((e) => e.id === id).length;
const $ = (h, sel) => h.document.querySelector(sel);

function watchToggleClicks(h) {
  const seen = [];
  h.document.addEventListener(
    "click",
    (event) => {
      const target = event.target;
      const action = target && target.closest && target.closest(TOGGLE);
      if (!action) return;
      const row = action.closest(`[${ROW_ATTR}]`);
      const rowId = row ? row.getAttribute(ROW_ATTR) : null;
      const lastGridClick = h.tiktok.eventsOf("grid-click").slice(-1)[0];
      seen.push({
        rowId,
        urlId: h.tiktok.currentId(),
        openedId: lastGridClick ? lastGridClick.id : null,
        inModal: !!action.closest('[aria-modal="true"]'),
        connected: action.isConnected,
        rowHasTag: !!(row && row.querySelector(TAG)),
        serverReposted: rowId ? h.tiktok.server.isReposted(rowId) : null,
        at: h.clock.now
      });
    },
    true
  );
  return seen;
}

function recordClicks(h) {
  const clicks = [];
  h.document.addEventListener(
    "click",
    (event) => {
      const el = event.target;
      let kind;
      if (el.closest(TOGGLE)) kind = "toggle";
      else if (el.closest('[data-e2e="cinema-mode-exit"]')) kind = "exit";
      else if (el.closest('[data-e2e="repost-tab"]')) kind = "tab";
      else if (el.closest('[data-e2e="user-repost-item"] a[href]')) kind = "grid";
      else if (el.closest(".TUXModal")) kind = `dialog:${el.textContent}`;
      else {
        const e2e = el.closest("[data-e2e]");
        kind = `other:${e2e ? e2e.getAttribute("data-e2e") : el.getAttribute("aria-label") || el.tagName.toLowerCase()}`;
      }
      clicks.push({ kind, at: h.clock.now });
    },
    true
  );
  return clicks;
}

// El invariante de seguridad, sobre todos los clicks al tag de la página.
function assertToggleSafety(h) {
  const perRow = new Map();
  for (const c of h.toggles) {
    assert.ok(c.connected && c.inModal, "the toggle click landed on a node inside the player");
    assert.equal(c.rowId, c.urlId, "the toggle click landed on the current item's row, never a neighbour");
    assert.equal(c.rowId, c.openedId, "the toggle click landed on the item opened from the grid");
    assert.equal(c.rowHasTag, true, "the row showed the repost tag at click time");
    assert.equal(c.serverReposted, true, "the item was reposted at click time, so the click removes and never re-adds");
    perRow.set(c.rowId, (perRow.get(c.rowId) || 0) + 1);
  }
  for (const [id, n] of perRow) assert.equal(n, 1, `item ${id} got ${n} toggle clicks`);
  assert.equal(h.tiktok.toggleClicks(), h.toggles.length);
}

function assertNothingForbidden(h) {
  for (const type of FORBIDDEN_EVENTS) assert.deepEqual(h.tiktok.eventsOf(type), [], `unexpected ${type}`);
  assert.deepEqual(h.clicks.filter((c) => c.kind.startsWith("other:")), []);
}

test("N reposted items: each one gets exactly one click and is counted once its tag is gone (across grid pages)", async (t) => {
  // 12 items en tandas de 5: la corrida tiene que scrollear para cargar más.
  const h = await profile(t, { items: repostItems(12), pageSize: 5, loadMoreMs: 1000 });
  const ids = idsOf(h);

  await start(h);
  const end = await runToEnd(h);
  assert.equal(end.message, MSG.es.done(12));
  assert.equal(end.finished, true);
  assert.deepEqual([end.removed, end.pending, end.unverified, end.rescued], [12, 0, 0, 0]);
  assert.deepEqual(h.tiktok.server.repostedIds(), []);
  for (const id of ids) {
    assert.equal(h.tiktok.toggleClicks(id), 1, `item ${id}`);
    assert.equal(gridClicks(h, id), 1, `item ${id} was opened once`);
  }
  // Cada item se abrió desde la grilla y se cerró; nada de cadena.
  assert.equal(h.tiktok.eventsOf("open").length, 12);
  assert.equal(h.tiktok.eventsOf("closed").length, 12);
  assert.ok(h.tiktok.eventsOf("load-more").length > 0);
  assertToggleSafety(h);
  assertNothingForbidden(h);
  assert.equal(h.storage.runMirror.removed, 12);

  // Otra corrida sin recargar: la grilla sigue mostrando los quitados (caché),
  // pero ninguno se vuelve a abrir ni a clickear.
  await start(h);
  const again = await runToEnd(h);
  assert.equal(again.message, MSG.es.noneFound);
  assert.equal(again.removed, 0);
  assert.equal(h.tiktok.gridIds().length, 12);
  assert.equal(h.tiktok.toggleClicks(), 12);
  assert.equal(h.tiktok.eventsOf("grid-click").length, 12);
});

test("the Next button, the keyboard and the share controls are never used: only tab, grid, toggle and close", async (t) => {
  const h = await profile(t, { items: repostItems(5), initialTab: "videos" });

  await start(h);
  const end = await runToEnd(h);
  assert.equal(end.removed, 5);
  assertNothingForbidden(h);
  const kinds = new Set(h.clicks.map((c) => c.kind));
  assert.deepEqual([...kinds].sort(), ["exit", "grid", "tab", "toggle"]);
  // Cada apertura sale de un click en la grilla: el reproductor nunca pasó
  // solo al siguiente.
  assert.equal(h.tiktok.eventsOf("open").length, h.tiktok.eventsOf("grid-click").length);
  assert.equal(h.clicks.filter((c) => c.kind === "tab").length, 1);
});

test("an adjacent preloaded reposted row never fools verification or receives a click", async (t) => {
  // S ya no está compartido (caché), B nunca cambia. Con las vecinas montadas:
  // - al abrir S, la fila siguiente (A) tiene el tag: un query sobre toda la
  //   raíz lo encontraría y clickearía A;
  // - al abrir A, B (vecina) sigue compartida: mirar la raíz entera diría
  //   "no se quitó";
  // - al abrir B, la primera fila (A, data-index 0) ya no tiene tag: mirar
  //   esa fila diría "se quitó".
  const [s, a, b, c] = repostItems(4);
  const items = [{ ...s, stale: true }, a, { ...b, neverFlip: true }, c];
  const h = await profile(t, { items });

  await start(h);
  const end = await runToEnd(h);
  assert.equal(end.message, UNVERIFIED.es(2, 1));
  assert.deepEqual([end.removed, end.pending, end.unverified], [2, 0, 1]);
  assert.deepEqual(
    [s, a, b, c].map((it) => h.tiktok.toggleClicks(it.id)),
    [0, 1, 1, 1]
  );
  assert.deepEqual(h.tiktok.server.repostedIds(), [b.id]);
  // Las vecinas estaban montadas y compartidas cuando se abrió cada una.
  const openOf = (id) => h.tiktok.eventsOf("open").find((e) => e.id === id);
  assert.deepEqual(openOf(s.id).rows, [s.id, a.id]);
  assert.deepEqual(openOf(b.id).rows, [a.id, b.id, c.id]);
  assertToggleSafety(h);
  assertNothingForbidden(h);
});

test("a row that never flips: clicked once, reported unverified, never retried by rescue or by a second START", async (t) => {
  const [a, b, c] = repostItems(3);
  // C no abre nunca, así hay repescas de verdad.
  const items = [a, { ...b, neverFlip: true }, { ...c, neverOpen: true }];
  const h = await profile(t, { items });

  await start(h);
  const first = await runToEnd(h);
  assert.equal(first.message, UNVERIFIED_ES_1_1_1);
  assert.deepEqual([first.removed, first.pending, first.unverified], [1, 1, 1]);
  // C: la pasada principal más las dos repescas.
  assert.equal(gridClicks(h, c.id), 3);
  assert.equal(gridClicks(h, b.id), 1);
  assert.equal(h.tiktok.toggleClicks(b.id), 1);
  assert.equal(h.tiktok.toggleClicks(c.id), 0);
  assert.ok(h.tiktok.eventsOf("toggle-no-effect").some((e) => e.id === b.id));

  // Otra corrida sin recargar: B sigue en la grilla y compartido, y ni se abre.
  await start(h);
  const second = await runToEnd(h);
  assert.equal(second.message, MSG.es.noneRemoved(1));
  assert.deepEqual([second.removed, second.pending, second.unverified], [0, 1, 0]);
  assert.equal(gridClicks(h, b.id), 1);
  assert.equal(gridClicks(h, a.id), 1);
  assert.equal(gridClicks(h, c.id), 6);
  assert.equal(h.tiktok.toggleClicks(b.id), 1);
  assert.equal(h.tiktok.toggleClicks(), 2);
  assert.equal(h.tiktok.server.isReposted(b.id), true);
  assertToggleSafety(h);
  assertNothingForbidden(h);
});

test("a not-reposted item (stale grid entry) gets zero clicks and is not counted", async (t) => {
  const [s, a] = repostItems(2);
  const h = await profile(t, { items: [{ ...s, stale: true }, a] });

  await start(h);
  const end = await runToEnd(h);
  assert.equal(end.message, MSG.es.done(1));
  assert.deepEqual([end.removed, end.pending, end.unverified], [1, 0, 0]);
  assert.equal(gridClicks(h, s.id), 1);
  assert.equal(h.tiktok.toggleClicks(s.id), 0);
  assert.equal(h.tiktok.toggleClicks(a.id), 1);
  // Sigue sin compartir: el click que no salió lo habría vuelto a agregar.
  assert.equal(h.tiktok.server.isReposted(s.id), false);
  assertToggleSafety(h);
});

const NOT_READY = [
  ["never opens", (it) => ({ ...it, neverOpen: true }), false],
  ["changes the URL but never mounts its row", (it) => ({ ...it, rowDelayMs: Infinity }), true],
  ["opens a different item", (it, other) => ({ ...it, opensAs: other.id }), true]
];
for (const [label, broken, opensSomething] of NOT_READY) {
  test(`a player that ${label}: zero toggle clicks, retried by rescue, still zero clicks`, async (t) => {
    const [x, a, b] = repostItems(3);
    const h = await profile(t, { items: [broken(x, a), a, b] });

    await start(h);
    const end = await runToEnd(h);
    assert.equal(end.message, MSG.es.withPending(2, 1));
    assert.deepEqual([end.removed, end.pending, end.unverified], [2, 1, 0]);
    assert.equal(gridClicks(h, x.id), 3);
    assert.equal(h.tiktok.toggleClicks(x.id), 0);
    assert.equal(h.tiktok.toggleClicks(a.id), 1);
    assert.equal(h.tiktok.toggleClicks(b.id), 1);
    assert.equal(h.tiktok.server.isReposted(x.id), true);
    // Si llegó a abrir algo, se cerró cada vez sin tocar nada.
    if (opensSomething) assert.equal(h.tiktok.eventsOf("closed").length, 3 + 2);
    assert.equal(h.tiktok.isPlayerOpen(), false);
    assertToggleSafety(h);
    assertNothingForbidden(h);
  });
}

for (const [label, confirmDialog] of [
  ["aria-modal dialog", true],
  ["role=dialog without aria-modal", { ariaModal: false }]
]) {
  test(`confirm-dialog variant (${label}): one confirm click inside the dialog only`, async (t) => {
    // Además un botón "Eliminar" en el perfil de fondo, que el regex de
    // confirmar también acepta: nunca se tiene que tocar.
    const h = await profile(t, { items: repostItems(2), confirmDialog, decoyConfirmButton: true });

    await start(h);
    const end = await runToEnd(h);
    assert.equal(end.message, MSG.es.done(2));
    assert.equal(end.removed, 2);
    assert.equal(h.tiktok.eventsOf("dialog-shown").length, 2);
    assert.equal(h.tiktok.eventsOf("dialog-confirm").length, 2);
    assert.deepEqual(
      h.clicks.filter((c) => c.kind.startsWith("dialog:")).map((c) => c.kind),
      ["dialog:Quitar", "dialog:Quitar"]
    );
    for (const id of idsOf(h)) assert.equal(h.tiktok.toggleClicks(id), 1);
    assertToggleSafety(h);
    assertNothingForbidden(h);
  });
}

test("confirm-dialog variant: confirming never counts by itself, only the tag disappearing does", async (t) => {
  const [slow, stuck] = repostItems(2);
  const items = [{ ...slow, toggleDelayMs: 2000 }, { ...stuck, neverFlip: true }];
  const h = await profile(t, { items, confirmDialog: true });

  await start(h);
  await h.until(() => h.tiktok.eventsOf("dialog-confirm")[0]);
  assert.equal((await h.status()).removed, 0, "the confirm click alone is not a removal");
  const applied = await h.until(() => h.tiktok.eventsOf("toggle-applied")[0]);
  assert.equal(applied.id, slow.id);
  assert.equal((await h.status()).removed, 0, "not counted before the row is re-read");
  await h.until(async () => (await h.status()).removed === 1);

  const end = await runToEnd(h);
  // El segundo confirma igual, pero su tag nunca se va: sin confirmar.
  assert.equal(end.message, UNVERIFIED.es(1, 1));
  assert.deepEqual([end.removed, end.unverified], [1, 1]);
  assert.equal(h.tiktok.eventsOf("dialog-confirm").length, 2);
  assert.equal(h.tiktok.toggleClicks(stuck.id), 1);
  assert.equal(h.tiktok.server.isReposted(stuck.id), true);
  assertToggleSafety(h);
  assertNothingForbidden(h);
});

test("Stop right after the click: no further clicks, START while stopping is refused, the item is never clicked again", async (t) => {
  const [a, b, c] = repostItems(3);
  const h = await profile(t, { items: [{ ...a, toggleDelayMs: 3000 }, b, c] });

  await start(h);
  await h.until(() => h.tiktok.eventsOf("toggle-click")[0]);
  const stoppedAt = h.clock.now;
  assert.deepEqual(await h.send({ action: "STOP" }), { ok: true, stopping: true });
  assert.deepEqual(await start(h), { ok: false, stopping: true });
  const end = await h.waitForRunEnd({ timeoutMs: 30000 });
  assert.equal(end.message, MSG.es.stoppedUnverified);
  assert.deepEqual([end.removed, end.unverified, end.finished], [0, 1, false]);
  // Ni un click más, ni siquiera para cerrar el reproductor.
  assert.deepEqual(h.clicks.filter((x) => x.at > stoppedAt), []);
  assert.ok(h.tiktok.isPlayerOpen());

  await h.advance(5000);
  assert.equal(h.tiktok.server.isReposted(a.id), false);
  assert.deepEqual(h.clicks.filter((x) => x.at > stoppedAt), []);

  // Una corrida nueva cierra el reproductor, saltea A y sigue con el resto.
  await start(h);
  const second = await runToEnd(h);
  assert.equal(second.message, MSG.es.done(2));
  assert.deepEqual([h.tiktok.toggleClicks(a.id), h.tiktok.toggleClicks(b.id), h.tiktok.toggleClicks(c.id)], [1, 1, 1]);
  assert.equal(gridClicks(h, a.id), 1);
  assertToggleSafety(h);
  assertNothingForbidden(h);
});

test("Stop before the click leaves the item untouched, and the next run clicks it exactly once", async (t) => {
  const h = await profile(t);
  const [a] = idsOf(h);

  await start(h);
  await h.until(() => h.tiktok.eventsOf("grid-click")[0]);
  // El reproductor ya abrió y la corrida está en la pausa antes de leer.
  await h.advance(600);
  assert.ok(h.tiktok.isPlayerOpen());
  const stoppedAt = h.clock.now;
  await h.send({ action: "STOP" });
  const end = await h.waitForRunEnd({ timeoutMs: 30000 });
  assert.equal(end.message, MSG.es.stopped);
  assert.deepEqual([end.removed, end.unverified], [0, 0]);
  assert.equal(h.tiktok.toggleClicks(), 0);
  assert.deepEqual(h.clicks.filter((x) => x.at > stoppedAt), []);

  await start(h);
  const second = await runToEnd(h);
  assert.equal(second.message, MSG.es.done(3));
  assert.equal(h.tiktok.toggleClicks(a), 1);
  assert.equal(gridClicks(h, a), 2);
  assertToggleSafety(h);
});

for (const lang of ["es", "en"]) {
  test(`end-of-run messages (${lang}): removed>0 with nothing pending, removed>0 with unverified, and 0/0`, async (t) => {
    const ok = await profile(t, { items: repostItems(2), lang });
    await start(ok, { lang });
    const okEnd = await runToEnd(ok);
    assert.equal(okEnd.message, MSG[lang].done(2));
    assert.deepEqual([okEnd.removed, okEnd.pending, okEnd.unverified, okEnd.finished], [2, 0, 0, true]);

    const [a, b] = repostItems(2);
    const mixed = await profile(t, { items: [a, { ...b, neverFlip: true }], lang });
    await start(mixed, { lang });
    const mixedEnd = await runToEnd(mixed);
    assert.equal(mixedEnd.message, UNVERIFIED[lang](1, 1));
    assert.deepEqual([mixedEnd.removed, mixedEnd.pending, mixedEnd.unverified, mixedEnd.finished], [1, 0, 1, true]);

    const none = await profile(t, { items: repostItems(2).map((it) => ({ ...it, stale: true })), lang });
    await start(none, { lang });
    const noneEnd = await runToEnd(none);
    assert.equal(noneEnd.message, MSG[lang].noneFound);
    assert.deepEqual([noneEnd.removed, noneEnd.pending, noneEnd.unverified, noneEnd.finished], [0, 0, 0, true]);
    assert.equal(none.tiktok.toggleClicks(), 0);
  });
}

test("no toggle click ever lands on a row that lacks the tag at click time", async (t) => {
  // Sobre cada item, algo distinto entre la apertura y el click:
  // - gone: TikTok saca los dos tags de la fila (el "servidor" sigue diciendo
  //   compartido): no se clickea y se da por "ya no estaba";
  // - half: saca solo el repost-tag y deja el control: no se clickea, va a la
  //   repesca, y al reabrirlo (fila nueva, con sus tags) recibe su único click;
  // - late: la fila se monta tarde, dentro del tope de apertura;
  // - stale, stuck: sin tags desde el principio, y uno que nunca cambia.
  const [gone, half, late, stale, stuck, plain] = repostItems(6);
  const items = [
    gone,
    half,
    { ...late, rowDelayMs: 2500 },
    { ...stale, stale: true },
    { ...stuck, neverFlip: true },
    plain
  ];
  const h = await profile(t, { items });
  const tampered = new Set();
  const tamper = (id, fn) => {
    const open = h.tiktok.eventsOf("open").find((e) => e.id === id);
    if (!open || tampered.has(id)) return;
    tampered.add(id);
    fn(h.document.querySelector(`[aria-modal="true"] [${ROW_ATTR}="${id}"]`));
  };

  await start(h);
  await h.until(async () => {
    tamper(gone.id, (row) => row.querySelector('[class*="DivPriorityTagsContainer"]').replaceChildren());
    tamper(half.id, (row) => row.querySelector(TAG).parentElement.remove());
    const s = await h.status();
    return !s.running && !s.stopping ? s : null;
  }, { timeoutMs: 600000 });
  const end = await h.status();

  assert.deepEqual([...tampered].sort(), [gone.id, half.id].sort());
  assert.equal(h.tiktok.toggleClicks(gone.id), 0);
  assert.equal(h.tiktok.toggleClicks(stale.id), 0);
  assert.equal(h.tiktok.toggleClicks(half.id), 1);
  assert.equal(gridClicks(h, half.id), 2);
  assert.equal(h.tiktok.toggleClicks(late.id), 1);
  assert.equal(h.tiktok.toggleClicks(stuck.id), 1);
  assert.equal(h.tiktok.toggleClicks(plain.id), 1);
  assert.deepEqual([end.removed, end.pending, end.unverified], [3, 0, 1]);
  assert.equal(end.rescued, 1);
  assertToggleSafety(h);
  assertNothingForbidden(h);
});

test("a player that never closes ends with cantClosePlayer after three tries, with no other clicks", async (t) => {
  const h = await profile(t, { items: repostItems(3), closeIgnored: true });

  await start(h);
  const end = await runToEnd(h);
  assert.equal(
    end.message,
    'No pude cerrar el reproductor. Volvé a la pestaña "Compartidos" de tu perfil y tocá Iniciar de nuevo.'
  );
  assert.deepEqual([end.removed, end.finished], [1, false]);
  assert.equal(h.tiktok.eventsOf("close-ignored").length, 3);
  assert.deepEqual(h.clicks.map((c) => c.kind), ["grid", "toggle", "exit", "exit", "exit"]);
  assert.equal(h.storage.runMirror.running, false);
  assertToggleSafety(h);
  assertNothingForbidden(h);
});

test("the same item listed twice in the grid (under another @user) is opened and clicked once", async (t) => {
  const h = await profile(t);
  await h.advance(h.tiktok.options.skeletonMs);
  const [first] = idsOf(h);
  const list = $(h, '[data-e2e="user-repost-item-list"]');
  const copy = list.firstElementChild.cloneNode(true);
  copy.querySelector("a[href]").setAttribute("href", `https://www.tiktok.com/@someone_else/video/${first}`);
  list.append(copy);

  await start(h);
  const end = await runToEnd(h);
  assert.equal(end.message, MSG.es.done(3));
  assert.equal(h.tiktok.toggleClicks(first), 1);
  assert.equal(gridClicks(h, first), 1);
  assertToggleSafety(h);
});

test("PROBE with the player open reports the cinema root, the current row and the tags per row, read-only", async (t) => {
  const [a, b, c] = repostItems(3);
  const h = await profile(t, { items: [a, b, { ...c, stale: true }] });
  await h.advance(h.tiktok.options.skeletonMs);
  const anchors = () => Array.from(h.document.querySelectorAll('[data-e2e="user-repost-item"] a[href]'));
  syntheticClick(anchors()[1]);
  await h.advance(h.tiktok.options.openDelayMs);

  const htmlBefore = h.document.body.innerHTML;
  const eventsBefore = h.tiktok.events.length;
  const { report } = await h.send({ action: "PROBE" });
  assert.equal(h.document.body.innerHTML, htmlBefore);
  assert.equal(h.tiktok.events.length, eventsBefore);

  assert.equal(report.playerOpen, true);
  const cinema = report.cinema;
  assert.equal(cinema.rootFound, true);
  assert.equal(cinema.urlId, b.id);
  assert.equal(cinema.currentRowFound, true);
  assert.equal(cinema.currentRowMatches, 1);
  assert.equal(cinema.repostState, "reposted");
  assert.equal(cinema.rowCount, 3);
  assert.deepEqual(
    cinema.rows.map(({ id, current, repostTag, repostActionTag }) => ({ id, current, repostTag, repostActionTag })),
    [
      { id: a.id, current: false, repostTag: 1, repostActionTag: 1 },
      { id: b.id, current: true, repostTag: 1, repostActionTag: 1 },
      { id: c.id, current: false, repostTag: 0, repostActionTag: 0 }
    ]
  );
  assert.equal(cinema.tagsOutsideRows, 0);
  assert.equal(cinema.currentActionTag.dataE2e, "repost-action-tag");
  assert.equal(cinema.currentActionTag.inDialog, true);
  assert.equal(cinema.exitButton.dataE2e, "cinema-mode-exit");
  assert.deepEqual(report.dialogs.map((d) => d.cinemaRoot), [true]);

  // En el item que ya no está compartido, el estado que leería la baja.
  syntheticClick($(h, '[data-e2e="cinema-mode-exit"]'));
  await h.advance(h.tiktok.options.closeDelayMs);
  syntheticClick(anchors()[2]);
  await h.advance(h.tiktok.options.openDelayMs);
  const stale = (await h.send({ action: "PROBE" })).report.cinema;
  assert.equal(stale.urlId, c.id);
  assert.equal(stale.repostState, "notReposted");
  assert.equal(h.tiktok.toggleClicks(), 0);

  // Sin reproductor: nada que reportar de él.
  syntheticClick($(h, '[data-e2e="cinema-mode-exit"]'));
  await h.advance(h.tiktok.options.closeDelayMs);
  const closed = (await h.send({ action: "PROBE" })).report.cinema;
  assert.deepEqual([closed.rootFound, closed.urlId, closed.currentRowFound, closed.rowCount], [false, null, false, 0]);
});
