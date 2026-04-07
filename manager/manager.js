/**
 * manager.js - Dashboard for Visual Tab Manager
 */

const { normalizeLanguage, normalizeTheme, t: translate, applyTranslations } = globalThis.VTM_UI;

const VIEW_SETTINGS_KEY = "vtm_view_settings";

const state = {
  currentHostname: null,
  allThumbnails: [],
  filteredThumbnails: [],
  openTabUrls: new Set(),
  pageSize: 40,
  cardSize: 240,
  page: 0,
  searchQuery: "",
  theme: "mrrobot",
  language: "en",
  closedTabTTL: 1800000,
  captureDelay: 100
};

const PAGE_SIZE_LIMITS = Object.freeze({ min: 1, max: 1000, fallback: 40 });
const CAPTURE_DELAY_LIMITS = Object.freeze({ min: 0, max: 300000, fallback: 100 });
const CLOSED_TAB_TTL_MINUTES_LIMITS = Object.freeze({ min: 0, max: 525600, fallback: 30 });
const CARD_SIZE_OPTIONS = Object.freeze([180, 240, 300, 360]);
const MANAGER_POPUP_GUARD_INTERVAL_MS = 2000;

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

const dom = {
  navTabs: $$(".nav-tab"),
  tabContents: $$(".tab-content"),
  hostSelect: $("#hostSelect"),
  searchInput: $("#searchInput"),
  searchClear: $("#searchClear"),
  tabsCounter: $("#tabsCounter"),
  tabsVisible: $("#tabsVisible"),
  tabsTotal: $("#tabsTotal"),
  btnRefresh: $("#btnRefresh"),
  btnClearThumbs: $("#btnClearThumbs"),
  emptyState: $("#emptyState"),
  noTabsState: $("#noTabsState"),
  noTabsDomain: $("#noTabsDomain"),
  grid: $("#thumbnailsGrid"),
  pagination: $("#pagination"),
  btnLoadMore: $("#btnLoadMore"),
  loadMoreCount: $("#loadMoreCount"),
  template: $("#thumbCardTemplate"),
  newHostname: $("#newHostname"),
  newSelector: $("#newSelector"),
  newKeyword: $("#newKeyword"),
  btnSaveSelector: $("#btnSaveSelector"),
  selectorsList: $("#selectorsList"),
  btnClearAllSel: $("#btnClearAllSelectors"),
  pageSizeSelect: $("#pageSizeSelect"),
  cardSizeSelect: $("#cardSizeSelect"),
  themeSelect: $("#themeSelect"),
  languageSelect: $("#languageSelect"),
  closedTabTTL: $("#closedTabTTL"),
  btnTheme: $("#btnThemeToggle"),
  captureDelay: $("#captureDelay"),
  autoCaptureStatus: $("#autoCaptureStatus"),
  btnRequestPermissions: $("#btnRequestPermissions"),
  toasts: $("#toastContainer")
};

async function init() {
  loadViewSettings();
  await loadRuntimeSettings();
  applyTheme();
  applyLocale();
  parseParams();
  bindEvents();
  startPopupLifecycleGuard();
  await fetchOpenTabs();
  await loadAllThumbnails();
  await loadDomains();
  await syncPermissionControls();

  if (new URLSearchParams(window.location.search).get("tab") === "settings") {
    switchTab("settings");
  }

  setInterval(cleanupClosedTabs, 60000);
}

function t(key, vars) {
  return translate(state.language, key, vars);
}

function parseParams() {
  const params = new URLSearchParams(window.location.search);
  const host = params.get("host");
  if (host) {
    state.currentHostname = host;
  }
}

function loadViewSettings() {
  try {
    const settings = JSON.parse(localStorage.getItem(VIEW_SETTINGS_KEY) || "{}");
    state.pageSize = normalizeInteger(settings.pageSize, PAGE_SIZE_LIMITS);
    state.cardSize = normalizeCardSize(settings.cardSize);
    state.closedTabTTL = normalizeClosedTabTTL(settings.closedTabTTL);
  } catch {
    // Keep defaults.
  }

  syncSettingsInputs();
}

