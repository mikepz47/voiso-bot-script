# Версионность и обновления (простыми словами)

Этот файл объясняет, как вести версии userscript-проекта и как работает обновление в Tampermonkey.

## 1) Что такое версия

Версия — это номер релиза в формате `X.Y.Z`:
- `X` (major): большие/ломающие изменения;
- `Y` (minor): новые функции без ломки старого;
- `Z` (patch): мелкие правки/фиксы.

Пример: `3.3.0 -> 3.3.1` (маленький фикс), `3.3.1 -> 3.4.0` (новая фича).

В нашем проекте версия хранится в meta-блоке userscript:
- [voiso-bot-script.js](/Users/mikepevzner/Documents/AI bot trainer/voiso-bot-script.js)

## 2) Базовые слова Git (без боли)

- `repo` — папка проекта под Git.
- `commit` — зафиксированное состояние проекта с комментарием.
- `tag` — метка на конкретный commit (обычно версия релиза, например `v3.3.0`).
- `remote` — удаленный сервер (GitHub/GitLab), куда публикуются изменения.

Важно: для локальной работы аккаунт НЕ нужен.

## 3) Что уже настроено в проекте

- Локальный Git-репозиторий и `.gitignore`.
- Скрипт релиза:
  - [scripts/release-userscript.sh](/Users/mikepevzner/Documents/AI bot trainer/scripts/release-userscript.sh)
- Артефакты для Tampermonkey:
  - [voiso-bot-script.user.js](/Users/mikepevzner/Documents/AI bot trainer/voiso-bot-script.user.js)
  - [voiso-bot-script.meta.js](/Users/mikepevzner/Documents/AI bot trainer/voiso-bot-script.meta.js)

## 4) Как выпустить новую версию

1. Изменить код в [voiso-bot-script.js](/Users/mikepevzner/Documents/AI bot trainer/voiso-bot-script.js).
2. Запустить релиз-команду:

```bash
./scripts/release-userscript.sh 3.3.1
```

Если уже есть публичный URL (GitHub raw), можно сразу проставить ссылки обновления:

```bash
./scripts/release-userscript.sh 3.3.1 https://raw.githubusercontent.com/<account>/<repo>/main
```

3. Зафиксировать в Git:

```bash
git add .
git commit -m "release: v3.3.1"
git tag v3.3.1
```

4. Если есть remote (GitHub), отправить:

```bash
git push origin main --tags
```

## 5) Как работает автообновление Tampermonkey

Tampermonkey использует 2 URL из meta-блока:
- `@updateURL` -> файл `*.meta.js` (проверка, есть ли новая версия)
- `@downloadURL` -> файл `*.user.js` (скачивание новой версии)

Когда версия в `@version` увеличена, Tampermonkey видит это и предлагает/ставит обновление (в зависимости от настроек TM).

## 6) Обновление по кнопке/вручную

В скрипте добавлена команда в меню Tampermonkey:
- `VOISO Bot: Check script update now`

Она открывает URL `*.user.js` для немедленного обновления.

Если URL еще не настроен в meta-блоке, можно временно задать его вручную в консоли страницы:

```javascript
localStorage.setItem('voiso_userscript_download_url', 'https://raw.githubusercontent.com/<account>/<repo>/main/voiso-bot-script.user.js');
```

## 7) Если аккаунта GitHub пока нет

Это не блокер:
- ведем локальные версии через Git (`commit`, `tag`);
- обновляем script в Tampermonkey ручной вставкой кода.

Для настоящего автообновления нужен публичный URL файла, поэтому позже лучше завести GitHub-аккаунт и выложить репозиторий.
