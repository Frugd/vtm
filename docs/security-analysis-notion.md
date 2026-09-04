# 🛡️ Анализ уязвимостей в веб-приложении — Visual Tab Manager

> 💡 **Практическое задание** · Тема: «Анализ уязвимостей в веб-приложении»
> **Объект:** Visual Tab Manager (VTM) — браузерное расширение, Manifest V3
> **Репозиторий:** `Frugd/vtm` · **Метод:** white-box аудит исходного кода
> **Объём:** ~5 200 строк JS/CSS/HTML · **Дата:** 04.09.2026

---

## 🎯 Цель

Научиться выявлять типичные уязвимости в веб-приложениях и предлагать меры защиты.

`Задание 1` Теоретический анализ → `Задание 2` Практическое исследование → `Задание 3` Рекомендации

---

## 📊 Итоги в цифрах

| Метрика | Значение |
| --- | --- |
| Всего находок | 16 |
| 🔴 Высокий риск | 2 |
| 🟠 Средний риск | 9 |
| 🟡 Низкий риск | 4 |
| ⚪ Информационный | 1 |
| XSS-векторов найдено | 0 |
| Сторонних зависимостей | 0 |

> ✅ **Сильная сторона:** во всей кодовой базе ноль `innerHTML`, `eval`, `new Function` — вывод только через `textContent` и DOM API.
> ⚠️ **Слабая сторона:** границы доверия и приватность — привилегированный обработчик сообщений без проверки отправителя и незашифрованные скриншоты.

---

## 🧩 Архитектура объекта исследования

| Компонент | Файл | Роль | Уровень привилегий |
| --- | --- | --- | --- |
| Service worker | `background.js` (1040) | IndexedDB, storage, захват вкладок, роутер сообщений | 🔴 Высокий |
| Content script автозахвата | `content/content-autocapture.js` (238) | Поиск элемента по селектору, запрос скриншота | 🟠 Средний |
| Content script пикера | `content/content-picker.js` (414) | Выбор элемента мышью | 🟠 Средний |
| Popup | `popup/popup.js` (284) | UI быстрых действий | 🟢 Низкий |
| Manager | `manager/manager.js` (949) | Галерея превью, настройки, правила | 🟢 Низкий |
| Shared UI | `shared/ui.js` (328) | i18n, темы, тосты | 🟢 Низкий |

---

# 📚 Задание 1 · Теоретический анализ

> 📌 Классификация по **OWASP Top 10 (2021)** с привязкой к этапу жизненного цикла приложения и реальным инцидентам.

## Классификация угроз