function saveViewSettings() {
  localStorage.setItem(VIEW_SETTINGS_KEY, JSON.stringify({
    pageSize: state.pageSize,
    cardSize: state.cardSize,
    closedTabTTL: state.closedTabTTL
  }));
}

async function loadRuntimeSettings() {
  try {
    const response = await browser.runtime.sendMessage({ type: "GET_SETTINGS" });
    if (response?.ok) {
      state.captureDelay = normalizeInteger(response.settings?.captureDelay, CAPTURE_DELAY_LIMITS);
      state.theme = normalizeTheme(response.settings?.theme);
      state.language = normalizeLanguage(response.settings?.language);
    }
  } catch {
    // Keep defaults when background settings are unavailable.
  }

  syncSettingsInputs();
}

function syncSettingsInputs() {
  dom.pageSizeSelect.value = String(state.pageSize);
  dom.cardSizeSelect.value = String(state.cardSize);
  dom.themeSelect.value = state.theme;
  dom.languageSelect.value = state.language;
  dom.closedTabTTL.value = String(closedTabTTLToMinutes(state.closedTabTTL));
  dom.captureDelay.value = String(state.captureDelay);
}

function applyTheme() {
  document.body.classList.remove("dark", "light", "mrrobot");
  document.body.classList.add(state.theme);

  const icons = { dark: "🌙", light: "☀️", mrrobot: "💀" };
  dom.btnTheme.textContent = icons[state.theme] || "💀";
}

function applyLocale() {
  document.documentElement.lang = state.language;
  document.title = t("manager.pageTitle");
  applyTranslations(document, state.language);
}

function updateAutoCaptureStatus(enabled) {
  dom.autoCaptureStatus.textContent = enabled ? t("manager.accessGranted") : t("manager.accessRevoked");
  dom.autoCaptureStatus.classList.toggle("on", enabled);
  dom.autoCaptureStatus.classList.toggle("off", !enabled);
}

function setPermissionButtonState(hasPermission, enabled) {
  dom.btnRequestPermissions.dataset.has = hasPermission ? "true" : "false";
  dom.btnRequestPermissions.dataset.enabled = enabled ? "true" : "false";

  updateAutoCaptureStatus(enabled);

  if (enabled) {
    dom.btnRequestPermissions.textContent = t("manager.revoke");
    dom.btnRequestPermissions.className = "btn btn-danger";
  } else {
    dom.btnRequestPermissions.textContent = t("manager.allow");
    dom.btnRequestPermissions.className = "btn btn-primary";
  }
}

async function syncPermissionControls() {
  try {
    const [hasPermission, settingsResponse] = await Promise.all([
      browser.permissions.contains({ origins: ["<all_urls>"] }).catch(() => false),
      browser.runtime.sendMessage({ type: "GET_SETTINGS" }).catch(() => ({ ok: false }))
    ]);

    const enabled = Boolean(
      hasPermission &&
      settingsResponse?.ok &&
      settingsResponse.settings?.autoCaptureEnabled
    );

    setPermissionButtonState(hasPermission, enabled);
  } catch {
    dom.btnRequestPermissions.textContent = t("manager.checking");
  }
}

async function fetchOpenTabs() {
  try {
    const tabs = await browser.tabs.query({});
    state.openTabUrls = new Set(tabs.map((tab) => tab.url).filter(Boolean));
  } catch {
    state.openTabUrls = new Set();
  }
}

async function closePopupWithoutBrowserWindows() {
  try {
    const currentWindow = await browser.windows.getCurrent();
    if (currentWindow?.type !== "popup") return;

    const windows = await browser.windows.getAll({ populate: false });
    const hasNormalWindows = windows.some((windowInfo) => windowInfo.type === "normal");

    if (!hasNormalWindows) {
      window.close();
    }
  } catch {
    // Ignore transient browser shutdown errors.
  }
}

