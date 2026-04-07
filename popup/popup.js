/**
 * popup.js - Browser action popup for Visual Tab Manager
 */

const { normalizeLanguage, normalizeTheme, t: translate, applyTranslations } = globalThis.VTM_UI;

const state = {
  currentTab: null,
  currentHostname: null,
  theme: "mrrobot",
  language: "en"
};

const dom = {
  domainName: document.getElementById("domainName"),
  statusDot: document.getElementById("statusDot"),
  selectorPreview: document.getElementById("selectorPreview"),
  noSelectorText: document.getElementById("noSelectorText"),
  tabsCountRow: document.getElementById("tabsCountRow"),
  tabsCount: document.getElementById("tabsCount"),
  btnPicker: document.getElementById("btnPicker"),
  btnCapture: document.getElementById("btnCapture"),
  btnManager: document.getElementById("btnManager"),
  btnSettings: document.getElementById("btnSettings"),
  btnClear: document.getElementById("btnClear"),
  toast: document.getElementById("toast"),
  modeTab: document.querySelector('#modeTab input'),
  modeWindow: document.querySelector('#modeWindow input')
};

async function init() {
  try {
    const settings = await getRuntimeSettings();
    state.theme = normalizeTheme(settings.theme);
    state.language = normalizeLanguage(settings.language);

    applyLocale();
    applyTheme();

    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    state.currentTab = tabs[0] || null;

    if (!state.currentTab || !state.currentTab.url) {
      dom.domainName.textContent = t("popup.unavailable");
      dom.domainName.style.color = "var(--text-muted)";
      return;
    }

    try {
      state.currentHostname = new URL(state.currentTab.url).hostname;
    } catch {
      dom.domainName.textContent = t("popup.notWebPage");
      dom.domainName.style.color = "var(--text-muted)";
      return;
    }

    dom.domainName.textContent = state.currentHostname;

    const selectorResponse = await browser.runtime.sendMessage({
      type: "GET_SELECTOR",
      hostname: state.currentHostname
    });

    if (selectorResponse?.ok && selectorResponse.selector) {
      showHasSelector(selectorResponse.selector);

      browser.tabs.sendMessage(state.currentTab.id, { type: "CAPTURE_NOW", source: "auto" })
        .catch(async () => {
          try {
            await browser.scripting.executeScript({
              target: { tabId: state.currentTab.id },
              files: ["content/content-autocapture.js"]
            });
            await browser.tabs.sendMessage(state.currentTab.id, { type: "CAPTURE_NOW", source: "auto" });
          } catch {
            // Ignore background capture warmup failures in the popup.
          }
        });
    } else {
      showNoSelector();
    }

    const tabsResponse = await browser.runtime.sendMessage({
      type: "GET_TABS_FOR_HOST",
      hostname: state.currentHostname
    });

    if (tabsResponse?.ok && Array.isArray(tabsResponse.tabs) && tabsResponse.tabs.length > 0) {
      dom.tabsCountRow.classList.add("show");
      dom.tabsCount.textContent = String(tabsResponse.tabs.length);
    }

    if (settings.managerMode === "window") {
      dom.modeWindow.checked = true;
    } else {
      dom.modeTab.checked = true;
    }
  } catch (error) {
    console.error("[VTM Popup] Init error:", error);
    toast(t("common.errorPrefix") + error.message, "error");
  }
}

async function getRuntimeSettings() {
  try {
    const response = await browser.runtime.sendMessage({ type: "GET_SETTINGS" });
    return response?.ok ? response.settings || {} : {};
  } catch {
    return {};
  }
}

function t(key, vars) {
  return translate(state.language, key, vars);
}

function applyLocale() {
  document.documentElement.lang = state.language;
  document.title = t("popup.pageTitle");
  applyTranslations(document, state.language);
}

function applyTheme() {
  document.body.classList.remove("dark", "light", "mrrobot");
  document.body.classList.add(state.theme);
}

function showHasSelector(selector) {
  dom.statusDot.classList.add("active");
  dom.selectorPreview.textContent = selector;
  dom.selectorPreview.style.display = "block";
  dom.noSelectorText.style.display = "none";
  dom.btnClear.style.display = "flex";
  dom.btnCapture.style.display = "flex";
}

