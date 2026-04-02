═══════════════════════════════════════════════════════════════════════════════
TASKS #5-8: VOISO AI Bot - Extended Version с редактируемым контентом
═══════════════════════════════════════════════════════════════════════════════

OVERVIEW:
Расширение TamperMonkey скрипта для поддержки редактирования контента перед
отправкой на AI бота. На этом этапе - без API вызовов (только формирование payload).

───────────────────────────────────────────────────────────────────────────────
TASK #5: Переименовать кнопку и изменить поведение
───────────────────────────────────────────────────────────────────────────────

TITLE:
Change button label and behavior

GOAL:
1. Переименовать кнопку с "🤖 Получить ответ от бота" на "AI BOT"
2. При клике открывать modal с редактируемым контентом вместо просмотра

CHANGES:
- Line ~465: Изменить textContent с "🤖 Получить ответ от бота" на "AI BOT"
- Логика остается та же (при клике собираем данные и открываем modal)

CURRENT CODE (line ~465):
    button.textContent = '🤖 Получить ответ от бота';

NEW CODE:
    button.textContent = 'AI BOT';

ACCEPTANCE CRITERIA:
✅ Кнопка отображает текст "AI BOT"
✅ При клике все еще работает collectPreviewData()
✅ Modal открывается как раньше

TIME: 1 minute

───────────────────────────────────────────────────────────────────────────────
TASK #6: Добавить редактируемый textarea в modal для контента
───────────────────────────────────────────────────────────────────────────────

TITLE:
Add editable textarea in modal for content editing

GOAL:
Добавить в modal окно textarea который:
1. Содержит formatted текст сообщений (как сейчас в .ai-bot-formatted-text)
2. Позволяет пользователю редактировать контент
3. Не�аемый (НЕ в отдельном блоке, а в textarea)

LOCATION:
BotPreviewModal.create() метод - в success state (когда есть сообщения)

WHAT TO ADD:
В modal content после раздела "📋 Форматированный текст" добавить:

```html
<div class="ai-bot-section">
    <div class="ai-bot-section-title">✏️ Редактировать контент</div>
    <textarea
        id="ai-bot-content-editor"
        class="ai-bot-textarea"
        rows="10">${this.escapeHtml(data.formatted_text)}</textarea>
</div>
```

CSS STYLES (добавить в modalStyles):
```css
.ai-bot-textarea {
    width: 100%;
    padding: 12px;
    font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', monospace;
    font-size: 13px;
    border: 1px solid #ddd;
    border-radius: 4px;
    resize: vertical;
    min-height: 200px;
    color: #333;
    line-height: 1.5;
}

.ai-bot-textarea:focus {
    outline: none;
    border-color: #007bff;
    box-shadow: 0 0 0 3px rgba(0, 123, 255, 0.1);
}
```

ACCEPTANCE CRITERIA:
✅ Textarea отображается в modal
✅ Содержит formatted_text из data
✅ После footer'а (перед кнопками)
✅ Можно редактировать текст
✅ Стили применены корректно
✅ Focus имеет синий border

TIME: 5 minutes

───────────────────────────────────────────────────────────────────────────────
TASK #7: Добавить JSON preview раздел (колчас только Preview, без редактирования)
───────────────────────────────────────────────────────────────────────────────

TITLE:
Add JSON preview section (read-only)

GOAL:
Добавить раздел с JSON структурой (как сейчас) но После textarea.
Это будет showing какой payload будет отправлен на API.

LOCATION:
BotPreviewModal.create() метод - после textarea раздела

WHAT TO ADD:
```html
<div class="ai-bot-section">
    <div class="ai-bot-section-title">📦 JSON Payload (будет отправлен на AI)</div>
    <div class="ai-bot-json" id="ai-bot-payload-preview">${this.escapeHtml(JSON.stringify(jsonData, null, 2))}</div>
</div>
```