function startPopupLifecycleGuard() {
  closePopupWithoutBrowserWindows();
  browser.windows.onRemoved.addListener(closePopupWithoutBrowserWindows);
  window.setInterval(closePopupWithoutBrowserWindows, MANAGER_POPUP_GUARD_INTERVAL_MS);
}

function bindEvents() {
  dom.navTabs.forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  dom.hostSelect.addEventListener("change", onHostChange);
  dom.searchInput.addEventListener("input", debounce(onSearch, 200));
  dom.searchClear.addEventListener("click", clearSearch);
  dom.btnRefresh.addEventListener("click", refreshFromDB);
  dom.btnClearThumbs.addEventListener("click", onClearThumbs);
  dom.btnLoadMore.addEventListener("click", () => {
    state.page += 1;
    renderPage();
  });
  dom.grid.addEventListener("click", onGridClick);

  dom.btnSaveSelector.addEventListener("click", onSaveSelector);
  dom.btnClearAllSel.addEventListener("click", onClearAllSelectors);

  dom.pageSizeSelect.addEventListener("change", () => {
    state.pageSize = normalizeInteger(dom.pageSizeSelect.value, {
      ...PAGE_SIZE_LIMITS,
      fallback: state.pageSize
    });
    state.page = 0;
    syncSettingsInputs();
    saveViewSettings();
    renderPage();
  });

  dom.cardSizeSelect.addEventListener("change", () => {
    state.cardSize = normalizeCardSize(dom.cardSizeSelect.value);
    syncSettingsInputs();
    saveViewSettings();
    renderPage();
  });

  dom.themeSelect.addEventListener("change", async () => {
    state.theme = normalizeTheme(dom.themeSelect.value);
    syncSettingsInputs();
    applyTheme();
    await saveRuntimeSetting("theme", state.theme);
    renderPage();
  });

  dom.languageSelect.addEventListener("change", async () => {
    state.language = normalizeLanguage(dom.languageSelect.value);
    syncSettingsInputs();
    applyLocale();
    await saveRuntimeSetting("language", state.language);
    renderPage();
    updateCounter();
    if (document.getElementById("tab-settings").classList.contains("active")) {
      await loadSelectorsList();
    }
    await syncPermissionControls();
  });

  dom.closedTabTTL.addEventListener("change", () => {
    state.closedTabTTL = minutesToClosedTabTTL(dom.closedTabTTL.value, state.closedTabTTL);
    syncSettingsInputs();
    saveViewSettings();
  });

  dom.captureDelay.addEventListener("change", async () => {
    state.captureDelay = normalizeInteger(dom.captureDelay.value, {
      ...CAPTURE_DELAY_LIMITS,
      fallback: state.captureDelay
    });
    syncSettingsInputs();
    await saveRuntimeSetting("captureDelay", state.captureDelay);
    toast(t("manager.delaySaved"), "success");
  });

  dom.btnRequestPermissions.addEventListener("click", async () => {
    const hasPermission = dom.btnRequestPermissions.dataset.has === "true";
    const enabled = dom.btnRequestPermissions.dataset.enabled === "true";

    try {
      if (enabled) {
        const removed = await (hasPermission
          ? browser.permissions.remove({ origins: ["<all_urls>"] })
          : Promise.resolve(true));

        if (!removed) {
          toast(t("manager.permissionRemovedFailedToast"), "error");
          return;
        }

        await saveRuntimeSetting("autoCaptureEnabled", false);
        toast(t("manager.accessRevoked"), "success");
      } else {
        const granted = await (hasPermission
          ? Promise.resolve(true)
          : browser.permissions.request({ origins: ["<all_urls>"] }));

        if (!granted) {
          toast(t("manager.permissionNotGrantedToast"), "warning");
          return;
        }

        await saveRuntimeSetting("autoCaptureEnabled", true);
        toast(t("manager.permissionGrantedToast"), "success");
      }
    } catch {
      toast(t("manager.permissionChangeError"), "error");
    } finally {
      await syncPermissionControls();
    }
  });

  dom.btnTheme.addEventListener("click", async () => {
    const cycle = ["dark", "light", "mrrobot"];
    const index = cycle.indexOf(state.theme);
    state.theme = cycle[(index + 1) % cycle.length];
    syncSettingsInputs();
    applyTheme();
    await saveRuntimeSetting("theme", state.theme);
    renderPage();
  });
}

