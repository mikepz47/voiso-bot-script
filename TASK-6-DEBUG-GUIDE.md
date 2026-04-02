═══════════════════════════════════════════════════════════════════════════════
TASK #6 DEBUG GUIDE: Найти данные тикета на VOISO портале
═══════════════════════════════════════════════════════════════════════════════

Когда разработчик откроет https://support.voiso.com/tickets/[любой_ID] и нажмет "AI BOT":
- Получается ошибка: "Не удалось загрузить данные тикета"
- Значит findTicketData() не может найти JSON

Нужно найти ГДЕ эти данные хранятся и обновить парсер.

───────────────────────────────────────────────────────────────────────────────
STEP 1: БЫСТРАЯ ДИАГНОСТИКА (2 минуты)
───────────────────────────────────────────────────────────────────────────────

1. Откройте https://support.voiso.com/tickets/[ваш_тикет_ID]
2. Нажмите F12 (откроется DevTools)
3. Перейдите на вкладка Console
4. Скопируйте и выполните этот скрипт:

```javascript
console.log('=== VOISO TICKET DATA DIAGNOSTICS ===\n');

// Проверка window переменных
console.log('▶ Checking window variables:');
const vars = ['__data', '__DATA__', 'initialState', 'state', 'ticketData',
              'TICKET_DATA', 'props', '__props__', '__INITIAL_STATE__'];
vars.forEach(v => {
    if (window[v]) {
        console.log(`✅ window.${v} EXISTS:`, window[v]);
    }
});

// Поиск объектов содержащих ticket данные
console.log('\n▶ Searching for ticket-like objects:');
const allKeys = Object.keys(window).filter(k => {
    try {
        const val = window[k];
        if (typeof val === 'object' && val !== null) {
            return (JSON.stringify(val).includes('ticket') ||
                   JSON.stringify(val).includes('event') ||
                   JSON.stringify(val).includes('message'));
        }
    } catch(e) {}
    return false;
});
console.log(`Found ${allKeys.length} objects:`, allKeys.slice(0, 10));

// Проверка data элементов в DOM
console.log('\n▶ Checking DOM data elements:');
const dataElements = document.querySelectorAll('[data-*]');
console.log(`Found ${dataElements.length} elements with data attributes`);
dataElements.forEach(el => {
    const attrs = el.attributes;
    [...attrs].forEach(attr => {
        if (attr.name.startsWith('data-')) {
            const val = attr.value.substring(0, 50);
            console.log(`${attr.name}: ${val}...`);
        }
    });
});

// Поиск в script тегах
console.log('\n▶ Searching script tags:');
const scripts = document.querySelectorAll('script');
let foundInScript = false;
scripts.forEach((script, idx) => {
    if (script.textContent && script.textContent.includes('ticket')) {
        console.log(`✅ Found "ticket" in script #${idx}, length: ${script.textContent.length}`);
        if (script.textContent.includes('__data') || script.textContent.includes('window.')) {
            console.log('   Content (first 200 chars):', script.textContent.substring(0, 200));
            foundInScript = true;
        }
    }
});

// Network Request info
console.log('\n▶ Network Info:');
console.log('Current URL:', window.location.href);
console.log('Hostname:', window.location.hostname);

console.log('\n=== END DIAGNOSTICS ===\n');
```

**Результат будет показан в консоли. Скопируйте вывод полностью.**

───────────────────────────────────────────────────────────────────────────────
STEP 2: ПРОВЕРКА NETWORK ЗАПРОСОВ (если Step 1 не нашел ничего)
───────────────────────────────────────────────────────────────────────────────

1. DevTools → Network tab
2. Перезагрузите страницу (F5)
3. Ищите запросы похожие на:
   - /api/tickets/[id]
   - /api/support/tickets/[id]
   - /api/chat/[id]
   - /api/messages/[id]
   - Или любой другой API endpoint

4. Нажмите на запрос → Response tab → посмотрите JSON структуру

**Скопируйте первые 100 строк JSON ответа.**

───────────────────────────────────────────────────────────────────────────────
STEP 3: ПЕРЕХВАТ API ДАННЫХ (если данные приходят через API)
───────────────────────────────────────────────────────────────────────────────

Если вы нашли что данные приходят через API но НЕ в window переменной,
вставьте этот скрипт в Console для перехвата:

```javascript
// Перехват fetch запросов
const originalFetch = window.fetch;
window.fetch = function(...args) {
    const url = args[0];
    return originalFetch.apply(this, args).then(response => {
        // Клонируем response чтобы можно было прочитать
        const clone = response.clone();
        clone.json()
            .then(data => {
                // Ищем ticket-like данные
                if (JSON.stringify(data).includes('ticket') ||
                    JSON.stringify(data).includes('event') ||
                    JSON.stringify(data).includes('message')) {
                    console.log('🎯 TICKET DATA INTERCEPTED FROM:', url);
                    console.log('📦 Full response:', data);
                    // Сохраняем в window для доступа из скрипта
                    window.__interceptedTicketData = data;
                }
            })
            .catch(e => {});
        return response;
    });
};