STRUCTURE (jsonData должна содержать):
```javascript
{
    "ticket_id": "...",
    "last_resolve_time": "...",
    "client_messages": [
        {
            "timestamp": "...",
            "text": "..."
        }
    ],
    "content_for_ai": "ЗНАЧЕНИЕ из textarea" // ← ЭТО ВАЖНО
}
```

NOTES:
- content_for_ai должна быть СИНХРОНИЗИРОВАНА с textarea
- Когда юзер меняет текст в textarea, JSON должен обновляться
- Сейчас это может быть статичный JSON (обновим в TASK #8)

ACCEPTANCE CRITERIA:
✅ JSON preview отображается
✅ Содержит все нужные поля
✅ Formato readable (pretty-printed)
✅ ID: "ai-bot-payload-preview" для обновления контента

TIME: 5 minutes

───────────────────────────────────────────────────────────────────────────────
TASK #8: Добавить синхронизацию textarea → JSON preview (real-time update)
───────────────────────────────────────────────────────────────────────────────

TITLE:
Sync textarea content to JSON preview in real-time

GOAL:
Когда пользователь редактирует текст в textarea, JSON payload должна
обновляться в real-time (live preview).

LOCATION:
BotPreviewModal.create() метод - в success state, после создания modal DOM

WHAT TO ADD:
```javascript
// После создания modal DOM, добавить event listener на textarea:
const contentEditor = document.getElementById('ai-bot-content-editor');
const payloadPreview = document.getElementById('ai-bot-payload-preview');

if (contentEditor && payloadPreview) {
    const updateJsonPreview = () => {
        const updatedPayload = {
            ticket_id: data.ticket_id,
            last_resolve_time: data.last_resolve_time,
            client_messages: data.messages,
            content_for_ai: contentEditor.value  // ← Берем текст из textarea
        };
        payloadPreview.textContent = JSON.stringify(updatedPayload, null, 2);
    };

    // Update on input
    contentEditor.addEventListener('input', updateJsonPreview);

    logger.log('Textarea-to-JSON sync initialized');
}
```

REQUIREMENTS:
- Event listener на 'input' (не 'change')
- Обновлять JSON preview когда юзер печатает
- НЕ должно быть lag'а (real-time)
- content_for_ai должна быть в JSON

ACCEPTANCE CRITERIA:
✅ Textarea изменяется → JSON обновляется
✅ Real-time обновление (без lag'а)
✅ content_for_ai поле в JSON синхронизировано
✅ Логируется инициализация синхронизации
✅ Все остальное работает как раньше

TIME: 3 minutes

───────────────────────────────────────────────────────────────────────────────
TASK #9: Изменить footer - добавить кнопку "Get Answer from AI Bot"
───────────────────────────────────────────────────────────────────────────────

TITLE:
Change modal footer - replace "Close" with "Get Answer from AI Bot"

GOAL:
Заменить кнопку "Закрыть" на "Get Answer from AI Bot" (английский язык).
Кнопка должна подготавливать payload но НЕ отправлять его (для этого будет TASK #10).

LOCATION:
BotPreviewModal.create() метод - footer раздел (успешный state)

CURRENT CODE (в footer):
```html
<div id="ai-bot-modal-footer">
    <button class="ai-bot-button" id="ai-bot-modal-close-btn">Закрыть</button>
</div>
```

NEW CODE:
```html
<div id="ai-bot-modal-footer">
    <button class="ai-bot-button" id="ai-bot-modal-close">Close</button>
    <button class="ai-bot-button ai-bot-button-primary" id="ai-bot-submit-btn">
        Get Answer from AI Bot
    </button>
</div>
```

CSS UPDATE (для правого выравнивания):
Modal footer уже имеет `justify-content: flex-end;` так что будут справа.

BUTTON STYLES (уже есть):
- ai-bot-button (обычная - Close)
- ai-bot-button-primary (синяя - Get Answer)

ACCEPTANCE CRITERIA:
✅ Две кнопки в footer
✅ "Close" слева (обычная)
✅ "Get Answer from AI Bot" справа (синяя, primary)
✅ "Close" закрывает modal
✅ "Get Answer from AI Bot" пока не делает ничего (будет log)

TIME: 2 minutes

───────────────────────────────────────────────────────────────────────────────
TASK #10: Добавить handler для "Get Answer from AI Bot" кнопки
───────────────────────────────────────────────────────────────────────────────

TITLE:
Add event handler for "Get Answer from AI Bot" button

GOAL:
При клике на "Get Answer from AI Bot":
1. Собрать текущий контент dari textarea
2. Сформировать final payload
3. Залогировать payload в console
4. Показать временный alert/notification что payload готов
5. НЕ отправлять API запрос (это будет позже)

LOCATION:
BotPreviewModal.create() метод - после создания footer кнопок

CODE TO ADD:
```javascript
const submitBtn = document.getElementById('ai-bot-submit-btn');

if (submitBtn) {
    submitBtn.addEventListener('click', () => {
        const contentEditor = document.getElementById('ai-bot-content-editor');
        const editedContent = contentEditor ? contentEditor.value : data.formatted_text;

        // Собираем final payload
        const payload = {
            ticket_id: data.ticket_id,
            last_resolve_time: data.last_resolve_time,
            client_messages: data.messages,
            content_for_ai: editedContent
        };

        logger.log('Payload ready for API submission:', payload);
        logger.info('Payload JSON:', JSON.stringify(payload, null, 2));

        // Временное уведомление
        alert('✅ Payload готов! В консоли смотри логи.\n\n(API запрос будет добавлен позже)');
    });

    logger.log('Submit handler initialized for "Get Answer" button');
}
```

REQUIREMENTS:
- Получить текст из textarea
- Сформировать payload объект
- Залогировать в console (2 варианта: обычный и JSON)
- Показать пользователю уведомление
- НЕ отправлять запрос

ACCEPTANCE CRITERIA:
✅ При клике на "Get Answer from AI Bot" собирается payload
✅ Логируется payload в console
✅ Показывается alert пользователю
✅ Payload содержит все поля (ticket_id, messages, content_for_ai)
✅ content_for_ai = текущее значение textarea
✅ API запрос НЕ отправляется

TIME: 3 minutes

───────────────────────────────────────────────────────────────────────────────
ИТОГОВЫЙ FLOW
───────────────────────────────────────────────────────────────────────────────

1. Юзер видит кнопку "AI BOT"
2. Нажимает кнопку
3. Открывается modal с:
   - Readonly JSON с исходными данными (ticket_id, последний resolve)
   - Editable textarea с formatted текст сообщений
   - Live-updating JSON preview (что будет отправлено на API)
   - Две кнопки: "Close" и "Get Answer from AI Bot"
4. Юзер может:
   - Изменить текст в textarea
   - Видеть как меняется JSON payload
   - Нажать "Close" для отмены
   - Нажать "Get Answer from AI Bot" чтобы подтвердить
5. При нажатии "Get Answer":
   - Payload логируется в console
   - Показывается алерт
   - API запрос НЕ отправляется (готовимся к следующему этапу)

───────────────────────────────────────────────────────────────────────────────
SUMMARY FOR DEVELOPER
───────────────────────────────────────────────────────────────────────────────

TASK #5:  Rename button to "AI BOT"
         Time: 1 min

TASK #6:  Add editable textarea
         Time: 5 min

TASK #7:  Add JSON payload preview
         Time: 5 min

TASK #8:  Real-time textarea→JSON sync
         Time: 3 min

TASK #9:  Change footer buttons
         Time: 2 min

TASK #10: Add "Get Answer" handler
         Time: 3 min

───────────────────────────────────────────────────────────────────────────────
TOTAL TIME: ~19 minutes

After completion:
- ✅ User can edit content before sending to AI
- ✅ Real-time JSON preview
- ✅ Payload is logged (ready for API integration next)
- ✅ Full UI/UX for content editing workflow

Next Steps (not in this task):
- Add API endpoint configuration
- Send payload to AI bot
- Display AI response
- Add rating/feedback for agent

═══════════════════════════════════════════════════════════════════════════════