async function saveRuntimeSetting(key, value) {
  try {
    await browser.runtime.sendMessage({
      type: "SAVE_SETTING",
      key,
      value
    });
  } catch {
    // Ignore temporary runtime failures.
  }
}

function switchTab(id) {
  dom.navTabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.tab === id));
  dom.tabContents.forEach((content) => content.classList.toggle("active", content.id === `tab-${id}`));

  if (id === "settings") {
    loadSelectorsList();
  }
}

async function loadAllThumbnails() {
  try {
    const response = await browser.runtime.sendMessage({ type: "GET_ALL_THUMBNAILS" });
    state.allThumbnails = response?.ok && Array.isArray(response.thumbnails)
      ? response.thumbnails.sort((left, right) => (right.timestamp || 0) - (left.timestamp || 0))
      : [];
  } catch (error) {
    console.error("[VTM Manager] Load error:", error);
    state.allThumbnails = [];
  }

  applyFilter();
  renderPage();
  updateCounter();
}

async function loadDomains() {
  const [selectorsResponse, rulesResponse] = await Promise.all([
    browser.runtime.sendMessage({ type: "GET_ALL_SELECTORS" }),
    browser.runtime.sendMessage({ type: "GET_ALL_RULES" })
  ]);

  if (!selectorsResponse?.ok || !rulesResponse?.ok) return;

  const defaultOption = document.createElement("option");
  defaultOption.value = "";
  defaultOption.textContent = t("manager.allDomains");
  dom.hostSelect.replaceChildren(defaultOption);

  const hosts = new Set(Object.keys(selectorsResponse.data || {}));
  for (const rule of rulesResponse.rules || []) {
    hosts.add(rule.hostname);
  }
  for (const thumb of state.allThumbnails) {
    hosts.add(thumb.hostname);
  }

  [...hosts].sort().forEach((host) => {
    const option = document.createElement("option");
    option.value = host;
    option.textContent = host;
    dom.hostSelect.appendChild(option);
  });

  if (state.currentHostname) {
    dom.hostSelect.value = state.currentHostname;
  }
}

function onHostChange() {
  state.currentHostname = dom.hostSelect.value || null;
  state.page = 0;
  state.searchQuery = "";
  dom.searchInput.value = "";
  applyFilter();
  renderPage();
  updateCounter();
}

function applyFilter() {
  if (!state.currentHostname && !state.searchQuery) {
    state.filteredThumbnails = [...state.allThumbnails];
    return;
  }

  state.filteredThumbnails = state.allThumbnails.filter((thumb) => {
    const hostMatches = !state.currentHostname || thumb.hostname === state.currentHostname;
    const searchMatches = !state.searchQuery ||
      (thumb.title || "").toLowerCase().includes(state.searchQuery) ||
      (thumb.url || "").toLowerCase().includes(state.searchQuery);
    return hostMatches && searchMatches;
  });
}

function onSearch() {
  state.searchQuery = dom.searchInput.value.trim().toLowerCase();
  dom.searchClear.style.display = state.searchQuery ? "block" : "none";
  state.page = 0;
  applyFilter();
  renderPage();
  updateCounter();
}

