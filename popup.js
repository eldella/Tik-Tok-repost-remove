const DONATION_URL = "https://www.paypal.com/paypalme/aledellabianca";
const KOFI_URL = "https://ko-fi.com/eldella";
const REVIEW_URL =
  "https://chromewebstore.google.com/detail/tik-tok-repost-remove/pklefombbanocnjepciiekdplmogdlic/reviews";

// El pedido de reseña solo aparece con una pasada terminada y un piso de
// reposts borrados: sin resultado a la vista, pedir estrellas es ruido.
const RATE_MIN_REMOVED = 5;
const RATE_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

// DolarApp no usa el mismo alias para USD/EUR que para ARS, por eso el
// popup deja elegir moneda. Sin emoji de bandera: en Windows los
// regional-indicator caen a texto plano ("AR", "US") en vez de mostrar
// la bandera, y el segmented control de arriba ya deja clara la moneda.
const DOLARAPP_ACCOUNTS = {
  ars: { fields: [["dolarappAlias", "eldella123.dolarapp"]] },
  usd: {
    fields: [
      ["dolarappRouting", "101019644"],
      ["dolarappAccount", "214709039349"]
    ]
  },
  eur: { fields: [["dolarappIban", "LU15 4080 0000 4791 0971"]] }
};

// appTitle es la marca y va igual en los dos idiomas. El nombre largo y
// traducido de la Chrome Web Store vive en _locales/*/messages.json (appName).
const UI = {
  es: {
    appTitle: "TikTok Repost Remover",
    tagFree: "GRATIS",
    subtitle: "Modo cadena con reintentos automáticos y repesca de fallidos.",
    statusIdle: "Inactivo",
    statusRunning: "Limpiando…",
    statusDone: "Completado ✔",
    statusDonePending: "Terminado con pendientes",
    statusFailed: "Sin eliminar: revisá a mano",
    statusNoConn: "Sin conexión",
    hintIdle: 'Abrí tu perfil en tiktok.com, pestaña "Republicaciones", y tocá Iniciar.',
    hintRunning: "Procesando en cadena, no cierres la pestaña.",
    hintNoConn: 'Abrí tu perfil en tiktok.com (pestaña "Republicaciones") y recargá la página.',
    hintOpenProfile: "Primero abrí tu perfil en tiktok.com.",
    pendingLabel: "En repesca:",
    pendingLabelDone: "No eliminados:",
    rescuedLabel: "Rescatados:",
    speedSafe: "Seguro",
    speedFast: "Rápido",
    speedTurbo: "Turbo",
    startBtn: "Iniciar limpieza",
    stopBtn: "Detener",
    donateText: "Herramienta 100% gratuita, hoy y siempre.<br>Si te ahorró horas, invitame un cafecito ☕<br><span style=\"font-size:9.5px;opacity:0.75\">DolarApp acepta USD y EUR desde cualquier país 🌎</span>",
    donateBtn: "Donar por PayPal",
    kofiBtn: "Ko-fi",
    dolarappAlias: "Alias",
    dolarappRouting: "ABA/Routing",
    dolarappAccount: "Cuenta",
    dolarappIban: "IBAN",
    thanksMsg: "¡Gracias por usar nuestra extensión! 💛 Si querés ayudarnos a mantenerla gratis, abajo podés donarnos 👇",
    rateTitle: "¿Te sirvió la extensión?",
    rateBody: "Acabás de limpiar <b>{n}</b> reposts. Una valoración en la Chrome Web Store ayuda a que otros la encuentren.",
    rateNowBtn: "Valorar en la Chrome Web Store",
    rateLaterBtn: "Ahora no",
    footer: "Usalo con tu propia cuenta · Turbo aumenta el riesgo de límite temporal de TikTok"
  },
  en: {
    appTitle: "TikTok Repost Remover",
    tagFree: "FREE",
    subtitle: "Chain mode with automatic retries and rescue passes for failed items.",
    statusIdle: "Idle",
    statusRunning: "Cleaning…",
    statusDone: "Completed ✔",
    statusDonePending: "Finished with pending",
    // Corto a propósito: "Nothing removed: check manually" partía la línea de
    // estado en dos en el popup de 350px y empujaba todo el panel hacia abajo.
    statusFailed: "None removed: check them",
    statusNoConn: "Not connected",
    hintIdle: 'Open your profile on tiktok.com, go to the "Reposts" tab, and hit Start.',
    hintRunning: "Processing in chain mode, don't close the tab.",
    hintNoConn: 'Open your profile on tiktok.com ("Reposts" tab) and reload the page.',
    hintOpenProfile: "First open your profile on tiktok.com.",
    pendingLabel: "In rescue queue:",
    pendingLabelDone: "Not removed:",
    rescuedLabel: "Rescued:",
    speedSafe: "Safe",
    speedFast: "Fast",
    speedTurbo: "Turbo",
    startBtn: "Start cleaning",
    stopBtn: "Stop",
    donateText: "100% free tool, today and always.<br>If it saved you hours, buy me a coffee ☕<br><span style=\"font-size:9.5px;opacity:0.75\">DolarApp accepts USD and EUR from any country 🌎</span>",
    donateBtn: "Donate via PayPal",
    kofiBtn: "Ko-fi",
    dolarappAlias: "Alias",
    dolarappRouting: "ABA/Routing",
    dolarappAccount: "Account",
    dolarappIban: "IBAN",
    thanksMsg: "Thanks for using our extension! 💛 If you'd like to help us keep it free, you can donate below 👇",
    rateTitle: "Did the extension help?",
    rateBody: "You just cleaned <b>{n}</b> reposts. A review on the Chrome Web Store helps other people find it.",
    rateNowBtn: "Rate on the Chrome Web Store",
    rateLaterBtn: "Not now",
    footer: "Use it with your own account · Turbo increases the risk of a temporary TikTok limit"
  }
};

