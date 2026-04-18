# Логика работы с базой данных (SQLite)

Документ описывает, **как и в каких случаях** приложение обращается к БД: создание, удаление, правка строк, ключи и параметры, участие связей и места в коде для доработок.

---

## 1. Общая архитектура

- Используется **один файл SQLite**; подключение: `src/db.py` → `open_connection` (включены `PRAGMA foreign_keys = ON` там, где поддерживается).
- **Реестр листов** — таблица `sheet`: `id`, `code`, `title`, `file_name`, `imported_at`, `headers_json`.
- **Данные каждого листа** из `config.json` хранятся в **отдельной физической таблице** `spod_sheet_<CODE>` (в имени дефисы в коде листа заменяются на подчёркивание). См. `sheet_storage.physical_table_name`.
- **Межлистовые бизнес-связи** (например, `CONTEST_CODE`) **не оформлены как FOREIGN KEY**: при версионировании строк (`is_current`, несколько версий одной логической сущности) классические FK между листами не применяются. Вместо этого — **индексы** по полям связей и проверки **`consistency.py`**. См. комментарий в `src/sheet_storage.py` в начале файла.

---

## 2. Служебные колонки строки листа (`spod_sheet_*`)

Константа `SERVICE_COLUMNS` в `src/sheet_storage.py`:

| Колонка | Назначение |
|---------|------------|
| `id` | Первичный ключ строки. **Именно его** использует UI: `/sheet/{code}/row/{row_id}`. |
| `sheet_id` | Ссылка на `sheet.id` — **единственный реальный FK** `REFERENCES sheet(id) ON DELETE CASCADE`. |
| `row_index` | Порядковый индекс строки в рамках листа (как при импорте из CSV). |
| `sort_key` | Число для сортировки; при сохранении новой версии **копируется** с предыдущей актуальной строки. |
| `consistency_ok` | `0` / `1` после прогона проверок целостности. |
| `consistency_errors` | JSON-массив строк с описанием ошибок. |
| `updated_at` | Метка времени UTC (строка ISO). |
| `is_current` | `1` — актуальная версия; `0` — устаревшая (история правок). |
| `replaces_row_id` | При вставке новой версии — `id` **предыдущей** актуальной строки (цепочка версий). |

Плюс все **колонки из CSV** как `TEXT` и **денормализованные** поля вида  
`j__<ИМЯ_JSON_КОЛОНКИ>__<путь__через__двойное_подчёркивание>` для выборок/фильтров (см. `flat_map_for_json_column`, лимит `_MAX_FLAT_PER_JSON_COL`).

---

## 3. Создание данных

### 3.1. Импорт из CSV

- Функция: `src/ingest.py` → `import_all`.
- Триггер в UI: `POST /admin/reimport` в `src/app.py`.
- При `clear=True`: удаление всех `spod_sheet_*`, `DELETE FROM sheet`, затем для каждого листа из конфига — создание таблицы (`sheet_storage.create_physical_table`), `INSERT INTO sheet(...)`, для каждой строки CSV — **`sheet_storage.insert_data_row`** с `is_current = 1`, `replaces_row_id = NULL`.
- Каждая строка получает новый автоинкрементный **`id`**.

### 3.2. Мастер «Новый конкурс»

- Черновик мастера (до коммита): таблица **`wizard_draft`** (`src/db.py` → `ensure_wizard_draft_table`): ключ **`draft_uuid`**, поля `step_index`, `status`, `state_json`, `contest_code_preview`, `updated_at`. В строки листов данные **не** пишутся до финального подтверждения.
- Фиксация в БД: `POST /wizard/new-contest/commit` → `src/wizard_contest.py` → **`commit_wizard`**.
- В одной транзакции последовательно вызывается **`_insert_row`** (обёртка над `insert_data_row`) для листов: `CONTEST-DATA`, `GROUP`, `REWARD-LINK`, `REWARD`, `INDICATOR`, `TOURNAMENT-SCHEDULE` (порядок и состав — в теле `commit_wizard`).
- Затем **`consistency.run_all_checks`**. В режиме `consistency.mode == "strict"` при ошибках у вставленных строк возможен **rollback** всей транзакции.
- При успехе и наличии **`draft_uuid`** в payload: **`DELETE FROM wizard_draft WHERE draft_uuid = ?`**.

---

## 4. Правка существующей строки (карточка редактирования)

### 4.1. HTTP

- **`POST /sheet/{code}/row/{row_id}/save`** — обработчик `row_save` в `src/app.py`.

### 4.2. Логика (версионирование, не UPDATE «на месте»)

1. Загрузка актуальной строки: **`sheet_storage.fetch_row_for_update`** — условие `id = ? AND is_current = 1`.
2. Тело запроса — JSON со **всеми** ячейками, которые отправляет клиент (`payload`).
3. Сравнение с текущим состоянием: **`_cells_canonical_json`** в `app.py`. Если наборы совпадают → **HTTP 400** «Нет изменений».
4. В транзакции:
   - **`mark_row_not_current`** — у строки с переданным `row_id`: `is_current = 0`, обновляется `updated_at`.
   - **`insert_data_row`** — новая строка с тем же **`sheet_id`**, **`row_index`**, **`sort_key`**, новыми значениями колонок, `is_current = 1`, **`replaces_row_id = row_id`** (старый id).
   - **`consistency.run_all_checks(conn, do_commit=False)`**.
   - **`_delete_row_edit_draft(conn, code, row_id)`** — удаление черновика для **старого** `row_id` (того, что был в URL).
   - Если в конфиге **`consistency.mode == "strict"`** и у **новой** строки `consistency_ok == 0` → **rollback** транзакции, **HTTP 400** с текстом ошибок.