function clearSearch() {
  dom.searchInput.value = "";
  dom.searchClear.style.display = "none";
  state.searchQuery = "";
  state.page = 0;
  applyFilter();
  renderPage();
  updateCounter();
}

function updateCounter() {
  dom.tabsCounter.style.display = state.filteredThumbnails.length || state.allThumbnails.length ? "flex" : "none";
  dom.tabsVisible.textContent = String(state.filteredThumbnails.length);
  dom.tabsTotal.textContent = String(state.allThumbnails.length);
}

async function refreshFromDB() {
  toast(t("manager.refreshing"));
  await fetchOpenTabs();
  await loadAllThumbnails();
  await loadDomains();
  toast(t("manager.dataRefreshed"), "success");
}

async function cleanupClosedTabs() {
  if (state.closedTabTTL <= 0) return;

  await fetchOpenTabs();

  const now = Date.now();
  for (const thumb of state.allThumbnails) {
    if (state.openTabUrls.has(thumb.url)) continue;

    const age = now - (thumb.timestamp || 0);
    if (age > state.closedTabTTL) {
      await browser.runtime.sendMessage({ type: "DELETE_THUMBNAIL", url: thumb.url });
    }
  }

  await loadAllThumbnails();
}

function renderPage() {
  const renderedCount = Math.min((state.page + 1) * state.pageSize, state.filteredThumbnails.length);
  const items = state.filteredThumbnails.slice(0, renderedCount);
  const hasMore = renderedCount < state.filteredThumbnails.length;

  if (state.allThumbnails.length === 0) {
    showState("empty");
    return;
  }

  if (state.filteredThumbnails.length === 0) {
    showState("noTabs");
    dom.noTabsDomain.textContent = state.currentHostname || t("manager.selectedFilters");
    return;
  }

  showState("grid");
  dom.grid.replaceChildren();

  items.forEach((thumb, index) => {
    dom.grid.appendChild(createCard(thumb, index));
  });

  dom.grid.style.setProperty("--grid-card-size", `${state.cardSize}px`);
  dom.grid.style.gridTemplateColumns = `repeat(auto-fill, minmax(${state.cardSize}px, 1fr))`;

  if (hasMore) {
    dom.pagination.style.display = "flex";
    dom.loadMoreCount.textContent = `(${state.filteredThumbnails.length - renderedCount})`;
  } else {
    dom.pagination.style.display = "none";
  }
}