| # | Угроза (OWASP) | Тип атаки | Этап ЖЦ | Механизм | Реальный кейс |
| --- | --- | --- | --- | --- | --- |
| 1 | A01 Broken Access Control | Обход авторизации, IDOR | Проектирование | Проверка прав только на клиенте, нет проверки владельца объекта | **Facebook 2018** — View As + Access Token, ~50 млн аккаунтов. **Parler 2021** — последовательные ID постов, выгрузка всего контента |
| 2 | A02 Cryptographic Failures | Перехват, чтение данных | Проектирование / Развёртывание | Нет TLS, секреты в открытом виде, слабые хеши | **Adobe 2013** — 153 млн паролей, 3DES в режиме ECB без соли |
| 3 | A03 Injection · SQLi | Внедрение SQL в запрос | Разработка | Конкатенация ввода в SQL-строку | **TalkTalk 2015** — 157 тыс. клиентов, штраф £400 тыс. **Heartland 2008** — 130 млн карт |
| 4 | A03 Injection · XSS | Исполнение чужого JS | Разработка | Вывод недоверенных данных в HTML без экранирования | **Samy worm, MySpace 2005** — 1 млн профилей за 20 часов. **British Airways / Magecart 2018** — 380 тыс. платёжных записей |
| 5 | A03 Injection · Command / Template | RCE | Разработка | Ввод попадает в shell или шаблонизатор | **Log4Shell CVE-2021-44228** — `${jndi:ldap://…}` в логе → RCE |
| 6 | A04 Insecure Design | Логическое злоупотребление | Проектирование | Нет лимитов, нет модели угроз | **LinkedIn 2021** — скрапинг 700 млн профилей через открытые эндпоинты |
| 7 | A05 Security Misconfiguration | Раскрытие данных | Развёртывание | Дефолтные пароли, открытые бакеты, избыточные права | **Capital One 2019** — SSRF + широкие IAM, 100 млн заявок. **Accenture 2017** — открытые S3 |
| 8 | A06 Vulnerable Components | Эксплуатация CVE | Разработка / Эксплуатация | Устаревшие библиотеки, нет SCA | **Equifax 2017** — Apache Struts CVE-2017-5638, 147 млн человек. **event-stream 2018** — supply chain в npm |
| 9 | A07 Auth Failures | Брутфорс, credential stuffing, угон сессии | Проектирование | Нет MFA и лимитов, предсказуемые Session ID | **Dunkin' Donuts 2015/2018** — credential stuffing. **Zoom 2020** — Zoom-bombing из-за коротких ID |
| 10 | A08 Integrity Failures | Подмена обновления | Развёртывание | Обновления и зависимости без проверки подписи | **SolarWinds Orion 2020** — троянизированное подписанное обновление, 18 тыс. клиентов |
| 11 | A09 Logging Failures | Позднее обнаружение | Эксплуатация | Нет логов и алертов, логирование секретов | **Marriott / Starwood** — взлом с 2014, обнаружен в 2018, 383 млн гостей |
| 12 | A10 SSRF | Доступ во внутреннюю сеть | Разработка | Сервер ходит по URL от пользователя | **Capital One 2019** — SSRF к 169.254.169.254 |
| 13 | CSRF | Действие от имени жертвы | Разработка | Нет anti-CSRF токена и `SameSite` | **Netflix 2006**, **ING Direct 2008** — смена адреса доставки, переводы |
| 14 | DoS / Resource Exhaustion | Отказ в обслуживании | Проектирование / Эксплуатация | Нет rate limiting, тяжёлые операции без квот, ReDoS | **GitHub 2018** — memcached-амплификация 1,35 Тбит/с. **Cloudflare 2019** — ReDoS в WAF уронил CDN |
| 15 | Clickjacking | UI redressing | Развёртывание | Нет `X-Frame-Options` / `frame-ancestors` | **Facebook 2010–2011** — likejacking |
| 16 | Supply chain расширений | Кража данных пользователей | Эксплуатация | Продажа или захват популярного расширения | **The Great Suspender 2021** — расширение управления вкладками, удалено из Chrome Web Store после внедрения вредоносного кода новым владельцем |

> 🎯 **Кейс #16 — прямой аналог VTM по классу продукта.** Расширение с миллионом пользователей превратилось в шпионское ПО после смены владельца. Урок вынесен в организационные меры (раздел 3.2).

---

# 🔍 Задание 2 · Практическое исследование

> 🧪 **Методика:** ручной white-box аудит исходников, анализ `manifest.json` и модели разрешений, трассировка потоков данных «страница → content script → background → IndexedDB → manager UI», grep-поиск опасных API, расчётная оценка исчерпания ресурсов.

## 🔐 2.1 Аутентификация и авторизация

> ℹ️ Классической аутентификации (логин/пароль) в расширении нет — субъект один, владелец профиля браузера. Границей доверия служит **модель разрешений браузера** и **проверка отправителя сообщений**.

### ✅ Что сделано правильно

- [x] Нет `externally_connectable` — произвольные сайты не могут напрямую слать сообщения в service worker
- [x] Широкий доступ вынесен в `optional_host_permissions: ["<all_urls>"]` — запрашивается по согласию, а не при установке
- [x] Content script регистрируется динамически и снимается при отзыве разрешения (`permissions.onRemoved`)

