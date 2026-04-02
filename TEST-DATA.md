# Тестовые данные и примеры

## Пример 1: Корректный тикет с сообщениями после resolve

Этот пример показывает структуру данных когда всё работает корректно.

```javascript
// Вставьте это в DevTools Console для эмуляции данных

window.__data = {
    id: 12345,
    ticket_id: "TIC-12345",
    status: "resolved",
    events: [
        {
            id: 1,
            r_type: "message",
            from_email: "client@gmail.com",
            author_name: "Иван Клиент",
            created_at: "2026-03-20T10:00:00Z",
            text: "Здравствуйте, у меня проблема с подключением",
            body: null
        },
        {
            id: 2,
            r_type: "message",
            from_email: "support@voiso.com",
            author_name: "Support Team",
            created_at: "2026-03-20T10:30:00Z",
            text: "Спасибо за обращение. Мы проверим вашу проблему",
            body: null
        },
        {
            id: 3,
            r_type: "resolve",
            from_email: "support@voiso.com",
            author_name: "Support Team",
            created_at: "2026-03-20T11:00:00Z",
            text: "Проблема решена. Тикет закрыт",
            body: null
        },
        {
            id: 4,
            r_type: "message",
            from_email: "client@gmail.com",
            author_name: "Иван Клиент",
            created_at: "2026-03-20T11:30:00Z",
            text: "Спасибо за помощь! Но у меня есть ещё один вопрос",
            body: null
        },
        {
            id: 5,
            r_type: "message",
            from_email: "client@gmail.com",
            author_name: "Иван Клиент",
            created_at: "2026-03-20T12:00:00Z",
            text: "Как мне обновить конфигурацию?",
            body: null
        }
    ]
};

// Ожидаемый результат:
// - Modal откроется
// - Будет 2 сообщения клиента после resolve (id: 4, 5)
// - Дата resolve: 20.03.2026 11:00:00
// - Два сообщения от Ивана Клиента с временем
```

## Пример 2: Тикет БЕЗ resolve (error)

```javascript
window.__data = {
    id: 12346,
    ticket_id: "TIC-12346",
    status: "open",
    events: [
        {
            id: 1,
            r_type: "message",
            from_email: "client@gmail.com",
            author_name: "Клиент",
            created_at: "2026-03-20T10:00:00Z",
            text: "Помощь нужна",
            body: null
        }
    ]
};

// Ожидаемый результат:
// - Modal откроется
// - Error message: "Не найден последний resolve в истории тикета"
// - Желтый фон warning
```

## Пример 3: Resolve но БЕЗ новых сообщений (warning)

```javascript
window.__data = {
    id: 12347,
    ticket_id: "TIC-12347",
    status: "resolved",
    events: [
        {
            id: 1,
            r_type: "message",
            from_email: "client@gmail.com",
            author_name: "Клиент",
            created_at: "2026-03-20T10:00:00Z",
            text: "Нужна помощь",
            body: null
        },
        {
            id: 2,
            r_type: "message",
            from_email: "support@voiso.com",
            author_name: "Поддержка",
            created_at: "2026-03-20T10:30:00Z",
            text: "Решено",
            body: null
        },
        {
            id: 3,
            r_type: "resolve",
            from_email: "support@voiso.com",
            author_name: "Поддержка",
            created_at: "2026-03-20T11:00:00Z",
            text: "Тикет закрыт",
            body: null
        }
    ]
};

// Ожидаемый результат:
// - Modal откроется
// - Warning message: "Нет новых сообщений от клиента после resolve"
// - Голубой фон
```

## Пример 4: Со специальными символами и emoji

```javascript
window.__data = {
    id: 12348,
    ticket_id: "TIC-12348",
    status: "resolved",
    events: [
        {
            id: 1,
            r_type: "message",
            from_email: "user@example.com",
            author_name: "Пользователь",
            created_at: "2026-03-20T10:00:00Z",
            text: "Привет! 👋",
            body: null
        },
        {
            id: 2,
            r_type: "resolve",
            from_email: "support@voiso.com",
            author_name: "Support",
            created_at: "2026-03-20T11:00:00Z",
            text: "Resolved ✅",
            body: null
        },
        {
            id: 3,
            r_type: "message",
            from_email: "user@example.com",
            author_name: "Пользователь",
            created_at: "2026-03-20T11:30:00Z",
            text: "А как это работает? <test> & \"quotes\" 'apostrophe'",
            body: null
        },
        {
            id: 4,
            r_type: "message",
            from_email: "user@example.com",
            author_name: "Пользователь",
            created_at: "2026-03-20T12:00:00Z",
            text: "🤖 Это точно работает? ✨",
            body: null
        }
    ]
};

// Ожидаемый результат:
// - HTML теги экранированы: <test> остаётся как <test>
// - Emoji отображается корректно: 👋 ✅ 🤖 ✨
// - Кириллица отображается: Пользователь
// - Спецсимволы отображаются: & ' " остаются целыми
```