function createCard(thumb, index) {
  const fragment = dom.template.content.cloneNode(true);
  const card = fragment.querySelector(".thumb-card");
  const isClosed = !state.openTabUrls.has(thumb.url);

  card.dataset.url = thumb.url;
  card.dataset.hostname = thumb.hostname;
  card.style.animationDelay = `${(index % 20) * 0.03}s`;

  if (isClosed) {
    card.classList.add("closed");
  }

  const image = card.querySelector(".thumb-img");
  const loader = card.querySelector(".thumb-loader");
  const placeholder = card.querySelector(".thumb-placeholder");
  const placeholderText = card.querySelector(".placeholder-text");
  const openButton = card.querySelector(".thumb-open-btn");
  const restoreButton = card.querySelector(".closed-restore-btn");
  const deleteButton = card.querySelector(".thumb-delete-btn");

  placeholderText.textContent = t("manager.blockNotFound");
  openButton.textContent = `↗️ ${t("manager.openTab")}`;
  restoreButton.textContent = `🔄 ${t("manager.restore")}`;
  deleteButton.title = t("manager.delete");

  if (thumb.dataUrl) {
    image.src = thumb.dataUrl;
    image.onload = () => loader.classList.add("hidden");
    image.onerror = () => {
      loader.classList.add("hidden");
      placeholder.style.display = "flex";
    };
  } else {
    loader.classList.add("hidden");
    placeholder.style.display = "flex";
  }

  const titleElement = card.querySelector(".thumb-title");
  const titleText = thumb.title || thumb.url;
  image.alt = titleText;
  titleElement.replaceChildren(createHighlightedFragment(titleText, state.searchQuery));

  const urlElement = card.querySelector(".thumb-url");
  try {
    urlElement.textContent = new URL(thumb.url).pathname.slice(0, 40) || "/";
  } catch {
    urlElement.textContent = thumb.url.slice(0, 40);
  }

  const favicon = card.querySelector(".favicon");
  favicon.src = buildFaviconDataUrl(thumb.hostname);
  favicon.alt = thumb.hostname || "VTM";

  deleteButton.addEventListener("click", async (event) => {
    event.stopPropagation();
    if (!confirm(t("manager.deleteThumbnailConfirm"))) return;

    await browser.runtime.sendMessage({ type: "DELETE_THUMBNAIL", url: thumb.url });
    toast(t("manager.deleted"), "success");
    await loadAllThumbnails();
  });

  if (isClosed) {
    const closedOverlay = card.querySelector(".thumb-closed-overlay");
    closedOverlay.style.display = "flex";

    restoreButton.addEventListener("click", async (event) => {
      event.stopPropagation();
      restoreButton.disabled = true;

      try {
        await browser.runtime.sendMessage({ type: "TOUCH_THUMBNAIL", url: thumb.url }).catch(() => null);
        await browser.tabs.create({ url: thumb.url, active: true });

        state.openTabUrls.add(thumb.url);
        toast(t("manager.tabRestored"), "success");

        setTimeout(async () => {
          await fetchOpenTabs();
          await loadAllThumbnails();
        }, 800);
      } catch {
        toast(t("manager.restoreFailed"), "error");
      } finally {
        restoreButton.disabled = false;
      }
    });
  }

  return card;
}

function showState(which) {
  dom.emptyState.style.display = which === "empty" ? "flex" : "none";
  dom.noTabsState.style.display = which === "noTabs" ? "flex" : "none";
  dom.grid.style.display = which === "grid" ? "grid" : "none";
  dom.pagination.style.display = "none";
  dom.tabsCounter.style.display = which === "grid" ? "flex" : "none";
}

async function onGridClick(event) {
  if (event.target.closest(".thumb-delete-btn")) return;
  if (event.target.closest(".closed-restore-btn")) return;

  const card = event.target.closest(".thumb-card");
  if (!card || card.classList.contains("closed")) return;

  const url = card.dataset.url;
  const tabs = await browser.tabs.query({});
  const target = tabs.find((tab) => tab.url === url);

  if (target) {
    await browser.runtime.sendMessage({
      type: "SWITCH_TO_TAB",
      tabId: target.id,
      windowId: target.windowId
    });
    toast(t("manager.switchedToTab"), "success");
  } else {
    await browser.tabs.create({ url });
    toast(t("manager.openedNewTab"), "success");
  }
}

async function onClearThumbs() {
  const target = state.currentHostname || t("manager.allDomainsTarget");
  if (!confirm(t("manager.deleteThumbnailsConfirm", { target }))) return;

  if (!state.currentHostname) {
    await browser.runtime.sendMessage({ type: "CLEAR_ALL_THUMBNAILS" });
  } else {
    const thumbnails = state.allThumbnails.filter((thumb) => thumb.hostname === state.currentHostname);
    for (const thumb of thumbnails) {
      await browser.runtime.sendMessage({ type: "DELETE_THUMBNAIL", url: thumb.url });
    }
  }

  toast(t("manager.deleteThumbnailsDone", { target }), "success");
  await refreshFromDB();
}

