# User Roles & `users` Table

Документ описывает актуальные роли, правила управления пользователями и фактическую структуру таблицы `users` в PostgreSQL.

## Role Enumeration

| Role | Права | Использование |
| --- | --- | --- |
| `super_admin` | Полный доступ ко всем API, включая создание/удаление администраторов и глобальные настройки. | Технические владельцы продукта. |
| `admin` | Управляет всеми сущностями кроме супер-админов/других админов; видит и редактирует задачи, контент-план, уведомления, но не дорожную карту. | Руководители отделов. |
| `content_manager` | Создаёт задачи, привязывает их к публикациям, ведёт контент-план. Нет доступа к управлению пользователями. | SMM/редакторы. |
| `executor` | Читает все задачи, но менять может только статус собственных задач. Нет доступа к администрированию. | Исполнители. |

Константы перечислены в `api/roles.js`. Там же задана матрица разрешений (`ROLE_PERMISSIONS`), которую использует UI для сокрытия элементов.

## Permission Rules (Server)

- **Просмотр пользователей**: любой аутентифицированный пользователь (`GET /api/users`), но поле `password` добавляется только тем, кто `canViewPasswords` (супер-админы).
- **Создание/редактирование/удаление пользователей**: `super_admin` и `admin`. При этом администратор может управлять только ролями, перечисленными в `getAssignableRoles(actorRole)` (админ не создаст другого админа).
- **Сброс пароля** и **обновление Telegram-данных другого пользователя**: те же правила, что и для редактирования. Любой пользователь может вызвать `PUT /api/users/:id/telegram` только для собственной записи.
- **Контент-план**: права определяются `CONTENT_PLAN_PERMISSIONS` в `api/server.js` (см. таблицу в `docs/api.md`).
- **Задачи/фичи**: эндпоинты `/api/tasks` и `/api/features` публичные на чтение; UI накладывает дополнительные фильтры по ролям.

## `users` Table Structure (PostgreSQL)

| Column | Type / Constraint | Notes |
| --- | --- | --- |
| `id` | `bigserial PRIMARY KEY` | Автоинкремент. |
| `last_name`, `first_name` | `text NOT NULL` | ФИО. |
| `middle_name` | `text` | Опционально. |
| `birth_date` | `text` | Формат `YYYY-MM-DD`. |
| `group_number` | `text` | Учебная группа/команда. |
| `login` | `text UNIQUE NOT NULL` | Используется для входа и рассылок. |
| `password` | `text NOT NULL` | Пока хранится в открытом виде. |
| `position` | `text` | Должность/роль в отделе. |
| `role` | `text NOT NULL CHECK role IN (...)` | Значения см. таблицу выше. |
| `telegram_username` | `text` | `@username` без `@`. |
| `telegram_chat_id` | `text` | Строковое число, которое присылает бот. |
| `telegram_opt_in` | `boolean NOT NULL DEFAULT false` | Флаг согласия на уведомления. |
| `created_at` | `timestamptz NOT NULL DEFAULT NOW()` | Автоматически. |
| `updated_at` | `timestamptz NOT NULL DEFAULT NOW()` | Обновляется триггером. |

### Default Super Admin Seed

`api/server.js` вызывает `ensureDefaultSuperAdmin()` при старте. Если заданы `DEFAULT_SUPER_ADMIN_LOGIN` и `DEFAULT_SUPER_ADMIN_PASSWORD`, то:

1. выполняется `INSERT ... ON CONFLICT DO NOTHING` в таблицу `users`;
2. пароль не захеширован — после первого входа рекомендуется сменить его вручную;
3. дополнительные поля (`FIRST_NAME`, `LAST_NAME`, `MIDDLE_NAME`, `BIRTH_DATE`, `GROUP_NUMBER`, `POSITION`) опциональны.

### SQLite Helper (устарел)

Файл `sql/create_users_table.sql` оставлен для старых локальных сценариев без PostgreSQL. Он не включает Telegram-поля и не используется в продакшене. Для реальных окружений применяются миграции Supabase или manual DDL, соответствующие таблице выше.