console.log('✅ Fetch interceptor installed. Reload page and check console.');
```

После этого перезагрузите страницу, и когда API запрос вернет данные,
они будут залогированы как "🎯 TICKET DATA INTERCEPTED FROM:"

───────────────────────────────────────────────────────────────────────────────
STEP 4: АНАЛИЗ СТРУКТУРЫ ДАННЫХ
───────────────────────────────────────────────────────────────────────────────

Когда вы найдете данные, проанализируйте структуру:

```javascript
// Вставьте это в console после нахождения данных

// Если данные в window.__data
const data = window.__data;

console.log('▶ Data Structure Analysis:');
console.log('Type:', typeof data);
console.log('Top-level keys:', Object.keys(data).slice(0, 20));
console.log('Has events:', !!data.events);
console.log('Has messages:', !!data.messages);
console.log('Has comments:', !!data.comments);

// Проверяем где находятся события
if (data.events) {
    console.log('✅ Events found directly:', data.events.length, 'items');
    console.log('First event:', data.events[0]);
}

if (data.data && data.data.events) {
    console.log('✅ Events found in data.data:', data.data.events.length, 'items');
    console.log('First event:', data.data.events[0]);
}

// Ищем resolve событие
const allEvents = data.events || data.messages || data.comments ||
                 data.data?.events || data.data?.messages || [];
const resolve = allEvents.find(e =>
    e.r_type === 'resolve' || e.status === 'resolved' || e.type === 'resolve'
);
console.log('Resolve event:', resolve);

// Ищем сообщения от клиента
const messages = allEvents.filter(e => e.from_email && !e.from_email.includes('voiso'));
console.log('Client messages:', messages.length);
console.log('Sample message:', messages[0]);
```

───────────────────────────────────────────────────────────────────────────────
STEP 5: ОТЧЕТ ДЛЯ РАЗРАБОТЧИКА
───────────────────────────────────────────────────────────────────────────────

После диагностики, заполните этот шаблон:

---

### ДИАГНОСТИЧЕСКИЙ ОТЧЕТ

**Где находятся данные:**
- [ ] window.__data
- [ ] window.__DATA__
- [ ] window.initialState
- [ ] window.ticketData
- [ ] window.[другая переменная]: _______
- [ ] В API ответе: _______
- [ ] В DOM элементе с data-атрибутом
- [ ] В script теге

**Структура данных:**
```
// Вставьте сюда первые 50 строк структуры
{

}
```

**Где находятся события (events/messages):**
- [ ] data.events
- [ ] data.messages
- [ ] data.data.events
- [ ] data.[путь]: _______

**Как определить resolve:**
- Поле: r_type или status или type?
- Значение: resolve или resolved?
- Пример: ______

**Как определить от кого сообщение:**
- Поле email: from_email или sender_email?
- Значение: ______

---

───────────────────────────────────────────────────────────────────────────────
STEP 6: ОБНОВЛЕНИЕ findTicketData() если нужно
───────────────────────────────────────────────────────────────────────────────

Если текущий парсер (line 40-93) не находит данные, обновите функцию:

EXAMPLE: Если данные в window.ticketStore.data:

```javascript
function findTicketData() {
    logger.log('Searching for ticket data...');

    // Новый способ - добавить в начало
    if (window.ticketStore && window.ticketStore.data) {
        logger.log('Found data in window.ticketStore.data');
        return window.ticketStore.data;
    }

    // Остальные способы как раньше...
    const windowVars = ['__data', '__DATA__', '__TICKET__', 'ticketData', 'TICKET_DATA'];
    for (const varName of windowVars) {
        if (window[varName]) {
            logger.log(`Found data in window.${varName}`);
            return window[varName];
        }
    }

    // ... остальной код как есть
}
```

───────────────────────────────────────────────────────────────────────────────
STEP 7: ТЕСТИРОВАНИЕ ПОСЛЕ ОБНОВЛЕНИЯ
───────────────────────────────────────