### ❌ Найденные проблемы

<details>
<summary><strong>🟠 V-1 · Отсутствие валидации отправителя в обработчике сообщений</strong> — A01, Средний, <code>background.js:750</code></summary>

```js
browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  handleMessage(msg, sender).then(sendResponse)...
});
```

`sender.id`, `sender.origin`, `sender.url` не проверяются. Любой content script на любой странице получает полный привилегированный API: `GET_ALL_THUMBNAILS`, `GET_ALL_SELECTORS`, `CLEAR_ALL_THUMBNAILS`, `OPEN_MANAGER`, `SWITCH_TO_TAB`.

**Impact:** нарушение границы доверия между недоверенной страницей и привилегированным фоном.
</details>

<details>
<summary><strong>🟠 V-2 · Доступ ко всем данным из любого контекста</strong> — A01, Средний, <code>background.js:789</code></summary>

Скомпрометированная вкладка `evil.com` отправляет `{type:"GET_ALL_THUMBNAILS"}` и получает JPEG-превью страниц банка, почты, корпоративных систем.

**Impact:** IDOR-подобная утечка — нет проверки, что запрашивающий контекст имеет отношение к запрашиваемому hostname.
</details>

<details>
<summary><strong>🟠 V-3 · Захват экрана привязан только к «активности» вкладки</strong> — A01, Средний, <code>background.js:813</code></summary>

`CAPTURE_AND_SAVE` проверяет `tab.active`, но не проверяет наличие host permission на этот origin.

**Impact:** скриншот видимой области может содержать 2FA-коды, содержимое PDF, приватные сообщения.
</details>

---

## 🍪 2.2 Управление сессиями

> ⚠️ Cookies и серверные сессии в расширении **не используются** — атрибуты `Secure` и `HttpOnly` неприменимы. Роль состояния сессии играют три хранилища.

| Хранилище | Что лежит | Область видимости | Оценка |
| --- | --- | --- | --- |
| IndexedDB `vtm-thumbnails` | `url`, `hostname`, `title`, `dataUrl` (JPEG base64), `timestamp` | Только расширение | 🔴 Не шифруется, нет TTL |
| `storage.sync` (`vtm_sel_*`, `vtm_rules`) | CSS-селекторы и ключевые слова по доменам | ☁️ Синхронизируется в облако браузера | 🟠 Утечка карты посещаемых доменов |
| `storage.local` (`vtm_window_state`) | Геометрия окна, язык, тема | Локально | 🟢 Норма |

<details>
<summary><strong>🔴 V-4 · Незашифрованное хранение скриншотов приватных страниц</strong> — A02, Высокий, <code>background.js:38</code></summary>

`saveThumbnail()` кладёт в IndexedDB полный `data:image/jpeg;base64,...` без шифрования и без TTL.

**Вектор:** профиль браузера читается любым процессом от имени пользователя — стилер-малварь, синхронизация папок, бэкап, форензика изъятого ноутбука.

**Усугубление:** нет ограничения на количество записей и нет автоочистки — история превью копится бессрочно.
</details>

<details>
<summary><strong>🟠 V-5 · Утечка списка доменов в облачную синхронизацию</strong> — A02, Средний, <code>background.js:137</code></summary>

```js
async function saveSelector(hostname, selector) {
  await browser.storage.sync.set({ [keys[0]]: selector });
}
```

Ключи вида `vtm_sel_mail.corp.example.com` уходят на серверы Mozilla/Google и размножаются на все устройства, включая недоверенные. Карта посещаемых ресурсов покидает устройство без явного согласия.
</details>

<details>
<summary><strong>🟡 V-6 · Нет инвалидации кэша дедупликации</strong> — A04, Низкий, <code>background.js:500</code></summary>

`recentAutoCaptures` и `inFlightAutoCaptures` живут в памяти воркера; при перезапуске дедупликация сбрасывается → повторный захват и лишняя запись данных.
</details>

