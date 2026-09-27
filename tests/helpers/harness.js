"use strict";

// Carga content.js tal cual se publica dentro de una página jsdom, con un
// reloj falso y un chrome.* mínimo, para poder manejar el tiempo del bucle
// (sleeps, waitFor, esperas de TikTok) sin esperar de verdad.
//
// Uso:
//   const h = await loadContent({ url, html, storage, beforeLoad });
//   await h.send({ action: "START" });   // lo que el script le pasa a sendResponse
//   await h.advance(5000);                // avanza 5 s de tiempo falso
//   h.window, h.document, h.clock, h.storage, h.logs, h.jsdomErrors
//   h.close();                            // siempre, al terminar cada test
// close() dispara pagehide como Chrome y falla si jsdom reportó errores.
// Para simular un F5 con el TikTok falso, usar h.reload() del fixture.

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { JSDOM, VirtualConsole } = require("jsdom");
const FakeTimers = require("@sinonjs/fake-timers");

const ROOT = path.resolve(__dirname, "..", "..");
// Siempre el content.js de la raíz: dist/ es solo una copia para el zip.
const CONTENT_PATH = path.join(ROOT, "content.js");
const MANIFEST_PATH = path.join(ROOT, "manifest.json");

const DEFAULT_URL = "https://www.tiktok.com/@me";
const DEFAULT_HTML =
  '<!DOCTYPE html><html lang="es"><head><title>TikTok - Make Your Day</title></head><body></body></html>';
// Fecha fija y no la real: el espejo de la corrida guarda Date.now() y
// readInterruptedRun compara edades, así los tests dan siempre lo mismo.
const DEFAULT_NOW = Date.parse("2026-09-26T12:00:00.000Z");
const EXTENSION_ID = "harness-extension-id";

// Solo lo que usa content.js (y el fixture). Falsear performance o
// queueMicrotask dentro de jsdom rompe cosas internas de jsdom y no aporta.
const FAKED_TIMERS = ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"];

// Chrome serializa mensajes y respuestas como JSON: un test que reciba el
// objeto vivo podría ver cosas que la extensión real nunca recibe
// (undefined, funciones, nodos del DOM).
const cloneJson = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

// Deja correr las promesas pendientes (callbacks del storage, awaits) sin
// mover el reloj falso: setImmediate es el de Node, no el de la página.
const flushMicrotasks = () => new Promise((resolve) => setImmediate(resolve));

// Igual que chrome.storage.local: los callbacks llegan después, nunca en el
// mismo tick, y lo guardado es una copia.
function createStorageArea(initial) {
  const data = cloneJson(initial || {}) || {};
  const writes = [];
  const later = (fn) => Promise.resolve().then(fn);
  const pick = (keys) => {
    if (keys == null) return cloneJson(data);
    const out = {};
    if (typeof keys === "string") {
      if (keys in data) out[keys] = cloneJson(data[keys]);
    } else if (Array.isArray(keys)) {
      for (const key of keys) if (key in data) out[key] = cloneJson(data[key]);
    } else {
      for (const [key, fallback] of Object.entries(keys)) {
        out[key] = key in data ? cloneJson(data[key]) : cloneJson(fallback);
      }
    }
    return out;
  };
  const area = {
    get(keys, callback) {
      const result = pick(keys);
      if (typeof callback === "function") {
        later(() => callback(result));
        return undefined;
      }
      return Promise.resolve(result);
    },
    set(items, callback) {
      for (const [key, value] of Object.entries(items || {})) data[key] = cloneJson(value);
      writes.push(cloneJson(items));
      if (typeof callback === "function") {
        later(() => callback());
        return undefined;
      }
      return Promise.resolve();
    },
    remove(keys, callback) {
      for (const key of [].concat(keys)) delete data[key];
      if (typeof callback === "function") {
        later(() => callback());
        return undefined;
      }
      return Promise.resolve();
    }
  };
  return { area, data, writes };
}