5. **`commit`** при успехе.
6. Ответ **303 Redirect** на **`/sheet/{code}/row/{new_id}`** — клиент переходит на **`id` новой** актуальной версии.

**Важно для доработок:** после сохранения стабильно искать «текущую» версию нужно по **`id` + `is_current = 1`**. URL после сохранения указывает на **новый** `id`.

---

## 5. Черновик правки строки (`row_edit_draft`)

- Таблица создаётся в `src/db.py` → **`ensure_row_edit_draft_table`**.
- Уникальный ключ: **`(sheet_code, row_id)`** — черновик привязан к **`id` строки на момент открытия карточки** (той версии, что в URL).
- Поля: `status` (для строки карточки по сути **EDIT**), `state_json` — JSON состояния (например `payload`, `confirmed_fields` с клиента).

### HTTP API (`src/app.py`)

| Метод | Путь | Действие |
|-------|------|----------|
| GET | `/sheet/{code}/row/{row_id}/draft` | Чтение черновика (`_fetch_row_edit_draft`). |
| PUT | `/sheet/{code}/row/{row_id}/draft` | Upsert (`_upsert_row_edit_draft`): `INSERT ... ON CONFLICT(sheet_code, row_id) DO UPDATE`. |
| DELETE | `/sheet/{code}/row/{row_id}/draft` | Удаление черновика (`_delete_row_edit_draft`). |

После успешного **`/save`** черновик для **старого** `row_id` удаляется.

---

## 6. Удаление данных

- **Отдельного API «удалить одну строку листа»** в типовых маршрутах нет: строки либо переводятся в **`is_current = 0`** при появлении новой версии, либо **массово уничтожаются** при полном переимпорте (`sheet_storage.drop_all_physical_tables`, очистка `sheet`).
- Явные удаления: **`row_edit_draft`**, **`wizard_draft`** по ключам выше.

---

## 7. Связи между сущностями

### 7.1. В схеме SQLite

- FK только **`sheet_id` → `sheet.id`**.
- Индексы по бизнес-ключам создаются в **`sheet_storage._create_relation_indices`** при создании таблицы листа, например:
  - **CONTEST-DATA**: `CONTEST_CODE`;
  - **GROUP**: `CONTEST_CODE`, пары с `GROUP_CODE`, тройка с `GROUP_VALUE`;
  - **REWARD**: `REWARD_CODE`;
  - **REWARD-LINK**, **INDICATOR**, **TOURNAMENT-SCHEDULE** — по соответствующим полям кодов.

### 7.2. В логике приложения

- **`src/consistency.py`** → **`run_all_checks`**: обход всех актуальных строк всех листов, пересчёт **`consistency_ok` / `consistency_errors`** (дубликаты `CONTEST_CODE`, ссылки на несуществующий конкурс, `REWARD_CODE`, уникальность троек GROUP и т.д.). Краткая модель описана в комментарии в начале файла.
- **`src/relations.py`** → **`build_context_for_row`**: только **чтение** для блока «Связи» в карточке. Определение **`CONTEST_CODE`** для текущей строки — **`_resolve_contest_codes`** (для **REWARD** дополнительно транзитивно через **REWARD-LINK** по **REWARD_CODE**). Дальше поиск связанных строк по листам; в ссылках используются **`sheet_code` + `row_id`** (числовой `id`).

---

## 8. Сводка ключей для HTTP и отладки

| Контекст | Ключи |
|----------|--------|
| URL карточки | `code` — код листа (`sheet.code` / `config.json`); `row_id` — **`id` в `spod_sheet_*`**. |
| Тело save | Имена колонок CSV и JSON-колонок → строковые значения (как в форме). |
| Черновик строки | `(sheet_code, row_id)` + объект `state` в JSON. |
| Мастер | `draft_uuid` в `wizard_draft`; commit — большой JSON с вложенными `cells` по сущностям. |
| Версии одной логической строки | Общие **`row_index`**, **`sort_key`**; разные **`id`**; цепочка **`replaces_row_id`**. |

---

## 9. Файлы для правок логики «под базу»

| Задача | Файл(ы) |
|--------|---------|
| Схема `sheet`, `wizard_draft`, `row_edit_draft` | `src/db.py` |
| DDL листа, вставка строки, денормализация JSON, индексы | `src/sheet_storage.py` |
| Маршруты: список, карточка, save, draft | `src/app.py` |
| Импорт CSV | `src/ingest.py` |
| Проверки между листами | `src/consistency.py` |
| Связи в UI карточки | `src/relations.py` |
| Мастер создания конкурса | `src/wizard_contest.py` |

---

## 10. Краткая цепочка «Пользователь нажал Сохранить»

1. Клиент: **POST** `/sheet/{code}/row/{row_id}/save` + JSON ячеек.  
2. Сервер: чтение строки **`id = row_id`, `is_current = 1`**.  
3. Если данные не изменились → **400**.  
4. Старая запись: **`is_current = 0`**.  
5. Новая запись: **INSERT** с новым **`id`**, теми же **`row_index` / `sort_key`**, **`replaces_row_id`**.  
6. **`run_all_checks`**; при strict и ошибках — **rollback**.  
7. Удаление **`row_edit_draft`** для старого `row_id`.  
8. **Commit** и редирект на **`/sheet/{code}/row/{new_id}`**.

---

*Документ отражает состояние кодовой базы на момент составления; при изменении маршрутов или схемы имеет смысл обновить этот файл.*