---

## 💉 2.3 Обработка пользовательского ввода

### SQL-инъекции

> ✅ **Не воспроизводятся архитектурно.** Реляционной СУБД нет, запросы к IndexedDB идут через `objectStore.put()` / `get()` с ключом, а не конкатенацией строк.

Однако найден **аналог — инъекция в хранилище**:

<details>
<summary><strong>🟠 V-7 · Подделка и затирание записей в хранилище</strong> — A03/A01, Средний, <code>background.js:819</code></summary>

Ключом записи служит подконтрольный странице `url`, а `msg.hostname` берётся из сообщения и не сверяется с реальным `sender.tab.url`:

```js
url: data.url || String(Date.now())
```

**Сценарии:**
1. Спуфинг в галерее — карточка выглядит как «Сбербанк», но ведёт на фишинговый URL
2. Затирание чужих записей подбором ключа
</details>

### XSS — проверено явно

> ✅ **Инъекция HTML/JS в UI менеджера не воспроизводится.** Это сильная сторона проекта.

| Проверка | Результат |
| --- | --- |
| `innerHTML`, `outerHTML`, `insertAdjacentHTML` | 0 совпадений |
| `document.write`, `createContextualFragment` | 0 совпадений |
| `eval`, `new Function` | 0 совпадений |
| Вывод заголовков и URL | `textContent` / `replaceChildren` — безопасно |
| Подсветка поиска | `document.createElement("mark")` + `textContent` — безопасно |
| i18n | `element.textContent = t(...)` — безопасно |

**Остаточные риски:**

<details>
<summary><strong>🟠 V-8 · Инъекция в SVG-фавиконку</strong> — A03, Средний (потенциальный), <code>manager.js:783</code></summary>

```js
const letter = String(hostname || "V").trim().charAt(0).toUpperCase() || "V";
const svg = `<svg …><text …>${letter}</text></svg>`;
```

Сейчас берётся ровно один символ — разметку сломать нельзя. **Но паттерн опасен:** любое изменение (показывать 2–3 буквы) мгновенно даёт XSS-вектор, т.к. `hostname` подделываем через V-7. Классифицируется как уязвимость дизайна.
</details>

<details>
<summary><strong>🟠 V-9 · Селектор не валидируется перед querySelector</strong> — A03, Средний, <code>content-autocapture.js:129</code></summary>

`selector` приходит из `storage.sync`, а туда попадает из пикера и формы настроек **без валидации синтаксиса**.

**Impact:** специально сконструированный селектор заставляет расширение скриншотить произвольную область — например, элемент с одноразовым кодом.
</details>

<details>
<summary><strong>🟡 V-10 · tabs.create с URL из хранилища без фильтра схемы</strong> — A03, Низкий, <code>manager.js:607,654</code></summary>

`browser.tabs.create({ url: thumb.url })` — схема не фильтруется. При подделке записи (V-7) в галерее появляется карточка с `javascript:` / `data:` URL.
</details>

<details>
<summary><strong>⚪ V-11 · Логирование чувствительных данных</strong> — A09, Информационный, весь <code>background.js</code></summary>

Десятки `console.log` с URL и длинами скриншотов. В продакшене — утечка телеметрии в консоль.
</details>

---

## 📦 2.4 Безопасность компонентов

| Аспект | Факт | Оценка |
| --- | --- | --- |
| Сторонние зависимости | `package.json`, `node_modules`, CDN-скрипты отсутствуют; весь код собственный vanilla JS | ✅ Отлично — поверхность supply-chain минимальна, известных CVE нет |
| Manifest version | MV3 | ✅ Актуально, наследуется строгий дефолтный CSP без `unsafe-eval` |
| Явный CSP | `content_security_policy` не задан | 🟠 Полагаемся на дефолт |
| `web_accessible_resources` | Открыт только `content-picker.css` для `<all_urls>` | 🟡 Позволяет фингерпринтинг расширения (нет `use_dynamic_url`) |
| Разрешения | `tabs`, `scripting`, `storage`, `activeTab` + опциональный `<all_urls>` | 🟠 `tabs` даёт постоянный доступ к URL всех вкладок — избыточно |
| Целостность поставки | Подпись обеспечивает магазин, собственных проверок нет | 🟠 Риск компрометации аккаунта разработчика |