let currentLang = "es";
const ui = (key) => (UI[currentLang] || UI.es)[key];

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const donateBtn = document.getElementById("donateBtn");
const kofiBtn = document.getElementById("kofiBtn");
const donateText = document.getElementById("donateText");
const statusText = document.getElementById("statusText");
const removedCount = document.getElementById("removedCount");
const pendingCount = document.getElementById("pendingCount");
// Se toma una sola vez al cargar: renderStatus le cambia la clave data-i18n,
// así que después ya no respondería a este selector.
const pendingLabel = document.querySelector('[data-i18n="pendingLabel"]');
const rescuedCount = document.getElementById("rescuedCount");
const hintText = document.getElementById("hintText");
const dot = document.getElementById("dot");
const ring = document.getElementById("ring");
const statusLine = document.getElementById("statusLine");
const speedGroup = document.getElementById("speedGroup");
const langGroup = document.getElementById("langGroup");
const appTitle = document.getElementById("appTitle");
const dolarappTabs = document.getElementById("dolarappTabs");
const dolarappSlider = document.getElementById("dolarappSlider");
const dolarappChip = document.getElementById("dolarappChip");

let selectedCurrency = "ars";

function positionDolarappSlider(btn) {
  if (!btn) return;
  dolarappSlider.style.width = `${btn.offsetWidth}px`;
  dolarappSlider.style.transform = `translateX(${btn.offsetLeft - 2}px)`;
}

// Crossfade corto al cambiar de moneda en vez de reemplazar el contenido
// de golpe, para evitar el salto brusco del chip.
function renderDolarapp() {
  const swap = () => {
    const acc = DOLARAPP_ACCOUNTS[selectedCurrency];
    const fieldsHtml = acc.fields
      .map(([labelKey, value]) => `<div>${ui(labelKey)}: <b>${value}</b></div>`)
      .join("");
    dolarappChip.innerHTML = `<span class="fields">${fieldsHtml}</span>`;
    dolarappChip.classList.remove("swap");
  };
  if (!dolarappChip.innerHTML.trim()) {
    swap();
  } else {
    dolarappChip.classList.add("swap");
    setTimeout(swap, 180);
  }
}

dolarappTabs.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-currency]");
  if (!btn) return;
  selectedCurrency = btn.dataset.currency;
  dolarappTabs.querySelectorAll("button").forEach((b) => b.classList.toggle("active", b === btn));
  positionDolarappSlider(btn);
  renderDolarapp();
});
positionDolarappSlider(dolarappTabs.querySelector(".active"));

const ratePrompt = document.getElementById("ratePrompt");
const rateBody = document.getElementById("rateBody");
const rateNowBtn = document.getElementById("rateNowBtn");
const rateLaterBtn = document.getElementById("rateLaterBtn");
const wrapEl = document.querySelector(".wrap");

let rateState = { rated: false, snoozeUntil: 0 };
let ratePromptShown = false;
let rateRemoved = 0;
let rateReturnFocus = null;

let rateStateLoaded = false;
chrome.storage.local.get({ rateState: null }, (data) => {
  if (data.rateState) rateState = { ...rateState, ...data.rateState };
  rateStateLoaded = true;
});

function persistRateState(patch) {
  rateState = { ...rateState, ...patch };
  chrome.storage.local.set({ rateState });
}

function renderRateBody(n) {
  rateBody.innerHTML = ui("rateBody").replace("{n}", n);
}

