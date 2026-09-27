"use strict";

// Comprueba que el TikTok falso se comporta como el real observado en vivo el
// 2026-09-26. Si el fixture se aleja de eso, los tests de la extensión
// pasarían contra un TikTok que no existe. Acá no corre ninguna baja de
// content.js: los clicks son sintéticos y directos, iguales a humanClick().

const test = require("node:test");
const assert = require("node:assert/strict");
const { syntheticClick } = require("./helpers/harness");
const { loadTikTok, repostItems } = require("./helpers/tiktok-fixture");

const ABSOLUTE_CONTENT_URL = /^https:\/\/www\.tiktok\.com\/@[^/]+\/(video|photo)\/\d+$/;

async function page(t, options = {}) {
  const h = await loadTikTok({ items: repostItems(5), skeletonMs: 3000, ...options });
  t.after(() => h.close());
  return h;
}

const $ = (h, sel) => h.document.querySelector(sel);
const $$ = (h, sel) => Array.from(h.document.querySelectorAll(sel));
const gridAnchors = (h) =>
  $$(h, '[data-e2e="user-repost-item-list"] [data-e2e="user-repost-item"] a[href]');
const currentRow = (h) =>
  $(h, `[aria-modal="true"] [data-cinema-mode-snap-row="${h.tiktok.currentId()}"]`);
const tagsIn = (row) => ({
  tag: row.querySelectorAll('[data-e2e="repost-tag"]').length,
  action: row.querySelectorAll('[data-e2e="repost-action-tag"]').length
});

// Abre el item n de la grilla de reposts (ya poblada) con un click sintético.
async function openItem(h, n) {
  syntheticClick(gridAnchors(h)[n]);
  await h.advance(h.tiktok.options.openDelayMs);
}

async function reposts(t, options = {}) {
  const h = await page(t, { initialTab: "reposts", ...options });
  await h.advance(h.tiktok.options.skeletonMs);
  return h;
}

test("profile tabs keep aria-selected on the tab itself; the reposts tab reads Compartidos", async (t) => {
  const h = await page(t);
  const tabs = $$(h, 'p[role="tab"]');
  const repostTab = $(h, '[data-e2e="repost-tab"]');

  assert.equal(tabs.length, 5);
  assert.equal(repostTab.tagName, "P");
  assert.equal(repostTab.textContent, "Compartidos");
  assert.equal(repostTab.getAttribute("aria-selected"), "false");
  assert.equal($(h, '[data-e2e="videos-tab"]').getAttribute("aria-selected"), "true");

  syntheticClick(repostTab);
  assert.equal(repostTab.getAttribute("aria-selected"), "true");
  assert.equal($(h, '[data-e2e="videos-tab"]').getAttribute("aria-selected"), "false");
  // Ni ancestros con aria-selected ni clases active/selected.
  for (let node = repostTab.parentElement, i = 0; i < 4; node = node.parentElement, i++) {
    assert.equal(node.getAttribute("aria-selected"), null);
    assert.doesNotMatch(node.getAttribute("class") || "", /active|selected/i);
  }
});