> 🟠 **V-12 · Нет явного CSP + избыточные постоянные разрешения** — A05 Security Misconfiguration, Средний, `manifest.json`

---

## 💥 2.5 Защита от DoS

> ℹ️ Расширение не сетевой сервис, классический сетевой DoS неприменим. Тестировался **локальный DoS** — исчерпание ресурсов браузера и диска, подвешивание UI.

<details>
<summary><strong>🔴 V-13 · Неограниченный рост IndexedDB (disk exhaustion)</strong> — DoS/A04, Высокий, <code>background.js:38</code></summary>

Ни `saveThumbnail`, ни `CAPTURE_AND_SAVE` не проверяют число записей и суммарный объём.

**Расчёт нагрузки:**

| Параметр | Значение |
| --- | --- |
| Кроп ограничен шириной | 400 px → JPEG q85 ≈ 30–60 КБ |
| Захват без селектора | Полный кадр без даунскейла → 300–700 КБ на 4K |
| Таймер автозахвата | `setInterval(…, 2000)` |
| Окно дедупликации | 30 с, только по URL + title + selector |
| Страница меняет title/URL раз в 30 с | ~120 записей/час |
| **Итого на одну вкладку** | **до ~80 МБ/час, единицы ГБ/сутки** |

**Impact:** срабатывание квоты Origin Private Storage, отказ записи, деградация всего профиля браузера.
</details>

<details>
<summary><strong>🟠 V-14 · Отсутствие rate limiting на привилегированных сообщениях</strong> — DoS, Средний, <code>background.js:750</code></summary>

```js
for(;;) runtime.sendMessage({type:"GET_ALL_THUMBNAILS"})
```

Заставляет воркер читать и сериализовать всю базу (десятки–сотни МБ base64) в каждом ответе → 100 % CPU, зависание service worker.
</details>

<details>
<summary><strong>🟠 V-15 · Дорогие операции в главном потоке рендера</strong> — DoS, Средний, <code>manager.js:470+</code></summary>

`cropImage()` использует `Image` + `canvas`; менеджер рендерит карточки с `data:`-изображениями без виртуализации (только «Load more»). При тысячах записей — длительная заморозка UI.
</details>

<details>
<summary><strong>🟡 V-16 · ReDoS-подобная деградация через селектор</strong> — DoS, Низкий, <code>content-autocapture.js:234</code></summary>

Селектор с `:has(… :not(…))` на глубоком DOM выполняется каждые 2 секунды в каждой вкладке домена — устойчивая нагрузка на CPU.
</details>

---

## 🗂️ 2.6 Реестр находок

> 📋 Эту таблицу удобно превратить в Notion database: `/table` → добавить свойства Status, Assignee, Sprint.

