# JSON: каталог данных и примеры (`Docs/JSON`)

## Назначение

- **`SPOD_INPUT_DATA_CATALOG.md`** — единый справочник по CSV в `IN/SPOD`: колонки, статистика, разбор вложенных JSON для **REWARD_ADD_DATA**, **CONTEST_FEATURE**, а также для **GROUP_VALUE**, **TARGET_TYPE** / **FILTER_PERIOD_ARR** (SCHEDULE), колонок **`*_ARR`** в `USER_ROLE` (объекты/массивы в ячейках).
- **`examples/`** — выгрузки **целиком** в JSON: **один CSV → один `.json`** с тем же базовым именем. В корне документа: `source_csv`, список имён колонок `columns`, массив `rows`. В **каждой** строке — **все поля** исходного CSV; текстовые колонки (например `CREATE_DT`, `CLOSE_DT`) идут строками; ячейки с JSON (начинаются с `{` или `[` после нормализации кавычек) превращаются в объекты/массивы.

Список файлов задаётся в **`src/Tools/export_spod_json_examples.py`** (`CSV_EXAMPLES_ORDER`). При смене имён выгрузок обновите этот список.

## Команды

| Действие | Команда из корня проекта |
|----------|---------------------------|
| Пересобрать Markdown-каталог по `IN/SPOD` | `python src/Tools/build_spod_input_catalog.py` |
| Обновить примеры JSON из `IN/SPOD` | `python src/Tools/export_spod_json_examples.py` |

После смены файлов в `IN/SPOD/` имеет смысл выполнить **обе** команды.

## Файлы в `examples/`

Имена совпадают с именами соответствующих CSV (см. `CSV_EXAMPLES_ORDER` в скрипте).

Пояснения к полям JSON в текстовом виде — в **`src/Tools/catalog_glossary/`** (фрагменты подключаются в каталог при сборке для REWARD и CONTEST).

## Панель администрирования и `REWARD_ADD_DATA`

В проекте **SPOD_GAME_Admin_UI** разбор `REWARD_ADD_DATA` в режиме «По полям» (`src/static/row_editor.js`, мастер `wizard_contest.js`) согласован с матрицей «ключ верхнего уровня ↔ `REWARD_TYPE`» из **`SPOD_INPUT_DATA_CATALOG.md`** (раздел 2 для REWARD):

- **`REWARD_TYPE` выбран** — в форме показываются только поля JSON, допустимые для этого типа; при смене типа блок `REWARD_ADD_DATA` пересобирается.
- **`REWARD_TYPE` пуст** — показываются только ключи, входящие во **все** типы из матрицы (пересечение); шаблон автозаполнения из `field_enums` / обязательных путей `editor_field_ui` подчиняется тем же правилам.
- Ключи **вне** описанной в матрице области при непустых данных по-прежнему отображаются (произвольные расширения схемы).

Дополнительно в корневом **`README.md`** описаны `json_scalar_array`, `field_enums` по элементам массива и экспорт **`SpodJsonEditor.refreshRewardAddDataJsonUi`**.

## Панель администрирования и `INDICATOR_FILTER`

Для листа `INDICATOR` колонка `INDICATOR_FILTER` в режиме «По полям» использует каскадные ограничения из
`indicator_filter_catalog` (формируется из `Docs/ПКАП параметры/06-04-2026 dm_gamification_filteredattribute_dic.xlsx`):

- `INDICATOR_CODE` определяет доступный список `filtered_attribute_code`;
- связка (`INDICATOR_CODE`, `filtered_attribute_code`) задаёт допустимые `filtered_attribute_type` и `filtered_attribute_match`;
- по типу выбирается нижнее поле:
  - строки → `filtered_attribute_condition` (whitelist + datalist с вариантами);
  - числа → `filtered_attribute_value` (границы `min/max`, если заданы);
  - даты (`DATE/DATETIME/TIMESTAMP`) → `filtered_attribute_dt` через datepicker (`YYYY-MM-DD`).

При сохранении в JSON/БД используется типозависимый ключ: `filtered_attribute_condition` или `filtered_attribute_value` или `filtered_attribute_dt`.

## История версий (Docs/JSON)

| Версия | Изменения |
|--------|-----------|
| 1.7.5 | Добавлен раздел по `INDICATOR_FILTER`: каскад зависимостей от `INDICATOR_CODE`, источник значений из `dm_gamification_filteredattribute_dic.xlsx`, datalist для `condition` и datepicker для `filtered_attribute_dt`, плюс фиксация ключей сохранения в JSON/БД. |
| 1.7.4 | Раздел о панели администрирования: фильтрация `REWARD_ADD_DATA` по `REWARD_TYPE`, пересечение при пустом типе, пересборка UI. |
| 1.7.3 | Каталог: подсказки для выгрузок `* 23-03 v3.csv`; машинный разбор JSON для GROUP, SCHEDULE, USER_ROLE; синхронизация с полнотой полей в `examples/`. |
| 1.7.2 | Перенос каталога в `Docs/JSON/`, примеры JSON, экспорт из `IN/SPOD`. |