test("the reposts grid shows skeletons first, then absolute video and photo links", async (t) => {
  const h = await page(t);
  syntheticClick($(h, '[data-e2e="repost-tab"]'));

  const list = $(h, '[data-e2e="user-repost-item-list"]');
  assert.ok(list.children.length > 0, "skeleton placeholders are rendered");
  assert.equal(list.querySelectorAll("a").length, 0);

  await h.advance(2999);
  assert.equal(gridAnchors(h).length, 0);
  await h.advance(1);
  const anchors = gridAnchors(h);
  assert.equal(anchors.length, 5);
  for (const a of anchors) assert.match(a.getAttribute("href"), ABSOLUTE_CONTENT_URL);
  assert.match(anchors[3].getAttribute("href"), /\/photo\//);
  // El item con data-e2e está 3 niveles arriba del <a>.
  assert.equal(anchors[0].parentElement.parentElement.parentElement.getAttribute("data-e2e"), "user-repost-item");
});

test("a synthetic grid click opens Cinema Mode on that item with its neighbours mounted", async (t) => {
  const h = await reposts(t);
  const ids = h.tiktok.server.reposts.map((it) => it.id);

  await openItem(h, 1);
  assert.equal(h.window.location.pathname, `/@creator_2/video/${ids[1]}`);
  const root = $(h, '[aria-modal="true"]');
  assert.equal(root.getAttribute("role"), "dialog");
  assert.deepEqual(h.tiktok.rowIds(), [ids[0], ids[1], ids[2]]);

  const row = currentRow(h);
  assert.equal(row.getAttribute("data-index"), "1");
  assert.equal(row.querySelectorAll("video").length, 1);
  assert.deepEqual(tagsIn(row), { tag: 1, action: 1 });
  // Las vecinas también están compartidas: un query sobre toda la raíz del
  // modal encuentra tres tags, y el primero no es el del video actual.
  assert.equal(root.querySelectorAll('[data-e2e="repost-tag"]').length, 3);
  assert.notEqual(root.querySelector('[data-e2e="repost-tag"]').closest("[data-cinema-mode-snap-row]"), row);
  // El texto del tag cambia de un video a otro.
  const texts = new Set(Array.from(root.querySelectorAll('[data-e2e="repost-tag"]'), (n) => n.textContent));
  assert.deepEqual(texts, new Set(["Lo compartiste", "2 lo compartió"]));
  // El perfil sigue montado detrás, con su botón de compartir.
  assert.equal(gridAnchors(h).length, 5);
  assert.ok($(h, 'button[data-e2e="share-btn"]'));
  assert.deepEqual(h.jsdomErrors, []);
});

test("one synthetic click on the action tag removes the repost ~170 ms later, with no dialog", async (t) => {
  const h = await reposts(t);
  const id = h.tiktok.server.reposts[0].id;
  await openItem(h, 0);

  syntheticClick(currentRow(h).querySelector('[data-e2e="repost-action-tag"]'));
  await h.advance(169);
  assert.equal(h.tiktok.server.isReposted(id), true);
  assert.deepEqual(tagsIn(currentRow(h)), { tag: 1, action: 1 });

  await h.advance(1);
  assert.equal(h.tiktok.server.isReposted(id), false);
  assert.deepEqual(tagsIn(currentRow(h)), { tag: 0, action: 0 });
  // La vecina no se tocó.
  const neighbour = $(h, `[data-cinema-mode-snap-row="${h.tiktok.server.reposts[1].id}"]`);
  assert.deepEqual(tagsIn(neighbour), { tag: 1, action: 1 });
  assert.equal($$(h, '[role="dialog"], [aria-modal="true"]').length, 1);
  assert.deepEqual(h.tiktok.server.toggleLog.map(({ id: rowId, currentId }) => ({ rowId, currentId })), [
    { rowId: id, currentId: id }
  ]);
});

test("the action tag is a toggle: a second click before it disappears re-adds the repost", async (t) => {
  const h = await reposts(t);
  const id = h.tiktok.server.reposts[0].id;
  await openItem(h, 0);

  const tag = currentRow(h).querySelector('[data-e2e="repost-action-tag"]');
  syntheticClick(tag);
  syntheticClick(tag);
  await h.advance(200);
  assert.equal(h.tiktok.toggleClicks(id), 2);
  assert.equal(h.tiktok.server.isReposted(id), true);
  assert.deepEqual(tagsIn(currentRow(h)), { tag: 1, action: 1 });
});

test("Next, ArrowDown and Escape ignore synthetic input; the exit button closes the player", async (t) => {
  const h = await reposts(t);
  await openItem(h, 0);
  const url = h.window.location.href;

  syntheticClick($(h, 'button[aria-label="Next video"]'));
  const { KeyboardEvent } = h.window;
  const key = (target, k) => target.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));
  key(h.document, "ArrowDown");
  key(currentRow(h).querySelector("video"), "ArrowDown");
  key($(h, '[aria-modal="true"]'), "ArrowDown");
  key(h.document, "Escape");
  await h.advance(5000);
  assert.equal(h.window.location.href, url);
  assert.ok(h.tiktok.isPlayerOpen());
  assert.equal(h.tiktok.eventsOf("next-ignored").length, 1);

  syntheticClick($(h, '[aria-modal="true"] [data-e2e="cinema-mode-exit"]'));
  await h.advance(h.tiktok.options.closeDelayMs);
  assert.equal($(h, '[aria-modal="true"]'), null);
  assert.equal(h.window.location.pathname, "/@me");
  assert.equal($(h, '[data-e2e="repost-tab"]').getAttribute("aria-selected"), "true");
});