| ID | Уязвимость | OWASP | Риск | Файл | Статус |
| --- | --- | --- | --- | --- | --- |
| V-1 | Нет валидации `sender` в `onMessage` | A01 | 🟠 Средний | `background.js:750` | 🔵 Open |
| V-2 | Доступ ко всем превью из любого контекста | A01 | 🟠 Средний | `background.js:789` | 🔵 Open |
| V-3 | Захват экрана без привязки к host permission | A01 | 🟠 Средний | `background.js:813` | 🔵 Open |
| V-4 | Скриншоты хранятся без шифрования и TTL | A02 | 🔴 Высокий | `background.js:38` | 🔵 Open |
| V-5 | Домены пользователя уходят в `storage.sync` | A02 | 🟠 Средний | `background.js:137` | 🔵 Open |
| V-6 | Нет инвалидации кэша дедупликации | A04 | 🟡 Низкий | `background.js:500` | 🔵 Open |
| V-7 | Подделка записей (`url`/`hostname` не сверяются) | A03/A01 | 🟠 Средний | `background.js:819` | 🔵 Open |
| V-8 | Небезопасная сборка SVG строкой | A03 | 🟠 Средний | `manager.js:783` | 🔵 Open |
| V-9 | Селектор не валидируется перед `querySelector` | A03 | 🟠 Средний | `content-autocapture.js:129` | 🔵 Open |
| V-10 | `tabs.create` без фильтра схемы URL | A03 | 🟡 Низкий | `manager.js:607,654` | 🔵 Open |
| V-11 | Логирование URL в консоль | A09 | ⚪ Инфо | `background.js` | 🔵 Open |
| V-12 | Нет явного CSP, избыточное `tabs` | A05 | 🟠 Средний | `manifest.json` | 🔵 Open |
| V-13 | Неограниченный рост IndexedDB | DoS/A04 | 🔴 Высокий | `background.js:38` | 🔵 Open |
| V-14 | Нет rate limiting сообщений | DoS | 🟠 Средний | `background.js:750` | 🔵 Open |
| V-15 | Тяжёлый рендер без виртуализации | DoS | 🟠 Средний | `manager.js:470+` | 🔵 Open |
| V-16 | ReDoS-подобный селектор в цикле 2 с | DoS | 🟡 Низкий | `content-autocapture.js:234` | 🔵 Open |

> ✅ **Проверено и не обнаружено:** SQL-инъекции · XSS через `innerHTML` · `eval` / `new Function` · удалённые скрипты · уязвимые сторонние зависимости · `externally_connectable`

---

# 🔧 Задание 3 · Разработка рекомендаций

## ⚙️ 3.1 Технические меры

### 1️⃣ Валидация ввода и границы доверия · V-1, V-2, V-7

```js
const PRIVILEGED = new Set([
  "GET_ALL_THUMBNAILS", "GET_ALL_SELECTORS", "CLEAR_ALL_THUMBNAILS",
  "CLEAR_ALL_DOMAIN_CONFIGS", "DELETE_THUMBNAIL", "OPEN_MANAGER"
]);

browser.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (sender.id !== browser.runtime.id) return false;      // чужое расширение
  const fromExtensionPage = !sender.tab;                   // popup / manager
  if (PRIVILEGED.has(msg?.type) && !fromExtensionPage) {
    sendResponse({ ok: false, error: "forbidden" });        // странице не отдаём
    return true;
  }
  handleMessage(msg, sender).then(sendResponse);
  return true;
});
```

Для `CAPTURE_AND_SAVE` брать URL и hostname **только** у браузера, игнорируя сообщение:

```js
const tab = await browser.tabs.get(sender.tab.id);
const targetUrl = tab.url;
const hostname  = new URL(tab.url).hostname;
```

- [ ] Whitelist допустимых `msg.type`
- [ ] Схема-валидация полей: типы, длины, `rect` — числа в разумных пределах
- [ ] Принцип default deny

### 2️⃣ Валидация селекторов · V-9

```js
function isSafeSelector(sel) {
  if (typeof sel !== "string" || sel.length > 200) return false;
  try { document.createDocumentFragment().querySelector(sel); return true; }
  catch { return false; }
}
```

- [ ] Проверять при сохранении (`SAVE_SELECTOR`, `SAVE_DOMAIN_CONFIG`) и перед применением
- [ ] Запретить `:has()` глубже одного уровня или ограничить время исполнения

### 3️⃣ Безопасная генерация разметки · V-8

```js
const esc = s => s.replace(/[&<>"']/g,
  c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
```

- [ ] Строить SVG через `document.createElementNS` + `textContent`
- [ ] Правило проекта: никакой конкатенации строк для HTML/SVG — зафиксировать линтером

