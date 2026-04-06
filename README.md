# Ной V3.3 - VOISO Support AI Bot Assistant

Tampermonkey-скрипт для `https://support.voiso.com/*`.
Текущий режим: стабильный parser + правая sticky AI-панель + live AI request + feedback в Google Sheets.

## Что делает скрипт

- перехватывает ticket-данные из JSON-источников в приоритетном порядке: перехваченный API JSON -> `window` переменные -> `data-*` атрибуты -> inline script JSON;
- нормализует события и ищет последний `resolve` (с fallback-диапазоном);
- собирает клиентские сообщения после `resolve`;
- определяет роль автора по agent email list;
- открывает правую sticky-панель с редактируемым контентом;
- отправляет запрос в `POST /v1/chat` и показывает AI-ответ в панели;
- отправляет feedback (`good/not_great/bad`) в Google Spreadsheet endpoint;
- сохраняет state по `ticket_id`.

## Быстрый старт (локально, без GitHub аккаунта)

1. Установите скрипт в Tampermonkey из файла `voiso-bot-script.js`.
2. Инициализируйте локальный git (если еще не инициализирован):

```bash
git init
git add .
git commit -m "init: voiso bot"
```

3. Для нового релиза поднимайте версию:

```bash
./scripts/release-userscript.sh 3.3.1
```

## Локальная конфигурация (секреты не хранятся в коде)

Перед использованием задайте значения в `localStorage` на странице `https://support.voiso.com`:

```javascript
localStorage.setItem('voiso_ai_api_key', '<YOUR_AI_API_KEY>');
localStorage.setItem('voiso_feedback_endpoint', 'https://script.google.com/macros/s/.../exec');
```

Проверка:

```javascript
localStorage.getItem('voiso_ai_api_key');
localStorage.getItem('voiso_feedback_endpoint');
```

## Автообновление Tampermonkey

Для автообновления нужны файлы:
- `voiso-bot-script.meta.js` — Tampermonkey проверяет новую версию;
- `voiso-bot-script.user.js` — Tampermonkey скачивает обновление.

Оба файла генерируются командой релиза:

```bash
./scripts/release-userscript.sh <version> <base_url>
```

Пример с GitHub Raw URL:

```bash
./scripts/release-userscript.sh 3.3.1 https://raw.githubusercontent.com/<account>/<repo>/main
```

После этого commit/tag/push:

```bash
git add .
git commit -m "release: v3.3.1"
git tag v3.3.1
git push origin main --tags
```

## Ручное обновление по кнопке

В меню Tampermonkey появилась команда:
- `VOISO Bot: Check script update now`

Она открывает `.user.js` URL и запускает обновление сразу.

Если URL еще не задан в мета-блоке, его можно временно задать в консоли:

```javascript
localStorage.setItem('voiso_userscript_download_url', 'https://raw.githubusercontent.com/<account>/<repo>/main/voiso-bot-script.user.js');
```

## Документация

- [INSTALLATION.md](INSTALLATION.md)
- [VERSIONING.md](VERSIONING.md)
- [docs/qa-checklist.md](docs/qa-checklist.md)

---
**Разработал:** Ной V3.3
**Дата обновления:** 2026-04-02