async function loadSelectorsList() {
  const selectorsResponse = await browser.runtime.sendMessage({ type: "GET_ALL_SELECTORS" });
  const rulesResponse = await browser.runtime.sendMessage({ type: "GET_ALL_RULES" });

  if (!selectorsResponse?.ok || !rulesResponse?.ok) return;

  const map = new Map();

  for (const [host, selector] of Object.entries(selectorsResponse.data || {})) {
    map.set(host, { selector, keywords: [] });
  }

  for (const rule of rulesResponse.rules || []) {
    if (!map.has(rule.hostname)) {
      map.set(rule.hostname, { selector: "", keywords: [] });
    }
    map.get(rule.hostname).keywords.push(rule.keyword);
  }

  if (map.size === 0) {
    dom.selectorsList.replaceChildren(createEmptyStateElement(t("manager.noDomainSettingsConfigured")));
    return;
  }

  const entries = [...map.entries()].sort((left, right) => left[0].localeCompare(right[0]));
  const fragment = document.createDocumentFragment();

  entries.forEach(([host, data]) => {
    fragment.appendChild(createSelectorListItem(host, data));
  });

  dom.selectorsList.replaceChildren(fragment);

  dom.selectorsList.onclick = async (event) => {
    const button = event.target.closest("[data-action]");
    if (!button) return;

    const item = button.closest(".item");
    const host = item.dataset.host;
    const data = map.get(host);

    if (button.dataset.action === "edit") {
      dom.newHostname.value = host;
      dom.newSelector.value = data.selector;
      dom.newKeyword.value = data.keywords.join(", ");
      dom.newHostname.focus();
      return;
    }

    if (!confirm(t("manager.deleteDomainSettingsConfirm", { host }))) return;

    await browser.runtime.sendMessage({ type: "DELETE_DOMAIN_CONFIG", hostname: host });
    toast(t("manager.deleted"), "success");
    await loadSelectorsList();
    await loadDomains();
  };
}

async function onSaveSelector() {
  const host = dom.newHostname.value.trim();
  const selector = dom.newSelector.value.trim();
  const keywords = dom.newKeyword.value.trim();

  if (!host) {
    toast(t("manager.hostRequired"), "warning");
    return;
  }

  if (!selector && !keywords) {
    toast(t("manager.selectorOrKeywordRequired"), "warning");
    return;
  }

  const response = await browser.runtime.sendMessage({
    type: "SAVE_DOMAIN_CONFIG",
    hostname: host,
    selector,
    keywords
  });

  if (!response?.ok) {
    toast(t("common.errorPrefix") + (response?.error || "unknown"), "error");
    return;
  }

  toast(t("manager.saved"), "success");
  dom.newHostname.value = "";
  dom.newSelector.value = "";
  dom.newKeyword.value = "";
  await loadSelectorsList();
  await loadDomains();
}

async function onClearAllSelectors() {
  if (!confirm(t("manager.clearAllDomainSettingsConfirm"))) return;

  const response = await browser.runtime.sendMessage({ type: "CLEAR_ALL_DOMAIN_CONFIGS" });
  if (!response?.ok) {
    toast(t("common.errorPrefix") + (response?.error || "unknown"), "error");
    return;
  }

  toast(t("manager.cleared"), "success");
  await loadSelectorsList();
  await loadDomains();
}

