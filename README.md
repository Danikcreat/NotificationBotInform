# Telegram Notification Bot

Бот присылает личные уведомления в Telegram тем пользователям, которые разрешили рассылку в таск‑менеджере. Он использует REST API (см. `docs/api.md`) для того, чтобы:

- синхронизировать Telegram username/chat id с аккаунтом, где логин совпадает с Telegram username;
- регулярно выгружать задачи и напоминать об истекающих дедлайнах;
- по команде выводить список задач конкретного пользователя;
- отправлять сервисные рассылки через отдельный CLI‑скрипт.

## Требования
- Node.js 18+
- Токен Telegram Bot API (через @BotFather)
- Доступ к API мини‑приложения (либо постоянный JWT, либо служебный логин/пароль)

## Установка
1. Скопируйте пример настроек и заполните значения:
   ```powershell
   Copy-Item .env.example .env
   ```
   Минимально нужны `TELEGRAM_BOT_TOKEN` и либо `API_TOKEN`, либо пара `API_SERVICE_LOGIN/API_SERVICE_PASSWORD`.
2. Убедитесь, что зависимости установлены (`npm install`).

## Запуск бота
```bash
npm run dev
```
Бот запустит long polling и планировщик напоминаний. Завершить работу можно Ctrl+C.

Если хотите вынести рассылку дедлайнов в отдельный процесс, запустите только автономный воркер:
```bash
npm run notifier
```
Он включает только TaskNotifier и использует Telegram-API исключительно для отправки сообщений, без long polling.

### Telegram-команды
- `/start` — привязывает текущий чат к пользователю с таким же логином и включает оповещения.
- `/tasks` — присылает список задач, где пользователь числится ответственным.
- `/stop` — отключает уведомления и очищает chat id.
- `/help` — подсказка по доступным командам.

> Требование: логин пользователя в приложении должен совпадать с его Telegram username. Только пользователи с `telegram_opt_in=true` и указанным `telegram_chat_id` получат уведомления.

### Планировщик напоминаний
- Параметр `TASK_NOTIFIER_POLL_INTERVAL_MS` задаёт частоту опроса API.
- `TASK_DEADLINE_ALERT_WINDOW_HOURS` определяет, за сколько часов до дедлайна отправлять одно напоминание.
- Состояние (чтобы не слать повторно одну и ту же задачу) хранится в `TASK_NOTIFIER_STATE_PATH` (`bot-state.json` по умолчанию).
- Чтобы добавить ссылку на задачу в сообщении, задайте `TASK_URL_TEMPLATE`, например: `https://example.com/tasks/:id` (подстрока `:id` будет заменена).

### Массовые рассылки
Скрипт `npm run notify` отправляет произвольное сообщение всем пользователям, которые разрешили Telegram-уведомления:
```bash
npm run notify -- --message "Встречаемся в 18:00"
```
Можно ограничить список конкретными логинами:
```bash
 npm run notify -- --message "Созвон" --login anna_pet --login ivan_official
 ```
 Чтобы спрятать ссылки под текст, используйте Telegram-форматирование:
 ```bash
 npm run notify -- --message "<a href=\"https://example.com\">Ссылка</a>" --format html
 ```

### Рассылка логинов и паролей
Однократно напомнить пользователям их логин и пароль можно командой:
```bash
npm run broadcast-credentials
```
Скрипт получает список пользователей из API и отправляет тем, кто включил Telegram-уведомления, сообщение вида:
```
Вот твои секретные данные для входа…
Логин: <значение>
Пароль: <спойлер с паролем>
```
Если у пользователя нет логина, пароля или Telegram-чата, он пропускается. Перед запуском убедитесь, что сервисный аккаунт имеет права видеть поле `password`.

### HTTP-доступ к рассылке 
Сервер `npm run notify-server` поднимает HTTP-точку (по умолчанию `http://localhost:8081/broadcast`), к которой может обращаться ваш сайт. Тело запроса:
```jsonc
{
  "message": "Напоминание в 18:00",
  "logins": ["anna_pet", "ivan_official"], // опционально
  "format": "html" // или parse_mode: "MarkdownV2"
}
```
Если задан `BROADCAST_ACCESS_TOKEN`, передавайте его в `Authorization: Bearer <token>` или `X-API-Key`. Поля `format`/`parse_mode` включают HTML/Markdown в Telegram; если их не задавать, можно выставить значение по умолчанию переменной `BROADCAST_PARSE_MODE`. В ответ придёт JSON со статистикой доставки.

Пример cURL:
```bash
curl -X POST http://vm635329.eurodir.ru:8081/broadcast ^
  -H "Content-Type: application/json" ^
  -H "Authorization: Bearer secret-token" ^
  -d "{\"message\":\"Напоминание в 18:00\"}"
```

## Переменные окружения
| Имя | Назначение |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | Токен, выданный @BotFather |
| `API_BASE_URL` | Базовый URL REST API (по умолчанию `http://localhost:4000/api`) |
| `API_TOKEN` | Готовый JWT. Если не задан, бот авторизуется по логину/паролю |
| `API_SERVICE_LOGIN` / `API_SERVICE_PASSWORD` | Учётные данные сервисного аккаунта (опционально, если указан `API_TOKEN`) |
| `USER_REFRESH_INTERVAL_MS` | Как часто обновлять кэш пользователей |
| `TASK_NOTIFIER_POLL_INTERVAL_MS` | Период опроса задач для напоминаний |
| `TASK_DEADLINE_ALERT_WINDOW_HOURS` | Окно, за которое высылать напоминания о дедлайне |
| `TASK_NOTIFIER_STATE_PATH` | Файл для хранения отметок об отправленных уведомлениях |
| `TASK_URL_TEMPLATE` | Необязательный шаблон ссылки на задачу (`:id` заменяется на идентификатор) |
| `BROADCAST_BATCH_SIZE` | После скольких сообщений вставлять небольшую паузу при рассылке |
| `BROADCAST_SERVER_PORT` | Порт HTTP-сервера рассылки (по умолчанию `8081`) |
| `BROADCAST_ACCESS_TOKEN` | Токен для авторизации HTTP-запросов (опционально) |
| `BROADCAST_PARSE_MODE` | Формат сообщений по умолчанию (`HTML`, `Markdown`, `MarkdownV2`) |

## Структура
- `src/index.js` — точка входа, регистрация хендлеров и запуск планировщика
- `src/apiClient.js` — обёртка над REST API с автоматическим логином
- `src/userDirectory.js` — кэш и операции по синхронизации Telegram-данных
- `src/notifier.js` — логика напоминаний о дедлайнах
- `src/cli/notify.js` — CLI для ручных уведомлений
- `src/tasks.js`, `src/stateStore.js`, `src/config.js` — вспомогательные модули

Документация по API лежит в `docs/api.md`.
