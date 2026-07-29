/* ============================================================
   popup.js — v4.0 Bilingüe (ES/EN)
   El idioma elegido se guarda en chrome.storage.local y se
   sincroniza con content.js para los mensajes de estado.
   ============================================================ */

/* ============================================================
   💰 TU LINK DE DONACIÓN
   ============================================================ */
const DONATION_URL = "https://www.paypal.com/paypalme/aledellabianca";

/* ============================================================
   🇦🇷 TU ALIAS DE DOLARAPP — el botón lo copia al portapapeles
   ============================================================ */
const DOLARAPP_ALIAS = "eldella123.dolarapp";

/* ============================================================
   🌐 TRADUCCIONES DE LA INTERFAZ
   Para agregar otro idioma: copiá un bloque, traducilo y
   agregá el botón correspondiente en popup.html (.lang)
   ============================================================ */
const UI = {
  es: {
    appTitle: "Limpiador de Reposts",
    tagFree: "GRATIS",
    subtitle: "Modo cadena con reintentos automáticos y repesca de fallidos.",
    statusIdle: "Inactivo",
    statusRunning: "Limpiando…",
    statusDone: "Completado ✔",
    statusNoConn: "Sin conexión",
    hintIdle: 'Abrí tu perfil en tiktok.com, pestaña "Republicaciones", y tocá Iniciar.',
    hintRunning: "Procesando en cadena, no cierres la pestaña.",
    hintNoConn: 'Abrí tu perfil en tiktok.com (pestaña "Republicaciones") y recargá la página.',
    hintOpenProfile: "Primero abrí tu perfil en tiktok.com.",
    pendingLabel: "En repesca:",
    rescuedLabel: "Rescatados:",
    speedSafe: "Seguro",
    speedFast: "Rápido",
    speedTurbo: "Turbo",
    startBtn: "Iniciar limpieza",
    stopBtn: "Detener",
    donateText: "Herramienta 100% gratuita, hoy y siempre.<br>Si te ahorró horas, invitame un cafecito ☕<br><span style=\"font-size:9.5px;opacity:0.75\">DolarApp acepta USD y EUR desde cualquier país 🌎</span>",
    donateBtn: "Donar por PayPal",
    thanksMsg: "¡Gracias por usar nuestra extensión! 💛 Si querés ayudarnos a mantenerla gratis, abajo podés donarnos 👇",
    footer: "Usalo con tu propia cuenta · Turbo aumenta el riesgo de límite temporal de TikTok"
  },
  en: {
    appTitle: "Reposts Cleaner",
    tagFree: "FREE",
    subtitle: "Chain mode with automatic retries and rescue passes for failed items.",
    statusIdle: "Idle",
    statusRunning: "Cleaning…",
    statusDone: "Completed ✔",
    statusNoConn: "Not connected",
    hintIdle: 'Open your profile on tiktok.com, go to the "Reposts" tab, and hit Start.',
    hintRunning: "Processing in chain mode, don't close the tab.",
    hintNoConn: 'Open your profile on tiktok.com ("Reposts" tab) and reload the page.',
    hintOpenProfile: "First open your profile on tiktok.com.",
    pendingLabel: "In rescue queue:",
    rescuedLabel: "Rescued:",
    speedSafe: "Safe",
    speedFast: "Fast",
    speedTurbo: "Turbo",
    startBtn: "Start cleaning",
    stopBtn: "Stop",
    donateText: "100% free tool, today and always.<br>If it saved you hours, buy me a coffee ☕<br><span style=\"font-size:9.5px;opacity:0.75\">DolarApp accepts USD and EUR from any country 🌎</span>",
    donateBtn: "Donate via PayPal",
    thanksMsg: "Thanks for using our extension! 💛 If you'd like to help us keep it free, you can donate below 👇",
    footer: "Use it with your own account · Turbo increases the risk of a temporary TikTok limit"
  }
};

let currentLang = "es";
const ui = (key) => (UI[currentLang] || UI.es)[key];

const startBtn = document.getElementById("startBtn");
const stopBtn = document.getElementById("stopBtn");
const donateBtn = document.getElementById("donateBtn");
const donateText = document.getElementById("donateText");
const statusText = document.getElementById("statusText");
const removedCount = document.getElementById("removedCount");
const pendingCount = document.getElementById("pendingCount");
const rescuedCount = document.getElementById("rescuedCount");
const hintText = document.getElementById("hintText");
const dot = document.getElementById("dot");
const ring = document.getElementById("ring");
const statusLine = document.getElementById("statusLine");
const speedGroup = document.getElementById("speedGroup");
const langGroup = document.getElementById("langGroup");
const appTitle = document.getElementById("appTitle");

let selectedSpeed = "rapido";
let lastRemoved = 0;
let lastRunning = null;