// Mostrarlo ya cuenta como un intento: si cierran el popup sin responder,
// el snooze corto evita que el pedido vuelva a saltar en la próxima apertura.
function maybeShowRatePrompt(removedNow) {
  if (!rateStateLoaded || ratePromptShown || rateState.rated) return;
  if (removedNow < RATE_MIN_REMOVED) return;
  if (Date.now() < rateState.snoozeUntil) return;

  ratePromptShown = true;
  rateRemoved = removedNow;
  renderRateBody(rateRemoved);

  // inert saca el panel de abajo del orden de tabulación y del árbol de
  // accesibilidad de una sola vez, así que no hace falta trampa de foco.
  rateReturnFocus = document.activeElement;
  wrapEl.inert = true;
  ratePrompt.classList.add("show");
  rateNowBtn.focus({ preventScroll: true });

  persistRateState({ snoozeUntil: Date.now() + RATE_SNOOZE_MS / 3 });
}

function closeRatePrompt() {
  if (!ratePrompt.classList.contains("show")) return;
  ratePrompt.classList.remove("show");
  wrapEl.inert = false;
  if (rateReturnFocus && rateReturnFocus.focus) {
    rateReturnFocus.focus({ preventScroll: true });
  }
}

rateNowBtn.addEventListener("click", () => {
  persistRateState({ rated: true });
  closeRatePrompt();
  chrome.tabs.create({ url: REVIEW_URL });
});

rateLaterBtn.addEventListener("click", () => {
  persistRateState({ snoozeUntil: Date.now() + RATE_SNOOZE_MS });
  closeRatePrompt();
});

// Escape se lee como "ahora no", no como "no me lo muestres más".
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape" || !ratePrompt.classList.contains("show")) return;
  e.preventDefault();
  persistRateState({ snoozeUntil: Date.now() + RATE_SNOOZE_MS });
  closeRatePrompt();
});

let selectedSpeed = "rapido";
let lastRemoved = 0;
let lastRunning = null;

function applyLanguage(lang) {
  if (!UI[lang]) return;
  currentLang = lang;

  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (UI[lang][key] !== undefined) el.textContent = UI[lang][key];
  });

  appTitle.textContent = ui("appTitle");
  donateText.innerHTML = ui("donateText");
  if (ratePromptShown) renderRateBody(rateRemoved);
  renderDolarapp();
  document.documentElement.lang = lang;

  langGroup.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === lang);
  });

  lastRunning = null;
  pollStatus();
}

async function getTikTokTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return null;
  // Chequeo de hostname real, no substring: un ".includes('tiktok.com')"
  // deja pasar cualquier URL que solo contenga ese texto (ej. un query
  // param en un sitio ajeno), habilitando inyectar content.js fuera de
  // TikTok vía el fallback de executeScript de abajo.
  let hostname;
  try {
    hostname = new URL(tab.url).hostname;
  } catch (e) {
    return null;
  }
  if (hostname !== "www.tiktok.com") return null;
  return tab;
}

async function sendToContent(tabId, message) {
  try {
    return await chrome.tabs.sendMessage(tabId, message);
  } catch (e) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["content.js"]
      });
      return await chrome.tabs.sendMessage(tabId, message);
    } catch (e2) {
      return null;
    }
  }
}

function renderStatus(status) {
  if (!status) {
    statusText.textContent = ui("statusNoConn");
    statusText.style.color = "var(--text-dim)";
    dot.classList.remove("on");
    ring.classList.remove("spinning");
    hintText.textContent = ui("hintNoConn");
    return;
  }

  const n = status.removed ?? 0;
  if (n !== lastRemoved) {
    removedCount.textContent = n;
    removedCount.classList.remove("bump");
    void removedCount.offsetWidth;
    removedCount.classList.add("bump");
    ring.classList.remove("zap");
    void ring.offsetWidth;
    ring.classList.add("zap");
    lastRemoved = n;
  }

  const pending = status.pending ?? 0;
  const finished = !status.running && !!status.finished;
  pendingCount.textContent = pending;
  rescuedCount.textContent = status.rescued ?? 0;

  // Terminada la corrida ya no queda nada en repesca: ese número pasa a ser
  // lo que no se pudo eliminar. Se cambia la clave data-i18n y no solo el
  // texto para que applyLanguage traduzca la etiqueta correcta.
  const pendingKey = finished ? "pendingLabelDone" : "pendingLabel";
  if (pendingLabel && pendingLabel.dataset.i18n !== pendingKey) {
    pendingLabel.dataset.i18n = pendingKey;
    pendingLabel.textContent = ui(pendingKey);
  }

  if (status.speed && status.speed !== selectedSpeed) {
    selectedSpeed = status.speed;
    highlightSpeed(selectedSpeed);
  }

  if (status.running) {
    statusText.textContent = ui("statusRunning");
    statusText.style.color = "var(--cyan)";
    dot.classList.add("on");
    ring.classList.add("spinning");
    statusLine.classList.remove("idle");
    hintText.textContent = status.message || ui("hintRunning");
    startBtn.disabled = true;
    stopBtn.disabled = false;
  } else {
    // Que la corrida haya terminado no quiere decir que haya salido bien:
    // antes mostraba "Completado ✔" en cian aunque no hubiera quitado
    // ninguno y todos quedaran pendientes. Con pendientes va en ámbar.
    let headline = "statusIdle";
    let color = "var(--text-dim)";
    if (finished && pending > 0) {
      headline = n === 0 ? "statusFailed" : "statusDonePending";
      color = "var(--warn)";
    } else if (finished) {
      headline = "statusDone";
      color = "var(--cyan)";
    }
    statusText.textContent = ui(headline);
    statusText.style.color = color;
    dot.classList.remove("on");
    ring.classList.remove("spinning");
    statusLine.classList.add("idle");
    hintText.textContent = status.message || ui("hintIdle");
    // Entre Detener y la salida real del bucle, content.js rechaza START
    // para no dejar dos bucles clickeando el mismo reproductor: Iniciar
    // queda apagado y el hint muestra su "Deteniendo…" hasta que termine.
    startBtn.disabled = !!status.stopping;
    stopBtn.disabled = true;
    if (status.finished) maybeShowRatePrompt(n);
  }
  lastRunning = status.running;
}