// Huecos de jsdom que Chrome sí tiene y que content.js usa: scroll de la
// ventana y scrollIntoView. jsdom no hace layout, así que solo se registran;
// el fixture de TikTok los envuelve para simular el scroll infinito.
function installBrowserGaps(window) {
  const scrolls = [];
  const scrollTo = function scrollTo(a, b) {
    const top = a && typeof a === "object" ? Number(a.top) || 0 : Number(b) || 0;
    scrolls.push({ top, at: window.Date.now() });
  };
  window.scrollTo = scrollTo;
  window.scroll = scrollTo;
  window.scrollBy = function scrollBy() {};
  if (typeof window.Element.prototype.scrollIntoView !== "function") {
    window.Element.prototype.scrollIntoView = function scrollIntoView() {};
  }
  return scrolls;
}

// El mismo click sintético que humanClick() de content.js: los tests del
// fixture lo usan para comprobar qué acepta TikTok sin pasar por la extensión.
function syntheticClick(el) {
  const window = el.ownerDocument.defaultView;
  const opts = { bubbles: true, cancelable: true, view: window };
  el.dispatchEvent(new window.MouseEvent("mousedown", opts));
  el.dispatchEvent(new window.MouseEvent("mouseup", opts));
  el.dispatchEvent(new window.MouseEvent("click", opts));
}

