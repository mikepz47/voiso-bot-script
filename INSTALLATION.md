# Установка и отладка TamperMonkey скрипта

## Требования

- Браузер: Chrome, Firefox, Safari, Edge (с поддержкой TamperMonkey)
- TamperMonkey v4.0 или выше
- JavaScript должен быть включен

## Пошаговая установка

### 1️⃣ Установка TamperMonkey

**Chrome / Chromium:**
- Откройте https://chrome.google.com/webstore/detail/tampermonkey/dhdgffkkebhmkfjojejmpbldmpobp5co
- Нажмите "Добавить в Chrome"
- Подтвердите установку

**Firefox:**
- Откройте https://addons.mozilla.org/en-US/firefox/addon/tampermonkey/
- Нажмите "Добавить в Firefox"
- Подтвердите

**Safari:**
- Используйте: https://www.shutterstock.com/blog/macos-shortcuts или другие user script managers

### 2️⃣ Создание нового скрипта

1. Нажмите на иконку TamperMonkey в браузере (обычно в правом верхнем углу)
2. Выберите "Dashboard" (или "Управление скриптами")
3. Нажмите кнопку "+" (Create a new script)

### 3️⃣ Копирование кода

1. Откройте файл `voiso-bot-script.js` из проекта
2. Скопируйте весь код (Ctrl+A → Ctrl+C)
3. В Dashboard TamperMonkey удалите весь default код
4. Вставьте наш код (Ctrl+V)
5. Нажмите Ctrl+S для сохранения

**Важно:** Убедитесь что скопировалась вся строка `// ==UserScript==...// ==/UserScript==`

### 3.1️⃣ Установка по URL (рекомендуется для автообновления)

1. Опубликуйте `voiso-bot-script.user.js` в доступный URL (например GitHub Raw)
2. Откройте этот URL в браузере
3. Tampermonkey предложит установить скрипт
4. Подтвердите установку

Если скрипт установлен из URL и в meta-блоке заданы `@updateURL` + `@downloadURL`, Tampermonkey сможет обновлять скрипт автоматически.

### 4️⃣ Проверка установки

1. Откройте https://support.voiso.com/
2. Проверьте что в браузере появилась кнопка `AI BOT`
3. Откройте DevTools (F12) → Console
4. Должно быть сообщение: `[VOISO BOT] Script initialized successfully`

## 🔍 Отладка

### Скрипт не загружается

**Решение 1: Проверьте что скрипт включен**
- Dashboard → Посмотрите статус скрипта
- Скрипт должен быть включен (галка ✓ напротив названия)

**Решение 2: Проверьте URL match**
- Откройте редактор скрипта (нажмите на название)
- Вкладка "Settings"
- "@match" должно быть: `https://support.voiso.com/*`

**Решение 3: Очистите кеш браузера**
- Закройте все вкладки с support.voiso.com
- Очистите кеш браузера (Ctrl+Shift+Delete)
- Откройте support.voiso.com заново

### Кнопка не видна

1. Откройте DevTools (F12) → Console
2. Введите: `document.getElementById('ai-bot-inject-button')`
3. Если результат `null` → кнопка не инжектена
4. Проверьте консоль на ошибки (красный текст)

### Modal не открывается

1. Нажмите на кнопку
2. Откройте DevTools (F12) → Console
3. Введите: `document.getElementById('ai-bot-modal-overlay')`
4. Если результат `null` → modal не создался
5. Посмотрите на ошибки в консоли ([VOISO BOT] ERROR: ...)

## 🧪 Тестирование на реальных данных

### Проверка данных тикета

1. Откройте тикет на https://support.voiso.com/tickets/123
2. Откройте DevTools (F12) → Console
3. Выполните команды для отладки:

```javascript
// Проверить доступные переменные
console.log(Object.keys(window).filter(k => k.includes('data') || k.includes('ticket')));

// Проверить window.__data (если существует)
console.log(window.__data);

// Проверить window.__DATA__
console.log(window.__DATA__);

// Поиск элементов с data атрибутами
console.log(document.querySelector('[data-ticket-json]'));
console.log(document.querySelector('[data-initial-state]'));

// Просмотр всех script тегов (поиск JSON)
Array.from(document.querySelectorAll('script')).forEach(s => {
    if (s.textContent.includes('ticket')) {
        console.log(s.textContent.substring(0, 200));
    }
});
```

### Если данные не найдены

1. На странице тикета откройте Network tab (DevTools → Network)
2. Загрузите страницу
3. Поищите запросы с именем содержащим "ticket" или "data"
4. Нажмите на запрос → Response tab
5. Ищите JSON с данными тикета

**Если найдете - сообщите структуру разработчику** для обновления парсера.

## 📊 Просмотр логов

В DevTools Console фильтруйте по текст "[VOISO BOT]":

1. DevTools → Console
2. Нажмите на фильтр (иконка воронки)
3. Введите: `[VOISO BOT]`
4. Будут видны только логи скрипта

**Полезные логи:**
```
[VOISO BOT] Script initialized successfully        → скрипт загрузился
[VOISO BOT] Button clicked                         → кнопка нажата
[VOISO BOT] Searching for ticket data...           → парсинг начался
[VOISO BOT] Found data in window.__data            → данные найдены
[VOISO BOT] Found last resolve event:              → resolve найден
[VOISO BOT] Modal created and displayed            → modal создан
```

## 🐛 Частые проблемы

### Modal открывается но предыдущие данные (не обновляется)

**Причина:** Старый modal не удален из DOM

**Решение:** Закройте modal и откройте заново, или обновите страницу (F5)

### Дата/время неправильного формата

**Причина:** Локаль браузера не поддерживает ru-RU

**Решение:** Проверьте в DevTools:
```javascript
new Date().toLocaleString('ru-RU', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
});
```

Если не работает - браузер нужно обновить или смена локали ОС.

### Emoji в кнопке не отображается

**Решение:** Обновите браузер (нужна поддержка Unicode)

## 📞 Отладка парсера сообщений

Если сообщения не собираются, проверьте структуру данных:

```javascript
// В консоли скрипта (или добавьте в скрипт временно)
const data = window.__data;
const messages = data.events || data.messages || data.comments;

console.log('Messages:', messages);
messages.forEach((msg, i) => {
    console.log(i, {
        from_email: msg.from_email,
        r_type: msg.r_type,
        text: msg.text?.substring(0, 50)
    });
});
```

Это покажет структуру сообщений и поможет понять как их парсить.

## 🔄 Обновление скрипта

### Вариант A: Автообновление (через URL)

1. Установите скрипт из `voiso-bot-script.user.js` URL
2. Убедитесь что в meta-блоке настроены `@updateURL` и `@downloadURL`
3. В Tampermonkey включите автообновления (по умолчанию обычно включены)
4. Tampermonkey будет периодически проверять `voiso-bot-script.meta.js`

### Вариант B: Обновить сразу по команде

1. Нажмите иконку Tampermonkey
2. Выберите команду `VOISO Bot: Check script update now`
3. Откроется `*.user.js` URL
4. Подтвердите обновление

### Вариант C: Полностью вручную (fallback)

1. Откройте Dashboard Tampermonkey
2. Нажмите редактировать скрипт
3. Вставьте свежий код вместо старого
4. Нажмите `Ctrl+S`
5. Обновите страницу поддержки (`F5`)

## ✅ Проверка перед production

```
□ Скрипт загружается без ошибок
□ Кнопка видна на страницах support.voiso.com
□ Кнопка НЕ видна на других сайтах
□ Клик открывает modal
□ Modal закрывается на ESC или клик на фон
□ Дата/время в readable формате
□ JSON валидный
□ Нет красных ошибок в console
```

---

**Версия:** 3.3
**Дата:** 2026-04-02