async function pollStatus() {
  const tab = await getTikTokTab();
  if (!tab) {
    renderStatus(null);
    return;
  }
  const status = await sendToContent(tab.id, { action: "STATUS" });
  renderStatus(status);
}

setInterval(pollStatus, 800);

chrome.storage.local.get({ lang: "es" }, (data) => {
  applyLanguage(UI[data.lang] ? data.lang : "es");
});

langGroup.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-lang]");
  if (!btn || btn.dataset.lang === currentLang) return;

  const lang = btn.dataset.lang;
  applyLanguage(lang);
  chrome.storage.local.set({ lang });

  const tab = await getTikTokTab();
  if (tab) sendToContent(tab.id, { action: "SET_LANG", lang });
});

function highlightSpeed(speed) {
  speedGroup.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", b.dataset.speed === speed);
  });
}

speedGroup.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-speed]");
  if (!btn) return;
  selectedSpeed = btn.dataset.speed;
  highlightSpeed(selectedSpeed);

  const tab = await getTikTokTab();
  if (tab) sendToContent(tab.id, { action: "SET_SPEED", speed: selectedSpeed });
});

const thanksToast = document.getElementById("thanksToast");
const donateCard = document.querySelector(".donate");
let thanksTimer = null;

function showThanks() {
  thanksToast.textContent = ui("thanksMsg");
  thanksToast.classList.add("show");
  donateCard.classList.add("highlight");
  clearTimeout(thanksTimer);
  thanksTimer = setTimeout(() => {
    thanksToast.classList.remove("show");
    donateCard.classList.remove("highlight");
  }, 6000);
}

startBtn.addEventListener("click", async () => {
  const tab = await getTikTokTab();
  if (!tab) {
    hintText.textContent = ui("hintOpenProfile");
    return;
  }
  const res = await sendToContent(tab.id, { action: "START", speed: selectedSpeed, lang: currentLang });
  // Si START vuelve rechazado ({ ok: false, stopping: true }, el bucle
  // anterior todavía está frenando) o no llega, no arrancó nada y no se
  // agradece como si hubiera arrancado. El poll sigue igual y muestra
  // "Deteniendo…" hasta que Iniciar se pueda volver a usar.
  if (res && res.ok) showThanks();
  pollStatus();
});

stopBtn.addEventListener("click", async () => {
  const tab = await getTikTokTab();
  if (!tab) return;
  await sendToContent(tab.id, { action: "STOP" });
  pollStatus();
});

donateBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: DONATION_URL });
});

kofiBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: KOFI_URL });
});

document.addEventListener("pointerdown", (e) => {
  const btn = e.target.closest("button");
  if (!btn || btn.disabled) return;

  const rect = btn.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);

  const ripple = document.createElement("span");
  ripple.className = "ripple";

  if (btn.id === "stopBtn" || btn.id === "donateBtn") {
    ripple.classList.add("magenta");
  } else if (btn.id === "startBtn") {
    // sin clase: blanco por defecto sobre el degradado
  } else {
    ripple.classList.add("cyan");
  }

  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${e.clientY - rect.top - size / 2}px`;

  btn.appendChild(ripple);
  ripple.addEventListener("animationend", () => ripple.remove());
});