## Пример 5: Много сообщений (stress test)

Используйте этот скрипт для создания 50+ сообщений:

```javascript
window.__data = {
    id: 12349,
    ticket_id: "TIC-12349",
    status: "resolved",
    events: [
        // Initial message
        {
            id: 1,
            r_type: "message",
            from_email: "client@gmail.com",
            author_name: "Клиент",
            created_at: "2026-03-20T10:00:00Z",
            text: "Первое сообщение",
            body: null
        },
        // Resolve
        {
            id: 2,
            r_type: "resolve",
            from_email: "support@voiso.com",
            author_name: "Support",
            created_at: "2026-03-20T11:00:00Z",
            text: "Resolved",
            body: null
        },
        // 50+ messages after resolve
        ...Array.from({length: 50}, (_, i) => ({
            id: 100 + i,
            r_type: "message",
            from_email: "client@gmail.com",
            author_name: "Клиент",
            created_at: new Date(2026, 2, 20, 11, 30 + i).toISOString(),
            text: `Сообщение номер ${i + 1}: Это очень длинное сообщение клиента что содержит ценную информацию для бота`,
            body: null
        }))
    ]
};

// Ожидаемый результат:
// - Modal откроется с 50 сообщениями
// - Modal должен быть scrollable
// - Нет lag'а при скролле
// - Все сообщения видны
```

## Пример 6: С сообщениями от premium-support (игнорировать)

```javascript
window.__data = {
    id: 12350,
    ticket_id: "TIC-12350",
    status: "resolved",
    events: [
        {
            id: 1,
            r_type: "message",
            from_email: "client@gmail.com",
            author_name: "Клиент",
            created_at: "2026-03-20T10:00:00Z",
            text: "Помощь",
            body: null
        },
        {
            id: 2,
            r_type: "resolve",
            from_email: "support@voiso.com",
            author_name: "Support",
            created_at: "2026-03-20T11:00:00Z",
            text: "Решено",
            body: null
        },
        {
            id: 3,
            r_type: "message",
            from_email: "premium-support@voiso.com",  // ← SHOULD BE IGNORED
            author_name: "Premium",
            created_at: "2026-03-20T11:30:00Z",
            text: "Это сообщение от премиум поддержки",
            body: null
        },
        {
            id: 4,
            r_type: "message",
            from_email: "client@gmail.com",
            author_name: "Клиент",
            created_at: "2026-03-20T12:00:00Z",
            text: "Спасибо!",
            body: null
        }
    ]
};

// Ожидаемый результат:
// - Сообщение от premium-support НЕ должно быть в modal
// - Только 1 сообщение клиента после resolve (id: 4)
```

## Как использовать примеры для тестирования

### Метод 1: Быстрое тестирование в консоли

1. Откройте https://support.voiso.com/
2. DevTools (F12) → Console
3. Скопируйте код примера выше
4. Выполните в консоли
5. Обновите страницу (F5)
6. Нажмите кнопку "🤖 Получить ответ от бота"

### Метод 2: Добавить в скрипт для отладки

Добавьте в конец `voiso-bot-script.js` временно:

```javascript
// DEBUG MODE - используйте для тестирования
window.__data = {
    // ... вставьте пример выше
};
```

Затем тестируйте. Не забудьте удалить перед production!

## Проверка структуры реальных данных

Если вам нужно найти реальную структуру данных на портале:

```javascript
// 1. Откройте Network tab в DevTools
// 2. Найдите запрос с данными тикета (обычно JSON)
// 3. Скопируйте структуру
// 4. Проверьте что есть:

// Нужные поля:
- events ИЛИ messages ИЛИ comments
- from_email (для каждого события/сообщения)
- created_at (timestamp)
- r_type ИЛИ type ИЛИ event_type (для определения типа события)
- text ИЛИ body ИЛИ message (содержание сообщения)

// Для resolve события:
- r_type: "resolve" ИЛИ status: "resolved"
```

## Отладочные команды

Выполняйте в DevTools Console для диагностики:

```javascript
// Проверить что скрипт загружен
console.log('[VOISO BOT] loaded:', !!window.__voiso_bot_loaded);

// Попробовать собрать данные вручную
const ticketData = window.__data || window.__DATA__;
console.log('Ticket data:', ticketData);

// Поиск resolve события
const resolve = ticketData?.events?.find(e => e.r_type === 'resolve' || e.status === 'resolved');
console.log('Resolve event:', resolve);

// Поиск сообщений клиента
const clientMessages = ticketData?.events?.filter(e =>
    e.from_email &&
    !e.from_email.includes('voiso.com') &&
    new Date(e.created_at) > new Date(resolve?.created_at)
);
console.log('Client messages after resolve:', clientMessages);

// Проверить кнопку
console.log('Button exists:', !!document.getElementById('ai-bot-inject-button'));

// Проверить styles
console.log('Styles injected:', !!document.getElementById('ai-bot-styles'));
```

---

**Версия:** 1.0
**Дата:** 2026-03-24
