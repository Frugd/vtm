/**
 * background.js - Service worker for Visual Tab Manager
 */

/* ═══════════════════════════════════════════════
   IndexedDB
   ═══════════════════════════════════════════════ */

let db = null;
const DB_NAME = "vtm-thumbnails";
const DB_VERSION = 1;
const STORE = "thumbs";
const AUTO_CAPTURE_DEDUPE_MS = 30000;
const inFlightAutoCaptures = new Set();
const recentAutoCaptures = new Map();

async function initDB() {
  if (db) return db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onupgradeneeded = (e) => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains(STORE)) {
        const s = d.createObjectStore(STORE, { keyPath: "url" });
        s.createIndex("hostname", "hostname", { unique: false });
        s.createIndex("timestamp", "timestamp", { unique: false });
      }
    };
  });
}

function idbTransaction(mode) {
  return db.transaction([STORE], mode).objectStore(STORE);
}

async function saveThumbnail(data) {
  await initDB();
  return new Promise((resolve, reject) => {
    // Force pure JSON primitives to avoid structured cloning DataError
    const record = JSON.parse(JSON.stringify({
      url: data.url || String(Date.now()),
      hostname: data.hostname || "unknown",
      title: data.title || data.url || "Untitled",
      dataUrl: data.dataUrl,
      timestamp: Date.now()
    }));
    
    const req = idbTransaction("readwrite").put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

async function touchThumbnail(url, updates = {}) {
  await initDB();

  const existing = await getThumbnail(url);
  if (!existing) return null;

  return new Promise((resolve, reject) => {
    const record = JSON.parse(JSON.stringify({
      ...existing,
      ...updates,
      url: existing.url,
      timestamp: Date.now()
    }));

    const req = idbTransaction("readwrite").put(record);
    req.onsuccess = () => resolve(record);
    req.onerror = () => reject(req.error);
  });
}

async function getAllThumbnails() {
  await initDB();
  return new Promise((resolve, reject) => {
    const req = idbTransaction("readonly").getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function getThumbnailsForHost(hostname) {
  await initDB();
  return new Promise((resolve, reject) => {
    const req = idbTransaction("readonly").index("hostname").getAll(hostname);
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

async function getThumbnail(url) {
  await initDB();
  return new Promise((resolve, reject) => {
    const req = idbTransaction("readonly").get(url);
    req.onsuccess = () => resolve(req.result || null);
    req.onerror = () => reject(req.error);
  });
}

async function deleteThumbnail(url) {
  await initDB();
  return new Promise((resolve, reject) => {
    const req = idbTransaction("readwrite").delete(url);
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

async function clearAllThumbnails() {
  await initDB();
  return new Promise((resolve, reject) => {
    const req = idbTransaction("readwrite").clear();
    req.onsuccess = () => resolve(true);
    req.onerror = () => reject(req.error);
  });
}

/* ═══════════════════════════════════════════════
   Selectors Storage (browser.storage.sync)
   ═══════════════════════════════════════════════ */

const SEL_PREFIX = "vtm_sel:";

function normalizeHostname(hostname) {
  return String(hostname || "").trim().toLowerCase();
}

function getSelectorKeys(hostname) {
  const raw = String(hostname || "").trim();
  const normalized = normalizeHostname(hostname);
  return [...new Set([raw, normalized].filter(Boolean).map(value => SEL_PREFIX + value))];
}

async function saveSelector(hostname, selector) {
  const keys = getSelectorKeys(hostname);
  if (!keys.length) return;
  await browser.storage.sync.set({ [keys[0]]: selector });
}

async function getSelector(hostname) {
  const keys = getSelectorKeys(hostname);
  if (!keys.length) return null;
  const result = await browser.storage.sync.get(keys);
  for (const key of keys) {
    if (result[key]) return result[key];
  }
  return null;
}

async function getAllSelectors() {
  const all = await browser.storage.sync.get(null);
  const out = {};
  for (const [k, v] of Object.entries(all)) {
    if (k.startsWith(SEL_PREFIX)) out[k.slice(SEL_PREFIX.length)] = v;
  }
  return out;
}

async function deleteSelector(hostname) {
  const keys = getSelectorKeys(hostname);
  if (!keys.length) return;
  await browser.storage.sync.remove(keys);
}

/* ═══════════════════════════════════════════════
   Capture Rules Storage
   ═══════════════════════════════════════════════ */

const RULES_KEY = "vtm_rules";

function normalizeRule(rule) {
  const hostname = normalizeHostname(rule?.hostname);
  const keyword = String(rule?.keyword || "").trim();
  if (!hostname || !keyword) return null;
  return { hostname, keyword };
}

function dedupeRules(rules) {
  const seen = new Set();
  const out = [];

  for (const rule of rules || []) {
    const normalized = normalizeRule(rule);
    if (!normalized) continue;

    const key = `${normalized.hostname}::${normalized.keyword.toLowerCase()}`;
    if (seen.has(key)) continue;

    seen.add(key);
    out.push(normalized);
  }

  return out;
}

function hostnameMatchesRule(ruleHostname, currentHostname) {
  const rule = normalizeHostname(ruleHostname);
  const host = normalizeHostname(currentHostname);

  if (!rule || !host) return false;
  if (rule === "*") return true;
  if (rule === host) return true;

  const suffix = rule.replace(/^\*\./, ".").replace(/^\*/, "");
  return Boolean(suffix) && host.endsWith(suffix);
}

function buildRuleHaystack(title, url) {
  const parts = [String(title || ""), String(url || "")];

  try {
    const parsed = new URL(url);
    parts.push(parsed.pathname || "");
    parts.push(parsed.search || "");
  } catch {
    // Ignore malformed URLs and fall back to the raw value above.
  }

  return parts.join("\n").toLowerCase();
}

async function inspectRules(hostname, title, url) {
  const rules = (await getAllRules()).filter(rule => hostnameMatchesRule(rule.hostname, hostname));
  const haystack = buildRuleHaystack(title, url);
  const matching = rules.filter(rule => haystack.includes(rule.keyword.toLowerCase()));
  return { rules, matching };
}

async function getAllRules() {
  const r = await browser.storage.sync.get(RULES_KEY);
  return dedupeRules(r[RULES_KEY] || []);
}

async function saveRule(hostname, keyword) {
  const normalized = normalizeRule({ hostname, keyword });
  if (!normalized) return;

  const rules = await getAllRules();
  rules.push(normalized);
  await browser.storage.sync.set({ [RULES_KEY]: dedupeRules(rules) });
}

async function deleteRule(index) {
  const rules = await getAllRules();
  rules.splice(index, 1);
  await browser.storage.sync.set({ [RULES_KEY]: rules });
}

async function getMatchingRules(hostname, title, url) {
  const { matching } = await inspectRules(hostname, title, url);
  return matching;
}

/* ═══════════════════════════════════════════════
   Combined Domain Config Storage
   ═══════════════════════════════════════════════ */

async function saveDomainConfig(hostname, selector, keywordStr) {
  const host = normalizeHostname(hostname);
  if (!host) return;

  if (selector) {
    await saveSelector(host, selector);
  } else {
    await deleteSelector(host);
  }

  let rules = await getAllRules();
  rules = rules.filter(r => r.hostname !== host);

  if (keywordStr) {
    const kws = keywordStr.split(",").map(s => s.trim()).filter(Boolean);
    for (const kw of kws) {
      rules.push({ hostname: host, keyword: kw });
    }
  }
  await browser.storage.sync.set({ [RULES_KEY]: dedupeRules(rules) });
}

async function deleteDomainConfig(hostname) {
  const host = normalizeHostname(hostname);
  if (!host) return;

  await deleteSelector(host);
  const rules = await getAllRules();
  const kept = rules.filter(r => r.hostname !== host);
  await browser.storage.sync.set({ [RULES_KEY]: kept });
}

async function clearAllDomainConfigs() {
  const all = await browser.storage.sync.get(null);
  const keysToRemove = Object.keys(all).filter(k => k.startsWith(SEL_PREFIX));
  if (keysToRemove.length > 0) {
    await browser.storage.sync.remove(keysToRemove);
  }
  await browser.storage.sync.set({ [RULES_KEY]: [] });
}

/* ═══════════════════════════════════════════════
   Settings Storage (browser.storage.local)
   ═══════════════════════════════════════════════ */

const SETTINGS_KEY = "vtm_runtime_settings";
const AUTO_CAPTURE_SCRIPT_ID = "vtm-auto-capture";
const DEFAULT_SETTINGS = Object.freeze({
  managerMode: "tab",
  theme: "mrrobot",
  language: "en",
  captureDelay: 100,
  autoCaptureEnabled: false
});

async function readStoredSettings() {
  const result = await browser.storage.local.get(SETTINGS_KEY);
  return result[SETTINGS_KEY] || null;
}

async function getSettings() {
  return {
    ...DEFAULT_SETTINGS,
    ...(await readStoredSettings() || {})
  };
}

async function ensureDefaultSettings() {
  const stored = await readStoredSettings();

  if (!stored) {
    const initialSettings = {
      ...DEFAULT_SETTINGS,
      autoCaptureDefaultApplied: true
    };

    try {
      await browser.permissions.remove({ origins: ["<all_urls>"] });
    } catch {
      // Ignore when the browser keeps static host permissions enabled.
    }

    await browser.storage.local.set({ [SETTINGS_KEY]: initialSettings });
    return initialSettings;
  }

  const mergedSettings = {
    ...DEFAULT_SETTINGS,
    ...stored
  };

  if (!Object.prototype.hasOwnProperty.call(stored, "autoCaptureDefaultApplied")) {
    mergedSettings.autoCaptureDefaultApplied = true;
  }

  if (JSON.stringify(mergedSettings) !== JSON.stringify(stored)) {
    await browser.storage.local.set({ [SETTINGS_KEY]: mergedSettings });
  }

  return mergedSettings;
}

async function saveSetting(key, value) {
  const s = await getSettings();
  s[key] = value;
  await browser.storage.local.set({ [SETTINGS_KEY]: s });
  await syncAutoCaptureContentScript();
}

async function getRegisteredAutoCaptureScripts() {
  try {
    return await browser.scripting.getRegisteredContentScripts({ ids: [AUTO_CAPTURE_SCRIPT_ID] });
  } catch {
    return [];
  }
}

async function syncAutoCaptureContentScript() {
  const [settings, hasPermission, registered] = await Promise.all([
    getSettings(),
    browser.permissions.contains({ origins: ["<all_urls>"] }).catch(() => false),
    getRegisteredAutoCaptureScripts()
  ]);

  const shouldRegister = Boolean(hasPermission && settings.autoCaptureEnabled);
  const isRegistered = registered.length > 0;

  if (shouldRegister && !isRegistered) {
    await browser.scripting.registerContentScripts([{
      id: AUTO_CAPTURE_SCRIPT_ID,
      js: ["content/content-autocapture.js"],
      matches: ["<all_urls>"],
      runAt: "document_idle",
      persistAcrossSessions: true
    }]);
    return;
  }

  if (!shouldRegister && isRegistered) {
    await browser.scripting.unregisterContentScripts({ ids: [AUTO_CAPTURE_SCRIPT_ID] });
  }
}

/* ═══════════════════════════════════════════════
   Screenshot Capture
   ═══════════════════════════════════════════════ */

async function captureTab(tabId, windowId) {
  try {
    return await browser.tabs.captureVisibleTab(windowId, {
      format: "jpeg",
      quality: 85
    });
  } catch (err) {
    console.error("[VTM] Capture failed:", err.message);
    return null;
  }
}

/* ═══════════════════════════════════════════════
   Image Cropping (Canvas API)
   ═══════════════════════════════════════════════ */

async function cropImage(dataUrl, rect) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const { x, y, width, height, dpr = 1 } = rect;
      const sx = Math.max(0, Math.round(x * dpr));
      const sy = Math.max(0, Math.round(y * dpr));
      const sw = Math.max(1, Math.round(width * dpr));
      const sh = Math.max(1, Math.round(height * dpr));
      
      const cw = Math.min(sw, img.width - sx);
      const ch = Math.min(sh, img.height - sy);
      if (cw <= 0 || ch <= 0) return resolve(dataUrl);

      const scale = Math.min(1, 400 / cw);
      const ow = Math.round(cw * scale);
      const oh = Math.round(ch * scale);

      const canvas = document.createElement("canvas");
      canvas.width = ow;
      canvas.height = oh;
      const ctx = canvas.getContext("2d");
      
      ctx.drawImage(img, sx, sy, cw, ch, 0, 0, ow, oh);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = (err) => {
      console.error("[VTM] Image load error:", err);
      // Fallback to original image if failing
      resolve(dataUrl);
    };
    img.src = dataUrl;
  });
}

function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

function buildCaptureRectKey(rect) {
  if (!rect) return "";

  return [
    rect.x,
    rect.y,
    rect.width,
    rect.height,
    rect.dpr
  ].map(value => Math.round(Number(value) || 0)).join(":");
}

function buildAutoCaptureKey(msg) {
  return [
    msg.url || "",
    msg.title || "",
    msg.selector || "",
    buildCaptureRectKey(msg.rect)
  ].join("|");
}

function hasRecentAutoCapture(url, captureKey) {
  const recent = recentAutoCaptures.get(url);
  if (!recent) return false;

  if ((Date.now() - recent.timestamp) > AUTO_CAPTURE_DEDUPE_MS) {
    recentAutoCaptures.delete(url);
    return false;
  }

  return recent.captureKey === captureKey;
}

function rememberAutoCapture(url, captureKey) {
  recentAutoCaptures.set(url, {
    captureKey,
    timestamp: Date.now()
  });

  if (recentAutoCaptures.size <= 200) return;

  const cutoff = Date.now() - AUTO_CAPTURE_DEDUPE_MS;
  for (const [key, value] of recentAutoCaptures.entries()) {
    if (value.timestamp < cutoff) {
      recentAutoCaptures.delete(key);
    }
  }
}

/* ═══════════════════════════════════════════════
   Picker Activation
   ═══════════════════════════════════════════════ */

async function activatePicker(tabId) {
  try {
    await browser.scripting.insertCSS({
      target: { tabId },
      files: ["content/content-picker.css"]
    });
    await browser.scripting.executeScript({
      target: { tabId },
      files: ["shared/ui.js", "content/content-picker.js"]
    });
  } catch (err) {
    console.error("[VTM] Picker activation failed:", err);
    throw err;
  }
}

/* ═══════════════════════════════════════════════
   Manager Opening (Tab or Window)
   ═══════════════════════════════════════════════ */

const WIN_STATE_KEY = "vtm_window_state";
const MANAGER_PAGE_URL = browser.runtime.getURL("manager/manager.html");
const MANAGER_PAGE_PATTERN = `${MANAGER_PAGE_URL}*`;
let managerWindowId = null;

async function getWindowState() {
  const r = await browser.storage.local.get(WIN_STATE_KEY);
  return r[WIN_STATE_KEY] || null;
}

async function saveWindowState(state) {
  await browser.storage.local.set({ [WIN_STATE_KEY]: state });
}

function hasValidWindowBounds(win) {
  return Number.isFinite(win?.width) && win.width > 50 &&
    Number.isFinite(win?.height) && win.height > 50;
}

async function persistManagerWindowBounds(win) {
  if (!win || win.type !== "popup" || !hasValidWindowBounds(win)) return;

  await saveWindowState({
    left: win.left,
    top: win.top,
    width: win.width,
    height: win.height
  });
}

async function getManagerPopupWindows() {
  const managerTabs = await browser.tabs.query({ url: MANAGER_PAGE_PATTERN });
  const popupWindows = [];
  const seenWindowIds = new Set();

  for (const tab of managerTabs) {
    if (seenWindowIds.has(tab.windowId)) continue;
    seenWindowIds.add(tab.windowId);

    try {
      const win = await browser.windows.get(tab.windowId);
      if (win?.type === "popup") {
        popupWindows.push(win);
      }
    } catch {
      // Window disappeared while iterating.
    }
  }

  return popupWindows;
}

async function closeManagerPopupWindows() {
  const popupWindows = await getManagerPopupWindows();

  for (const win of popupWindows) {
    await persistManagerWindowBounds(win);

    try {
      await browser.windows.remove(win.id);
    } catch {
      // Ignore if the popup window is already closing.
    }

    if (managerWindowId === win.id) {
      managerWindowId = null;
    }
  }
}

async function closeManagerPopupWindowsIfBrowserClosed() {
  const windows = await browser.windows.getAll({ populate: false });
  const hasNormalBrowserWindows = windows.some(win => win.type === "normal");

  if (!hasNormalBrowserWindows) {
    await closeManagerPopupWindows();
  }
}

async function getManagerContext() {
  const managerTabs = await browser.tabs.query({ url: MANAGER_PAGE_PATTERN });
  if (!managerTabs.length) {
    managerWindowId = null;
    return null;
  }

  const preferredTabs = managerWindowId
    ? [
        ...managerTabs.filter(tab => tab.windowId === managerWindowId),
        ...managerTabs.filter(tab => tab.windowId !== managerWindowId)
      ]
    : managerTabs;

  for (const tab of preferredTabs) {
    try {
      const win = await browser.windows.get(tab.windowId);
      managerWindowId = win?.type === "popup" ? win.id : null;
      return { tab, win };
    } catch {
      // Try next manager tab if this one disappeared.
    }
  }

  managerWindowId = null;
  return null;
}

async function focusManagerContext(context, url) {
  if (!context?.tab) return false;

  if (url && context.tab.url !== url) {
    await browser.tabs.update(context.tab.id, { url });
  }

  await browser.tabs.update(context.tab.id, { active: true });

  if (context.win?.id != null) {
    await browser.windows.update(context.win.id, { focused: true });
  }

  managerWindowId = context.win?.type === "popup" ? context.win.id : null;
  return true;
}

async function openManager(params = "") {
  const settings = await getSettings();
  const managerURL = MANAGER_PAGE_URL + (params ? `?${params}` : "");

  const existingManager = await getManagerContext();
  if (existingManager) {
    await focusManagerContext(existingManager, managerURL);
    return;
  }

  if (settings.managerMode === "window") {
    // Restore saved window state or use defaults
    const saved = await getWindowState();
    const createOpts = {
      url: managerURL,
      type: "popup",
      width: saved?.width || 1100,
      height: saved?.height || 750
    };

    // Restore position if we have it
    if (saved?.left != null && saved?.top != null) {
      createOpts.left = saved.left;
      createOpts.top = saved.top;
    }

    try {
      const win = await browser.windows.create(createOpts);
      managerWindowId = win.id;

      // Save state when window is closed
      // (position/size are saved in the onRemoved listener below)
    } catch (err) {
      console.error("[VTM] Window create failed, falling back to tab:", err);
      await openManagerInTab(managerURL);
    }
  } else {
    await openManagerInTab(managerURL);
  }
}

async function openManagerInTab(url) {
  const existingManager = await getManagerContext();
  if (existingManager) {
    await focusManagerContext(existingManager, url);
    return;
  }

  await browser.tabs.create({ url });
}

// Track window position/size changes for the manager window
browser.windows.onRemoved.addListener(async (windowId) => {
  if (windowId === managerWindowId) {
    managerWindowId = null;
  }

  try {
    await closeManagerPopupWindowsIfBrowserClosed();
  } catch {
    // Ignore transient shutdown errors.
  }
});

// Periodically save manager window bounds (Firefox doesn't have onBoundsChanged)
setInterval(async () => {
  if (!managerWindowId) return;
  try {
    const win = await browser.windows.get(managerWindowId);
    await persistManagerWindowBounds(win);
  } catch {
    managerWindowId = null;
  }
}, 3000);

browser.runtime.onStartup.addListener(() => {
  closeManagerPopupWindows().catch(err => {
    console.error("[VTM] Failed to close restored manager popup:", err);
  });
});

/* ═══════════════════════════════════════════════
   Message Handler
   ═══════════════════════════════════════════════ */

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender)
    .then(sendResponse)
    .catch(err => sendResponse({ ok: false, error: err.message }));
  return true;
});

async function handleMessage(msg, sender) {
  const tabId = sender.tab?.id;

  switch (msg.type) {

    /* ── Selectors ── */
    case "GET_SELECTOR":
      return { ok: true, selector: await getSelector(msg.hostname) };

    case "SAVE_SELECTOR":
      await saveSelector(msg.hostname, msg.selector);
      return { ok: true };

    case "GET_ALL_SELECTORS":
      return { ok: true, data: await getAllSelectors() };

    case "DELETE_SELECTOR":
      await deleteSelector(msg.hostname);
      return { ok: true };

    /* ── Domain Configs ── */
    case "SAVE_DOMAIN_CONFIG":
      await saveDomainConfig(msg.hostname, msg.selector, msg.keywords);
      return { ok: true };

    case "DELETE_DOMAIN_CONFIG":
      await deleteDomainConfig(msg.hostname);
      return { ok: true };

    case "CLEAR_ALL_DOMAIN_CONFIGS":
      await clearAllDomainConfigs();
      return { ok: true };

    /* ── Thumbnails ── */
    case "GET_ALL_THUMBNAILS":
      return { ok: true, thumbnails: await getAllThumbnails() };

    case "GET_THUMBNAILS_FOR_HOST":
      return { ok: true, thumbnails: await getThumbnailsForHost(msg.hostname) };

    case "GET_THUMBNAIL":
      return { ok: true, thumbnail: await getThumbnail(msg.url) };

    case "TOUCH_THUMBNAIL":
      return {
        ok: true,
        thumbnail: await touchThumbnail(msg.url, msg.updates || {})
      };

    case "DELETE_THUMBNAIL":
      await deleteThumbnail(msg.url);
      return { ok: true };

    case "CLEAR_ALL_THUMBNAILS":
      await clearAllThumbnails();
      return { ok: true };

    /* ── Capture ── */
    case "CAPTURE_AND_SAVE": {
      console.log("[VTM] CAPTURE_AND_SAVE started for", msg.hostname);
      if (!tabId) return { ok: false, error: "No tab ID" };

      const targetUrl = msg.url || sender.tab?.url || "";
      const targetTitle = msg.title || targetUrl || "Untitled";
      const isAutoCapture = msg.source === "auto";
      const autoCaptureKey = buildAutoCaptureKey({
        ...msg,
        url: targetUrl,
        title: targetTitle
      });

      if (isAutoCapture) {
        if (inFlightAutoCaptures.has(targetUrl)) {
          return { ok: true, skipped: true, reason: "in-flight" };
        }

        if (hasRecentAutoCapture(targetUrl, autoCaptureKey)) {
          return { ok: true, skipped: true, reason: "recent" };
        }

        const existing = await getThumbnail(targetUrl);
        if (existing?.dataUrl && existing.title === targetTitle) {
          rememberAutoCapture(targetUrl, autoCaptureKey);
          return { ok: true, skipped: true, reason: "already-saved" };
        }

        inFlightAutoCaptures.add(targetUrl);
      }

      try {
        const tab = await browser.tabs.get(tabId);
        if (!tab.active) {
          console.log("[VTM] CAPTURE_AND_SAVE failed: Tab not active");
          return { ok: false, error: "Tab not active" };
        }

        console.log("[VTM] Capturing tab...", tabId, "Window:", tab.windowId);
        const fullDataUrl = await captureTab(tabId, tab.windowId);
        if (!fullDataUrl) {
          console.log("[VTM] CAPTURE_AND_SAVE failed: Capture returned null");
          return { ok: false, error: "Capture failed" };
        }

        console.log("[VTM] Capture successful, length:", fullDataUrl.length);
        let finalDataUrl = fullDataUrl;
        if (msg.rect && msg.rect.width > 0 && msg.rect.height > 0) {
          console.log("[VTM] Cropping image...", msg.rect);
          finalDataUrl = await cropImage(fullDataUrl, msg.rect);
          console.log("[VTM] Crop successful, new length:", finalDataUrl.length);
        }

        console.log("[VTM] Saving to IndexedDB...");
        try {
          await saveThumbnail({
            url: targetUrl,
            hostname: msg.hostname,
            title: targetTitle,
            dataUrl: finalDataUrl
          });
          console.log("[VTM] IndexedDB save successful!");
        } catch (dbErr) {
          console.error("[VTM] IndexedDB save error:", dbErr);
          return { ok: false, error: "DB Error: " + dbErr.message };
        }

        if (isAutoCapture) {
          rememberAutoCapture(targetUrl, autoCaptureKey);
        }

        return { ok: true };
      } finally {
        if (isAutoCapture) {
          inFlightAutoCaptures.delete(targetUrl);
        }
      }
    }

    case "CAPTURE_CURRENT_TAB": {
      if (!tabId) return { ok: false, error: "No tab ID" };

      const fullDataUrl = await captureTab(tabId);
      if (!fullDataUrl) return { ok: false, error: "Capture failed" };

      let finalDataUrl = fullDataUrl;
      if (msg.rect) {
        finalDataUrl = await cropImage(fullDataUrl, msg.rect);
      }

      await saveThumbnail({
        url: msg.url,
        hostname: msg.hostname,
        title: msg.title,
        dataUrl: finalDataUrl
      });

      return { ok: true };
    }

    /* ── Tabs ── */
    case "GET_TABS_FOR_HOST": {
      const tabs = await browser.tabs.query({});
      const filtered = tabs.filter(t => {
        try { return new URL(t.url).hostname === msg.hostname; }
        catch { return false; }
      });
      return { ok: true, tabs: filtered };
    }

    case "SWITCH_TO_TAB":
      try {
        await browser.tabs.update(msg.tabId, { active: true });
        if (msg.windowId) {
          await browser.windows.update(msg.windowId, { focused: true });
        }
      } catch (err) {
        console.error("[VTM] Tab switch failed:", err);
      }
      return { ok: true };

    case "GET_ACTIVE_HOSTNAME": {
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      if (!tabs.length || !tabs[0].url) return { ok: true, hostname: null };
      try {
        return { ok: true, hostname: new URL(tabs[0].url).hostname };
      } catch {
        return { ok: true, hostname: null };
      }
    }

    /* ── Picker ── */
    case "ACTIVATE_PICKER":
      await activatePicker(msg.tabId);
      return { ok: true };

    case "SELECTOR_PICKED":
      await saveSelector(msg.hostname, msg.selector);
      return { ok: true };

    /* ── Rules ── */
    case "SAVE_RULE":
      await saveRule(msg.hostname, msg.keyword);
      return { ok: true };

    case "GET_ALL_RULES":
      return { ok: true, rules: await getAllRules() };

    case "DELETE_RULE":
      await deleteRule(msg.index);
      return { ok: true };

    case "CHECK_RULES":
      {
        const { rules, matching } = await inspectRules(msg.hostname, msg.title, msg.url);
        return {
          ok: true,
          matching,
          hasRules: rules.length > 0
        };
      }

    /* ── Settings ── */
    case "GET_SETTINGS":
      return { ok: true, settings: await getSettings() };

    case "SAVE_SETTING":
      await saveSetting(msg.key, msg.value);
      return { ok: true };

    /* ── Manager ── */
    case "OPEN_MANAGER":
      await openManager(msg.params || "");
      return { ok: true };

    default:
      return { ok: false, error: "Unknown: " + msg.type };
  }
}

/* ═══════════════════════════════════════════════
   Badge
   ═══════════════════════════════════════════════ */

async function updateBadge() {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length || !tabs[0].url) return;
    const hostname = new URL(tabs[0].url).hostname;
    if (!hostname) return;
    const selector = await getSelector(hostname);
    browser.action.setBadgeText({ text: selector ? "●" : "" });
    if (selector) {
      browser.action.setBadgeBackgroundColor({ color: "#4CAF50" });
    }
  } catch { /* ignore */ }
}

browser.tabs.onActivated.addListener(updateBadge);
browser.tabs.onUpdated.addListener(updateBadge);
browser.permissions.onAdded.addListener(() => {
  syncAutoCaptureContentScript().catch((err) => {
    console.error("[VTM] Failed to sync content scripts after permission grant:", err);
  });
});
browser.permissions.onRemoved.addListener(() => {
  syncAutoCaptureContentScript().catch((err) => {
    console.error("[VTM] Failed to sync content scripts after permission removal:", err);
  });
});

/* ═══════════════════════════════════════════════
   Init
   ═══════════════════════════════════════════════ */

async function initializeExtension() {
  await initDB();
  await ensureDefaultSettings();
  await syncAutoCaptureContentScript();
}

initializeExtension().catch(err => console.error("[VTM] Init failed:", err));

self.addEventListener("activate", () => {
  initializeExtension().catch(err => console.error("[VTM] Reinit failed:", err));
});
