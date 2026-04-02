# QA Checklist - VOISO Support AI Bot Assistant (V3.2)

## Scope

Текущий инкремент покрывает runtime sticky-panel flow:
- стабильный парсинг `resolve` и клиентских сообщений из JSON;
- правая sticky-панель вместо modal поверх центра экрана;
- реальный AI request (`POST /v1/chat`) с обработкой JSON/stream-like ответов;
- отсутствие side effects в Reply/Comment timeline.

## 1. Regression / Load

- [ ] Скрипт загружается без `Uncaught` ошибок
- [ ] В консоли есть `[VOISO BOT] Script initialized successfully`
- [ ] Кнопка `AI BOT` появляется на `https://support.voiso.com/*`
- [ ] Кнопка не появляется на других доменах

## 2. Parser Stability

### 2.1 Источники данных (приоритет)

- [ ] При наличии `window.__interceptedApiData` используется он
- [ ] Если перехваченного JSON нет, используется `window`-переменная
- [ ] Если в `window` данных нет, используются `data-*` атрибуты
- [ ] Если предыдущие источники пустые, используется inline script JSON

### 2.2 Поддержка структур

- [ ] Кейс `events/messages/comments` (верхний уровень) обрабатывается корректно
- [ ] Кейс `data.attributes.events/messages/comments/...` обрабатывается корректно
- [ ] Кейс `included[*]` обрабатывается корректно
- [ ] Смешанная структура (например `events + included`) не ломает результат

### 2.3 Resolve и сообщения

- [ ] Последний `resolve` выбирается по максимальному timestamp среди resolve-событий
- [ ] При отсутствии `resolve` возвращается корректная ошибка
- [ ] Сообщения клиента берутся только после `resolve`
- [ ] Внутренние email (`voiso`, `premium-support`) исключаются
- [ ] Дубли сообщений удаляются
- [ ] Итоговые сообщения отсортированы по времени (старое -> новое)

## 3. Sticky Panel UX

### 3.1 Открытие и структура

- [ ] По клику `AI BOT` открывается правая sticky-панель
- [ ] В панели есть `Editable Content` (`textarea`)
- [ ] В панели есть `Get Answer from AI Bot`
- [ ] После ответа отображается `AI Answer`
- [ ] Отображается рейтинг `Good / Not great / Bad`
- [ ] Для `Not great/Bad` доступен `subject`

### 3.2 Collapse / Close

- [ ] `Collapse` сворачивает панель
- [ ] `Expand` разворачивает панель
- [ ] `Close` и `X` закрывают панель
- [ ] `Esc` закрывает панель только когда фокус внутри панели
- [ ] После закрытия панель удаляется из DOM

### 3.3 State per ticket

- [ ] `edited_content` сохраняется отдельно по `ticket_id`
- [ ] `ai_answer` сохраняется отдельно по `ticket_id`
- [ ] `rating/subject` сохраняются отдельно по `ticket_id`
- [ ] При переключении тикетов state не смешивается

## 4. AI Request / Response

### 4.1 Submit

- [ ] При валидном контенте отправляется `POST /v1/chat`
- [ ] В запросе есть корректный `session_id` (`voiso-ticket-<ticket_id>`)
- [ ] Кнопка submit блокируется в процессе генерации
- [ ] Лоадер отображается до завершения запроса

### 4.2 Ответ и ошибки

- [ ] Валидный JSON-ответ отображается в `AI Answer`
- [ ] Stream/SSE-like ответ корректно собирается в итоговый текст
- [ ] Пустой ответ дает понятную ошибку в панели
- [ ] HTTP error отображается в панели
- [ ] Timeout отображается в панели

### 4.3 Диагностика timeout

- [ ] При timeout в логе есть `session_id`
- [ ] При timeout в логе есть `elapsed_ms`
- [ ] При timeout в логе есть `status`
- [ ] При timeout в логе есть `response_text_length`

### 4.4 Feedback Logging (Google Spreadsheet)

- [ ] `Good` отправляет 1 POST сразу по клику
- [ ] `Not great`/`Bad` без `subject` не отправляются
- [ ] `Not great`/`Bad` с `subject` отправляют 1 POST
- [ ] Payload содержит ровно: `ticket_id`, `agent`, `request`, `response`, `feedback`, `subject`
- [ ] `agent` = последний агентский email из чата
- [ ] `request` = текст, реально отправленный в AI
- [ ] `response` = финальный AI answer в панели
- [ ] При double-click нет дублей запросов
- [ ] При 2xx отображается статус успешной отправки
- [ ] При network/timeout/HTTP-error отображается статус ошибки без закрытия панели

## 5. No Side Effects in Ticket UI

- [ ] После генерации ответа Reply/Comment поля тикета не изменяются
- [ ] Не происходит автозаполнение textarea/contenteditable в timeline
- [ ] Не нажимаются submit/reply/comment кнопки тикета
- [ ] В timeline тикета не создаются автоматические комментарии

## 6. Smoke / Reliability

- [ ] 20 прогонов подряд без ложного timeout при успешном ответе сервера
- [ ] Нет смешивания состояния между тикетами в SPA-навигации
- [ ] Нет регрессии кнопки/панели после 10+ циклов open/close