async function loadContent(options = {}) {
  const {
    url = DEFAULT_URL,
    html = DEFAULT_HTML,
    storage = {},
    now = DEFAULT_NOW,
    beforeLoad = null,
    contentPath = CONTENT_PATH,
    echo = !!process.env.HARNESS_ECHO,
    // Por defecto close() falla si jsdom reportó errores; true solo para un
    // test que los provoque a propósito.
    allowJsdomErrors = false
  } = options;

  // Todo lo que la página escribe en consola queda en logs (content.js
  // loguea cada fallo); con HARNESS_ECHO=1 además se imprime.
  const logs = [];
  const jsdomErrors = [];
  const virtualConsole = new VirtualConsole();
  for (const level of ["log", "info", "warn", "error", "debug"]) {
    virtualConsole.on(level, (...args) => {
      logs.push({ level, args });
      if (echo) console[level]("[page]", ...args);
    });
  }
  // Un "not implemented" de jsdom (p. ej. una navegación real) casi siempre
  // es un error del fixture o un click que en Chrome haría otra cosa: queda
  // a la vista para que los tests lo puedan exigir vacío.
  virtualConsole.on("jsdomError", (err) => {
    jsdomErrors.push(err);
    if (echo) console.error("[jsdom]", err.message);
  });

  const dom = new JSDOM(html, {
    url,
    pretendToBeVisual: true,
    runScripts: "outside-only",
    virtualConsole
  });
  const { window } = dom;

  // El reloj va DENTRO de la ventana de jsdom: content.js corre con esa
  // ventana como global, así que sus setTimeout y Date.now son estos.
  // tickAsync cede el turno entre timer y timer con el setImmediate del
  // global si existe, y si no con su setTimeout real, que en Windows tarda
  // ~15 ms por vuelta. withGlobal lo toma en el momento, así que se le presta
  // el de Node solo durante esa llamada: la página nunca lo ve (en Chrome no
  // existe).
  window.setImmediate = setImmediate;
  const timers = FakeTimers.withGlobal(window);
  delete window.setImmediate;
  const clock = timers.install({ now, toFake: FAKED_TIMERS });

  const scrolls = installBrowserGaps(window);
  const storageArea = createStorageArea(storage);
  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, "utf8"));
  const listeners = [];

  window.chrome = {
    runtime: {
      id: EXTENSION_ID,
      lastError: undefined,
      getManifest: () => cloneJson(manifest),
      onMessage: {
        addListener: (fn) => listeners.push(fn),
        removeListener: (fn) => {
          const i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        },
        hasListener: (fn) => listeners.includes(fn)
      }
    },
    storage: { local: storageArea.area }
  };

  // El fixture arma la página antes de que corra el script, como en TikTok,
  // donde la extensión se inyecta con la página ya cargada.
  const fixture = beforeLoad ? await beforeLoad({ window, document: window.document, clock }) : undefined;

  const source = fs.readFileSync(contentPath, "utf8");
  vm.runInContext(source, dom.getInternalVMContext(), { filename: contentPath });
  // Deja llegar las lecturas iniciales del storage (idioma, espejo).
  await flushMicrotasks();

  // Como chrome.tabs.sendMessage: resuelve con lo que el listener pase a
  // sendResponse. Si ningún listener devuelve true y nadie responde, el canal
  // se cierra y llega undefined.
  function send(msg, sender = { id: EXTENSION_ID }) {
    if (listeners.length === 0) {
      return Promise.reject(new Error("content.js did not register a runtime.onMessage listener"));
    }
    return new Promise((resolve) => {
      let responded = false;
      const sendResponse = (payload) => {
        if (responded) return;
        responded = true;
        resolve(cloneJson(payload));
      };
      let keepOpen = false;
      for (const fn of listeners) {
        if (fn(cloneJson(msg), sender, sendResponse) === true) keepOpen = true;
      }
      if (!responded && !keepOpen) {
        responded = true;
        resolve(undefined);
      }
    });
  }

  const advance = (ms) => clock.tickAsync(ms);

  // Avanza el reloj de a stepMs hasta que predicate() dé algo truthy (puede
  // ser async). Falla si pasa timeoutMs de tiempo falso: un bucle trabado
  // tiene que romper el test, no colgarlo.
  async function until(predicate, { timeoutMs = 120000, stepMs = 100 } = {}) {
    const start = clock.now;
    for (;;) {
      const value = await predicate();
      if (value) return value;
      if (clock.now - start >= timeoutMs) {
        throw new Error(`until(): condition not met within ${timeoutMs} ms of fake time`);
      }
      await clock.tickAsync(stepMs);
    }
  }

  const status = () => send({ action: "STATUS" });

  // Espera a que no quede corrida viva (ni frenando). Devuelve el STATUS final.
  // Pasos de 250 ms, lo mismo que el sondeo de waitFor en content.js: más
  // finos solo hacen más lento el test sin cambiar el resultado.
  const waitForRunEnd = (opts) =>
    until(async () => {
      const s = await status();
      return !s.running && !s.stopping ? s : null;
    }, { stepMs: 250, ...opts });

  // Como Chrome al recargar o cerrar la pestaña: primero pagehide, con el
  // reloj falso todavía puesto (content.js manda ahí la escritura diferida
  // del espejo), y recién después se desarma la página. Sin el pagehide, un
  // test de recarga perdería justo la escritura que Chrome sí haría.
  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    try {
      const pagehide =
        typeof window.PageTransitionEvent === "function"
          ? new window.PageTransitionEvent("pagehide", { persisted: false })
          : new window.Event("pagehide");
      window.dispatchEvent(pagehide);
    } finally {
      clock.uninstall();
      window.close();
    }
    // Una excepción en un listener de la página o del fixture solo llega a
    // jsdomErrors: si no se exige vacío acá, un fixture roto (p. ej. al
    // alternar un tag) pasaría en silencio en cada test que no lo mire.
    if (jsdomErrors.length > 0 && !allowJsdomErrors) {
      const detail = jsdomErrors.map((err) => `- ${err.message}`).join("\n");
      throw new Error(`jsdom reported ${jsdomErrors.length} error(s) on this page:\n${detail}`);
    }
  }

  return {
    dom,
    window,
    document: window.document,
    clock,
    send,
    status,
    advance,
    until,
    waitForRunEnd,
    close,
    fixture,
    storage: storageArea.data,
    storageWrites: storageArea.writes,
    scrolls,
    logs,
    jsdomErrors,
    listenerCount: () => listeners.length,
    manifest
  };
}

module.exports = {
  loadContent,
  syntheticClick,
  flushMicrotasks,
  CONTENT_PATH,
  DEFAULT_URL,
  DEFAULT_NOW
};