/* ------------------------------------------------------------
   🌐 Aplicar idioma a toda la interfaz
   ------------------------------------------------------------ */
function applyLanguage(lang) {
  if (!UI[lang]) return;
  currentLang = lang;

  // Textos estáticos marcados con data-i18n
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const key = el.dataset.i18n;
    if (UI[lang][key] !== undefined) el.textContent = UI[lang][key];
  });

  // Casos especiales
  appTitle.textContent = ui("appTitle");
  donateText.innerHTML = ui("donateText"); // contiene <br>, texto propio seguro
  document.documentElement.lang = lang;

  // Resaltar el botón de idioma activo
  langGroup.querySelectorAll("button").forEach((b) => {
    b.classList.toggle("active", b.dataset.lang === lang);
  });

  // Refrescar los textos dinámicos de estado
  lastRunning = null; // fuerza re-render completo en el próximo poll
  pollStatus();
}

/* ------------------------------------------------------------
   Pestaña activa (debe ser tiktok.com)
   ------------------------------------------------------------ */
async function getTikTokTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url || !tab.url.includes("tiktok.com")) return null;
  return tab;
}

/* ------------------------------------------------------------
   Mensajería con reinyección automática del content script
   ------------------------------------------------------------ */
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

/* ------------------------------------------------------------
   Render del estado
   ------------------------------------------------------------ */
function renderStatus(status) {
  if (!status) {
    statusText.textContent = ui("statusNoConn");
    statusText.style.color = "var(--text-dim)";
    dot.classList.remove("on");
    ring.classList.remove("spinning");
    hintText.textContent = ui("hintNoConn");
    return;
  }

  // Contador principal con "bump"
  const n = status.removed ?? 0;
  if (n !== lastRemoved) {
    removedCount.textContent = n;
    removedCount.classList.remove("bump");
    void removedCount.offsetWidth;
    removedCount.classList.add("bump");
    // 💥 Onda expansiva del anillo con cada borrado
    ring.classList.remove("zap");
    void ring.offsetWidth;
    ring.classList.add("zap");
    lastRemoved = n;
  }

  pendingCount.textContent = status.pending ?? 0;
  rescuedCount.textContent = status.rescued ?? 0;

  // Sincronizar velocidad
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
    statusText.textContent = status.finished ? ui("statusDone") : ui("statusIdle");
    statusText.style.color = status.finished ? "var(--cyan)" : "var(--text-dim)";
    dot.classList.remove("on");
    ring.classList.remove("spinning");
    statusLine.classList.add("idle");
    hintText.textContent = status.message || ui("hintIdle");
    startBtn.disabled = false;
    stopBtn.disabled = true;
  }
  lastRunning = status.running;
}

/* ------------------------------------------------------------
   Polling de estado
   ------------------------------------------------------------ */
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

/* ------------------------------------------------------------
   🌐 Cargar idioma guardado al abrir el popup
   ------------------------------------------------------------ */
chrome.storage.local.get({ lang: "es" }, (data) => {
  applyLanguage(UI[data.lang] ? data.lang : "es");
});

/* ------------------------------------------------------------
   🌐 Cambio de idioma: guarda y sincroniza con content.js
   ------------------------------------------------------------ */
langGroup.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-lang]");
  if (!btn || btn.dataset.lang === currentLang) return;

  const lang = btn.dataset.lang;
  applyLanguage(lang);
  chrome.storage.local.set({ lang });

  const tab = await getTikTokTab();
  if (tab) sendToContent(tab.id, { action: "SET_LANG", lang });
});

/* ------------------------------------------------------------
   Selector de velocidad
   ------------------------------------------------------------ */
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

/* ------------------------------------------------------------
   Iniciar / Detener
   ------------------------------------------------------------ */
/* ------------------------------------------------------------
   💛 Toast de agradecimiento al iniciar la limpieza
   ------------------------------------------------------------ */
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
  await sendToContent(tab.id, { action: "START", speed: selectedSpeed, lang: currentLang });
  showThanks();
  pollStatus();
});

stopBtn.addEventListener("click", async () => {
  const tab = await getTikTokTab();
  if (!tab) return;
  await sendToContent(tab.id, { action: "STOP" });
  pollStatus();
});

/* ------------------------------------------------------------
   Donaciones
   ------------------------------------------------------------ */
donateBtn.addEventListener("click", () => {
  chrome.tabs.create({ url: DONATION_URL });
});


/* ============================================================
   🌊 EFECTO RIPPLE
   ============================================================ */
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
    // blanco por defecto sobre el degradado
  } else {
    ripple.classList.add("cyan");
  }

  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
  ripple.style.top = `${e.clientY - rect.top - size / 2}px`;

  btn.appendChild(ripple);
  ripple.addEventListener("animationend", () => ripple.remove());
});