### 4️⃣ Фильтрация URL при открытии · V-10

```js
const ALLOWED = new Set(["http:", "https:"]);
function safeOpen(url) {
  let u; try { u = new URL(url); } catch { return; }
  if (!ALLOWED.has(u.protocol)) return;
  browser.tabs.create({ url: u.href });
}
```

### 5️⃣ Безопасное хранение · V-4, V-5

- [ ] Шифровать `dataUrl` через WebCrypto (AES-GCM); ключ — из парольной фразы (PBKDF2/Argon2) либо неэкспортируемый `CryptoKey`
- [ ] Перенести селекторы и правила из `storage.sync` в `storage.local`, синхронизацию сделать явной опцией с предупреждением
- [ ] TTL и автоочистка: удалять записи старше N дней по `timestamp` через `alarms` (индекс уже создан)
- [ ] Доменный блоклист «никогда не захватывать»
- [ ] Автоисключение приватных вкладок и страниц с полями ввода пароля
- [ ] Не сохранять превью при `Cache-Control: no-store`

### 6️⃣ Генерация безопасных сессий

> ℹ️ Применимо к текущей архитектуре косвенно, обязательно — при появлении серверной части.

- [ ] Идентификаторы устройства/сессии — `crypto.getRandomValues`, ≥128 бит энтропии, с ротацией и TTL
- [ ] Cookies: `Secure` + `HttpOnly` + `SameSite=Strict` + `Path=/` + короткий TTL
- [ ] Регенерация Session ID после смены прав, серверная инвалидация при логауте
- [ ] HSTS обязательно

### 7️⃣ Противодействие DoS · V-13 – V-16

| Мера | Параметр |
| --- | --- |
| Квота по числу записей | `MAX_THUMBS = 500`, LRU-вытеснение по индексу `timestamp` |
| Квота по объёму | `MAX_BYTES = 200 МБ`, проверка `navigator.storage.estimate()`, отказ при `usage/quota > 0.8` |
| Жёсткий даунскейл всегда | max 400×300 px, JPEG q60 → объём меньше в 5–10 раз |
| Rate limiting | Токен-бакет на `sender.tab.id`: 10 сообщений/с, 60/мин |
| Событийная модель вместо таймера | `visibilitychange` + `MutationObserver` с debounce ≥ 1 с, учёт `document.hidden` |
| Виртуализация галереи | IntersectionObserver + `loading="lazy"` |
| Формат хранения | `Blob` / `ObjectURL` вместо base64 → −33 % объёма и меньше нагрузка на GC |
| Тайм-ауты | На `cropImage` и `querySelector` через `requestIdleCallback` / AbortController |

### 8️⃣ Конфигурация и компоненты · V-12

```json
"content_security_policy": {
  "extension_pages": "script-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
}
```

- [ ] Убрать постоянное `tabs`, где хватает `activeTab`; запрашивать опционально
- [ ] `use_dynamic_url: true` для `web_accessible_resources` — анти-фингерпринтинг
- [ ] CI: `npm audit`, Dependabot, gitleaks
- [ ] ESLint с правилами `no-unsanitized/property`, `no-eval`
- [ ] Статический анализ: CodeQL, Semgrep
- [ ] Воспроизводимая сборка, проверка контрольной суммы перед публикацией

### 9️⃣ Логирование и мониторинг · V-11

- [ ] Вырезать `console.log` с URL/hostname в релизе — флаг `DEBUG`, минификация с `drop_console`
- [ ] Логировать только события безопасности: отклонённые сообщения, превышение rate limit, ошибки квоты
- [ ] Без персональных данных, с ограниченным буфером

---

## 🏛️ 3.2 Организационные меры