function showNoSelector() {
  dom.statusDot.classList.remove("active");
  dom.selectorPreview.style.display = "none";
  dom.noSelectorText.style.display = "block";
  dom.btnClear.style.display = "none";
  dom.btnCapture.style.display = "none";
}

function setCaptureButtonLoading(isLoading) {
  dom.btnCapture.disabled = isLoading;
  const content = [];

  if (isLoading) {
    const loader = document.createElement("span");
    loader.className = "loader";
    content.push(loader, document.createTextNode(` ${t("popup.captureInProgress")}`));
  } else {
    const icon = document.createElement("span");
    icon.className = "btn-icon";
    icon.textContent = "📸";

    const label = document.createElement("span");
    label.textContent = t("popup.captureNow");

    content.push(icon, label);
  }

  dom.btnCapture.replaceChildren(...content);
}

dom.btnPicker.addEventListener("click", async () => {
  if (!state.currentTab || !state.currentHostname) {
    toast(t("popup.noActiveTab"), "error");
    return;
  }

  if (!state.currentTab.url.startsWith("http://") && !state.currentTab.url.startsWith("https://")) {
    toast(t("popup.httpOnly"), "warning");
    return;
  }

  try {
    await browser.runtime.sendMessage({
      type: "ACTIVATE_PICKER",
      tabId: state.currentTab.id
    });
  } catch (error) {
    console.error("[VTM Popup] Picker error:", error);
  }

  window.close();
});

dom.btnManager.addEventListener("click", async () => {
  const params = state.currentHostname ? `host=${encodeURIComponent(state.currentHostname)}` : "";
  await browser.runtime.sendMessage({ type: "OPEN_MANAGER", params });
  window.close();
});

dom.btnSettings.addEventListener("click", async () => {
  await browser.runtime.sendMessage({ type: "OPEN_MANAGER", params: "tab=settings" });
  window.close();
});

dom.btnClear.addEventListener("click", async () => {
  if (!state.currentHostname) return;
  if (!confirm(t("popup.deleteSelectorConfirm", { hostname: state.currentHostname }))) return;

  const response = await browser.runtime.sendMessage({
    type: "DELETE_SELECTOR",
    hostname: state.currentHostname
  });

  if (response?.ok) {
    showNoSelector();
    toast(t("popup.selectorDeleted"));
  } else {
    toast(t("common.errorPrefix") + (response?.error || "unknown"), "error");
  }
});

dom.btnCapture.addEventListener("click", async () => {
  if (!state.currentTab || !state.currentHostname) {
    toast(t("popup.noActiveTab"), "error");
    return;
  }

  setCaptureButtonLoading(true);

  try {
    let result;

    try {
      result = await browser.tabs.sendMessage(state.currentTab.id, {
        type: "CAPTURE_NOW",
        source: "manual"
      });
    } catch {
      await browser.scripting.executeScript({
        target: { tabId: state.currentTab.id },
        files: ["content/content-autocapture.js"]
      });
      result = await browser.tabs.sendMessage(state.currentTab.id, {
        type: "CAPTURE_NOW",
        source: "manual"
      });
    }

    if (result?.ok) {
      toast(t("popup.captureSaved"));
    } else {
      toast(t("popup.captureFailed"), "warning");
    }
  } catch (error) {
    toast(t("common.errorPrefix") + error.message, "error");
  } finally {
    setCaptureButtonLoading(false);
  }
});

dom.modeTab.addEventListener("change", () => saveModePreference("tab"));
dom.modeWindow.addEventListener("change", () => saveModePreference("window"));

async function saveModePreference(mode) {
  await browser.runtime.sendMessage({
    type: "SAVE_SETTING",
    key: "managerMode",
    value: mode
  });
}

browser.runtime.onMessage.addListener((message) => {
  if (message.type === "SELECTOR_PICKED_NOTIFY") {
    showHasSelector(message.selector);
    toast(t("popup.elementPicked", { selector: message.selector }));
  }
});

let toastTimer = null;
function toast(message, type = "") {
  dom.toast.textContent = message;
  dom.toast.className = "toast" + (type ? ` ${type}` : "");
  dom.toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => dom.toast.classList.remove("show"), 2800);
}

init();
