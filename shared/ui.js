(() => {
  const LANGUAGES = Object.freeze(["en", "ru"]);
  const THEMES = Object.freeze(["dark", "light", "mrrobot"]);

  const messages = {
    en: {
      brand: {
        full: "Visual Tab Manager",
        short: "VTM",
        subtitle: "Visual tab manager"
      },
      common: {
        errorPrefix: "Error: "
      },
      popup: {
        pageTitle: "VTM",
        loading: "Loading…",
        selectorNotSet: "No selector configured",
        tabsOnSite: "Tabs on this site:",
        openManagerMode: "Open manager in:",
        modeTab: "Tab",
        modeWindow: "Window",
        pickElement: "Pick element",
        captureNow: "Capture now",
        manager: "Manager",
        settings: "Settings",
        reset: "Reset",
        unavailable: "Unavailable",
        notWebPage: "Not a web page",
        noActiveTab: "No active tab available",
        httpOnly: "Works only on http/https pages",
        deleteSelectorConfirm: "Delete selector for {hostname}?",
        selectorDeleted: "Selector deleted",
        captureSaved: "Screenshot saved",
        captureFailed: "Could not capture the current page",
        captureInProgress: "Capturing…",
        elementPicked: "Element selected: {selector}"
      },
      manager: {
        pageTitle: "VTM Manager",
        themeToggleTitle: "Switch theme",
        managerTab: "Manager",
        settingsTab: "Settings",
        domainLabel: "Domain",
        allDomains: "— All domains —",
        searchPlaceholder: "Search by title…",
        records: "items",
        refresh: "Refresh",
        clear: "Clear",
        getStarted: "Get started",
        getStartedDescription: "Open tabs, pick an element to capture, and navigate visually.",
        step1: "Click “Pick element” and choose the preview area.",
        step2: "Select a domain and click “Refresh”.",
        step3: "Click cards to switch between tabs.",
        noItems: "No items",
        noThumbnailsFor: "No thumbnails for",
        loadMore: "Load more",
        domainSettings: "Domain settings",
        domainSettingsDescription: "CSS selectors and title keywords used for thumbnail captures.",
        addOrEdit: "Add / edit",
        domain: "Domain",
        cssSelector: "CSS selector",
        keywordInTitle: "Title keyword",
        keywordPlaceholder: "Post (comma-separated)",
        save: "Save",
        savedConfigs: "Saved",
        loading: "Loading…",
        clearAllDomainSettings: "Delete all domain settings",
        irreversibleAction: "This action cannot be undone",
        system: "System",
        allowAutoCapture: "Enable auto capture",
        accessGranted: "Access granted",
        accessRevoked: "Access revoked",
        autoCaptureHint: "Grant access to all sites to capture elements automatically on newly opened pages without clicking the extension icon.",
        checking: "Checking…",
        allow: "Allow",
        revoke: "Revoke",
        captureDelay: "Capture delay",
        captureDelayHint: "Milliseconds. Increase it if the browser becomes sluggish.",
        milliseconds: "ms",
        display: "Display",
        thumbnailsPerPage: "Thumbnails per page",
        performanceHint: "Lower values improve performance",
        itemsUnit: "pcs",
        cardSize: "Card size",
        widthInPixels: "Width in pixels",
        theme: "Theme",
        themeHint: "Manager appearance",
        language: "Language",
        languageHint: "Popup, manager, and picker language",
        languageEnglish: "English",
        languageRussian: "Russian",
        themeDark: "🌙 Dark",
        themeLight: "☀️ Light",
        themeMrRobot: "💀 Mr. Robot",
        cardSizeSmall: "Small (180)",
        cardSizeMedium: "Medium (240)",
        cardSizeLarge: "Large (300)",
        cardSizeXL: "XL (360)",
        closedTabsTTL: "Closed tab lifetime",
        closedTabsTTLHint: "How long closed-tab thumbnails are kept before deletion",
        minutes: "min",
        blockNotFound: "Element not found",
        openTab: "Open tab",
        restore: "Restore",
        delete: "Delete",
        edit: "Edit",
        deleted: "Deleted",
        saved: "Saved",
        cleared: "Cleared",
        selectedFilters: "selected filters",
        delaySaved: "Capture delay saved",
        refreshing: "Refreshing…",
        dataRefreshed: "Data refreshed",
        deleteThumbnailConfirm: "Delete this thumbnail?",
        tabRestored: "Tab restored",
        restoreFailed: "Could not restore the tab",
        switchedToTab: "Switched to tab",
        openedNewTab: "Opened a new tab",
        deleteThumbnailsConfirm: "Delete all thumbnails for {target}?",
        deleteThumbnailsDone: "Thumbnails for {target} were removed",
        allDomainsTarget: "all domains",
        noDomainSettingsConfigured: "No domain settings yet",
        deleteDomainSettingsConfirm: "Delete all settings for {host}?",
        hostRequired: "Enter a domain",
        selectorOrKeywordRequired: "Enter a selector or a keyword",
        clearAllDomainSettingsConfirm: "Delete ALL domain settings?",
        permissionGrantedToast: "Access granted. Auto capture is enabled.",
        permissionNotGrantedToast: "Access was not granted",
        permissionRemovedFailedToast: "Could not revoke access",
        permissionChangeError: "Permission change failed"
      },
      picker: {
        clickElement: "Click an element to capture",
        cancel: "Cancel",
        saveFailed: "Save failed: {error}",
        selectedAndSaved: "Element selected and saved"
      }
    },
    ru: {
      brand: {
        full: "Visual Tab Manager",
        short: "VTM",
        subtitle: "Визуальный менеджер вкладок"
      },
      common: {
        errorPrefix: "Ошибка: "
      },
      popup: {
        pageTitle: "VTM",
        loading: "Загрузка…",
        selectorNotSet: "Селектор не задан",
        tabsOnSite: "Вкладок на сайте:",
        openManagerMode: "Открывать менеджер:",
        modeTab: "Вкладка",
        modeWindow: "Окно",
        pickElement: "Выбрать элемент",
        captureNow: "Захватить сейчас",
        manager: "Менеджер",
        settings: "Настройки",
        reset: "Сбросить",
        unavailable: "Недоступно",
        notWebPage: "Не веб-страница",
        noActiveTab: "Нет доступной вкладки",
        httpOnly: "Работает только на http/https страницах",
        deleteSelectorConfirm: "Удалить селектор для {hostname}?",
        selectorDeleted: "Селектор удалён",
        captureSaved: "Скриншот сохранён",
        captureFailed: "Не удалось захватить текущую страницу",
        captureInProgress: "Захват…",
        elementPicked: "Элемент выбран: {selector}"
      },
      manager: {
        pageTitle: "VTM Manager",
        themeToggleTitle: "Переключить тему",
        managerTab: "Менеджер",
        settingsTab: "Настройки",
        domainLabel: "Домен",
        allDomains: "— Все домены —",
        searchPlaceholder: "Поиск по названию…",
        records: "записей",
        refresh: "Обновить",
        clear: "Очистить",
        getStarted: "Начните работу",
        getStartedDescription: "Откройте вкладки, выберите элемент для захвата и управляйте вкладками визуально.",
        step1: "Нажмите «Выбрать элемент» и укажите область для превью.",
        step2: "Выберите домен и нажмите «Обновить».",
        step3: "Кликайте по карточкам для переключения между вкладками.",
        noItems: "Нет записей",
        noThumbnailsFor: "Нет миниатюр для",
        loadMore: "Загрузить ещё",
        domainSettings: "Настройки доменов",
        domainSettingsDescription: "CSS-селекторы и ключевые слова заголовка для захвата миниатюр.",
        addOrEdit: "Добавить / изменить",
        domain: "Домен",
        cssSelector: "CSS-селектор",
        keywordInTitle: "Ключ. слово в заголовке",
        keywordPlaceholder: "Post (через запятую)",
        save: "Сохранить",
        savedConfigs: "Сохранённые",
        loading: "Загрузка…",
        clearAllDomainSettings: "Удалить все настройки доменов",
        irreversibleAction: "Необратимое действие",
        system: "Система",
        allowAutoCapture: "Разрешить автозахват",
        accessGranted: "Доступ разрешён",
        accessRevoked: "Доступ отозван",
        autoCaptureHint: "Включите доступ ко всем сайтам, чтобы элементы сохранялись автоматически на новых страницах без нажатия на иконку расширения.",
        checking: "Проверка…",
        allow: "Разрешить",
        revoke: "Запретить",
        captureDelay: "Задержка между захватами",
        captureDelayHint: "В миллисекундах. Увеличьте, если браузер тормозит.",
        milliseconds: "мс",
        display: "Отображение",
        thumbnailsPerPage: "Миниатюр на странице",
        performanceHint: "Меньшие значения улучшают производительность",
        itemsUnit: "шт",
        cardSize: "Размер карточки",
        widthInPixels: "Ширина в пикселях",
        theme: "Тема",
        themeHint: "Оформление менеджера",
        language: "Язык",
        languageHint: "Язык popup, менеджера и picker",
        languageEnglish: "Английский",
        languageRussian: "Русский",
        themeDark: "🌙 Тёмная",
        themeLight: "☀️ Светлая",
        themeMrRobot: "💀 Mr. Robot",
        cardSizeSmall: "Мал. (180)",
        cardSizeMedium: "Средн. (240)",
        cardSizeLarge: "Больш. (300)",
        cardSizeXL: "XL (360)",
        closedTabsTTL: "Время жизни закрытых вкладок",
        closedTabsTTLHint: "Через сколько удаляются миниатюры закрытых вкладок",
        minutes: "мин",
        blockNotFound: "Элемент не найден",
        openTab: "Открыть вкладку",
        restore: "Восстановить",
        delete: "Удалить",
        edit: "Редактировать",
        deleted: "Удалено",
        saved: "Сохранено",
        cleared: "Очищено",
        selectedFilters: "выбранных фильтров",
        delaySaved: "Задержка сохранена",
        refreshing: "Обновление…",
        dataRefreshed: "Данные обновлены",
        deleteThumbnailConfirm: "Удалить эту миниатюру?",
        tabRestored: "Вкладка восстановлена",
        restoreFailed: "Не удалось восстановить вкладку",
        switchedToTab: "Переход на вкладку",
        openedNewTab: "Открыта новая вкладка",
        deleteThumbnailsConfirm: "Удалить все миниатюры для {target}?",
        deleteThumbnailsDone: "Миниатюры для {target} удалены",
        allDomainsTarget: "всех доменов",
        noDomainSettingsConfigured: "Нет настроек доменов",
        deleteDomainSettingsConfirm: "Удалить все настройки для {host}?",
        hostRequired: "Укажите домен",
        selectorOrKeywordRequired: "Укажите селектор или ключевое слово",
        clearAllDomainSettingsConfirm: "Удалить ВСЕ настройки доменов?",
        permissionGrantedToast: "Доступ разрешён. Автозахват работает.",
        permissionNotGrantedToast: "Доступ не предоставлен",
        permissionRemovedFailedToast: "Не удалось отозвать доступ",
        permissionChangeError: "Не удалось изменить разрешения"
      },
      picker: {
        clickElement: "Кликните на элемент для захвата",
        cancel: "Отмена",
        saveFailed: "Ошибка сохранения: {error}",
        selectedAndSaved: "Элемент выбран и сохранён"
      }
    }
  };

  function normalizeLanguage(language) {
    return LANGUAGES.includes(language) ? language : "en";
  }

  function normalizeTheme(theme) {
    return THEMES.includes(theme) ? theme : "mrrobot";
  }

  function getMessage(language, key) {
    return key.split(".").reduce((value, segment) => value?.[segment], messages[normalizeLanguage(language)]);
  }

  function t(language, key, vars = {}) {
    const template = getMessage(language, key) ?? getMessage("en", key) ?? key;
    return String(template).replace(/\{(\w+)\}/g, (_, name) => {
      return Object.prototype.hasOwnProperty.call(vars, name) ? String(vars[name]) : `{${name}}`;
    });
  }

  function applyTranslations(root, language) {
    const lang = normalizeLanguage(language);

    root.querySelectorAll("[data-i18n]").forEach((element) => {
      element.textContent = t(lang, element.dataset.i18n);
    });

    root.querySelectorAll("[data-i18n-title]").forEach((element) => {
      element.title = t(lang, element.dataset.i18nTitle);
    });

    root.querySelectorAll("[data-i18n-placeholder]").forEach((element) => {
      element.placeholder = t(lang, element.dataset.i18nPlaceholder);
    });

    root.querySelectorAll("[data-i18n-aria-label]").forEach((element) => {
      element.setAttribute("aria-label", t(lang, element.dataset.i18nAriaLabel));
    });

    root.querySelectorAll("[data-i18n-tooltip]").forEach((element) => {
      element.setAttribute("data-tooltip", t(lang, element.dataset.i18nTooltip));
    });
  }

  globalThis.VTM_UI = Object.freeze({
    languages: LANGUAGES,
    themes: THEMES,
    messages,
    normalizeLanguage,
    normalizeTheme,
    t,
    applyTranslations
  });
})();
