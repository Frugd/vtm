/**
 * content-picker.js - Element picker for Visual Tab Manager
 * Injected via scripting.executeScript. Highlights elements on hover,
 * generates a CSS selector on click, saves it, and captures immediately.
 */

(async () => {
  const shared = globalThis.VTM_UI || {};
  const normalizeLanguage = shared.normalizeLanguage || ((value) => value === "ru" ? "ru" : "en");
  const normalizeTheme = shared.normalizeTheme || ((value) => ["dark", "light", "mrrobot"].includes(value) ? value : "mrrobot");
  const translate = shared.t || ((language, key) => key);

  let language = "en";
  let theme = "mrrobot";

  try {
    const response = await browser.runtime.sendMessage({ type: "GET_SETTINGS" });
    if (response?.ok) {
      language = normalizeLanguage(response.settings?.language);
      theme = normalizeTheme(response.settings?.theme);
    }
  } catch {
    // Use defaults when runtime settings are unavailable.
  }

  const t = (key, vars) => translate(language, key, vars);

  if (window.__VTM_PICKER_ACTIVE) {
    if (window.__VTM_PICKER_CLEANUP) {
      window.__VTM_PICKER_CLEANUP();
    }
  }

  window.__VTM_PICKER_ACTIVE = true;
  document.documentElement.setAttribute("data-vtm-picker", "");

  const palette = getPickerPalette(theme);

  const overlay = document.createElement("div");
  overlay.id = "__vtm_overlay__";
  overlay.style.cssText = `
    position:fixed!important;
    pointer-events:none!important;
    z-index:2147483646!important;
    border:2px solid ${palette.accent}!important;
    background:${palette.fill}!important;
    border-radius:4px!important;
    transition:all 0.08s ease!important;
    box-shadow:0 0 0 3px ${palette.shadow}!important;
    display:none!important;
  `;
  document.documentElement.appendChild(overlay);

  const tooltip = document.createElement("div");
  tooltip.id = "__vtm_tooltip__";
  tooltip.style.cssText = `
    position:fixed!important;
    z-index:2147483647!important;
    background:${palette.tooltipBackground}!important;
    color:${palette.accent}!important;
    font:11px/1.4 'Consolas','Fira Code',monospace!important;
    padding:4px 8px!important;
    border-radius:5px!important;
    border:1px solid ${palette.tooltipBorder}!important;
    pointer-events:none!important;
    max-width:400px!important;
    word-break:break-all!important;
    display:none!important;
    box-shadow:0 2px 12px rgba(0,0,0,0.5)!important;
  `;
  document.documentElement.appendChild(tooltip);

  const banner = document.createElement("div");
  banner.id = "__vtm_banner__";
  banner.style.cssText = `
    position:fixed!important;
    top:0!important;
    left:0!important;
    right:0!important;
    z-index:2147483647!important;
    background:${palette.banner}!important;
    color:#ffffff!important;
    font:600 13px/1 'Segoe UI',system-ui,sans-serif!important;
    padding:10px 16px!important;
    text-align:center!important;
    display:flex!important;
    align-items:center!important;
    justify-content:center!important;
    gap:8px!important;
  `;
  const bannerIcon = document.createElement("span");
  bannerIcon.style.fontSize = "15px";
  bannerIcon.textContent = "🎯";

  const bannerText = document.createElement("span");
  bannerText.textContent = t("picker.clickElement");

  const bannerCancel = document.createElement("span");
  bannerCancel.id = "__vtm_cancel__";
  bannerCancel.style.marginLeft = "auto";
  bannerCancel.style.background = "rgba(0,0,0,0.2)";
  bannerCancel.style.borderRadius = "4px";
  bannerCancel.style.padding = "2px 8px";
  bannerCancel.style.fontSize = "11px";
  bannerCancel.style.cursor = "pointer";
  bannerCancel.style.flexShrink = "0";
  bannerCancel.textContent = `✕ ${t("picker.cancel")}`;

  banner.append(bannerIcon, bannerText, bannerCancel);
  document.documentElement.appendChild(banner);

  document.getElementById("__vtm_cancel__")?.addEventListener("click", (event) => {
    event.stopPropagation();
    cleanup();
  });

  function generateSelector(element) {
    const isUnique = (selector) => {
      try {
        return document.querySelectorAll(selector).length === 1;
      } catch {
        return false;
      }
    };

    function getPartFor(node) {
      const tag = node.tagName.toLowerCase();

      if (node.id && /^[a-zA-Z][\w-]*$/.test(node.id)) {
        const selector = `#${CSS.escape(node.id)}`;
        if (isUnique(selector)) return selector;
      }

      const attributes = ["data-testid", "data-qa", "data-id", "data-key", "data-cy", "aria-label"];
      for (const attribute of attributes) {
        const value = node.getAttribute(attribute);
        if (value && value.length < 60) {
          const selector = `${tag}[${attribute}="${CSS.escape(value)}"]`;
          if (isUnique(selector)) return selector;
        }
      }

      const classes = getGoodClasses(node);
      if (classes.length > 0) {
        for (const className of classes) {
          const selector = `${tag}.${CSS.escape(className)}`;
          if (isUnique(selector)) return selector;
        }
        if (classes.length >= 2) {
          const selector = `${tag}.${CSS.escape(classes[0])}.${CSS.escape(classes[1])}`;
          if (isUnique(selector)) return selector;
        }
        return `${tag}.${classes.slice(0, 2).map((className) => CSS.escape(className)).join(".")}`;
      }

      const parent = node.parentElement;
      if (parent) {
        const siblings = [...parent.children].filter((child) => child.tagName === node.tagName);
        if (siblings.length > 1) {
          return `${tag}:nth-of-type(${siblings.indexOf(node) + 1})`;
        }
      }

      return tag;
    }

    function getGoodClasses(node) {
      const skipPatterns = [
        /^(js-|is-|has-|state-|active|disabled|selected|hover|focus|visible|hidden|open|closed)/i,
        /^(col-|row-|d-|m-|p-|mt-|mb-|ml-|mr-|pt-|pb-|pl-|pr-|px-|py-|mx-|my-|gap-|text-|bg-|border-|rounded-|shadow-|flex|grid|w-|h-|min-|max-)/i,
        /^ng-/,
        /^v-/
      ];

      return [...node.classList]
        .filter((className) => {
          return className &&
            className.length >= 2 &&
            className.length <= 50 &&
            !/^\d/.test(className) &&
            !skipPatterns.some((pattern) => pattern.test(className));
        })
        .slice(0, 3);
    }

    const quickSelector = getPartFor(element);
    if (isUnique(quickSelector)) return quickSelector;

    const parts = [];
    let node = element;

    while (node && node !== document.documentElement) {
      parts.unshift(getPartFor(node));
      const selector = parts.join(" > ");
      if (isUnique(selector)) return selector;
      node = node.parentElement;
    }

    return parts.join(" > ");
  }

  function onMouseMove(event) {
    const target = event.target;
    if (!target || target === overlay || target === tooltip || target === banner || banner.contains(target)) return;

    const rect = target.getBoundingClientRect();
    overlay.style.cssText += `
      display:block!important;
      left:${rect.left}px!important;
      top:${rect.top}px!important;
      width:${rect.width}px!important;
      height:${rect.height}px!important;
    `;

    tooltip.textContent = generateSelector(target);
    tooltip.style.display = "block";

    let tooltipX = rect.left;
    let tooltipY = rect.bottom + 6;

    if (tooltipX + 340 > window.innerWidth) tooltipX = window.innerWidth - 348;
    if (tooltipY + 40 > window.innerHeight) tooltipY = rect.top - 30;
    if (tooltipY < 50) tooltipY = 50;

    tooltip.style.left = `${Math.max(4, tooltipX)}px`;
    tooltip.style.top = `${tooltipY}px`;
  }

  function onMouseOut() {
    overlay.style.display = "none";
    tooltip.style.display = "none";
  }

  async function onClick(event) {
    if (banner.contains(event.target)) return;

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const target = event.target;
    const selector = generateSelector(target);
    const hostname = window.location.hostname;

    try {
      const response = await browser.runtime.sendMessage({
        type: "SELECTOR_PICKED",
        hostname,
        selector
      });

      if (!response?.ok) {
        showNotification(
          t("picker.saveFailed", { error: response?.error || "unknown" }),
          "",
          { primary: "#7f1d1d", secondary: "#b91c1c" }
        );
        cleanup();
        return;
      }

      cleanup();
      await new Promise((resolve) => setTimeout(resolve, 400));

      const element = document.querySelector(selector);
      if (element) {
        element.scrollIntoView({ behavior: "auto", block: "center", inline: "center" });
        await new Promise((resolve) => setTimeout(resolve, 300));

        const rect = element.getBoundingClientRect();
        await browser.runtime.sendMessage({
          type: "CAPTURE_AND_SAVE",
          selector,
          hostname,
          url: window.location.href,
          title: document.title || window.location.pathname,
          rect: {
            x: Math.round(rect.left),
            y: Math.round(rect.top),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            dpr: window.devicePixelRatio || 1
          }
        });
      }

      const successPalette = theme === "mrrobot"
        ? { primary: "#7f1d1d", secondary: "#b91c1c" }
        : { primary: "#2e7d32", secondary: "#4caf50" };

      showNotification(t("picker.selectedAndSaved"), selector, successPalette);
    } catch (error) {
      showNotification(error.message, "", { primary: "#7f1d1d", secondary: "#b91c1c" });
      cleanup();
    }
  }

  function onKeyDown(event) {
    if (event.key === "Escape") {
      cleanup();
    }
  }

  document.addEventListener("mousemove", onMouseMove, true);
  document.addEventListener("mouseout", onMouseOut, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);

  function showNotification(message, selector, colors) {
    if (!document.getElementById("__vtm_kf__")) {
      const style = document.createElement("style");
      style.id = "__vtm_kf__";
      style.textContent = `
        @keyframes __vtm_fi {
          from { opacity: 0; transform: translateX(-50%) translateY(-8px); }
          to { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }

    const notification = document.createElement("div");
    notification.id = "__vtm_notification__";
    notification.style.cssText = `
      position:fixed!important;
      top:50px!important;
      left:50%!important;
      transform:translateX(-50%)!important;
      z-index:2147483647!important;
      background:linear-gradient(135deg, ${colors.primary}, ${colors.secondary})!important;
      color:#ffffff!important;
      font:600 13px/1.5 'Segoe UI',system-ui,sans-serif!important;
      padding:12px 20px!important;
      border-radius:10px!important;
      box-shadow:0 4px 20px rgba(0,0,0,0.4)!important;
      max-width:480px!important;
      text-align:center!important;
      animation:__vtm_fi 0.3s ease!important;
    `;

    const messageLine = document.createElement("div");
    messageLine.textContent = message;
    notification.appendChild(messageLine);

    if (selector) {
      const selectorLine = document.createElement("div");
      selectorLine.style.fontSize = "10px";
      selectorLine.style.opacity = "0.8";
      selectorLine.style.fontFamily = "monospace";
      selectorLine.style.marginTop = "4px";
      selectorLine.style.wordBreak = "break-all";
      selectorLine.textContent = selector;
      notification.appendChild(selectorLine);
    }

    document.documentElement.appendChild(notification);
    setTimeout(() => notification.remove(), 4000);
  }

  let cleanedUp = false;

  function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;

    document.removeEventListener("mousemove", onMouseMove, true);
    document.removeEventListener("mouseout", onMouseOut, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);

    try { overlay.remove(); } catch {}
    try { tooltip.remove(); } catch {}
    try { banner.remove(); } catch {}

    document.documentElement.removeAttribute("data-vtm-picker");
    window.__VTM_PICKER_ACTIVE = false;
    window.__VTM_PICKER_CLEANUP = null;
  }

  window.__VTM_PICKER_CLEANUP = cleanup;
})();

function getPickerPalette(theme) {
  const palettes = {
    dark: {
      accent: "#4f8ef7",
      fill: "rgba(79, 142, 247, 0.12)",
      shadow: "rgba(79, 142, 247, 0.25)",
      tooltipBackground: "#0f1123",
      tooltipBorder: "#2d3561",
      banner: "linear-gradient(135deg, #4f8ef7, #7c4dff)"
    },
    light: {
      accent: "#3a7bd5",
      fill: "rgba(58, 123, 213, 0.12)",
      shadow: "rgba(58, 123, 213, 0.25)",
      tooltipBackground: "#ffffff",
      tooltipBorder: "#bfd0f5",
      banner: "linear-gradient(135deg, #3a7bd5, #6200ea)"
    },
    mrrobot: {
      accent: "#b91c1c",
      fill: "rgba(185, 28, 28, 0.12)",
      shadow: "rgba(185, 28, 28, 0.28)",
      tooltipBackground: "#0b0b0b",
      tooltipBorder: "#4b1111",
      banner: "linear-gradient(135deg, #7f1d1d, #b91c1c)"
    }
  };

  return palettes[theme] || palettes.mrrobot;
}

void 0;