test("the grid keeps a removed item until the page is reloaded", async (t) => {
  const h = await reposts(t);
  const id = h.tiktok.server.reposts[0].id;
  await openItem(h, 0);
  syntheticClick(currentRow(h).querySelector('[data-e2e="repost-action-tag"]'));
  await h.advance(200);
  syntheticClick($(h, '[data-e2e="cinema-mode-exit"]'));
  await h.advance(h.tiktok.options.closeDelayMs);

  assert.equal(h.tiktok.gridIds()[0], id);
  assert.equal(gridAnchors(h).length, 5);

  // F5: mismo servidor, página nueva.
  const reloaded = await h.reload({ skeletonMs: 1000 });
  t.after(() => reloaded.close());
  assert.equal(reloaded.tiktok.server, h.tiktok.server);
  assert.equal(reloaded.window.location.pathname, "/@me");
  await reloaded.advance(1000);
  assert.equal(reloaded.tiktok.gridIds().length, 4);
  assert.ok(!reloaded.tiktok.gridIds().includes(id));
});

test("scrolling to the bottom loads the next page of the grid", async (t) => {
  const h = await reposts(t, { pageSize: 3, loadMoreMs: 1000 });
  assert.equal(gridAnchors(h).length, 3);

  h.window.scrollTo({ top: 0, behavior: "instant" });
  await h.advance(1000);
  assert.equal(gridAnchors(h).length, 3);

  h.window.scrollTo({ top: h.document.body.scrollHeight, behavior: "smooth" });
  await h.advance(1000);
  assert.equal(gridAnchors(h).length, 5);
});

test("scrollBy to the bottom or scrollIntoView on the last row also loads more", async (t) => {
  const h = await reposts(t, { items: repostItems(20), pageSize: 8, loadMoreMs: 1000 });
  assert.equal(gridAnchors(h).length, 8);

  // Un item de la primera fila no llega al fondo.
  gridAnchors(h)[0].scrollIntoView({ block: "center" });
  await h.advance(1000);
  assert.equal(gridAnchors(h).length, 8);

  gridAnchors(h)[7].scrollIntoView({ block: "center" });
  await h.advance(1000);
  assert.equal(gridAnchors(h).length, 16);

  h.window.scrollBy(0, 300);
  await h.advance(1000);
  assert.equal(gridAnchors(h).length, 16);
  h.window.scrollBy({ top: h.document.body.scrollHeight });
  await h.advance(1000);
  assert.equal(gridAnchors(h).length, 20);
});

test("failure mode: a row that never flips keeps its tags", async (t) => {
  const items = repostItems(3).map((it, i) => (i === 0 ? { ...it, neverFlip: true } : it));
  const h = await reposts(t, { items });
  await openItem(h, 0);

  syntheticClick(currentRow(h).querySelector('[data-e2e="repost-action-tag"]'));
  await h.advance(4000);
  assert.equal(h.tiktok.server.isReposted(items[0].id), true);
  assert.deepEqual(tagsIn(currentRow(h)), { tag: 1, action: 1 });
  assert.equal(h.tiktok.toggleClicks(items[0].id), 1);
});

test("failure mode: a player that never opens leaves the URL on the profile", async (t) => {
  const h = await reposts(t, { neverOpen: true });
  await openItem(h, 0);
  await h.advance(10000);

  assert.equal(h.tiktok.isPlayerOpen(), false);
  assert.equal(h.window.location.pathname, "/@me");
  assert.equal(h.tiktok.eventsOf("open-ignored").length, 1);
});

