"use strict";

// Humo del harness: que content.js cargue en jsdom, que el reloj falso maneje
// sus esperas, que los mensajes (STATUS, PROBE, START) respondan y que un F5
// simulado con reload() se comporte como en Chrome. La lógica de baja se
// prueba aparte (T8), no acá.

const test = require("node:test");
const assert = require("node:assert/strict");
const { loadContent } = require("./helpers/harness");
const { loadTikTok, repostItems } = require("./helpers/tiktok-fixture");

const STATUS_KEYS = [
  "finished",
  "lang",
  "message",
  "pending",
  "removed",
  "rescued",
  "running",
  "speed",
  "stopping",
  "unverified"
];

const OPEN_PROFILE = {
  es: "Abrí tu perfil (tiktok.com/@tu_usuario) antes de iniciar.",
  en: "Open your profile (tiktok.com/@your_username) before starting."
};

test("content.js loads once and registers a single message listener", async (t) => {
  const h = await loadContent();
  t.after(() => h.close());

  assert.equal(h.window.__repostCleanerLoaded, true);
  assert.equal(typeof h.window.__repostRemoverProbe, "function");
  assert.equal(h.listenerCount(), 1);
  assert.deepEqual(h.jsdomErrors, []);
});

test("STATUS answers with the expected shape on an idle page", async (t) => {
  const h = await loadContent();
  t.after(() => h.close());

  const status = await h.send({ action: "STATUS" });
  assert.deepEqual(Object.keys(status).sort(), STATUS_KEYS);
  assert.deepEqual(status, {
    running: false,
    stopping: false,
    finished: false,
    removed: 0,
    rescued: 0,
    pending: 0,
    unverified: 0,
    speed: "rapido",
    lang: "es",
    message: ""
  });
});

test("STATUS reports the language saved in chrome.storage.local", async (t) => {
  const h = await loadContent({ storage: { lang: "en" } });
  t.after(() => h.close());

  const status = await h.send({ action: "STATUS" });
  assert.equal(status.lang, "en");
});

test("PROBE returns a read-only report and leaves the page untouched", async (t) => {
  const h = await loadTikTok({ items: repostItems(3), initialTab: "reposts", skeletonMs: 1000 });
  t.after(() => h.close());
  await h.advance(1000);

  const htmlBefore = h.document.body.innerHTML;
  const eventsBefore = h.tiktok.events.length;
  const response = await h.send({ action: "PROBE" });

  assert.equal(response.ok, true);
  const report = response.report;
  assert.equal(report.probe, "TikTok Repost Remover DOM probe (read-only)");
  assert.equal(report.extensionVersion, h.manifest.version);
  assert.equal(report.pathname, "/@me");
  assert.equal(report.playerOpen, false);
  assert.equal(report.documentLang, "es");
  assert.deepEqual(report.run, { running: false, finished: false });
  assert.equal(report.repostTab.exists, true);
  assert.equal(report.repostTab.ariaSelected, "true");

  // Ni un click, tecla o scroll, y el estado de la corrida intacto.
  assert.equal(h.document.body.innerHTML, htmlBefore);
  assert.equal(h.tiktok.events.length, eventsBefore);
  assert.equal((await h.status()).message, "");
});

test("START on a non-profile URL ends with the openProfile message and clicks nothing", async (t) => {
  const h = await loadTikTok({ url: "https://www.tiktok.com/foryou", items: repostItems(2) });
  t.after(() => h.close());

  assert.deepEqual(await h.send({ action: "START", speed: "turbo" }), { ok: true });
  const status = await h.waitForRunEnd({ timeoutMs: 5000 });

  assert.equal(status.message, OPEN_PROFILE.es);
  assert.equal(status.finished, false);
  assert.equal(status.removed, 0);
  assert.equal(h.tiktok.toggleClicks(), 0);
  assert.deepEqual(h.tiktok.eventsOf("grid-click"), []);
  // Toda salida del bucle deja el espejo en running:false.
  assert.equal(h.storage.runMirror.running, false);
});

test("START honours the language sent by the popup", async (t) => {
  const h = await loadTikTok({ url: "https://www.tiktok.com/foryou" });
  t.after(() => h.close());

  await h.send({ action: "START", lang: "en" });
  const status = await h.waitForRunEnd({ timeoutMs: 5000 });
  assert.equal(status.message, OPEN_PROFILE.en);
});

// Arranca una corrida larga en el perfil y la deja a mitad de camino, con el
// espejo guardado en running:true, lista para cortarla con un F5.
async function runCutMidway(t) {
  const h = await loadTikTok({ items: repostItems(30), initialTab: "reposts" });
  t.after(() => h.close());
  // Un minuto con la página abierta antes de Iniciar: el espejo queda con una
  // hora posterior a la carga, así una recarga que reiniciara el reloj falso
  // lo vería "en el futuro" y estos tests lo notarían.
  await h.advance(60000);
  await h.send({ action: "START", speed: "turbo" });
  await h.advance(3000);
  assert.equal((await h.status()).running, true);
  assert.equal(h.storage.runMirror.running, true);
  return h;
}

test("reload() fires pagehide and carries the server, storage, URL and fake time forward", async (t) => {
  const h = await runCutMidway(t);
  let pagehides = 0;
  h.window.addEventListener("pagehide", () => pagehides++);
  const url = h.window.location.href;
  const before = h.clock.now;

  const r = await h.reload();
  t.after(() => r.close());
  assert.equal(pagehides, 1);
  assert.equal(r.tiktok.server, h.tiktok.server);
  assert.equal(r.window.location.href, url);
  assert.equal(r.clock.now, before + 1000);
  assert.ok(r.storage.runMirror.updatedAt <= r.clock.now, "the saved mirror is never in the future");
});

test("a run cut by reload() shows the interrupted notice, and the mirror goes back to running:false", async (t) => {
  const h = await runCutMidway(t);
  const r = await h.reload();
  t.after(() => r.close());

  const status = await r.status();
  assert.equal(status.running, false);
  assert.match(status.message, /^Se interrumpió \(recarga de página\)/);
  assert.equal(r.storage.runMirror.running, false);
});

test("a reload more than 30 minutes later shows no interrupted notice", async (t) => {
  const h = await runCutMidway(t);
  const r = await h.reload({}, { gapMs: 31 * 60 * 1000 });
  t.after(() => r.close());

  assert.equal((await r.status()).message, "");
  assert.equal(r.storage.runMirror.running, false);
});

test("START on a directly loaded video page runs on the fake clock and still ends with openProfile", async (t) => {
  const h = await loadTikTok({ url: "https://www.tiktok.com/@creator_1/video/7689540975353416981" });
  t.after(() => h.close());

  await h.send({ action: "START" });
  // Primero intenta cerrar el reproductor y espera: la corrida sigue viva
  // hasta que se mueve el reloj falso.
  assert.equal((await h.status()).running, true);

  const start = h.clock.now;
  const status = await h.waitForRunEnd({ timeoutMs: 30000 });
  assert.ok(h.clock.now > start, "the run should only end after fake time passes");
  assert.equal(status.message, OPEN_PROFILE.es);
  assert.equal(h.tiktok.toggleClicks(), 0);
});