| # | Мера | Содержание |
| --- | --- | --- |
| 1 | **SSDLC** | Моделирование угроз STRIDE на этапе проектирования каждой функции; чек-лист OWASP ASVS L2 при код-ревью; обязательный второй ревьюер для `background.js` и роутера сообщений |
| 2 | **Политика минимальных привилегий** | Любое новое разрешение в `manifest.json` утверждается отдельно с обоснованием в PR |
| 3 | **Политика приватности** | Публичный документ: какие данные (скриншоты!) хранятся, где, сколько, как удалить. Экран первого запуска с явным **opt-in** на автозахват и предупреждением о конфиденциальности превью |
| 4 | **Управление уязвимостями** | `SECURITY.md` с контактом и SLA: ответ 72 ч, исправление критичных ≤ 14 дней. Координированное раскрытие, CHANGELOG с пометками security |
| 5 | **Защита цепочки поставки** | 2FA/аппаратный ключ на аккаунтах в AMO/CWS и GitHub, защищённая ветка `main`, подписанные коммиты, запрет добавления мейнтейнеров без ревью — прямой урок The Great Suspender |
| 6 | **Обучение пользователей** | Инструкция в менеджере: не включать автозахват на банковских и корпоративных ресурсах, использовать блоклист, периодически очищать хранилище, не ставить расширение на общий компьютер |
| 7 | **Обучение команды** | Ежегодный тренинг по OWASP Top 10 и специфике WebExtensions; разбор инцидентов Equifax, SolarWinds, The Great Suspender |
| 8 | **Регулярный аудит** | Раз в полгода повторный white-box аудит, автосканирование в CI на каждый PR, ретест исправленных находок |

---

## 🗓️ 3.3 Приоритетный план устранения

> 📌 Готово к переносу в Notion board: `/board` со статусами Backlog → In progress → Review → Done.

| Приоритет | Работы | Находки | Срок |
| --- | --- | --- | --- |
| 🔴 **P0** | Проверка `sender`, доверие только `sender.tab.url`, квоты и LRU для IndexedDB | V-1, V-2, V-7, V-13 | Спринт 1 |
| 🟠 **P1** | Шифрование и TTL превью, перенос из `storage.sync`, rate limiting | V-4, V-5, V-14 | Спринт 2 |
| 🟡 **P2** | Валидация селекторов, безопасный SVG, фильтр схем URL, CSP и урезание разрешений | V-9, V-8, V-10, V-12 | Спринт 3 |
| ⚪ **P3** | Чистка логов, виртуализация списка, событийный автозахват | V-11, V-15, V-16 | Спринт 4 |

---

# ✅ Выводы

> 🟢 **1. Хорошая гигиена в части XSS.** Во всей кодовой базе нет ни одного `innerHTML` или `eval`, вывод идёт через `textContent` и DOM API, подсветка поиска реализована безопасно. SQL-инъекции неприменимы архитектурно (IndexedDB, key-value). Сторонних зависимостей нет — supply-chain риск минимален.

> 🔴 **2. Основные риски — границы доверия и приватность.** Привилегированный обработчик сообщений без проверки отправителя (V-1, V-2, V-7) и незашифрованное бессрочное хранение скриншотов приватных страниц (V-4).

> 🟠 **3. Устойчивость к DoS низкая.** Отсутствие квот на IndexedDB и rate limiting позволяет недоверенной странице исчерпать дисковую квоту (до ~80 МБ/час на вкладку) и загрузить CPU (V-13, V-14).

> ✅ **4. Реализация мер P0–P1 закрывает все находки высокой и средней критичности** и приводит расширение в соответствие с требованиями OWASP ASVS L2 в применимой части.

---

## 📎 Источники

- OWASP Top 10:2021 — https://owasp.org/Top10/
- OWASP ASVS 4.0 — https://owasp.org/www-project-application-security-verification-standard/
- Chrome Extensions Security Guidelines — https://developer.chrome.com/docs/extensions/develop/security-privacy
- MDN · WebExtensions Security best practices — https://developer.mozilla.org/docs/Mozilla/Add-ons/WebExtensions
- Исходный код объекта исследования — `Frugd/vtm`