test("failure mode: the URL changes but the current row never mounts", async (t) => {
  const items = repostItems(3).map((it, i) => (i === 0 ? { ...it, rowDelayMs: Infinity } : it));
  const h = await reposts(t, { items });
  await openItem(h, 0);
  await h.advance(10000);

  assert.equal(h.tiktok.currentId(), items[0].id);
  assert.equal(currentRow(h), null);
  assert.deepEqual(h.tiktok.rowIds(), [items[1].id]);
});

test("failure mode: a grid click can open a different item than the one clicked", async (t) => {
  const base = repostItems(3);
  const items = base.map((it, i) => (i === 0 ? { ...it, opensAs: base[1].id } : it));
  const h = await reposts(t, { items });
  await openItem(h, 0);

  assert.equal(h.tiktok.currentId(), items[1].id);
  assert.ok(currentRow(h));
});

test("failure mode: stale grid entries open without repost tags", async (t) => {
  const items = repostItems(2).map((it, i) => (i === 0 ? { ...it, stale: true } : it));
  const h = await reposts(t, { items });
  assert.equal(h.tiktok.gridIds()[0], items[0].id);
  await openItem(h, 0);

  assert.equal(h.tiktok.server.isReposted(items[0].id), false);
  assert.deepEqual(tagsIn(currentRow(h)), { tag: 0, action: 0 });
});

test("UI changed: the reposts tab can be missing entirely", async (t) => {
  const h = await page(t, { missingRepostTab: true });
  assert.equal($(h, '[data-e2e="repost-tab"]'), null);
  assert.equal($$(h, 'p[role="tab"]').length, 4);
  assert.ok(!$$(h, 'p[role="tab"]').some((n) => /compartid/i.test(n.textContent)));
});

test("UI changed: the reposts tab can lose its data-e2e but still read Compartidos", async (t) => {
  const h = await page(t, { repostTabWithoutE2e: true });
  assert.equal($(h, '[data-e2e="repost-tab"]'), null);
  const tab = $$(h, 'p[role="tab"]').find((n) => n.textContent === "Compartidos");
  assert.ok(tab);

  syntheticClick(tab);
  assert.equal(tab.getAttribute("aria-selected"), "true");
  assert.equal(h.tiktok.selectedTab(), "reposts");
});

test("UI changed: the grid can render without its data-e2e hooks", async (t) => {
  const h = await page(t, { missingGrid: true });
  syntheticClick($(h, '[data-e2e="repost-tab"]'));
  await h.advance(3000);

  assert.equal($(h, '[data-e2e="user-repost-item-list"]'), null);
  assert.equal($(h, '[data-e2e="user-repost-item"]'), null);
  // Los links siguen ahí: solo cambiaron los hooks.
  assert.equal(h.tiktok.gridIds().length, 5);
});

test("confirm-dialog variant: the flip waits for the dialog's confirm button", async (t) => {
  const h = await reposts(t, { confirmDialog: true });
  const id = h.tiktok.server.reposts[0].id;
  await openItem(h, 0);

  syntheticClick(currentRow(h).querySelector('[data-e2e="repost-action-tag"]'));
  await h.advance(150);
  const dialogs = $$(h, '[role="dialog"]');
  assert.equal(dialogs.length, 2);
  // El reproductor sigue siendo el primer [aria-modal="true"] del documento.
  assert.equal($(h, '[aria-modal="true"]'), dialogs[0]);
  await h.advance(1000);
  assert.equal(h.tiktok.server.isReposted(id), true);
  // Un click fuera del diálogo mientras está abierto queda marcado.
  syntheticClick(currentRow(h).querySelector('[data-e2e="repost-action-tag"]'));
  assert.deepEqual(h.tiktok.eventsOf("click-outside-dialog").map((e) => e.e2e), ["repost-action-tag"]);
  assert.deepEqual(h.tiktok.server.toggleLog.map((e) => e.dialogOpen), [false, true]);
  await h.advance(150);

  const confirm = Array.from($$(h, '[role="dialog"]')[1].querySelectorAll("button")).find((b) => b.textContent === "Quitar");
  syntheticClick(confirm);
  await h.advance(170);
  assert.equal(h.tiktok.server.isReposted(id), false);
  assert.deepEqual(tagsIn(currentRow(h)), { tag: 0, action: 0 });
  assert.equal(h.tiktok.dialogOpen(), false);
});
