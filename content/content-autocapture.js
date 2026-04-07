/**
 * content-autocapture.js - Auto-capture thumbnails on tab visibility
 */

(function() {
  "use strict";

  function isValidPage() {
    const protocol = window.location.protocol;
    if (protocol === "about:" || protocol === "chrome:" || protocol === "moz-extension:") {
      return false;
    }

    return !window.location.href.includes("moz-extension://");
  }

  if (!isValidPage()) return;

  const hostname = window.location.hostname;
  let lastCapture = 0;
  let cooldownMs = 100;
  let autoCaptureEnabled = false;
  let captureInProgress = false;
  let lastCapturedFingerprint = "";
  let lastObservedPageKey = "";

  function getPageKey() {
    return `${window.location.href}|${document.title}`;
  }

  function getVisibleRect(element) {
    const rect = element.getBoundingClientRect();
    const left = Math.max(0, rect.left);
    const top = Math.max(0, rect.top);
    const right = Math.min(window.innerWidth, rect.right);
    const bottom = Math.min(window.innerHeight, rect.bottom);
    const width = right - left;
    const height = bottom - top;

    if (width < 10 || height < 10) return null;

    return {
      x: Math.round(left),
      y: Math.round(top),
      width: Math.round(width),
      height: Math.round(height)
    };
  }

  function buildCaptureFingerprint({ url, title, selector, matchingRules, captureRect }) {
    const keywordKey = matchingRules
      .map(rule => String(rule.keyword || "").toLowerCase())
      .sort()
      .join(",");

    const rectKey = captureRect
      ? [captureRect.x, captureRect.y, captureRect.width, captureRect.height].join(":")
      : "none";

    return [url, title, selector || "", keywordKey, rectKey].join("|");
  }

  async function hasSavedThumbnail(url, title) {
    try {
      const response = await browser.runtime.sendMessage({
        type: "GET_THUMBNAIL",
        url
      });

      return Boolean(
        response?.ok &&
        response.thumbnail?.dataUrl &&
        (response.thumbnail.title || "") === title
      );
    } catch {
      return false;
    }
  }

  async function tryCapture(force = false, source = "auto") {
    if (captureInProgress) return;

    const url = window.location.href;
    const title = document.title || window.location.pathname || url;

    let selector = null;
    let matchingRules = [];
    let hasRules = false;

    try {
      const rulesResponse = await browser.runtime.sendMessage({
        type: "CHECK_RULES",
        hostname,
        title,
        url
      });

      if (rulesResponse?.ok) {
        matchingRules = Array.isArray(rulesResponse.matching) ? rulesResponse.matching : [];
        hasRules = Boolean(rulesResponse.hasRules);
      }
    } catch {
      // Ignore and continue: selector-only capture still may apply.
    }

    try {
      const selectorResponse = await browser.runtime.sendMessage({
        type: "GET_SELECTOR",
        hostname
      });

      if (selectorResponse?.ok && selectorResponse.selector) {
        selector = selectorResponse.selector;
      }
    } catch {
      return;
    }

    const ruleMatched = matchingRules.length > 0;
    const canUseSelector = Boolean(selector) && (!hasRules || ruleMatched);
    const allowViewportCapture = !selector && ruleMatched;

    if (!canUseSelector && !allowViewportCapture) return;

    let captureRect = null;

    if (canUseSelector) {
      try {
        const element = document.querySelector(selector);
        if (element) {
          captureRect = getVisibleRect(element);
        }
      } catch {
        return;
      }
    }

    if (!captureRect && allowViewportCapture) {
      captureRect = {
        x: 0,
        y: 0,
        width: window.innerWidth,
        height: window.innerHeight
      };
    }

    if (!captureRect) return;

    const fingerprint = buildCaptureFingerprint({
      url,
      title,
      selector: canUseSelector ? selector : "",
      matchingRules,
      captureRect
    });

    if (!force && fingerprint === lastCapturedFingerprint) return;

    if (!force && await hasSavedThumbnail(url, title)) {
      lastCapturedFingerprint = fingerprint;
      return;
    }

    const notification = document.getElementById("__vtm_notification__");
    if (notification) notification.style.display = "none";

    captureInProgress = true;

    try {
      const response = await browser.runtime.sendMessage({
        type: "CAPTURE_AND_SAVE",
        source,
        selector: canUseSelector ? selector : "",
        hostname,
        url,
        title,
        rect: {
          ...captureRect,
          dpr: window.devicePixelRatio || 1
        }
      });

      if (response?.ok) {
        lastCapturedFingerprint = fingerprint;
      }
    } catch (err) {
      console.error("[VTM] Capture error:", err.message);
    } finally {
      captureInProgress = false;
    }
  }

  browser.runtime.sendMessage({ type: "GET_SETTINGS" })
    .then(response => {
      if (response?.ok) {
        cooldownMs = parseInt(response.settings?.captureDelay, 10) || 100;
        autoCaptureEnabled = response.settings?.autoCaptureEnabled === true;
      }
    })
    .catch(() => {});

  function triggerCapture(force = false) {
    if (!autoCaptureEnabled && !force) return;
    if (document.visibilityState !== "visible") return;

    const pageKey = getPageKey();
    if (pageKey !== lastObservedPageKey) {
      lastObservedPageKey = pageKey;
      lastCapturedFingerprint = "";
      lastCapture = 0;
    }

    const now = Date.now();
    if (!force && (now - lastCapture) < cooldownMs) return;

    lastCapture = now;
    void tryCapture(force, "auto");
  }

  browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg.type === "CAPTURE_NOW") {
      const source = msg.source === "manual" ? "manual" : "auto";
      tryCapture(source === "manual", source).then(() => sendResponse({ ok: true }));
      return true;
    }
  });

  document.addEventListener("visibilitychange", () => triggerCapture(false));
  window.addEventListener("pageshow", () => triggerCapture(false));
  window.addEventListener("popstate", () => triggerCapture(false));
  window.addEventListener("hashchange", () => triggerCapture(false));

  setInterval(() => triggerCapture(false), 2000);

  if (document.visibilityState === "visible") {
    setTimeout(() => triggerCapture(false), 500);
  }
})();