function buildFaviconDataUrl(hostname) {
  const palettes = {
    dark: { background: "#13142a", foreground: "#7c4dff", border: "#4f8ef7" },
    light: { background: "#f5f6fd", foreground: "#3a7bd5", border: "#bfd0f5" },
    mrrobot: { background: "#111111", foreground: "#ef4444", border: "#b91c1c" }
  };

  const palette = palettes[state.theme] || palettes.mrrobot;
  const letter = String(hostname || "V").trim().charAt(0).toUpperCase() || "V";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16">
      <rect x="0.5" y="0.5" width="15" height="15" rx="4" fill="${palette.background}" stroke="${palette.border}" />
      <text x="8" y="11" text-anchor="middle" font-family="Segoe UI, Arial, sans-serif" font-size="8" font-weight="700" fill="${palette.foreground}">${letter}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function normalizeInteger(value, options = {}) {
  const {
    min = Number.MIN_SAFE_INTEGER,
    max = Number.MAX_SAFE_INTEGER,
    fallback = 0
  } = options;

  const parsed = parseInt(value, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function normalizeCardSize(value) {
  const parsed = parseInt(value, 10);
  return CARD_SIZE_OPTIONS.includes(parsed) ? parsed : 240;
}

function normalizeClosedTabTTL(value) {
  const fallback = CLOSED_TAB_TTL_MINUTES_LIMITS.fallback * 60000;
  const parsed = parseInt(value, 10);

  if (!Number.isFinite(parsed)) return fallback;
  if (parsed <= 0) return 0;

  return parsed;
}

function closedTabTTLToMinutes(value) {
  if (!value || value <= 0) return 0;
  return Math.max(1, Math.round(value / 60000));
}

function minutesToClosedTabTTL(value, fallbackMilliseconds = 1800000) {
  const fallbackMinutes = closedTabTTLToMinutes(fallbackMilliseconds);
  const minutes = normalizeInteger(value, {
    ...CLOSED_TAB_TTL_MINUTES_LIMITS,
    fallback: fallbackMinutes
  });

  return minutes === 0 ? 0 : minutes * 60000;
}

function debounce(fn, milliseconds) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), milliseconds);
  };
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createHighlightedFragment(text, query) {
  const fragment = document.createDocumentFragment();
  const normalizedText = String(text ?? "");
  const normalizedQuery = String(query ?? "");

  if (!normalizedQuery) {
    fragment.appendChild(document.createTextNode(normalizedText));
    return fragment;
  }

  const matcher = new RegExp(`(${escapeRegExp(normalizedQuery)})`, "gi");
  const parts = normalizedText.split(matcher);

  parts.forEach((part) => {
    if (!part) return;

    if (part.toLowerCase() === normalizedQuery.toLowerCase()) {
      const mark = document.createElement("mark");
      mark.textContent = part;
      fragment.appendChild(mark);
      return;
    }

    fragment.appendChild(document.createTextNode(part));
  });

  return fragment;
}

function createEmptyStateElement(message) {
  const element = document.createElement("div");
  element.className = "items-empty";
  element.textContent = message;
  return element;
}

function createSelectorListItem(host, data) {
  const item = document.createElement("div");
  item.className = "item";
  item.dataset.host = host;

  const hostElement = document.createElement("span");
  hostElement.className = "item-host";
  hostElement.style.flex = "1";
  hostElement.textContent = host;

  const selectorElement = document.createElement("code");
  selectorElement.className = "item-value";
  selectorElement.style.flex = "2";
  selectorElement.textContent = data.selector;

  const keywordsElement = document.createElement("span");
  keywordsElement.className = "item-value";
  keywordsElement.style.flex = "1";
  keywordsElement.style.color = "var(--text-muted)";
  keywordsElement.style.fontSize = "12px";
  keywordsElement.textContent = data.keywords.join(", ");

  const actions = document.createElement("div");
  actions.className = "item-actions";

  const editButton = document.createElement("button");
  editButton.type = "button";
  editButton.className = "btn-icon-sm";
  editButton.dataset.action = "edit";
  editButton.title = t("manager.edit");
  editButton.textContent = "Edit";

  const deleteButton = document.createElement("button");
  deleteButton.type = "button";
  deleteButton.className = "btn-icon-sm danger";
  deleteButton.dataset.action = "delete";
  deleteButton.title = t("manager.delete");
  deleteButton.textContent = "Del";

  actions.append(editButton, deleteButton);
  item.append(hostElement, selectorElement, keywordsElement, actions);

  return item;
}

function toast(message, type = "") {
  const element = document.createElement("div");
  element.className = "toast" + (type ? ` ${type}` : "");
  element.textContent = message;
  dom.toasts.appendChild(element);

  setTimeout(() => {
    element.classList.add("removing");
    setTimeout(() => element.remove(), 200);
  }, 3000);
}

init();
