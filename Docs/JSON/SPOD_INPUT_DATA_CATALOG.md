# Каталог входных данных SPOD (CSV, `IN/SPOD`)

Единый справочник по листам выгрузки: **все колонки**, краткое **назначение**, оценка типа данных, **варианты значений** (с ограничениями для длинных текстов и высокой кардинальности). Для **REWARD** (`REWARD_ADD_DATA`) и **CONTEST** (`CONTEST_FEATURE`) — машинный разбор JSON (деревья, типы, варианты по `REWARD_TYPE` / `CONTEST_TYPE`) и **пояснительный справочник полей**. Для **GROUP** (`GROUP_VALUE`), **SCHEDULE** (`TARGET_TYPE`, `FILTER_PERIOD_ARR`), **USER_ROLE** (массивы кодов в колонках `*_ARR`) — дополнительно деревья путей для ячеек с JSON-объектом/массивом (как в `Docs/JSON/examples`).

**Пересборка документа:** `python src/Tools/build_spod_input_catalog.py`

**Примеры JSON:** каталог **`Docs/JSON/examples/`** — один CSV выгрузки → один `.json` с тем же именем; см. **`Docs/JSON/README.md`**. Команда: `python src/Tools/export_spod_json_examples.py`.

## Сводный реестр полей (CSV + ПКАП + Структура БД)

Проведена полная сверка по следующим источникам:

- `IN/SPOD/CONTEST (PROM) 17-04 v0.csv`
- `IN/SPOD/GROUP (PROM) 17-04 v0.csv`
- `IN/SPOD/INDICATOR (PROM) 17-04 v0.csv`
- `IN/SPOD/REWARD (PROM) 17-04 v0.csv`
- `IN/SPOD/REWARD-LINK (PROM) 17-04 v0.csv`
- `IN/SPOD/SCHEDULE (PROM) 17-04 v0.csv`
- `config.json` (блоки `sheets`, `editor_field_definitions`)
- `Docs/ПКАП параметры/(GAME) [HDP] Справочники по геймификации` (HTML + PDF)
- `Docs/Структура БД Фабрика/Структура БД Геймификации-v16-20260420_1648` (HTML)
- `Docs/Структура БД Фабрика/Структура БД Геймификации-v16-20260420_164930.pdf`

Сформированы итоговые файлы:

- `Docs/JSON/SPOD_FIELD_REGISTRY.csv`
- `Docs/JSON/SPOD_FIELD_REGISTRY.xlsx`
- `Docs/JSON/SPOD_FIELDS_ONLY_IN_CSV.csv`

Состав колонок в `SPOD_FIELD_REGISTRY.*` соответствует заданию:

- ИМЯ ЛИСТА
- ИМЯ ФАЙЛА
- ИМЯ ПОЛЯ
- признка json
- имя ключа внутри json (лист с полным путем от верха (кроме названия колонки самой)
- label если есть
- description если есть
- имеющиеся даныне о типе поля
- имеющиеся данные об ограничениях ввода
- имеющиеся данные о вариантах значений
- наличие поля в CSV файлах не пустые значений (кол-во)
- наличие поля в CSV файлах пустые значений (кол-во)
- признак того что поле есть в CSV
- ПКАП
- ПКАП -> ТФС -> ФАБРИКА (передается на фабрику)
- ФАБРИКА БД

### Интерпретация интеграционных колонок (`SPOD_FIELD_REGISTRY.xlsx`)

Ниже зафиксированы правила трактовки последних трёх колонок реестра:

- **`ПКАП`** — если значение `Да` или `Да ?`, параметр используется в ПКАП (в расчётах или бизнес-логике); `Нет` — не используется ПКАП; `-` — отсутствие достоверной привязки.
- **`ПКАП -> ТФС -> ФАБРИКА (передается на фабрику)`** — `Да` означает, что ПКАП передаёт параметр в Фабрику через ТФС; `Нет` — не передаёт; `Да ?` — гипотеза, требующая уточнения.
- **`ФАБРИКА БД`** — `Да` означает, что поле сохраняется в БД Фабрики и используется в фабричном контуре; `Нет` — в БД Фабрики не фиксируется как рабочий параметр; `Да ?` — не полностью подтверждено.

Технические нюансы файла:

- В колонках встречаются редкие варианты `Да ?`, `-`, а также одиночное `да` (нижний регистр); при аналитике `Да` и `да` трактуются одинаково как положительный признак.
- По текущей версии реестра все строки имеют `признак того что поле есть в CSV = Да` (172 из 172).

#### Сводка по значениям (172 строки)

| Колонка | Значение | Кол-во |
|---|---:|---:|
| `ПКАП` | `Да` | 50 |
| `ПКАП` | `Да ?` | 3 |
| `ПКАП` | `Нет` | 118 |
| `ПКАП` | `-` | 1 |
| `ПКАП -> ТФС -> ФАБРИКА (передается на фабрику)` | `Да` | 156 |
| `ПКАП -> ТФС -> ФАБРИКА (передается на фабрику)` | `да` | 1 |
| `ПКАП -> ТФС -> ФАБРИКА (передается на фабрику)` | `Да ?` | 1 |
| `ПКАП -> ТФС -> ФАБРИКА (передается на фабрику)` | `Нет` | 13 |
| `ПКАП -> ТФС -> ФАБРИКА (передается на фабрику)` | `-` | 1 |
| `ФАБРИКА БД` | `Да` | 120 |
| `ФАБРИКА БД` | `Да ?` | 3 |
| `ФАБРИКА БД` | `Нет` | 49 |

#### Сводка по листам (кол-во строк / признаки использования)

В таблице: `всего` / `ПКАП (Да + Да ?)` / `передается на Фабрику (Да)` / `ФАБРИКА БД (Да)`.

| Лист | Значения |
|---|---|
| `Конкурсы` | `52 / 20 / 51 / 38` |
| `Группы / уровни` | `8 / 3 / 8 / 8` |
| `Показатели` | `27 / 13 / 14 / 3` |
| `Награды` | `61 / 0 / 61 / 61` |
| `Связи конкурс — группа — награда` | `3 / 0 / 3 / 3` |
| `Расписание турниров` | `21 / 17 / 19 / 7` |

#### Комментарий по смыслу флагов

- Флаги не обязаны совпадать между собой: поле может не участвовать в расчёте ПКАП (`ПКАП = Нет`), но при этом передаваться в Фабрику как служебное/транспортное (`ПКАП -> ТФС -> ФАБРИКА = Да`) и/или храниться в БД Фабрики (`ФАБРИКА БД = Да`).
- Для задач расчётного контура следует в первую очередь опираться на `ПКАП` и `ФАБРИКА БД`, а `ПКАП -> ТФС -> ФАБРИКА` использовать как признак канала доставки данных.

## Карта использования колонок по системам

Ниже приведена карта использования **верхнеуровневых колонок CSV** (без внутренних `json_path`).
Значения взяты из `SPOD_FIELD_REGISTRY.xlsx` и нормализованы: `Да`/`Да ?`/`да` → `Да`, остальные → `Нет`.

Эта карта предназначена для чтения описаний полей ниже по документу: для каждой колонки сразу видно,
используется ли она в ПКАП, передаётся ли в Фабрику через ТФС и хранится ли в БД Фабрики.

### Конкурсы

| Колонка | ПКАП | ПКАП→ТФС→ФАБРИКА | ФАБРИКА БД |
|---|---:|---:|---:|
| `BUSINESS_BLOCK` | Да | Да | Нет |
| `BUSINESS_STATUS` | Да | Да | Да |
| `CALC_TYPE` | Нет | Нет | Нет |
| `CLOSE_DT` | Нет | Да | Да |
| `CONTEST_CODE` | Да | Да | Да |
| `CONTEST_DESCRIPTION` | Да | Да | Да |
| `CONTEST_FACTOR_METHOD` | Да | Да | Нет |
| `CONTEST_FEATURE` | Нет | Да | Да |
| `CONTEST_INDICATOR_METHOD` | Да | Да | Нет |
| `CONTEST_PERIOD` | Да | Да | Нет |
| `CONTEST_SUBJECT` | Да | Да | Нет |
| `CONTEST_TYPE` | Нет | Да | Да |
| `CREATE_DT` | Да | Да | Да |
| `FACTOR_MARK_TYPE` | Да | Да | Да |
| `FACTOR_MATCH` | Да | Да | Да |
| `FACT_POST_PROCESSING` | Да | Да | Нет |
| `FULL_NAME` | Да | Да | Да |
| `PLAN_METHOD_CODE` | Да | Да | Нет |
| `PLAN_MOD_METOD` | Да | Да | Нет |
| `PLAN_MOD_VALUE` | Да | Да | Нет |
| `PRODUCT` | Нет | Да | Да |
| `PRODUCT_GROUP` | Нет | Да | Да |
| `SHOW_INDICATOR` | Да | Да | Да |
| `SOURCE_UPD_FREQUENCY` | Нет | Да | Да |
| `TARGET_TYPE` | Нет | Да | Нет |

### Группы / уровни

| Колонка | ПКАП | ПКАП→ТФС→ФАБРИКА | ФАБРИКА БД |
|---|---:|---:|---:|
| `ADD_CALC_CRITERION` | Нет | Да | Да |
| `ADD_CALC_CRITERION_2` | Нет | Да | Да |
| `BASE_CALC_CODE` | Нет | Да | Да |
| `CONTEST_CODE` | Да | Да | Да |
| `GET_CALC_CRITERION` | Нет | Да | Да |
| `GET_CALC_METHOD` | Нет | Да | Да |
| `GROUP_CODE` | Да | Да | Да |
| `GROUP_VALUE` | Да | Да | Да |

### Показатели

| Колонка | ПКАП | ПКАП→ТФС→ФАБРИКА | ФАБРИКА БД |
|---|---:|---:|---:|
| `CALC_TYPE` | Нет | Нет | Нет |
| `CONTESTANT_SELECTION` | Да | Да | Нет |
| `CONTEST_CODE` | Да | Да | Да |
| `CONTEST_CRITERION` | Нет | Да | Нет |
| `FULL_NAME` | Нет | Нет | Нет |
| `INDICATOR_ADD_CALC_TYPE` | Да | Да | Да |
| `INDICATOR_AGG_FUNCTION` | Да | Да | Нет |
| `INDICATOR_CALC_TYPE` | Нет | Нет | Нет |
| `INDICATOR_CODE` | Да | Да | Нет |
| `INDICATOR_FILTER` | Да | Да | Нет |
| `INDICATOR_MARK_TYPE` | Нет | Нет | Нет |
| `INDICATOR_MATCH` | Нет | Нет | Нет |
| `INDICATOR_OBJECT` | Нет | Нет | Да |
| `INDICATOR_VALUE` | Нет | Нет | Нет |
| `INDICATOR_WEIGHT` | Да | Да | Нет |
| `N` | Нет | Да | Да |

### Награды

| Колонка | ПКАП | ПКАП→ТФС→ФАБРИКА | ФАБРИКА БД |
|---|---:|---:|---:|
| `FULL_NAME` | Нет | Да | Да |
| `REWARD_ADD_DATA` | Нет | Да | Да |
| `REWARD_CODE` | Нет | Да | Да |
| `REWARD_CONDITION` | Нет | Да | Да |
| `REWARD_COST` | Нет | Да | Да |
| `REWARD_DESCRIPTION` | Нет | Да | Да |
| `REWARD_TYPE` | Нет | Да | Да |

### Связи конкурс — группа — награда

| Колонка | ПКАП | ПКАП→ТФС→ФАБРИКА | ФАБРИКА БД |
|---|---:|---:|---:|
| `CONTEST_CODE` | Нет | Да | Да |
| `GROUP_CODE` | Нет | Да | Да |
| `REWARD_CODE` | Нет | Да | Да |

### Расписание турниров

| Колонка | ПКАП | ПКАП→ТФС→ФАБРИКА | ФАБРИКА БД |
|---|---:|---:|---:|
| `CALC_TYPE` | Да | Да | Нет |
| `CONTEST_CODE` | Да | Да | Да |
| `CRITERION_MARK_TYPE` | Да | Да | Нет |
| `CRITERION_MARK_VALUE` | Да | Да | Нет |
| `END_DT` | Да | Да | Да |
| `FILTER_PERIOD_ARR` | Да | Да | Нет |
| `PERIOD_TYPE` | Нет | Да | Да |
| `PLAN_PERIOD_END_DT` | Да | Да | Нет |
| `PLAN_PERIOD_START_DT` | Да | Да | Нет |
| `RESULT_DT` | Да | Да | Да |
| `START_DT` | Да | Да | Да |
| `TARGET_TYPE` | Нет | Да | Да |
| `TOURNAMENT_CODE` | Да | Да | Да |
| `TOURNAMENT_STATUS` | Да | Да | Да |
| `TRN_INDICATOR_FILTER` | Нет | Нет | Нет |

## Карта использования JSON-внутренностей по системам

Раздел фиксирует использование **внутренних JSON-путей** (`json_path` в реестре), чтобы было видно,
какие именно элементы JSON участвуют в ПКАП, передаются на Фабрику и/или хранятся в БД Фабрики.

Нормализация флагов: `Да`, `Да ?`, `да` → `Да`; остальные значения → `Нет`.

### Конкурсы · `CONTEST_FEATURE`

| JSON-путь | Label | ПКАП | ПКАП→ТФС→ФАБРИКА | ФАБРИКА БД |
|---|---|---:|---:|---:|
| `accuracy` | Знак точности | Нет | Да | Да |
| `avatarShow` | Показывать аватар | Нет | Да | Да |
| `businessBlock` | Бизнес-блок | Нет | Да | Да |
| `capacity` | Округление | Нет | Да | Да |
| `feature` | Особенности конкурса | Нет | Да | Да |
| `gosbHidden` | Скрыть от ГОСБ | Нет | Да | Да |
| `gosbVisible` | Показать в ГОСБ | Нет | Да | Да |
| `helpCodeList` | Код помощи (элемент {index1}) | Нет | Да | Да |
| `masking` | Скрытие персональных данных | Нет | Да | Да |
| `minNumber` | Минимум участников | Нет | Да | Да |
| `momentRewarding` | Момент награждения | Нет | Да | Да |
| `persomanNumberHidden` | Скрыть от участников | Нет | Да | Да |
| `persomanNumberVisible` | Показать участникам | Нет | Да | Да |
| `preferences` | Преференции | Нет | Да | Да |
| `tbHidden` | Скрыть от ТБ | Нет | Да | Да |
| `tbVisible` | Показать в ТБ | Нет | Да | Да |
| `tournamentEndMailing` | Письмо о завершении турнира | Нет | Да | Да |
| `tournamentLikeMailing` | Письмо о лайках | Нет | Да | Да |
| `tournamentListMailing` | Рассылка списка участников | Нет | Да | Да |
| `tournamentRewardingMailing` | Рассылка о награждении | Нет | Да | Да |
| `tournamentStartMailing` | Письмо о начале турнира | Нет | Да | Да |
| `tournamentTeam` | Командный турнир | Нет | Да | Да |
| `typeRewarding` | Режим награждения | Нет | Да | Да |
| `vid` | Тип витрины | Нет | Да | Да |

### Конкурсы · `CONTEST_PERIOD`

| JSON-путь | Label | ПКАП | ПКАП→ТФС→ФАБРИКА | ФАБРИКА БД |
|---|---|---:|---:|---:|
| `criterion_mark_type` | Оператор критерия (элемент 0) | Да | Да | Нет |
| `criterion_mark_value` | Порог критерия (элемент 0) | Да | Да | Нет |
| `period_code` | Код периода (элемент 0) | Да | Да | Нет |

### Показатели · `INDICATOR_FILTER`

| JSON-путь | Label | ПКАП | ПКАП→ТФС→ФАБРИКА | ФАБРИКА БД |
|---|---|---:|---:|---:|
| `filtered_attribute_code` | Код атрибута фильтра | Да | Да | Нет |
| `filtered_attribute_condition` | Список значений фильтра | Да | Да | Нет |
| `filtered_attribute_condition.*` | Значение условия (элемент {index1}) | Нет | Нет | Нет |
| `filtered_attribute_dt` | Дата фильтра | Да | Да | Нет |
| `filtered_attribute_match` | Оператор фильтра | Да | Да | Нет |
| `filtered_attribute_max_date` | Максимальная дата | Нет | Нет | Нет |
| `filtered_attribute_max_value` | Максимальное числовое значение | Нет | Нет | Нет |
| `filtered_attribute_min_date` | Минимальная дата | Нет | Нет | Нет |
| `filtered_attribute_min_value` | Минимальное числовое значение | Нет | Нет | Нет |
| `filtered_attribute_type` | Тип атрибута фильтра | Да | Да | Нет |
| `filtered_attribute_value` | Числовое значение фильтра | Да | Да | Нет |

### Награды · `REWARD_ADD_DATA`

| JSON-путь | Label | ПКАП | ПКАП→ТФС→ФАБРИКА | ФАБРИКА БД |
|---|---|---:|---:|---:|
| `bookingRequired` | Требуется бронирование | Нет | Да | Да |
| `businessBlock` | Бизнес-блок | Нет | Да | Да |
| `commingSoon` | Скоро будет | Нет | Да | Да |
| `deliveryRequired` | Требуется доставка | Нет | Да | Да |
| `feature` | feature | Нет | Да | Да |
| `fileName` | Код медиа-файла | Нет | Да | Да |
| `getCondition` | — | Нет | Да | Да |
| `getCondition.employeeRating` | — | Нет | Да | Да |
| `getCondition.employeeRating.minCrystalEarnedTotal` | Минимум кристаллов | Нет | Да | Да |
| `getCondition.employeeRating.minRatingBANK` | Минимальный рейтинг в стране | Нет | Да | Да |
| `getCondition.employeeRating.minRatingGOSB` | Минимальный рейтинг в ТБ | Нет | Да | Да |
| `getCondition.employeeRating.minRatingTB` | Минимальный рейтинг в ГОСБ | Нет | Да | Да |
| `getCondition.employeeRating.seasonCode` | Сезон рейтинга | Нет | Да | Да |
| `getCondition.nonRewards` | Запрещающие награды | Нет | Да | Да |
| `getCondition.nonRewards.nonRewardCode` | Код исключающей награды | Нет | Да | Да |
| `getCondition.rewards` | Требуемые награды | Нет | Да | Да |
| `getCondition.rewards.amount` | Количество (1 / 2 / 3) | Нет | Да | Да |
| `getCondition.rewards.rewardCode` | Код требуемой награды (BADGE) | Нет | Да | Да |
| `helpCodeList` | helpCodeList[{index}] | Нет | Да | Да |
| `hidden` | Скрыть | Нет | Да | Да |
| `hiddenRewardList` | Скрыть в списках | Нет | Да | Да |
| `ignoreConditions` | Доступность без условий | Нет | Да | Да |
| `isGrouping` | isGrouping | Нет | Да | Да |
| `isGroupingName` | isGroupingName | Нет | Да | Да |
| `isGroupingTitle` | isGroupingTitle | Нет | Да | Да |
| `isGroupingTultip` | isGroupingTultip | Нет | Да | Да |
| `itemAmount` | Количество товаров | Нет | Да | Да |
| `itemFeature` | itemFeature | Нет | Да | Да |
| `itemGroupAmount` | Групповые лимиты по месяцам | Нет | Да | Да |
| `itemGroupAmount.itemParam` | Месяц | Нет | Да | Да |
| `itemGroupAmount.itemParamAmount` | Лимит (0–100) | Нет | Да | Да |
| `itemLimitCount` | Лимит по количеству (itemLimitCount) | Нет | Да | Да |
| `itemLimitPeriod` | Период лимита выдачи | Нет | Да | Да |
| `itemMinShow` | Минимум показов (itemMinShow) | Нет | Да | Да |
| `masterBadge` | Мастер-бейдж | Нет | Да | Да |
| `newsType` | Тип новости | Нет | Да | Да |
| `nftFlg` | NFT-награда | Нет | Да | Да |
| `outstanding` | Публиковать в ленте | Нет | Да | Да |
| `parentRewardCode` | Родительская награда | Нет | Да | Да |
| `persomanNumberVisible` | Показать участникам | Нет | Да | Да |
| `preferences` | preferences[0] | Нет | Да | Да |
| `priority` | Приоритет награды | Нет | Да | Да |
| `recommendationLevel` | Уровень рекомендации | Нет | Да | Да |
| `refreshOldNews` | Обновлять старые новости | Нет | Да | Да |
| `rewardAgainGlobal` | Повторная выдача (глобально) | Нет | Да | Да |
| `rewardAgainTournament` | Повторная выдача (в турнире) | Нет | Да | Да |
| `rewardRule` | Правило выдачи | Нет | Да | Да |
| `seasonItem` | Сезон действия | Нет | Да | Да |
| `singleNews` | Текст личной новости | Нет | Да | Да |
| `tagColor` | Цвет тега | Нет | Да | Да |
| `tagEndDT` | Дата окончания тега | Нет | Да | Да |
| `teamNews` | Текст командной новости | Нет | Да | Да |
| `tournamentTeam` | Командный турнир | Нет | Да | Да |
| `winCriterion` | Критерий победы для новости | Нет | Да | Да |

### Расписание турниров · `FILTER_PERIOD_ARR`

| JSON-путь | Label | ПКАП | ПКАП→ТФС→ФАБРИКА | ФАБРИКА БД |
|---|---|---:|---:|---:|
| `criterion_mark_type` | Оператор критерия участия | Да | Да | Нет |
| `criterion_mark_value` | Порог критерия участия | Да | Да | Нет |
| `end_dt` | Дата окончания периода (end_dt) | Да | Да | Нет |
| `period_code` | Код периода | Да | Да | Нет |
| `start_dt` | Дата начала периода (start_dt) | Да | Да | Нет |

### Расписание турниров · `TARGET_TYPE`

| JSON-путь | Label | ПКАП | ПКАП→ТФС→ФАБРИКА | ФАБРИКА БД |
|---|---|---:|---:|---:|
| `seasonCode` | Сезон турнира | Нет | Да | Да |

Итоги сверки:

- Всего строк в реестре: **172** (после дедупликации путей JSON и нормализации повторов).
- Полей/путей, которые есть в CSV, но не найдены в обоих каталогах (ПКАП и Структура БД): **2**.
- Для `INDICATOR_FILTER` добавлены под-поля (`filtered_attribute_code`, `filtered_attribute_type`, `filtered_attribute_match`, `filtered_attribute_value`, `filtered_attribute_dt`, `filtered_attribute_condition`) с отдельной проверкой наличия в каталогах.
- Для `INDICATOR_FILTER` в Admin UI зафиксирована каскадная зависимость: `INDICATOR_CODE` → `filtered_attribute_code` → (`filtered_attribute_type`, `filtered_attribute_match`) → (`filtered_attribute_condition` / `filtered_attribute_dt` / `filtered_attribute_value`) с применением ограничений `min/max`, если они заданы в `indicator_filter_catalog`.
- Для `INDICATOR_FILTER` подтверждён источник допустимых `condition_options`: `Docs/ПКАП параметры/06-04-2026 dm_gamification_filteredattribute_dic.xlsx` (агрегация в `config.json`), включая список валют `ccy_code` (31 значение) и другие справочные значения по атрибутам.
- Варианты значений в реестре нормализованы: для пар `label/value` в итоговой колонке оставляется только `value`.

Поля, найденные только в CSV:

- `INDICATOR (PROM) 17-04 v0.csv` → `N`
- `SCHEDULE (PROM) 17-04 v0.csv` → `TRN_INDICATOR_FILTER`

## Оглавление

- [Карта использования колонок по системам](#карта-использования-колонок-по-системам)
- [Карта использования JSON-внутренностей по системам](#карта-использования-json-внутренностей-по-системам)
- [Актуализация по `config.json` (названия полей в UI)](#актуализация-по-configjson-названия-полей-в-ui)
- [REWARD (PROM) 23-03 v3.csv](#reward-prom-23-03-v3)
- [CONTEST (PROM) 23-03 v3.csv](#contest-prom-23-03-v3)
- [employee (PROM) 13-03 v0.csv](#employee-prom-13-03-v0)
- [GROUP (PROM) 18-03 v0.csv](#group-prom-18-03-v0)
- [INDICATOR (PROM) 18-03 v0.csv](#indicator-prom-18-03-v0)
- [ORG_UNIT_V20 20-03 v0.csv](#org-unit-v20-20-03-v0)
- [REPORT (PROM) 18-03 v0.csv](#report-prom-18-03-v0)
- [REWARD-LINK (PROM) 18-03 v0.csv](#reward-link-prom-18-03-v0)
- [SCHEDULE (PROM) 18-03 v0.csv](#schedule-prom-18-03-v0)
- [USER_ROLE (PROM) 13-03 v0.csv](#user-role-prom-13-03-v0)

---
## Уточнения наименований и связей (HDP + contestscheme)

С учётом `Docs/ПКАП параметры/(GAME) [HDP] Справочники по геймификации`, `Docs/GAMIFICATION_FIELD_LABELS_PROPOSAL.md` и `Docs/ПКАП параметры/contestscheme_v0.json`:

- Основная связка сущностей: `CONTEST_CODE` связывает `CONTEST` ↔ `GROUP` ↔ `INDICATOR` ↔ `SCHEDULE` ↔ `REWARD-LINK`.
- Связь наград с конкурсом выполняется через `REWARD-LINK` (`CONTEST_CODE`, `GROUP_CODE`, `REWARD_CODE`), а не напрямую через `REWARD`.
- Для `INDICATOR` поле `INDICATOR_ADD_CALC_TYPE` фактически задаёт роль в формуле (`NUMERATOR`/`DIVIDER`).
- Для `SCHEDULE` поле `FILTER_PERIOD_ARR` соответствует модели дополнительных периодов из `contestscheme_v0.json` (`tournament_period`), а `CRITERION_MARK_TYPE`/`CRITERION_MARK_VALUE` задают порог допуска участника.
- Для `CONTEST` поля `PLAN_METHOD_CODE`, `PLAN_MOD_METOD`, `CONTEST_INDICATOR_METHOD`, `CONTEST_FACTOR_METHOD`, `FACT_POST_PROCESSING` лучше трактовать как ссылки на справочник методов `dm_gamification_method_dic`.

---
## Актуализация по `config.json` (названия полей в UI)

Ниже — краткая выжимка по текущим пользовательским названиям и ограничениям из `config.json` (блоки `editor_field_ui`, `field_enums`, `editor_textareas`) для ключевых JSON-полей. Этот блок нужен как «мост» между техничными JSON-ключами и тем, как поле подписано/валидируется в интерфейсе редактирования.

| Лист / колонка | JSON-путь / поле | Текущее имя в UI | Значения / поведение (актуально по `config.json`) |
|---|---|---|---|
| `CONTEST-DATA.CONTEST_FEATURE` | `vid` | «Вид конкурса» | toggle: `ПРОМ` / `ТЕСТ` |
| `CONTEST-DATA.CONTEST_FEATURE` | `momentRewarding` | «Момент вручения награды» | `AFTER` («Вручаем в конце») / `DURIN` («Вручаем сразу») |
| `CONTEST-DATA.CONTEST_FEATURE` | `masking` | «Маскировка» | `Y` («Да») / `N` («Нет») |
| `CONTEST-DATA.CONTEST_PERIOD` | `[i].period_code`, `[i].criterion_mark_type`, `[i].criterion_mark_value` | «Периоды и критерии конкурса (JSON)» | массив объектов с периодом, оператором и порогом |
| `REWARD.REWARD_ADD_DATA` | `newsType` | «Тип новости» | `AIPROMPT` («AI-новость») / `TEMPLATE` («Новость по шаблону») |
| `REWARD.REWARD_ADD_DATA` | `getCondition.nonRewards[].nonRewardCode` | «Код исключающей награды» | варианты подтягиваются из листа `REWARD` c фильтром `REWARD_TYPE=ITEM`, подпись: `{FULL_NAME}: ["{REWARD_CODE}"]` |
| `REWARD.REWARD_ADD_DATA` | `getCondition.rewards[].rewardCode` | «Код требуемой награды (BADGE)» | whitelist-ввод; проверка по кодам `REWARD` c фильтром `REWARD_TYPE=BADGE` |
| `REWARD.REWARD_ADD_DATA` | `getCondition.rewards[].amount` | «Количество (1 / 2 / 3)» | фиксированные значения: `1`, `2`, `3` |
| `REWARD.REWARD_ADD_DATA` | `itemGroupAmount[].itemParam` | «Месяц группового лимита» | перечисление месяцев `Январь`…`Декабрь` |
| `INDICATOR.INDICATOR_FILTER` | `[i].filtered_attribute_code` | «Код атрибута фильтра» | список строится по `indicator_filter_catalog.by_indicator_code[INDICATOR_CODE]`; смена `INDICATOR_CODE` пересобирает блоки фильтра |
| `INDICATOR.INDICATOR_FILTER` | `[i].filtered_attribute_type`, `[i].filtered_attribute_match` | «Тип атрибута», «Оператор фильтра» | значения ограничены по паре (`INDICATOR_CODE`, `filtered_attribute_code`); недопустимое/пустое значение заменяется на первое допустимое |
| `INDICATOR.INDICATOR_FILTER` | `[i].filtered_attribute_condition` | «Список значений фильтра» | для `condition_options` с непустыми значениями применяется whitelist-ввод (подсветка valid/invalid); значения вне списка отбрасываются при пересборке |
| `INDICATOR.INDICATOR_FILTER` | `[i].filtered_attribute_dt`, `[i].filtered_attribute_value` | «Дата фильтра», «Числовое значение фильтра» | для `DATE*` используются `filtered_attribute_min_date/max_date`; для чисел — `filtered_attribute_min_value/max_value` |
| `INDICATOR.INDICATOR_FILTER` | `[i].filtered_attribute_condition` (UX) | «Список значений фильтра» | для whitelist-полей в UI отображается datalist (выпадающие варианты), включая коды из справочника (`ccy_code`, `segment_mk` и др.) |
| `INDICATOR.INDICATOR_FILTER` | `[i].filtered_attribute_dt` (UX) | «Дата фильтра» | при типах `DATE` / `DATETIME` / `TIMESTAMP` рендерится datepicker; в итоговый JSON сохраняется ключ `filtered_attribute_dt` |
| `TOURNAMENT-SCHEDULE.FILTER_PERIOD_ARR` | `[0].period_code` | «Код периода» | значения: `0`, `1` |
| `TOURNAMENT-SCHEDULE.FILTER_PERIOD_ARR` | `[0].criterion_mark_type` | «Оператор критерия участия» | `>=`, `>`, `=`, `<=`, `<`, `<>`, `(пусто)` |
| `TOURNAMENT-SCHEDULE.TARGET_TYPE` | `seasonCode` | «Сезон турнира» | enum с человекочитаемыми подписями (`SEASON_2025_1`, `SEASON_f_2025` и др.) |
| `TOURNAMENT-SCHEDULE` | `TOURNAMENT_STATUS` | «Статус турнира» | `АКТИВНЫЙ`, `ПОДВЕДЕНИЕ ИТОГОВ`, `ЗАВЕРШЕН`, `ОТМЕНЕН`, `УДАЛЕН` |
| `TOURNAMENT-SCHEDULE` | `PERIOD_TYPE` | «Тип периода» | упорядоченный enum (месяцы → кварталы/полугодия → год → `произвольный`) |

Примечание: полные деревья JSON, статистика встречаемости и примеры значений по выгрузке остаются в соответствующих разделах ниже; таблица выше фиксирует именно актуальные «человеческие» названия/ограничения из текущей конфигурации редактора.

---
<a id="reward-prom-23-03-v3"></a>

## Файл: `REWARD (PROM) 23-03 v3.csv`

- **Путь:** `IN/SPOD/REWARD (PROM) 23-03 v3.csv`
- **Строк данных:** 598 (без учёта заголовка)
- **Разделитель:** `;`, кодировка UTF-8
- **Колонок:** 7

### Краткое назначение колонок

| Колонка | Назначение |
|---------|------------|
| `REWARD_CODE` | Уникальный код награды; используется в связке `REWARD-LINK.REWARD_CODE`.  ПКАП |
| `REWARD_TYPE` | Тип награды (ITEM / BADGE / LABEL / CRYSTAL), определяет допустимую структуру `REWARD_ADD_DATA`. |
| `FULL_NAME` | Краткое отображаемое название награды. |
| `REWARD_DESCRIPTION` | Пользовательское описание награды и условий получения. |
| `REWARD_CONDITION` | Условие выдачи награды (по HDP: `1` — победа, `2` — участие). |
| `REWARD_COST` | Номинал/стоимость награды в условных единицах. |
| `REWARD_ADD_DATA` | JSON с параметрами отображения, выдачи, ограничений и коммуникаций награды. |

### Плоские колонки (статистика значений)

| Колонка | Тип (оценка) | Непустых | Уникальных* | Варианты / комментарий |
|---------|--------------|----------|-------------|-------------------------|
| `REWARD_CODE` | строка | 598/598 | 598 | **высокая кардинальность** (598 уник.); примеры: `['ITEM_01', 'ITEM_02', 'ITEM_03', 'ITEM_04', 'ITEM_05', 'ITEM_06', 'ITEM_07', 'ITEM_08', 'ITEM_09', 'ITEM_10', 'ITEM_11', 'ITEM_12', 'ITEM_13', 'ITEM_14', 'LABEL_01']`  ПКАП |
| `REWARD_TYPE` | строка | 598/598 | 4 | `['ITEM', 'BADGE', 'LABEL', 'CRYSTAL']` |
| `FULL_NAME` | строка | 598/598 | 354 | **высокая кардинальность** (354 уник.); примеры: `['Бронза', 'Золото', 'Серебро', 'Криcталл', 'Инноваторы', '5 инициатив', 'CSI на 100%', 'SLA на 100%', 'Я-Наставник', '1 инициатива', '3 инициативы', 'AI-community', 'Бронза по НПА', 'Золото по НПА', 'Одним сердцем']` |
| `REWARD_DESCRIPTION` | строка | 598/598 | 268 | **длинный текст**, до 927 симв.; примеры (обрезка): `['тут будет условие получения награды', 'описание бейджа', 'описание', 'Золотой бейдж можно получить, одержав победу в любом турнире сезона', 'Серебряный бейдж можно получить, одержав победу в любом турнире сезона', 'Бронзовый бейдж можно получить, одержав победу в любом турнире сезона', 'Возможность поговорить тет-а-тет с Сергеем Меламедом. Диалог пройдет в формате наставнической онлайн-сессии. Директор Департамента развития корпоративного бизне…', 'Артефакт, который впишется в любой интерьер семейного дома. Благодарственное письмо за подписью директора Департамента развития корпоративного бизнеса Сергея Ме…']`; всего **268** уникальных |
| `REWARD_CONDITION` | целое (строкой в CSV) | 598/598 | 2 | `['1', '2']` |
| `REWARD_COST` | целое (строкой в CSV) | 598/598 | 21 | `['0', '1', '2', '3', '4', '5', '6', '7', '8', '10', '11', '12', '14', '15', '17', '19', '20', '30', '40', '50', '60']` |
| `REWARD_ADD_DATA` | строка | 598/598 | 519 | **длинный текст**, до 2363 симв.; примеры (обрезка): `['{"""feature""": [], """nftFlg""":"""N""", """outstanding""":"""N""", """rewardRule""":"""Бейдж получат ТОП-3 от числа участников турнира в каждом тербанке""", "…', '{"""feature""": [], """nftFlg""":"""N""", """outstanding""":"""N""", """rewardRule""":"""Бейдж получат ТОП-3 от числа участников турнира в подразделении""", """…', '{"""feature""": [], """nftFlg""":"""N""", """outstanding""":"""N""", """rewardRule""":"""Бейдж получат 10% от числа участников турнира в тербанке""", """rewardA…', '{"""feature""": [], """nftFlg""":"""N""", """outstanding""":"""N""", """rewardRule""":"""Бейдж получат 10% от числа участников турнира в тербанке""", """rewardA…', '{"""feature""": ["""Факт получения бейджа попадает в ленту сообщества"""], """nftFlg""":"""N""", """outstanding""":"""Y""", """rewardRule""":"""Бейдж получит уч…', '{"""feature""": [], """nftFlg""":"""N""", """outstanding""":"""N""", """rewardRule""":"""Бейдж получат ТОП-3 от числа участников турнира в каждом тербанке""", "…', '{"""feature""": [], """nftFlg""":"""N""", """outstanding""":"""N""", """rewardRule""":"""Бейдж получат ТОП-3 от числа участников турнира в подразделении""", """…', '{"""feature""": [], """nftFlg""":"""N""", """outstanding""":"""N""", """rewardRule""":"""Бейдж получат 10% от числа участников турнира в подразделении""", """re…']`; всего **519** уникальных |

\* Уникальных по непустым значениям; для длинных текстов перечисление ограничено.

### JSON: колонка `REWARD_ADD_DATA`

Предобработка: в ячейке последовательность тройных кавычек заменяется на обычную `"`, затем `json.loads`. Корень — один объект; пути ниже с префиксом `REWARD_ADD_DATA`.

#### Сводка по `REWARD_TYPE`

| REWARD_TYPE | строк | JSON распарсено |
|-------------|-------|-----------------|
| BADGE | 529 | 529 |
| ITEM | 61 | 61 |
| LABEL | 6 | 6 |
| CRYSTAL | 2 | 2 |

#### Ключи JSON, встречающиеся не во всех типах награды

- `REWARD_ADD_DATA.bookingRequired`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.businessBlock`: есть в ['BADGE', 'ITEM']; **нет** в ['CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.businessBlock[]`: есть в ['BADGE', 'ITEM']; **нет** в ['CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.commingSoon`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.deliveryRequired`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.feature[]`: есть в ['BADGE', 'ITEM', 'LABEL']; **нет** в ['CRYSTAL']
- `REWARD_ADD_DATA.getCondition`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.getCondition.employeeRating`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.getCondition.employeeRating.minCrystalEarnedTotal`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.getCondition.employeeRating.minRatingBANK`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.getCondition.employeeRating.minRatingGOSB`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.getCondition.employeeRating.minRatingTB`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.getCondition.employeeRating.seasonCode`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.getCondition.nonRewards`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.getCondition.nonRewards[]`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.getCondition.nonRewards[].nonRewardCode`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.getCondition.rewards`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.getCondition.rewards[]`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.getCondition.rewards[].amount`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.getCondition.rewards[].rewardCode`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.helpCodeList`: есть в ['BADGE']; **нет** в ['CRYSTAL', 'ITEM', 'LABEL']
- `REWARD_ADD_DATA.helpCodeList[]`: есть в ['BADGE']; **нет** в ['CRYSTAL', 'ITEM', 'LABEL']
- `REWARD_ADD_DATA.hiddenRewardList`: есть в ['BADGE', 'ITEM']; **нет** в ['CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.ignoreConditions`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.isGrouping`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.isGroupingName`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.isGroupingTitle`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.isGroupingTultip`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.itemAmount`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.itemFeature`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.itemFeature[]`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.itemGroupAmount`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.itemGroupAmount[]`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.itemGroupAmount[].itemParam`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.itemGroupAmount[].itemParamAmount`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.itemLimitCount`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.itemLimitPeriod`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.itemMinShow`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.masterBadge`: есть в ['BADGE']; **нет** в ['CRYSTAL', 'ITEM', 'LABEL']
- `REWARD_ADD_DATA.newsType`: есть в ['BADGE']; **нет** в ['CRYSTAL', 'ITEM', 'LABEL']
- `REWARD_ADD_DATA.parentRewardCode`: есть в ['BADGE', 'LABEL']; **нет** в ['CRYSTAL', 'ITEM']
- `REWARD_ADD_DATA.persomanNumberVisible`: есть в ['ITEM']; **нет** в ['BADGE', 'CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.preferences`: есть в ['BADGE']; **нет** в ['CRYSTAL', 'ITEM', 'LABEL']
- `REWARD_ADD_DATA.preferences[]`: есть в ['BADGE']; **нет** в ['CRYSTAL', 'ITEM', 'LABEL']
- `REWARD_ADD_DATA.priority`: есть в ['BADGE']; **нет** в ['CRYSTAL', 'ITEM', 'LABEL']
- `REWARD_ADD_DATA.recommendationLevel`: есть в ['BADGE']; **нет** в ['CRYSTAL', 'ITEM', 'LABEL']
- `REWARD_ADD_DATA.refreshOldNews`: есть в ['BADGE', 'ITEM', 'LABEL']; **нет** в ['CRYSTAL']
- `REWARD_ADD_DATA.seasonItem`: есть в ['BADGE', 'ITEM']; **нет** в ['CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.seasonItem[]`: есть в ['BADGE', 'ITEM']; **нет** в ['CRYSTAL', 'LABEL']
- `REWARD_ADD_DATA.tagColor`: есть в ['LABEL']; **нет** в ['BADGE', 'CRYSTAL', 'ITEM']
- `REWARD_ADD_DATA.tagEndDT`: есть в ['LABEL']; **нет** в ['BADGE', 'CRYSTAL', 'ITEM']
- `REWARD_ADD_DATA.tournamentTeam`: есть в ['BADGE']; **нет** в ['CRYSTAL', 'ITEM', 'LABEL']
- `REWARD_ADD_DATA.winCriterion`: есть в ['BADGE']; **нет** в ['CRYSTAL', 'ITEM', 'LABEL']

#### Тип награды `BADGE` — дерево путей

- `REWARD_ADD_DATA`
  - `businessBlock`
  - `businessBlock[]`
  - `feature`
  - `feature[]`
  - `fileName`
  - `helpCodeList`
  - `helpCodeList[]`
  - `hidden`
  - `hiddenRewardList`
  - `masterBadge`
  - `newsType`
  - `nftFlg`
  - `outstanding`
  - `parentRewardCode`
  - `preferences`
  - `preferences[]`
  - `priority`
  - `recommendationLevel`
  - `refreshOldNews`
  - `rewardAgainGlobal`
  - `rewardAgainTournament`
  - `rewardRule`
  - `seasonItem`
  - `seasonItem[]`
  - `singleNews`
  - `teamNews`
  - `tournamentTeam`
  - `winCriterion`

##### Листья и узлы (типы и варианты) — `BADGE`

- **`REWARD_ADD_DATA`** — в 529 JSON; типы: `{'object': 529}`
- **`REWARD_ADD_DATA.businessBlock`** — в 529 JSON; типы: `{'array': 529}`; длина массива: min=1, max=1
- **`REWARD_ADD_DATA.businessBlock[]`** — в 529 JSON; типы: `{'string': 529}`; примеры строк: `['MNS', 'IMUB', 'RNUB', 'RSB1', 'KMSB1', 'KMKKSB', 'SERVICEMEN', 'KMFACTORING']`
- **`REWARD_ADD_DATA.feature`** — в 529 JSON; типы: `{'array': 529}`; длина массива: min=0, max=5
- **`REWARD_ADD_DATA.feature[]`** — в 216 JSON; типы: `{'string': 333}`; строки: **длинный текст** (макс. 137 симв.)
- **`REWARD_ADD_DATA.fileName`** — в 529 JSON; типы: `{'string': 529}`; примеры строк: `['', 'GURU', 'VASCODAGAMA', 'SUPERCUP_2023', 'CT_TITLE_PROJECT', 'INDIA_COMMISSION_3M', 'INDIA_COMMISSION_X2', 'INDIA_COMMISSION_X3', 'INDIA_COMMISSION_X4', 'SUPERBONUS_2023_TOP1', 'INDIA_COMMISSION_100K', 'INDIA_COMMISSION_500K', 'SUPERBONUS_2023_TOP10', 'SUPERBONUS_2023_TOP20', 'CHAMPION_LEAGUE_2023_1', 'CHAMPION_LEAGUE_2023_2', 'SUPERBONUS_2023_TOP20+', 'TOURNAMENT_CONDITIONAL_DEALS_TB', 'TOURNAMENT_CONDITIONAL_DEALS_BANK', 'TOURNAMENT_CONDITIONAL_DEALS_GOSB']`
- **`REWARD_ADD_DATA.helpCodeList`** — в 30 JSON; типы: `{'array': 30}`; длина массива: min=1, max=2
- **`REWARD_ADD_DATA.helpCodeList[]`** — в 30 JSON; типы: `{'string': 31}`; примеры строк: `['AST_1', 'NFT_1']`
- **`REWARD_ADD_DATA.hidden`** — в 529 JSON; типы: `{'string': 529}`; примеры строк: `['N', 'Y']`
- **`REWARD_ADD_DATA.hiddenRewardList`** — в 112 JSON; типы: `{'string': 112}`; примеры строк: `['N', 'Y']`
- **`REWARD_ADD_DATA.masterBadge`** — в 529 JSON; типы: `{'string': 529}`; примеры строк: `['N', 'Y']`
- **`REWARD_ADD_DATA.newsType`** — в 51 JSON; типы: `{'string': 51}`; примеры строк: `['AIPROMPT', 'TEMPLATE']`
- **`REWARD_ADD_DATA.nftFlg`** — в 529 JSON; типы: `{'string': 529}`; примеры строк: `['N', 'Y']`
- **`REWARD_ADD_DATA.outstanding`** — в 529 JSON; типы: `{'string': 529}`; примеры строк: `['N', 'Y']`
- **`REWARD_ADD_DATA.parentRewardCode`** — в 529 JSON; типы: `{'string': 529}`; примеры строк: `['REWARD_01', 'REWARD_02', 'REWARD_03', 'REWARD_04', 'REWARD_05', 'REWARD_06', 'REWARD_07', 'REWARD_00_01', 'REWARD_00_02', 'REWARD_09_01', 'REWARD_09_03', 'REWARD_09_04', 'REWARD_10_03', 'REWARD_10_04', 'REWARD_11_01', 'REWARD_12_01', 'REWARD_13_01', 'REWARD_14_01', 'REWARD_15_01', 'REWARD_16_01', 'REWARD_17_01', 'REWARD_19_01', 'REWARD_20_03', 'REWARD_23_03', 'REWARD_23_04', 'REWARD_25_04', 'REWARD_26_04', 'REWARD_28_01', 'REWARD_28_03', 'REWARD_28_04', 'REWARD_29_03', 'REWARD_29_04', 'REWARD_30_03', 'REWARD_30_04', 'REWARD_31_01', 'REWARD_32_03', 'REWARD_32_04', 'REWARD_33_01', 'REWARD_33_04', 'REWARD_34_01', 'REWARD_34_03', 'REWARD_34_04', 'REWARD_35_04', 'REWARD_36_04', 'REWARD_37_04']`
- **`REWARD_ADD_DATA.preferences`** — в 9 JSON; типы: `{'array': 9}`; длина массива: min=1, max=1
- **`REWARD_ADD_DATA.preferences[]`** — в 9 JSON; типы: `{'string': 9}`; строки: **длинный текст** (макс. 127 симв.)
- **`REWARD_ADD_DATA.priority`** — в 529 JSON; типы: `{'string': 529}`; примеры строк: `['1', '2', '3']`
- **`REWARD_ADD_DATA.recommendationLevel`** — в 529 JSON; типы: `{'string': 529}`; примеры строк: `['TB', 'NON', 'BANK', 'GOSB']`
- **`REWARD_ADD_DATA.refreshOldNews`** — в 344 JSON; типы: `{'string': 344}`; примеры строк: `['N', 'Y']`
- **`REWARD_ADD_DATA.rewardAgainGlobal`** — в 529 JSON; типы: `{'string': 529}`; примеры строк: `['N', 'Y']`
- **`REWARD_ADD_DATA.rewardAgainTournament`** — в 529 JSON; типы: `{'string': 529}`; примеры строк: `['N']`
- **`REWARD_ADD_DATA.rewardRule`** — в 529 JSON; типы: `{'string': 529}`; строки: **длинный текст** (макс. 131 симв.)
- **`REWARD_ADD_DATA.seasonItem`** — в 45 JSON; типы: `{'array': 45}`; длина массива: min=1, max=1
- **`REWARD_ADD_DATA.seasonItem[]`** — в 45 JSON; типы: `{'string': 45}`; примеры строк: `['SEASON_2025_1', 'SEASON_2025_2', 'SEASON_2026_1', 'SEASON_f_2025', 'SEASON_f_2026', 'SEASON_s_2025', 'SEASON_m_2025_1', 'SEASON_m_2025_2', 'SEASON_m_2026_1', 'SEASON_imub_2025', 'SEASON_rnub_2025', 'SEASON_rsb1_2025', 'SEASON_kmsb1_2025']`
- **`REWARD_ADD_DATA.singleNews`** — в 529 JSON; типы: `{'string': 529}`; строки: **длинный текст** (макс. 340 симв.)
- **`REWARD_ADD_DATA.teamNews`** — в 529 JSON; типы: `{'string': 529}`; строки: **длинный текст** (макс. 285 симв.)
- **`REWARD_ADD_DATA.tournamentTeam`** — в 21 JSON; типы: `{'string': 21}`; примеры строк: `['Y']`
- **`REWARD_ADD_DATA.winCriterion`** — в 37 JSON; типы: `{'string': 37}`; строки: **длинный текст** (макс. 272 симв.)

#### Тип награды `ITEM` — дерево путей

- `REWARD_ADD_DATA`
  - `bookingRequired`
  - `businessBlock`
  - `businessBlock[]`
  - `commingSoon`
  - `deliveryRequired`
  - `feature`
  - `feature[]`
  - `fileName`
  - `getCondition`
    - `employeeRating`
      - `minCrystalEarnedTotal`
      - `minRatingBANK`
      - `minRatingGOSB`
      - `minRatingTB`
      - `seasonCode`
    - `nonRewards`
    - `nonRewards[]`
      - `nonRewardCode`
    - `rewards`
    - `rewards[]`
      - `amount`
      - `rewardCode`
  - `hidden`
  - `hiddenRewardList`
  - `ignoreConditions`
  - `isGrouping`
  - `isGroupingName`
  - `isGroupingTitle`
  - `isGroupingTultip`
  - `itemAmount`
  - `itemFeature`
  - `itemFeature[]`
  - `itemGroupAmount`
  - `itemGroupAmount[]`
    - `itemParam`
    - `itemParamAmount`
  - `itemLimitCount`
  - `itemLimitPeriod`
  - `itemMinShow`
  - `nftFlg`
  - `outstanding`
  - `persomanNumberVisible`
  - `refreshOldNews`
  - `rewardAgainGlobal`
  - `rewardAgainTournament`
  - `rewardRule`
  - `seasonItem`
  - `seasonItem[]`
  - `singleNews`
  - `teamNews`

##### Листья и узлы (типы и варианты) — `ITEM`

- **`REWARD_ADD_DATA`** — в 61 JSON; типы: `{'object': 61}`
- **`REWARD_ADD_DATA.bookingRequired`** — в 61 JSON; типы: `{'string': 61}`; примеры строк: `['Y']`
- **`REWARD_ADD_DATA.businessBlock`** — в 61 JSON; типы: `{'array': 61}`; длина массива: min=1, max=1
- **`REWARD_ADD_DATA.businessBlock[]`** — в 61 JSON; типы: `{'string': 61}`; примеры строк: `['MNS', 'KMKKSB']`
- **`REWARD_ADD_DATA.commingSoon`** — в 61 JSON; типы: `{'string': 61}`; примеры строк: `['N']`
- **`REWARD_ADD_DATA.deliveryRequired`** — в 61 JSON; типы: `{'string': 61}`; примеры строк: `['Y']`
- **`REWARD_ADD_DATA.feature`** — в 61 JSON; типы: `{'array': 61}`; длина массива: min=0, max=6
- **`REWARD_ADD_DATA.feature[]`** — в 57 JSON; типы: `{'string': 129}`; строки: **длинный текст** (макс. 133 симв.)
- **`REWARD_ADD_DATA.fileName`** — в 61 JSON; типы: `{'string': 61}`; примеры строк: `['']`
- **`REWARD_ADD_DATA.getCondition`** — в 61 JSON; типы: `{'object': 61}`
- **`REWARD_ADD_DATA.getCondition.employeeRating`** — в 59 JSON; типы: `{'object': 59}`
- **`REWARD_ADD_DATA.getCondition.employeeRating.minCrystalEarnedTotal`** — в 59 JSON; типы: `{'string': 59}`; примеры строк: `['', '3', '10']`
- **`REWARD_ADD_DATA.getCondition.employeeRating.minRatingBANK`** — в 59 JSON; типы: `{'string': 59}`; примеры строк: `['', '1', '3', '5', '10', '15', '25', '30', '35', '40', '50', '100']`
- **`REWARD_ADD_DATA.getCondition.employeeRating.minRatingGOSB`** — в 59 JSON; типы: `{'string': 59}`; примеры строк: `['', '1']`
- **`REWARD_ADD_DATA.getCondition.employeeRating.minRatingTB`** — в 59 JSON; типы: `{'string': 59}`; примеры строк: `['', '1', '2', '3', '5']`
- **`REWARD_ADD_DATA.getCondition.employeeRating.seasonCode`** — в 59 JSON; типы: `{'string': 59}`; примеры строк: `['SEASON_2024', 'SEASON_2025_1', 'SEASON_2025_2', 'SEASON_m_2024', 'SEASON_m_2025_1', 'SEASON_m_2025_2']`
- **`REWARD_ADD_DATA.getCondition.nonRewards`** — в 61 JSON; типы: `{'array': 61}`; длина массива: min=0, max=8
- **`REWARD_ADD_DATA.getCondition.nonRewards[]`** — в 37 JSON; типы: `{'object': 110}`
- **`REWARD_ADD_DATA.getCondition.nonRewards[].nonRewardCode`** — в 37 JSON; типы: `{'string': 110}`; примеры строк: `['ITEM_01', 'ITEM_02', 'ITEM_03', 'ITEM_04', 'ITEM_05', 'ITEM_06', 'ITEM_07', 'ITEM_08', 'ITEM_m_01', 'ITEM_m_02', 'ITEM_m_04', 'ITEM_m_05', 'ITEM_m_06', 'ITEM_m_07', 'ITEM_01_2025-1_01', 'ITEM_01_2025-1_02', 'ITEM_01_2025-1_03', 'ITEM_01_2025-1_06', 'ITEM_01_2025-1_07', 'ITEM_01_2025-1_08', 'ITEM_01_2025-1_10', 'ITEM_01_2025-2_01', 'ITEM_01_2025-2_03', 'ITEM_01_2025-2_08', 'ITEM_01_2025-2_14', 'ITEM_02_2025-1_01', 'ITEM_02_2025-1_03', 'ITEM_02_2025-1_07', 'ITEM_02_2025-1_08', 'ITEM_02_2025-1_14', 'ITEM_02_2025-2_01', 'ITEM_02_2025-2_02', 'ITEM_02_2025-2_03', 'ITEM_02_2025-2_07', 'ITEM_02_2025-2_08', 'ITEM_02_2025-2_09', 'ITEM_02_2025-2_10', 'ITEM_02_2025-2_11', 'ITEM_02_2025-2_12', 'ITEM_02_2025-2_14']`
- **`REWARD_ADD_DATA.getCondition.rewards`** — в 61 JSON; типы: `{'array': 61}`; длина массива: min=0, max=1
- **`REWARD_ADD_DATA.getCondition.rewards[]`** — в 7 JSON; типы: `{'object': 7}`
- **`REWARD_ADD_DATA.getCondition.rewards[].amount`** — в 7 JSON; типы: `{'string': 7}`; примеры строк: `['1']`
- **`REWARD_ADD_DATA.getCondition.rewards[].rewardCode`** — в 7 JSON; типы: `{'string': 7}`; примеры строк: `['REWARD_23_04', 'REWARD_31_01', 'REWARD_39_03', 'r_01_2025-2_03-5_1', 'r_02_2025-2_03-5_1', 'r_02_2025-2_07-11_3']`
- **`REWARD_ADD_DATA.hidden`** — в 61 JSON; типы: `{'string': 61}`; примеры строк: `['N', 'Y']`
- **`REWARD_ADD_DATA.hiddenRewardList`** — в 20 JSON; типы: `{'string': 20}`; примеры строк: `['N']`
- **`REWARD_ADD_DATA.ignoreConditions`** — в 61 JSON; типы: `{'array': 61}`; длина массива: min=0, max=0
- **`REWARD_ADD_DATA.isGrouping`** — в 61 JSON; типы: `{'string': 61}`; примеры строк: `['N', 'Y']`
- **`REWARD_ADD_DATA.isGroupingName`** — в 61 JSON; типы: `{'string': 61}`; примеры строк: `['обед', 'гаджет', 'SberShop', 'гемба ЦА', 'Благодарность', 'Стажировка ДГР', 'Стажировка ДРКБ', 'встреча лидеров', 'очная стажировка', 'Книга от Ситнова ВВ', 'Онлайн с Меламедом СВ', 'проектная деятельность', 'Благодарственное письмо', 'Стажировка Сберздоровье']`
- **`REWARD_ADD_DATA.isGroupingTitle`** — в 61 JSON; типы: `{'string': 61}`; примеры строк: `['', 'Месяц мероприятия']`
- **`REWARD_ADD_DATA.isGroupingTultip`** — в 61 JSON; типы: `{'string': 61}`; примеры строк: `['', 'Выберите месяц']`
- **`REWARD_ADD_DATA.itemAmount`** — в 61 JSON; типы: `{'string': 61}`; примеры строк: `['', '1', '2', '3', '4', '5', '7', '10', '11', '14', '15', '16', '20', '30', '40', '100', '103', '105', '110']`
- **`REWARD_ADD_DATA.itemFeature`** — в 60 JSON; типы: `{'array': 60}`; длина массива: min=0, max=6
- **`REWARD_ADD_DATA.itemFeature[]`** — в 56 JSON; типы: `{'string': 163}`; строки: **длинный текст** (макс. 233 симв.)
- **`REWARD_ADD_DATA.itemGroupAmount`** — в 61 JSON; типы: `{'array': 61}`; длина массива: min=0, max=7
- **`REWARD_ADD_DATA.itemGroupAmount[]`** — в 2 JSON; типы: `{'object': 11}`
- **`REWARD_ADD_DATA.itemGroupAmount[].itemParam`** — в 2 JSON; типы: `{'string': 11}`; примеры строк: `['Май', 'Июль', 'Июнь', 'Март', 'Август', 'Апрель', 'Ноябрь', 'Январь', 'Октябрь', 'Февраль', 'Сентябрь']`
- **`REWARD_ADD_DATA.itemGroupAmount[].itemParamAmount`** — в 2 JSON; типы: `{'string': 11}`; примеры строк: `['15']`
- **`REWARD_ADD_DATA.itemLimitCount`** — в 61 JSON; типы: `{'string': 61}`; примеры строк: `['1']`
- **`REWARD_ADD_DATA.itemLimitPeriod`** — в 61 JSON; типы: `{'string': 61}`; примеры строк: `['once']`
- **`REWARD_ADD_DATA.itemMinShow`** — в 61 JSON; типы: `{'string': 61}`; примеры строк: `['1', '2', '3', '4', '5', '10']`
- **`REWARD_ADD_DATA.nftFlg`** — в 61 JSON; типы: `{'string': 61}`; примеры строк: `['N']`
- **`REWARD_ADD_DATA.outstanding`** — в 61 JSON; типы: `{'string': 61}`; примеры строк: `['N']`
- **`REWARD_ADD_DATA.persomanNumberVisible`** — в 20 JSON; типы: `{'array': 20}`; длина массива: min=0, max=0
- **`REWARD_ADD_DATA.refreshOldNews`** — в 61 JSON; типы: `{'string': 61}`; примеры строк: `['N']`
- **`REWARD_ADD_DATA.rewardAgainGlobal`** — в 61 JSON; типы: `{'string': 61}`; примеры строк: `['N']`
- **`REWARD_ADD_DATA.rewardAgainTournament`** — в 61 JSON; типы: `{'string': 61}`; примеры строк: `['N']`
- **`REWARD_ADD_DATA.rewardRule`** — в 61 JSON; типы: `{'string': 61}`; строки: **длинный текст** (макс. 188 симв.)
- **`REWARD_ADD_DATA.seasonItem`** — в 61 JSON; типы: `{'array': 61}`; длина массива: min=0, max=1
- **`REWARD_ADD_DATA.seasonItem[]`** — в 59 JSON; типы: `{'string': 59}`; примеры строк: `['SEASON_2024', 'SEASON_2025_1', 'SEASON_2025_2', 'SEASON_m_2024', 'SEASON_m_2025_1', 'SEASON_m_2025_2']`
- **`REWARD_ADD_DATA.singleNews`** — в 61 JSON; типы: `{'string': 61}`; примеры строк: `['']`
- **`REWARD_ADD_DATA.teamNews`** — в 61 JSON; типы: `{'string': 61}`; примеры строк: `['']`

#### Тип награды `LABEL` — дерево путей

- `REWARD_ADD_DATA`
  - `feature`
  - `feature[]`
  - `fileName`
  - `hidden`
  - `nftFlg`
  - `outstanding`
  - `parentRewardCode`
  - `refreshOldNews`
  - `rewardAgainGlobal`
  - `rewardAgainTournament`
  - `rewardRule`
  - `singleNews`
  - `tagColor`
  - `tagEndDT`
  - `teamNews`

##### Листья и узлы (типы и варианты) — `LABEL`

- **`REWARD_ADD_DATA`** — в 6 JSON; типы: `{'object': 6}`
- **`REWARD_ADD_DATA.feature`** — в 6 JSON; типы: `{'array': 6}`; длина массива: min=0, max=1
- **`REWARD_ADD_DATA.feature[]`** — в 2 JSON; типы: `{'string': 2}`; примеры строк: `['Метка обновляется ежедневно и учитывает ваши активности за последние 2 недели.', 'Метка будет действовать до середины 2026 года с возможностью дальнейшего продления']`
- **`REWARD_ADD_DATA.fileName`** — в 6 JSON; типы: `{'string': 6}`; примеры строк: `['']`
- **`REWARD_ADD_DATA.hidden`** — в 6 JSON; типы: `{'string': 6}`; примеры строк: `['N']`
- **`REWARD_ADD_DATA.nftFlg`** — в 6 JSON; типы: `{'string': 6}`; примеры строк: `['N']`
- **`REWARD_ADD_DATA.outstanding`** — в 6 JSON; типы: `{'string': 6}`; примеры строк: `['N']`
- **`REWARD_ADD_DATA.parentRewardCode`** — в 6 JSON; типы: `{'string': 6}`; примеры строк: `['LABEL_01', 'LABEL_02', 'LABEL_03', 'LABEL_05', 'LABEL_06', 'LABEL_07']`
- **`REWARD_ADD_DATA.refreshOldNews`** — в 6 JSON; типы: `{'string': 6}`; примеры строк: `['N']`
- **`REWARD_ADD_DATA.rewardAgainGlobal`** — в 6 JSON; типы: `{'string': 6}`; примеры строк: `['N']`
- **`REWARD_ADD_DATA.rewardAgainTournament`** — в 6 JSON; типы: `{'string': 6}`; примеры строк: `['N']`
- **`REWARD_ADD_DATA.rewardRule`** — в 6 JSON; типы: `{'string': 6}`; примеры строк: `['']`
- **`REWARD_ADD_DATA.singleNews`** — в 6 JSON; типы: `{'string': 6}`; примеры строк: `['']`
- **`REWARD_ADD_DATA.tagColor`** — в 6 JSON; типы: `{'string': 6}`; примеры строк: `['pink-80', 'green-70', 'orange-80', 'purple-80', 'light-blue-80']`
- **`REWARD_ADD_DATA.tagEndDT`** — в 6 JSON; типы: `{'string': 6}`; примеры строк: `['2024-12-31', '2026-06-30', '4000-01-01']`
- **`REWARD_ADD_DATA.teamNews`** — в 6 JSON; типы: `{'string': 6}`; примеры строк: `['']`

#### Тип награды `CRYSTAL` — дерево путей

- `REWARD_ADD_DATA`
  - `feature`
  - `fileName`
  - `hidden`
  - `nftFlg`
  - `outstanding`
  - `rewardAgainGlobal`
  - `rewardAgainTournament`
  - `rewardRule`
  - `singleNews`
  - `teamNews`

##### Листья и узлы (типы и варианты) — `CRYSTAL`

- **`REWARD_ADD_DATA`** — в 2 JSON; типы: `{'object': 2}`
- **`REWARD_ADD_DATA.feature`** — в 2 JSON; типы: `{'array': 2}`; длина массива: min=0, max=0
- **`REWARD_ADD_DATA.fileName`** — в 2 JSON; типы: `{'string': 2}`; примеры строк: `['']`
- **`REWARD_ADD_DATA.hidden`** — в 2 JSON; типы: `{'string': 2}`; примеры строк: `['Y']`
- **`REWARD_ADD_DATA.nftFlg`** — в 2 JSON; типы: `{'string': 2}`; примеры строк: `['N']`
- **`REWARD_ADD_DATA.outstanding`** — в 2 JSON; типы: `{'string': 2}`; примеры строк: `['N']`
- **`REWARD_ADD_DATA.rewardAgainGlobal`** — в 2 JSON; типы: `{'string': 2}`; примеры строк: `['N']`
- **`REWARD_ADD_DATA.rewardAgainTournament`** — в 2 JSON; типы: `{'string': 2}`; примеры строк: `['N']`
- **`REWARD_ADD_DATA.rewardRule`** — в 2 JSON; типы: `{'string': 2}`; примеры строк: `['']`
- **`REWARD_ADD_DATA.singleNews`** — в 2 JSON; типы: `{'string': 2}`; примеры строк: `['']`
- **`REWARD_ADD_DATA.teamNews`** — в 2 JSON; типы: `{'string': 2}`; примеры строк: `['']`


### Пояснительный справочник полей JSON `REWARD_ADD_DATA`

_Смысловые трактовки — рабочие гипотезы по именам и выборке._


Документ описывает структуру и смысл полей объекта JSON, который хранится в CSV в колонке **`REWARD_ADD_DATA`** (файл выборки: `IN/SPOD/REWARD (PROM) 20-03 v0.csv`, 598 строк, разбор JSON после замены `"""` → `"` — без ошибок).

**Корень:** один JSON-объект (ниже пути указаны относительно этого объекта, без префикса `REWARD_ADD_DATA.`).

**Связь с `REWARD_TYPE`:** набор полей и их наполнение **зависят от типа награды**. Ниже для каждого поля указано, в каких типах оно встречается.

---


#### 1. Типы наград и охват данных

| REWARD_TYPE | Строк в выборке | Примечание |
|-------------|-----------------|------------|
| **BADGE**   | 529             | Значки, турниры, новости, приоритеты |
| **ITEM**    | 61              | Предметы, условия выдачи, группировки |
| **LABEL**   | 6               | Метки, цвет, дата окончания |
| **CRYSTAL** | 2               | Минимальный набор полей |

Число **уникальных путей** в данных по типу: ITEM — 51, BADGE — 29, LABEL — 16, CRYSTAL — 11.

---

#### 2. Матрица: поле ↔ REWARD_TYPE

Легенда: **+** — поле присутствует во всех строках этого типа в выборке; **±** — только в части строк; **—** — нет в данных этого типа.

| Поле (ключ верхнего уровня) | BADGE | ITEM | LABEL | CRYSTAL |
|----------------------------|:-----:|:----:|:-----:|:-------:|
| `bookingRequired`          | —     | +    | —     | —       |
| `businessBlock`            | +     | +    | —     | —       |
| `commingSoon`              | —     | +    | —     | —       |
| `deliveryRequired`         | —     | +    | —     | —       |
| `feature`                  | +     | +    | +     | +       |
| `fileName`                 | +     | +    | +     | +       |
| `getCondition`             | —     | +    | —     | —       |
| `hidden`                   | +     | +    | +     | +       |
| `hiddenRewardList`         | ±     | ±    | —     | —       |
| `ignoreConditions`         | —     | +    | —     | —       |
| `isGrouping`               | —     | +    | —     | —       |
| `isGroupingName`           | —     | +    | —     | —       |
| `isGroupingTitle`          | —     | +    | —     | —       |
| `isGroupingTultip`         | —     | +    | —     | —       |
| `itemAmount`               | —     | +    | —     | —       |
| `itemFeature`              | —     | ±    | —     | —       |
| `itemGroupAmount`          | —     | +    | —     | —       |
| `itemLimitCount`           | —     | +    | —     | —       |
| `itemLimitPeriod`          | —     | +    | —     | —       |
| `itemMinShow`              | —     | +    | —     | —       |
| `helpCodeList`             | ±     | —    | —     | —       |
| `masterBadge`              | +     | —    | —     | —       |
| `newsType`                 | ±     | —    | —     | —       |
| `nftFlg`                   | +     | +    | +     | +       |
| `outstanding`              | +     | +    | +     | +       |
| `parentRewardCode`         | +     | —    | +     | —       |
| `persomanNumberVisible`    | —     | ±    | —     | —       |
| `preferences`              | ±     | —    | —     | —       |
| `priority`                 | +     | —    | —     | —       |
| `recommendationLevel`      | +     | —    | —     | —       |
| `refreshOldNews`           | ±     | +    | +     | —       |
| `rewardAgainGlobal`        | +     | +    | +     | +       |
| `rewardAgainTournament`    | +     | +    | +     | +       |
| `rewardRule`               | +     | +    | +     | +       |
| `seasonItem`               | ±     | ±    | —     | —       |
| `singleNews`               | +     | +    | +     | +       |
| `tagColor`                 | —     | —    | +     | —       |
| `tagEndDT`                 | —     | —    | +     | —       |
| `teamNews`                 | +     | +    | +     | +       |
| `tournamentTeam`           | ±     | —    | —     | —       |
| `winCriterion`             | ±     | —    | —     | —       |

---

#### 3. Дерево полей (объединённое)

Отражает все ключи, встречавшиеся в выборке по любому `REWARD_TYPE`.

```
├── bookingRequired          [ITEM]
├── businessBlock[]          [BADGE, ITEM]
├── commingSoon              [ITEM]
├── deliveryRequired         [ITEM]
├── feature[]                [BADGE, ITEM, LABEL, CRYSTAL]
├── fileName                 [все]
├── getCondition             [ITEM]
│   ├── employeeRating
│   │   ├── minCrystalEarnedTotal
│   │   ├── minRatingBANK
│   │   ├── minRatingGOSB
│   │   ├── minRatingTB
│   │   └── seasonCode
│   ├── nonRewards[]
│   │   └── nonRewardCode
│   └── rewards[]
│       ├── amount
│       └── rewardCode
├── hidden                   [все]
├── hiddenRewardList         [BADGE, ITEM]
├── ignoreConditions[]       [ITEM]
├── isGrouping               [ITEM]
├── isGroupingName           [ITEM]
├── isGroupingTitle          [ITEM]
├── isGroupingTultip         [ITEM]
├── itemAmount               [ITEM]
├── itemFeature[]            [ITEM]
├── itemGroupAmount[]
│   ├── itemParam            [ITEM]
│   └── itemParamAmount      [ITEM]
├── itemLimitCount           [ITEM]
├── itemLimitPeriod          [ITEM]
├── itemMinShow              [ITEM]
├── helpCodeList[]           [BADGE]
├── masterBadge              [BADGE]
├── newsType                 [BADGE]
├── nftFlg                   [все]
├── outstanding              [все]
├── parentRewardCode         [BADGE, LABEL]
├── persomanNumberVisible[]  [ITEM]
├── preferences[]            [BADGE]
├── priority                 [BADGE]
├── recommendationLevel      [BADGE]
├── refreshOldNews           [BADGE, ITEM, LABEL]
├── rewardAgainGlobal        [все]
├── rewardAgainTournament    [все]
├── rewardRule               [все]
├── seasonItem[]             [BADGE, ITEM]
├── singleNews               [все]
├── tagColor                 [LABEL]
├── tagEndDT                 [LABEL]
├── teamNews                 [все]
├── tournamentTeam           [BADGE]
└── winCriterion             [BADGE]
```

---

#### 4. Справочник полей по алфавиту

Формат записи: **назначение (гипотеза по имени и данным)**, тип, типы наград, домен значений, частота/особенности в выборке.

##### `bookingRequired`

- **Тип:** строка (флаг).
- **REWARD_TYPE:** только ITEM; во всех 61 строке — **`Y`**.
- **Смысл (гипотеза):** требуется бронирование для получения предмета.

##### `businessBlock`

- **Тип:** массив строк (коды блока/подразделения).
- **REWARD_TYPE:** BADGE, ITEM.
- **Размер массива в выборке:** всегда ровно один элемент.
- **Значения элемента:**  
  - BADGE: `MNS`, `IMUB`, `RNUB`, `RSB1`, `KMSB1`, `KMKKSB`, `SERVICEMEN`, `KMFACTORING`;  
  - ITEM: `MNS`, `KMKKSB`.

##### `commingSoon`

- **Тип:** строка (опечатка в имени поля: ожидаемо *comingSoon*).
- **REWARD_TYPE:** ITEM; везде **`N`**.

##### `deliveryRequired`

- **Тип:** строка (флаг).
- **REWARD_TYPE:** ITEM; везде **`Y`**.

##### `feature`

- **Тип:** массив строк.
- **REWARD_TYPE:** все типы.
- **Длина:** BADGE 0–5 элементов; ITEM 0–6; LABEL 0–1; CRYSTAL в выборке всегда пустой массив.
- **Элементы:** в BADGE/ITEM — в основном **длинные текстовые описания** (подсказки/условия); в LABEL — короткие фразы про метку; в CRYSTAL — нет заполненных элементов в выборке.

##### `fileName`

- **Тип:** строка (идентификатор файла/кампании/турнира).
- **REWARD_TYPE:** все.
- **Домен:**  
  - BADGE — много кодов (`GURU`, `VASCODAGAMA`, турниры, комиссии и т.д.) и пустая строка;  
  - ITEM, LABEL, CRYSTAL — в выборке преимущественно **`""`**.

##### `hidden`

- **Тип:** строка-флаг **`Y` / `N`**.
- **REWARD_TYPE:** все.
- **Смысл (гипотеза):** скрытая награда в интерфейсе.

##### `hiddenRewardList`

- **Тип:** строка **`Y` / `N`** (не массив, несмотря на имя).
- **REWARD_TYPE:** BADGE (часть строк), ITEM (часть строк).
- **Смысл (гипотеза):** участие в списке скрытых наград.

##### `helpCodeList`

- **Тип:** массив строк.
- **REWARD_TYPE:** только BADGE; в 30 из 529 строках; длина 1–2.
- **Значения элементов:** **`AST_1`**, **`NFT_1`**.

##### `ignoreConditions`

- **Тип:** массив (в выборке всегда пустой).
- **REWARD_TYPE:** ITEM.

##### `isGrouping` / `isGroupingName` / `isGroupingTitle` / `isGroupingTultip`

- **Тип:** строки.
- **REWARD_TYPE:** только ITEM.
- **`isGrouping`:** **`Y` / `N`**.
- **`isGroupingName`:** человекочитаемое название группы (обед, гаджет, SberShop, стажировки и т.д.).
- **`isGroupingTitle` / `isGroupingTultip`:** заголовок и текст подсказки; часто **`""`**; в данных имя **`isGroupingTultip`** вероятно означает *tooltip* (опечатка).

##### `itemAmount`

- **Тип:** строка с числом (количество).
- **REWARD_TYPE:** ITEM.
- **Примеры значений:** пусто, `1`, `2`, … до `110` и др.

##### `itemFeature`

- **Тип:** массив строк.
- **REWARD_TYPE:** ITEM (60 из 61); элементы — **длинный текст** (описания признаков предмета).

##### `itemGroupAmount`

- **Тип:** массив объектов `{ itemParam, itemParamAmount }`.
- **REWARD_TYPE:** ITEM; вложенные объекты редки (2 строки с непустым наполнением).
- **`itemParam`:** название месяца (январь–декабрь).
- **`itemParamAmount`:** в выборке везде **`15`** (в целом ожидается строка с числом в диапазоне, задаваемом продуктом; в панели администрирования для ввода используется сверка со списком **0…100**).

**Редактор Admin UI (версия приложения 0.2.47):** массив **`itemGroupAmount`** в колонке **`REWARD_ADD_DATA`** редактируется как **«массив объектов»** (**`json_object_array`** + **`object_array_item_keys`** в **`config.json`** → **`editor_textareas`**). Для каждого элемента массива отображаются поля **`itemParam`** (выпадающий список: значения из **`field_enums`**, в конфиге — статический перечень месяцев) и **`itemParamAmount`** (текстовое поле с подсветкой по **`whitelist_validated_input`** — допустимые строки **0**, **1**, …, **100**). Подсказки **`label` / `description`** в **`editor_field_ui`** привязаны к путям **без индекса элемента**: `["itemGroupAmount", "itemParam"]`, `["itemGroupAmount", "itemParamAmount"]` (клиент **`row_editor.js`** сопоставляет их с фактическим JSON-путём вида `itemGroupAmount → <индекс> → ключ`). Подробнее: **`README.md`**, раздел **4.5**.

##### `itemLimitCount`

- **Тип:** строка.
- **REWARD_TYPE:** ITEM; в выборке везде **`1`**.

##### `itemLimitPeriod`

- **Тип:** строка.
- **REWARD_TYPE:** ITEM; в выборке везде **`once`**.

##### `itemMinShow`

- **Тип:** строка (число).
- **REWARD_TYPE:** ITEM.
- **Значения:** `1`, `2`, `3`, `4`, `5`, `10`.

##### `masterBadge`

- **Тип:** строка **`Y` / `N`**.
- **REWARD_TYPE:** BADGE; во всех строках типа.

##### `newsType`

- **Тип:** строка.
- **REWARD_TYPE:** BADGE; не во всех строках.
- **Значения в выборке:** **`AIPROMPT`**, **`TEMPLATE`**.

##### `nftFlg`

- **Тип:** строка **`Y` / `N`**.
- **REWARD_TYPE:** все; у ITEM в выборке только **`N`**.

##### `outstanding`

- **Тип:** строка **`Y` / `N`**.
- **REWARD_TYPE:** все; у ITEM/LABEL/CRYSTAL в выборке **`N`**.

##### `parentRewardCode`

- **Тип:** строка (код родительской награды).
- **REWARD_TYPE:** BADGE (`REWARD_*`), LABEL (`LABEL_*`).

##### `persomanNumberVisible`

- **Тип:** массив (в выборке пустой, 20 строк ITEM).
- **Смысл по имени:** видимость «персонального номера» (возможно, *person* / *persona*).

##### `preferences`

- **Тип:** массив строк.
- **REWARD_TYPE:** BADGE; редко (9 строк); элементы — **длинный текст** (до ~127 символов).

##### `priority`

- **Тип:** строка.
- **REWARD_TYPE:** BADGE.
- **Значения:** **`1`**, **`2`**, **`3`**.

##### `recommendationLevel`

- **Тип:** строка (уровень/канал рекомендаций).
- **REWARD_TYPE:** BADGE.
- **Значения:** **`TB`**, **`NON`**, **`BANK`**, **`GOSB`**.

##### `refreshOldNews`

- **Тип:** строка **`Y` / `N`**.
- **REWARD_TYPE:** BADGE (не во всех), ITEM, LABEL; у CRYSTAL поля нет в данных.

##### `rewardAgainGlobal` / `rewardAgainTournament`

- **Тип:** строка **`Y` / `N`** (в выборке у многих типов только **`N`**).
- **REWARD_TYPE:** все, где поле есть.

##### `rewardRule`

- **Тип:** строка.
- **REWARD_TYPE:** все.
- **Домен:** **длинный текст** (правила/условия); у LABEL/CRYSTAL часто пусто.

##### `seasonItem`

- **Тип:** массив строк (коды сезона).
- **REWARD_TYPE:** BADGE (45 строк с непустым), ITEM (59 из 61 с элементом).
- **Примеры:** `SEASON_2025_1`, `SEASON_m_2025_1`, `SEASON_f_2025`, коды по блокам (`SEASON_imub_2025` и т.д.).

##### `singleNews` / `teamNews`

- **Тип:** строка.
- **REWARD_TYPE:** все.
- **Домен:** у BADGE — **длинный текст** (новости); у ITEM/LABEL/CRYSTAL в выборке часто **`""`**.

##### `tagColor`

- **Тип:** строка (дизайн-токен цвета).
- **REWARD_TYPE:** LABEL.
- **Значения:** `pink-80`, `green-70`, `orange-80`, `purple-80`, `light-blue-80`.

##### `tagEndDT`

- **Тип:** строка (дата окончания действия метки, формат даты).
- **REWARD_TYPE:** LABEL.
- **Значения:** `2024-12-31`, `2026-06-30`, `4000-01-01` (условная «бесконечность»).

##### `tournamentTeam`

- **Тип:** строка.
- **REWARD_TYPE:** BADGE; 21 строка; в выборке только **`Y`**.

##### `winCriterion`

- **Тип:** строка.
- **REWARD_TYPE:** BADGE; 37 строк.
- **Домен:** **длинный текст** (критерий победы в турнире).

---

#### 5. Блок `getCondition` (только ITEM)

Объект задаёт условия получения предмета.

| Подполе | Тип | Описание и домен (по выборке) |
|---------|-----|-------------------------------|
| `employeeRating` | объект | Есть в 59 из 61 строк; вложенные пороги рейтинга и сезон. |
| `employeeRating.minCrystalEarnedTotal` | строка | Число как строка или `""`; примеры: `3`, `10`. |
| `employeeRating.minRatingBANK` | строка | `""`, `1`, `3`, … до `100`. |
| `employeeRating.minRatingGOSB` | строка | `""`, `1`. |
| `employeeRating.minRatingTB` | строка | `""`, `1`, `2`, `3`, `5`. |
| `employeeRating.seasonCode` | строка | Код сезона: `SEASON_2024`, `SEASON_2025_1`, `SEASON_m_*` и т.д. |
| `nonRewards` | массив объектов | 0–8 элементов; объект: `{ "nonRewardCode": "..." }`. |
| `nonRewards[].nonRewardCode` | строка | Коды вида `ITEM_*`, `ITEM_m_*`, составные коды с сезонами. |
| `rewards` | массив объектов | 0–1 объект в выборке. |
| `rewards[].amount` | строка | В выборке **`1`**. |
| `rewards[].rewardCode` | строка | Код награды, например `REWARD_23_04` или `r_01_2025-2_03-5_1`.  ПКАП |

**Редактор Admin UI:** массивы **`nonRewards`** и **`rewards`** в карточке **REWARD** для **`REWARD_ADD_DATA`** оформлены как **массивы объектов** (см. **`README.md`**, §**4.5**): элемент **`nonRewards`** — объект **`{ "nonRewardCode": "…" }`** (коды ITEM из выборки **`options_from_sheet`**), элемент **`rewards`** — **`rewardCode`** (BADGE и др. из БД, с **`label_template`** в списке) и **`amount`** (**`1`**, **`2`**, **`3`**). В **`editor_field_ui`** используются пути без числового индекса: `["getCondition", "nonRewards", "nonRewardCode"]`, `["getCondition", "rewards", "rewardCode"]`, `["getCondition", "rewards", "amount"]`.

---

#### 6. Версия документа

| Версия | Дата | Изменения |
|--------|------|-----------|
| 1.0 | 2026-01-31 | Первичная выгрузка справочника по полям на основе анализа файла `REWARD (PROM) 20-03 v0.csv` (598 строк). Описания «смысла» полей — рабочие гипотезы по именам и значениям, не официальная ТЗ СПОД. |
| 1.1 | 2026-04-18 | Дополнено описание блоков **`getCondition`** (массивы **`nonRewards`** / **`rewards`**) и **`itemGroupAmount`**: как поля отображаются в Admin UI (**`json_object_array`**, **`field_enums`**, **`whitelist_validated_input`**, канонические **`paths`** в **`editor_field_ui`**). Согласовано с релизом приложения **0.2.47** (**`README.md`**, §**8**). |
| 1.2 | 2026-04-20 | Обновлён сводный реестр полей по `17-04 v0`: выполнены дедупликация JSON-путей, нормализация вариантов `value`, отдельный разбор `INDICATOR_FILTER` (включая `filtered_attribute_dt` и `filtered_attribute_value`), а также синхронизация итогов по файлам `SPOD_FIELD_REGISTRY.csv` / `SPOD_FIELD_REGISTRY.xlsx` / `SPOD_FIELDS_ONLY_IN_CSV.csv`. |
| 1.3 | 2026-04-21 | Уточнена логика каскадной валидации `INDICATOR_FILTER` в Admin UI: зависимость от `INDICATOR_CODE`, ограничение `filtered_attribute_code` и пары `type/match`, whitelist для `filtered_attribute_condition`, а также применение `min/max` к `filtered_attribute_dt` и `filtered_attribute_value`. |
| 1.4 | 2026-04-21 | Детализирован UX `INDICATOR_FILTER`: подтверждено происхождение списков `condition_options` из `dm_gamification_filteredattribute_dic.xlsx`, добавлены правила отображения datalist для whitelist-полей, datepicker для `filtered_attribute_dt` и фиксация типозависимого ключа в итоговом JSON (`condition` / `value` / `dt`). |

<a id="contest-prom-23-03-v3"></a>

## Файл: `CONTEST (PROM) 23-03 v3.csv`

- **Путь:** `IN/SPOD/CONTEST (PROM) 23-03 v3.csv`
- **Строк данных:** 338 (без учёта заголовка)
- **Разделитель:** `;`, кодировка UTF-8
- **Колонок:** 25

### Краткое назначение колонок

| Колонка | Назначение |
|---------|------------|
| `CONTEST_CODE` | Уникальный код конкурса; ключ связи с `GROUP`, `INDICATOR`, `SCHEDULE`, `REWARD-LINK`, `REPORT`.  ПКАП |
| `FULL_NAME` | Наименование конкурса для UI. |
| `CREATE_DT` | Дата создания конкурса. |
| `CLOSE_DT` | Дата завершения конкурса (`4000-01-01` часто используется как «без ограничения»). |
| `BUSINESS_STATUS` | Бизнес-статус конкурса (например `АКТИВНЫЙ`/`АРХИВНЫЙ`).  ПКАП |
| `CONTEST_TYPE` | Тип конкурса; влияет на структуру `CONTEST_FEATURE`.  ПКАП |
| `CONTEST_DESCRIPTION` | Текстовое описание условий конкурса.  ПКАП |
| `CONTEST_FEATURE` | JSON с параметрами отображения, рассылок, фильтров и выдачи наград.  ПКАП |
| `SHOW_INDICATOR` | Подпись/единица отображения целевого показателя.  ПКАП |
| `PRODUCT_GROUP` | Бизнес-направление (продуктовая группа).  ПКАП |
| `PRODUCT` | Продукт или тематика конкурса.  ПКАП |
| `CONTEST_SUBJECT` | Субъект расчёта конкурса (обычно сотрудник/подразделение).  ПКАП |
| `FACTOR_MARK_TYPE` | Тип оценки показателя (например рейтинг/критерий).  ПКАП |
| `CONTEST_INDICATOR_METHOD` | Метод расчёта индикатора: `INTEGRAL` (взвешенная сумма), `RELATION` (отношение сумм).  ПКАП |
| `CONTEST_FACTOR_METHOD` | Метод итогового факта: `FACT`, `FACT0-FACT1`, `RUN_RATE`, `RUN_RATE-FACT1`, `FACT0-RUN_RATE1_DOWN`, `RUN_RATE/FACT1`, `FACT0/RUN_RATE1_DOWN`.  ПКАП |
| `PLAN_METHOD_CODE` | Метод расчёта плана: `NOT_USED` (план не задан), `PRESET_VALUE`, `DEPENDS_PREVIOUS_PERIOD`.  ПКАП |
| `PLAN_MOD_METOD` | Операция модификации плана: `MULTIPLIER` (умножить), `APPEND` (добавить), либо пусто.  ПКАП |
| `PLAN_MOD_VALUE` | Числовое значение модификатора плана.  ПКАП |
| `FACTOR_MATCH` | Оператор сравнения для определения результата (`=`, `>`, `>=` и др.).  ПКАП |
| `CONTEST_PERIOD` | Правила периодов/критериев конкурса (часто JSON-массив). |
| `TARGET_TYPE` | Вид цели расчёта (в выгрузках встречаются `ПРОМ`/`ТЕСТ`).  ПКАП |
| `SOURCE_UPD_FREQUENCY` | Периодичность обновления данных источника (в днях).  ПКАП |
| `CALC_TYPE` | Тип расчёта (промышленный/ручной, кодовое значение).  ПКАП |
| `BUSINESS_BLOCK` | Бизнес-блок(и) конкурса.  ПКАП |
| `FACT_POST_PROCESSING` | Постобработка факта: `PERCENTILE`, `PERCENTILE_DOWN`, `PERCENTILE_UPEST`, `PERCENTILE_UP`, `SPECIAL_INDICATOR_1`, `COUNT_BIGGER`, либо пусто.  ПКАП |

### Плоские колонки (статистика значений)

| Колонка | Тип (оценка) | Непустых | Уникальных* | Варианты / комментарий |
|---------|--------------|----------|-------------|-------------------------|
| `CONTEST_CODE` | строка | 338/338 | 338 | **высокая кардинальность** (338 уник.); примеры: `['CONTEST_00', 'CONTEST_01', 'CONTEST_02', 'CONTEST_03', 'CONTEST_04', 'CONTEST_05', 'CONTEST_06', 'CONTEST_07', 'CONTEST_11', 'CONTEST_12', 'CONTEST_13', 'CONTEST_14', 'CONTEST_15', 'CONTEST_16', 'CONTEST_17']`  ПКАП |
| `FULL_NAME` | строка | 338/338 | 226 | **высокая кардинальность** (226 уник.); примеры: `['Гемба', 'товары', 'Кристаллы', 'на сегодня', '5 инициатив', 'CSI на 100%', 'SLA на 100%', 'Я-Наставник', '1 инициатива', '3 инициативы', 'AI-community', 'Лотос у моря', 'Загадка Алтая', 'Карта влияния', 'Ралли брокера']` |
| `CREATE_DT` | строка | 338/338 | 4 | `['2023-01-01', '2023-07-01', '2025-01-01', '2026-01-01']` |
| `CLOSE_DT` | строка | 338/338 | 4 | `['2025-06-30', '2025-12-31', '2026-12-31', '4000-01-01']` |
| `BUSINESS_STATUS` | строка | 338/338 | 2 | `['АКТИВНЫЙ', 'АРХИВНЫЙ']`  ПКАП |
| `CONTEST_TYPE` | строка | 338/338 | 3 | `['ТУРНИРНЫЙ', 'ИНДИВИДУАЛЬНЫЙ', 'ИНДИВИДУАЛЬНЫЙ НАКОПИТЕЛЬНЫЙ']`  ПКАП |
| `CONTEST_DESCRIPTION` | строка | 338/338 | 184 | **длинный текст**, до 1298 симв.; примеры (обрезка): `['описание', 'Описание турнира', 'Конкурс по ФОТ', 'Сезон 2025 год. Турниры', 'сделай сделки с 1 клиентом', 'сделай сделки с 3 клиентами', 'сделай сделки с 10 клиентами', 'Чтобы стать участником, получи в текущем месяце комиссию по банковским гарантиям больше, чем в предыдущем. \\\\nПо итогам месяца в каждом ГОСБ менеджеры с ТОП-1 п…']`; всего **184** уникальных  ПКАП |
| `CONTEST_FEATURE` | строка | 338/338 | 155 | **длинный текст**, до 1343 симв.; примеры (обрезка): `['{"""feature""": [], """vid""": """ПРОМ""", """momentRewarding""": """DURIN""", """minNumber""": 1, """capacity""": """""", """accuracy""": 0, """masking""": """…', '{"""feature""": [], """vid""": """ПРОМ""", """momentRewarding""": """AFTER""", """minNumber""": 1, """capacity""": """""", """accuracy""": 0, """masking""": """…', '{"""feature""": [], """vid""": """ПРОМ""", """momentRewarding""": """DURIN""", """minNumber""": 1, """capacity""": """""", """accuracy""": 0, """masking""": """…', '{"""feature""": [], """vid""": """ПРОМ""", """momentRewarding""": """DURIN""", """minNumber""": 1, """capacity""": """THOUSANDS""", """accuracy""": 0, """maskin…', '{"""feature""": [], """vid""": """ТЕСТ""", """momentRewarding""": """AFTER""", """minNumber""": 1, """capacity""": """""", """accuracy""": 2, """masking""": """…', '{"""feature""": ["""Обновление информации происходит раз в неделю"""], """vid""": """ПРОМ""", """momentRewarding""": """DURIN""", """minNumber""": 1, """capacit…', '{"""feature""": [], """vid""": """ПРОМ""", """momentRewarding""": """DURIN""", """minNumber""": 1, """capacity""": """""", """accuracy""": 2, """masking""": """…', '{"""feature""": [], """vid""": """ТЕСТ""", """momentRewarding""": """AFTER""", """minNumber""": 1, """capacity""": """""", """accuracy""": 1, """masking""": """…']`; всего **155** уникальных  ПКАП |
| `SHOW_INDICATOR` | строка | 338/338 | 31 | `['%', '%%', 'пт.', 'шт.', 'Факт', 'балл', 'Темп %', 'Ранг %%', 'ФЛ, шт.', 'клиенты', 'Ср. балл', 'млн руб.', 'К-во, шт.', 'категория', 'тыс. руб.', 'Анкет, шт.', 'Сумма, руб.', 'Пакеты услуг', 'Договора, шт.', 'Сумма УС, шт.', 'Процент (х100)', 'Факт, млн руб.', 'Сумма, млн руб.', 'сборы, млн руб.', 'Сумма, тыс. руб.', 'Интегральный ранг', 'Прирост, млн руб.', 'Прирост, тыс. руб.', 'Комиссия, тыс. руб.', 'Прирост ОСЗ, млн руб.', 'нетто-притоки, млн руб.']`  ПКАП |
| `PRODUCT_GROUP` | строка | 338/338 | 20 | `['ЕФС', 'ФОТ', 'DTaaS', 'ТФиДО', 'Лизинг', 'Команда', 'Кредиты', 'Гарантии', 'Системные', 'Статусные', 'Факторинг', 'Эквайринг', 'Экосистема', 'Страхование', 'Пассивы, РКО', 'Спец проекты', 'Эффективность', 'ВЭД, нац рынки, хедж', 'ДГР кредитные продукты', 'Продукты УБ в канале СБ1']`  ПКАП |
| `PRODUCT` | строка | 338/338 | 65 | **высокая кардинальность** (65 уник.); примеры: `['HR', 'IT', 'COM', 'CSI', 'ESG', 'SLA', 'ДМС', 'ЛПП', 'СМР', 'СФН', 'УКП', 'ФОТ', 'ЦКП', 'RAIT', 'Лига']`  ПКАП |
| `CONTEST_SUBJECT` | строка | 338/338 | 1 | `['EMPLOYEE']`  ПКАП |
| `FACTOR_MARK_TYPE` | строка | 338/338 | 3 | `['CRITERION', 'RATING_MAX', 'RATING_MIN']`  ПКАП |
| `CONTEST_INDICATOR_METHOD` | строка | 338/338 | 2 | выгрузка: `['INTEGRAL', 'RELATION']`; в `config.json` те же 2 значения (с короткими label).  ПКАП |
| `CONTEST_FACTOR_METHOD` | строка | 338/338 | 4 | выгрузка: `['FACT', 'RUN_RATE', 'FACT0-FACT1', 'FACT0-RUN_RATE1_DOWN']`; в `config.json` расширено до 7 методов из справочника.  ПКАП |
| `PLAN_METHOD_CODE` | строка | 338/338 | 2 | выгрузка: `['PRESET_VALUE', 'DEPENDS_PREVIOUS_PERIOD']`; в `config.json` дополнительно есть `NOT_USED`.  ПКАП |
| `PLAN_MOD_METOD` | строка | 3/338 | 1 | выгрузка: `['MULTIPLIER']`; в `config.json` доступны `MULTIPLIER`, `APPEND` и пусто.  ПКАП |
| `PLAN_MOD_VALUE` | целое (строкой в CSV) | 338/338 | 24 | `['0', '1', '2', '3', '4', '5', '10', '50', '100', '50000', '100000', '250000', '300000', '500000', '1000000', '2000000', '3000000', '5000000', '7000000', '10000000', '12000000', '15000000', '500000000', '1000000000']`  ПКАП |
| `FACTOR_MATCH` | строка | 338/338 | 3 | `['=', '>', '>=']`  ПКАП |
| `CONTEST_PERIOD` | строка | 312/338 | 3 | `['[]', '[{"period_code""": -1, """criterion_mark_type""": """>""", """criterion_mark_value""": 0}]"', '[{"period_code""": 0, """criterion_mark_type""": """>""", """criterion_mark_value""": 0}, {"""period_code""": 1, """criterion_mark_type""": """>""", """criterion_mark_value""": 0}]"']` |
| `TARGET_TYPE` | строка | 338/338 | 2 | `['ПРОМ', 'ТЕСТ']`  ПКАП |
| `SOURCE_UPD_FREQUENCY` | целое (строкой в CSV) | 338/338 | 3 | `['1', '7', '10']`  ПКАП |
| `CALC_TYPE` | целое (строкой в CSV) | 338/338 | 2 | `['0', '1']`  ПКАП |
| `BUSINESS_BLOCK` | строка | 338/338 | 9 | `['[]', '["""MNS"""]', '["""IMUB"""]', '["""RNUB"""]', '["""RSB1"""]', '["""KMSB1"""]', '["""KMKKSB"""]', '["""SERVICEMEN"""]', '["""KMFACTORING"""]']`  ПКАП |
| `FACT_POST_PROCESSING` | строка | 10/338 | 3 | выгрузка: `['PERCENTILE', 'PERCENTILE_UP', 'SPECIAL_INDICATOR_1']`; в `config.json` полный набор из 6 методов + пусто.  ПКАП |

\* Уникальных по непустым значениям; для длинных текстов перечисление ограничено.

### JSON: колонка `CONTEST_FEATURE`

Предобработка: тройные кавычки в CSV → обычные `"`, затем `json.loads`. Пути с префиксом `CONTEST_FEATURE`.

#### Сводка по `CONTEST_TYPE`

| CONTEST_TYPE | строк | JSON распарсено |
|--------------|-------|-----------------|
| ТУРНИРНЫЙ | 178 | 178 |
| ИНДИВИДУАЛЬНЫЙ НАКОПИТЕЛЬНЫЙ | 98 | 98 |
| ИНДИВИДУАЛЬНЫЙ | 62 | 62 |

#### Ключи JSON, встречающиеся не во всех типах конкурса

- `CONTEST_FEATURE.avatarShow`: есть в ['ТУРНИРНЫЙ']; **нет** в ['ИНДИВИДУАЛЬНЫЙ', 'ИНДИВИДУАЛЬНЫЙ НАКОПИТЕЛЬНЫЙ']
- `CONTEST_FEATURE.feature[]`: есть в ['ИНДИВИДУАЛЬНЫЙ НАКОПИТЕЛЬНЫЙ', 'ТУРНИРНЫЙ']; **нет** в ['ИНДИВИДУАЛЬНЫЙ']
- `CONTEST_FEATURE.helpCodeList`: есть в ['ТУРНИРНЫЙ']; **нет** в ['ИНДИВИДУАЛЬНЫЙ', 'ИНДИВИДУАЛЬНЫЙ НАКОПИТЕЛЬНЫЙ']
- `CONTEST_FEATURE.helpCodeList[]`: есть в ['ТУРНИРНЫЙ']; **нет** в ['ИНДИВИДУАЛЬНЫЙ', 'ИНДИВИДУАЛЬНЫЙ НАКОПИТЕЛЬНЫЙ']
- `CONTEST_FEATURE.preferences`: есть в ['ТУРНИРНЫЙ']; **нет** в ['ИНДИВИДУАЛЬНЫЙ', 'ИНДИВИДУАЛЬНЫЙ НАКОПИТЕЛЬНЫЙ']
- `CONTEST_FEATURE.preferences[]`: есть в ['ТУРНИРНЫЙ']; **нет** в ['ИНДИВИДУАЛЬНЫЙ', 'ИНДИВИДУАЛЬНЫЙ НАКОПИТЕЛЬНЫЙ']
- `CONTEST_FEATURE.tbVisible[]`: есть в ['ТУРНИРНЫЙ']; **нет** в ['ИНДИВИДУАЛЬНЫЙ', 'ИНДИВИДУАЛЬНЫЙ НАКОПИТЕЛЬНЫЙ']
- `CONTEST_FEATURE.tournamentTeam`: есть в ['ТУРНИРНЫЙ']; **нет** в ['ИНДИВИДУАЛЬНЫЙ', 'ИНДИВИДУАЛЬНЫЙ НАКОПИТЕЛЬНЫЙ']

#### Тип конкурса `ТУРНИРНЫЙ` — дерево путей

- `CONTEST_FEATURE`
  - `accuracy`
  - `avatarShow`
  - `businessBlock`
  - `businessBlock[]`
  - `capacity`
  - `feature`
  - `feature[]`
  - `gosbHidden`
  - `gosbVisible`
  - `helpCodeList`
  - `helpCodeList[]`
  - `masking`
  - `minNumber`
  - `momentRewarding`
  - `persomanNumberHidden`
  - `persomanNumberVisible`
  - `persomanNumberVisible[]`
  - `preferences`
  - `preferences[]`
  - `tbHidden`
  - `tbVisible`
  - `tbVisible[]`
  - `tournamentEndMailing`
  - `tournamentLikeMailing`
  - `tournamentListMailing`
  - `tournamentRewardingMailing`
  - `tournamentStartMailing`
  - `tournamentTeam`
  - `typeRewarding`
  - `vid`

##### Листья и узлы — `ТУРНИРНЫЙ`

- **`CONTEST_FEATURE`** — в 178 JSON; типы: `{'object': 178}`
- **`CONTEST_FEATURE.accuracy`** — в 178 JSON; типы: `{'integer': 178}`; числа (примеры): ['0', '1', '2', '3', '5']
- **`CONTEST_FEATURE.avatarShow`** — в 2 JSON; типы: `{'string': 2}`; примеры строк: `['Y']`
- **`CONTEST_FEATURE.businessBlock`** — в 178 JSON; типы: `{'array': 178}`; длина массива: min=1, max=1
- **`CONTEST_FEATURE.businessBlock[]`** — в 178 JSON; типы: `{'string': 178}`; примеры строк: `['MNS', 'IMUB', 'RNUB', 'RSB1', 'KMSB1', 'KMKKSB', 'SERVICEMEN', 'KMFACTORING']`
- **`CONTEST_FEATURE.capacity`** — в 178 JSON; типы: `{'string': 178}`; примеры строк: `['', 'MILLIONS', 'THOUSANDS']`
- **`CONTEST_FEATURE.feature`** — в 178 JSON; типы: `{'array': 178}`; длина массива: min=0, max=6
- **`CONTEST_FEATURE.feature[]`** — в 125 JSON; типы: `{'string': 300}`; строки: **длинный текст** (макс. 259 симв.)
- **`CONTEST_FEATURE.gosbHidden`** — в 178 JSON; типы: `{'array': 178}`; длина массива: min=0, max=0
- **`CONTEST_FEATURE.gosbVisible`** — в 178 JSON; типы: `{'array': 178}`; длина массива: min=0, max=0
- **`CONTEST_FEATURE.helpCodeList`** — в 8 JSON; типы: `{'array': 8}`; длина массива: min=1, max=2
- **`CONTEST_FEATURE.helpCodeList[]`** — в 8 JSON; типы: `{'string': 9}`; примеры строк: `['SD_1', 'MNS_AI_1', 'MNS_HR_1', 'MNS_IT_1', 'KPK_NPA_1', 'MNS_COM_1']`
- **`CONTEST_FEATURE.masking`** — в 178 JSON; типы: `{'string': 178}`; примеры строк: `['N']`
- **`CONTEST_FEATURE.minNumber`** — в 178 JSON; типы: `{'integer': 178}`; числа (примеры): ['0', '1', '2', '3']
- **`CONTEST_FEATURE.momentRewarding`** — в 178 JSON; типы: `{'string': 178}`; примеры строк: `['AFTER']`
- **`CONTEST_FEATURE.persomanNumberHidden`** — в 178 JSON; типы: `{'array': 178}`; длина массива: min=0, max=0
- **`CONTEST_FEATURE.persomanNumberVisible`** — в 178 JSON; типы: `{'array': 178}`; длина массива: min=0, max=7
- **`CONTEST_FEATURE.persomanNumberVisible[]`** — в 43 JSON; типы: `{'string': 61}`; примеры строк: `['00013701', '00343653', '00673892', '01340230', '01661250', '01728325', '01737312', '01767368', '01807213', '88888888', '91500718']`
- **`CONTEST_FEATURE.preferences`** — в 15 JSON; типы: `{'array': 15}`; длина массива: min=0, max=4
- **`CONTEST_FEATURE.preferences[]`** — в 13 JSON; типы: `{'string': 21}`; строки: **длинный текст** (макс. 158 симв.)
- **`CONTEST_FEATURE.tbHidden`** — в 178 JSON; типы: `{'array': 178}`; длина массива: min=0, max=0
- **`CONTEST_FEATURE.tbVisible`** — в 178 JSON; типы: `{'array': 178}`; длина массива: min=0, max=4
- **`CONTEST_FEATURE.tbVisible[]`** — в 4 JSON; типы: `{'string': 16}`; примеры строк: `['16', '40', '54', '99']`
- **`CONTEST_FEATURE.tournamentEndMailing`** — в 178 JSON; типы: `{'string': 178}`; примеры строк: `['N', 'Y']`
- **`CONTEST_FEATURE.tournamentLikeMailing`** — в 178 JSON; типы: `{'string': 178}`; примеры строк: `['N', 'Y']`
- **`CONTEST_FEATURE.tournamentListMailing`** — в 178 JSON; типы: `{'array': 178}`; длина массива: min=0, max=0
- **`CONTEST_FEATURE.tournamentRewardingMailing`** — в 178 JSON; типы: `{'string': 178}`; примеры строк: `['N', 'Y']`
- **`CONTEST_FEATURE.tournamentStartMailing`** — в 178 JSON; типы: `{'string': 178}`; примеры строк: `['N', 'Y']`
- **`CONTEST_FEATURE.tournamentTeam`** — в 15 JSON; типы: `{'string': 15}`; примеры строк: `['N', 'Y']`
- **`CONTEST_FEATURE.typeRewarding`** — в 178 JSON; типы: `{'string': 178}`; примеры строк: `['all', 'one']`
- **`CONTEST_FEATURE.vid`** — в 178 JSON; типы: `{'string': 178}`; примеры строк: `['ПРОМ', 'ТЕСТ']`

#### Тип конкурса `ИНДИВИДУАЛЬНЫЙ НАКОПИТЕЛЬНЫЙ` — дерево путей

- `CONTEST_FEATURE`
  - `accuracy`
  - `businessBlock`
  - `businessBlock[]`
  - `capacity`
  - `feature`
  - `feature[]`
  - `gosbHidden`
  - `gosbVisible`
  - `masking`
  - `minNumber`
  - `momentRewarding`
  - `persomanNumberHidden`
  - `persomanNumberVisible`
  - `persomanNumberVisible[]`
  - `tbHidden`
  - `tbVisible`
  - `tournamentEndMailing`
  - `tournamentLikeMailing`
  - `tournamentListMailing`
  - `tournamentRewardingMailing`
  - `tournamentStartMailing`
  - `typeRewarding`
  - `vid`

##### Листья и узлы — `ИНДИВИДУАЛЬНЫЙ НАКОПИТЕЛЬНЫЙ`

- **`CONTEST_FEATURE`** — в 98 JSON; типы: `{'object': 98}`
- **`CONTEST_FEATURE.accuracy`** — в 98 JSON; типы: `{'integer': 98}`; числа (примеры): ['0', '2']
- **`CONTEST_FEATURE.businessBlock`** — в 98 JSON; типы: `{'array': 98}`; длина массива: min=1, max=1
- **`CONTEST_FEATURE.businessBlock[]`** — в 98 JSON; типы: `{'string': 98}`; примеры строк: `['MNS', 'KMSB1', 'KMKKSB', 'SERVICEMEN']`
- **`CONTEST_FEATURE.capacity`** — в 98 JSON; типы: `{'string': 98}`; примеры строк: `['', 'MILLIONS', 'THOUSANDS']`
- **`CONTEST_FEATURE.feature`** — в 98 JSON; типы: `{'array': 98}`; длина массива: min=0, max=3
- **`CONTEST_FEATURE.feature[]`** — в 18 JSON; типы: `{'string': 28}`; примеры строк: `['Учёт договоров ведется с начала 2025 года', 'Учёт договоров ведется с начала 2026 года', 'Бейдж выдается за каждый заключенный договор', 'Обновление информации происходит раз в неделю', 'Факт получения бейджа попадает в лену сообщества']`
- **`CONTEST_FEATURE.gosbHidden`** — в 98 JSON; типы: `{'array': 98}`; длина массива: min=0, max=0
- **`CONTEST_FEATURE.gosbVisible`** — в 98 JSON; типы: `{'array': 98}`; длина массива: min=0, max=0
- **`CONTEST_FEATURE.masking`** — в 98 JSON; типы: `{'string': 98}`; примеры строк: `['N']`
- **`CONTEST_FEATURE.minNumber`** — в 98 JSON; типы: `{'integer': 98}`; числа (примеры): ['1']
- **`CONTEST_FEATURE.momentRewarding`** — в 98 JSON; типы: `{'string': 98}`; примеры строк: `['AFTER', 'DURIN']`
- **`CONTEST_FEATURE.persomanNumberHidden`** — в 98 JSON; типы: `{'array': 98}`; длина массива: min=0, max=0
- **`CONTEST_FEATURE.persomanNumberVisible`** — в 98 JSON; типы: `{'array': 98}`; длина массива: min=0, max=2
- **`CONTEST_FEATURE.persomanNumberVisible[]`** — в 6 JSON; типы: `{'string': 12}`; примеры строк: `['00673892', '01340230']`
- **`CONTEST_FEATURE.tbHidden`** — в 98 JSON; типы: `{'array': 98}`; длина массива: min=0, max=0
- **`CONTEST_FEATURE.tbVisible`** — в 98 JSON; типы: `{'array': 98}`; длина массива: min=0, max=0
- **`CONTEST_FEATURE.tournamentEndMailing`** — в 98 JSON; типы: `{'string': 98}`; примеры строк: `['N', 'Y']`
- **`CONTEST_FEATURE.tournamentLikeMailing`** — в 98 JSON; типы: `{'string': 98}`; примеры строк: `['N', 'Y']`
- **`CONTEST_FEATURE.tournamentListMailing`** — в 98 JSON; типы: `{'array': 98}`; длина массива: min=0, max=0
- **`CONTEST_FEATURE.tournamentRewardingMailing`** — в 98 JSON; типы: `{'string': 98}`; примеры строк: `['N', 'Y']`
- **`CONTEST_FEATURE.tournamentStartMailing`** — в 98 JSON; типы: `{'string': 98}`; примеры строк: `['N']`
- **`CONTEST_FEATURE.typeRewarding`** — в 98 JSON; типы: `{'string': 98}`; примеры строк: `['all', 'one']`
- **`CONTEST_FEATURE.vid`** — в 98 JSON; типы: `{'string': 98}`; примеры строк: `['ПРОМ']`

#### Тип конкурса `ИНДИВИДУАЛЬНЫЙ` — дерево путей

- `CONTEST_FEATURE`
  - `accuracy`
  - `businessBlock`
  - `businessBlock[]`
  - `capacity`
  - `feature`
  - `gosbHidden`
  - `gosbVisible`
  - `masking`
  - `minNumber`
  - `momentRewarding`
  - `persomanNumberHidden`
  - `persomanNumberVisible`
  - `persomanNumberVisible[]`
  - `tbHidden`
  - `tbVisible`
  - `tournamentEndMailing`
  - `tournamentLikeMailing`
  - `tournamentListMailing`
  - `tournamentRewardingMailing`
  - `tournamentStartMailing`
  - `typeRewarding`
  - `vid`

##### Листья и узлы — `ИНДИВИДУАЛЬНЫЙ`

- **`CONTEST_FEATURE`** — в 62 JSON; типы: `{'object': 62}`
- **`CONTEST_FEATURE.accuracy`** — в 62 JSON; типы: `{'integer': 62}`; числа (примеры): ['0', '2']
- **`CONTEST_FEATURE.businessBlock`** — в 62 JSON; типы: `{'array': 62}`; длина массива: min=0, max=1
- **`CONTEST_FEATURE.businessBlock[]`** — в 60 JSON; типы: `{'string': 60}`; примеры строк: `['MNS', 'KMKKSB', 'SERVICEMEN', 'KMFACTORING']`
- **`CONTEST_FEATURE.capacity`** — в 62 JSON; типы: `{'string': 62}`; примеры строк: `['']`
- **`CONTEST_FEATURE.feature`** — в 62 JSON; типы: `{'array': 62}`; длина массива: min=0, max=0
- **`CONTEST_FEATURE.gosbHidden`** — в 62 JSON; типы: `{'array': 62}`; длина массива: min=0, max=0
- **`CONTEST_FEATURE.gosbVisible`** — в 62 JSON; типы: `{'array': 62}`; длина массива: min=0, max=0
- **`CONTEST_FEATURE.masking`** — в 62 JSON; типы: `{'string': 62}`; примеры строк: `['N']`
- **`CONTEST_FEATURE.minNumber`** — в 62 JSON; типы: `{'integer': 62}`; числа (примеры): ['1']
- **`CONTEST_FEATURE.momentRewarding`** — в 62 JSON; типы: `{'string': 62}`; примеры строк: `['AFTER', 'DURIN']`
- **`CONTEST_FEATURE.persomanNumberHidden`** — в 62 JSON; типы: `{'array': 62}`; длина массива: min=0, max=0
- **`CONTEST_FEATURE.persomanNumberVisible`** — в 62 JSON; типы: `{'array': 62}`; длина массива: min=0, max=3
- **`CONTEST_FEATURE.persomanNumberVisible[]`** — в 12 JSON; типы: `{'string': 26}`; примеры строк: `['00343653', '00673892', '01340230', '88888888', '91500718']`
- **`CONTEST_FEATURE.tbHidden`** — в 62 JSON; типы: `{'array': 62}`; длина массива: min=0, max=0
- **`CONTEST_FEATURE.tbVisible`** — в 62 JSON; типы: `{'array': 62}`; длина массива: min=0, max=0
- **`CONTEST_FEATURE.tournamentEndMailing`** — в 62 JSON; типы: `{'string': 62}`; примеры строк: `['N']`
- **`CONTEST_FEATURE.tournamentLikeMailing`** — в 62 JSON; типы: `{'string': 62}`; примеры строк: `['N', 'Y']`
- **`CONTEST_FEATURE.tournamentListMailing`** — в 62 JSON; типы: `{'array': 62}`; длина массива: min=0, max=0
- **`CONTEST_FEATURE.tournamentRewardingMailing`** — в 62 JSON; типы: `{'string': 62}`; примеры строк: `['N', 'Y']`
- **`CONTEST_FEATURE.tournamentStartMailing`** — в 62 JSON; типы: `{'string': 62}`; примеры строк: `['N']`
- **`CONTEST_FEATURE.typeRewarding`** — в 62 JSON; типы: `{'string': 62}`; примеры строк: `['all', 'one']`
- **`CONTEST_FEATURE.vid`** — в 62 JSON; типы: `{'string': 62}`; примеры строк: `['ПРОМ', 'ТЕСТ']`


### Пояснительный справочник полей JSON `CONTEST_FEATURE`

_Смысловые трактовки — рабочие гипотезы._


Документ описывает структуру объекта JSON в колонке **`CONTEST_FEATURE`** листа CONTEST (файл выборки: `IN/SPOD/CONTEST (PROM) 18-03 v0.csv`, **338** строк, разбор после замены `"""` → `"` — **без ошибок**).

**Корень:** один JSON-объект (ниже пути указаны **без** префикса `CONTEST_FEATURE.` — это ключи внутри ячейки).

**Связь с `CONTEST_TYPE`:** набор полей и заполненность **зависят от типа конкурса**. В выборке три значения типа.

---


#### 1. Типы конкурсов и охват

| CONTEST_TYPE | Строк в выборке | Уникальных путей в JSON |
|--------------|-----------------|-------------------------|
| **ТУРНИРНЫЙ** | 178 | 31 |
| **ИНДИВИДУАЛЬНЫЙ НАКОПИТЕЛЬНЫЙ** | 98 | 24 |
| **ИНДИВИДУАЛЬНЫЙ** | 62 | 23 |

---

#### 2. Матрица: поле ↔ CONTEST_TYPE

Легенда: **+** — поле есть у всех строк этого типа; **±** — только у части строк или массив иногда непустой; **—** — в данных этого типа пути нет (ключ отсутствует или массив никогда не даёт вложенных значений).

| Поле | ТУРНИРНЫЙ | ИНД. НАКОПИТЕЛЬНЫЙ | ИНДИВИДУАЛЬНЫЙ |
|------|:---------:|:------------------:|:--------------:|
| `accuracy` | + | + | + |
| `avatarShow` | ± (2 стр.) | — | — |
| `businessBlock` | + | + | + |
| `businessBlock[]` | + | + | ± (60/62) |
| `capacity` | + | + | + |
| `feature` / `feature[]` | + / ± | + / ± | + / — (массив всегда пустой) |
| `gosbHidden` / `gosbVisible` | + (пустые) | + | + |
| `helpCodeList` / `helpCodeList[]` | ± (8 стр.) | — | — |
| `masking` | + | + | + |
| `minNumber` | + | + | + |
| `momentRewarding` | + | + | + |
| `persomanNumberHidden` | + | + | + |
| `persomanNumberVisible` / `[]` | + / ± | + / ± | + / ± |
| `preferences` / `preferences[]` | ± | — | — |
| `tbHidden` / `tbVisible` | + | + | + |
| `tbVisible[]` | ± (непустой у 4 стр.) | — | — |
| `tournamentStartMailing` … `tournamentRewardingMailing` | + | + | + |
| `tournamentListMailing` | + (пустой) | + | + |
| `tournamentTeam` | ± (15 стр.) | — | — |
| `typeRewarding` | + | + | + |
| `vid` | + | + | + |

---

#### 3. Дерево полей (объединённое)

Узлы в квадратных скобках — элементы массива (скаляр или объект; здесь везде скаляры).

```
CONTEST_FEATURE                    [корневой object]
├── accuracy                       [integer]
├── avatarShow                     [string Y/N] — только ТУРНИРНЫЙ, редко
├── businessBlock[]                [string — код блока]
├── capacity                       [string: единица ёмкости или ""]
├── feature[]                      [string — тексты] — нет элементов у ИНДИВИДУАЛЬНЫЙ
├── gosbHidden[]                   [в выборке всегда пусто]
├── gosbVisible[]                  [в выборке всегда пусто]
├── helpCodeList[]                 [string] — только ТУРНИРНЫЙ
├── masking                        [string, в выборке N]
├── minNumber                      [integer]
├── momentRewarding                [string: AFTER, DURIN*]
├── persomanNumberHidden[]         [в выборке пусто]
├── persomanNumberVisible[]        [string — табельные номера]
├── preferences[]                  [string — длинные тексты] — только ТУРНИРНЫЙ
├── tbHidden[]                     [пусто]
├── tbVisible[]                    [string — коды ТБ] — только ТУРНИРНЫЙ, редко непусто
├── tournamentStartMailing         [Y/N]
├── tournamentEndMailing           [Y/N]
├── tournamentLikeMailing          [Y/N]
├── tournamentRewardingMailing     [Y/N]
├── tournamentListMailing[]          [пусто]
├── tournamentTeam                 [Y/N] — только ТУРНИРНЫЙ
├── typeRewarding                  [all | one]
└── vid                            [ПРОМ | ТЕСТ]
```

\* В данных встречается значение **`DURIN`** — вероятная опечатка для *DURING* (в ходе периода).

---

#### 4. Справочник полей по алфавиту

##### `accuracy`

- **Тип JSON:** целое число.
- **CONTEST_TYPE:** все три типа.
- **Домен в выборке:** ТУРНИРНЫЙ — `0`, `1`, `2`, `3`, `5`; накопительный и индивидуальный — `0`, `2`.
- **Смысл (гипотеза):** точность / шаг отображения или расчёта (уточняется в ТЗ СПОД).

##### `avatarShow`

- **Тип:** строка **`Y` / `N`**.
- **CONTEST_TYPE:** только **ТУРНИРНЫЙ**; в выборке **2** строки, значение **`Y`**.
- **Смысл (гипотеза):** показ аватаров участников турнира.

##### `businessBlock`

- **Тип:** массив строк.
- **CONTEST_TYPE:** все; у **ИНДИВИДУАЛЬНЫЙ** возможен пустой массив (2 строки без элемента).
- **Размер:** ТУРНИРНЫЙ и накопительный — обычно ровно один код; индивидуальный — 0 или 1 элемент.
- **Примеры `businessBlock[]`:** `MNS`, `IMUB`, `RNUB`, `RSB1`, `KMSB1`, `KMKKSB`, `SERVICEMEN`, `KMFACTORING` (турнир); накопительный — подмножество (`MNS`, `KMSB1`, `KMKKSB`, `SERVICEMEN`); индивидуальный — `MNS`, `KMKKSB`, `SERVICEMEN`, `KMFACTORING`.

##### `capacity`

- **Тип:** строка.
- **CONTEST_TYPE:** все.
- **Домен:** **`""`**, **`MILLIONS`**, **`THOUSANDS`** (у **ИНДИВИДУАЛЬНЫЙ** в выборке только **`""`**).

##### `feature`

- **Тип:** массив строк (подсказки / описания для UI).
- **CONTEST_TYPE:** **ТУРНИРНЫЙ** и **ИНДИВИДУАЛЬНЫЙ НАКОПИТЕЛЬНЫЙ** — 0…N элементов; **ИНДИВИДУАЛЬНЫЙ** — в выборке **всегда пустой** массив.
- **Элементы:** у турниров — преимущественно **длинный текст** (до ~259 символов); у накопительного — короткие и средние фразы (про договоры, бейджи, ленту и т.д.).

##### `gosbHidden` / `gosbVisible`

- **Тип:** массивы (фильтры по ГОСБ).
- **CONTEST_TYPE:** все; в выборке **всегда пустые**.

##### `helpCodeList`

- **Тип:** массив строк (коды справки).
- **CONTEST_TYPE:** только **ТУРНИРНЫЙ**; **8** строк, 1–2 элемента.
- **Примеры:** `SD_1`, `MNS_AI_1`, `MNS_HR_1`, `MNS_IT_1`, `KPK_NPA_1`, `MNS_COM_1`.

##### `masking`

- **Тип:** строка.
- **CONTEST_TYPE:** все; в выборке везде **`N`**.
- **Смысл (гипотеза):** маскирование данных (как у наград).

##### `minNumber`

- **Тип:** целое число.
- **CONTEST_TYPE:** все.
- **Домен:** турнир — `0`…`3`; накопительный и индивидуальный — в выборке **`1`**.

##### `momentRewarding`

- **Тип:** строка (момент начисления награды).
- **CONTEST_TYPE:** все.
- **Домен:** **`AFTER`** (после); **`DURIN`** — только у накопительного и индивидуального (см. примечание про опечатку). У **ТУРНИРНЫЙ** в выборке только **`AFTER`**.

##### `persomanNumberHidden`

- **Тип:** массив; в выборке **всегда пустой**.
- **CONTEST_TYPE:** все.

##### `persomanNumberVisible`

- **Тип:** массив строк (табельные номера, допуск к конкурсу).
- **CONTEST_TYPE:** все; длина 0…7 (турнир), 0…2 (накопительный), 0…3 (индивидуальный).
- **Примеры элементов:** `00673892`, `01340230`, `88888888`, `91500718` и др.

##### `preferences`

- **Тип:** массив строк.
- **CONTEST_TYPE:** только **ТУРНИРНЫЙ**; **15** строк; 0–4 элемента; тексты **длинные** (до ~158 символов).

##### `tbHidden` / `tbVisible`

- **Тип:** массивы (фильтр по ТБ).
- **CONTEST_TYPE:** все; **`tbHidden`** в выборке всегда пустой.
- **`tbVisible[]`:** непустой **только у ТУРНИРНЫЙ** (4 JSON); значения вроде **`16`**, **`40`**, **`54`**, **`99`** (коды территориальных банков).

##### `tournamentStartMailing`, `tournamentEndMailing`, `tournamentLikeMailing`, `tournamentRewardingMailing`

- **Тип:** строка **`Y` / `N`** (рассылки по событиям турнира/конкурса).
- **CONTEST_TYPE:** все; у **ИНДИВИДУАЛЬНЫЙ** в выборке **`tournamentEndMailing`** и **`tournamentStartMailing`** только **`N`**; остальные флаги могут быть **`Y`**.

##### `tournamentListMailing`

- **Тип:** массив; в выборке **всегда пустой**.

##### `tournamentTeam`

- **Тип:** строка **`Y` / `N`**.
- **CONTEST_TYPE:** только **ТУРНИРНЫЙ**; **15** строк.
- **Смысл (гипотеза):** командный режим турнира.

##### `typeRewarding`

- **Тип:** строка.
- **CONTEST_TYPE:** все.
- **Домен:** **`all`**, **`one`** (все победители / один).

##### `vid`

- **Тип:** строка (контур: промо или тест).
- **CONTEST_TYPE:** все.
- **Домен:** **`ПРОМ`**, **`ТЕСТ`**; у **ИНДИВИДУАЛЬНЫЙ НАКОПИТЕЛЬНЫЙ** в выборке только **`ПРОМ`**.

---

#### 5. Различия по CONTEST_TYPE (кратко)

| Признак | ТУРНИРНЫЙ | ИНД. НАКОПИТЕЛЬНЫЙ | ИНДИВИДУАЛЬНЫЙ |
|---------|-----------|---------------------|----------------|
| Дополнительные ключи | `avatarShow`, `helpCodeList`, `preferences`, `tournamentTeam`; непустой `tbVisible[]` | — | — |
| Массив `feature` | 0–6 текстов, часто длинные | 0–3 текста | всегда `[]` |
| `momentRewarding` | только `AFTER` | `AFTER`, `DURIN` | `AFTER`, `DURIN` |
| `businessBlock` | всегда 1 код | всегда 1 код | может быть `[]` |
| `capacity` | есть `MILLIONS`/`THOUSANDS` | то же | только `""` |
| `minNumber` | 0–3 | `1` | `1` |
| `accuracy` | шире диапазон | 0, 2 | 0, 2 |
| `vid` | ПРОМ/ТЕСТ | только ПРОМ | ПРОМ/ТЕСТ |

---

#### 6. Версия документа

| Версия | Дата | Изменения |
|--------|------|-----------|
| 1.0 | 2026-01-31 | Справочник по полям `CONTEST_FEATURE` по файлу `CONTEST (PROM) 18-03 v0.csv` (338 строк, 3 значения `CONTEST_TYPE`). Смысловые трактовки — рабочие гипотезы. |

<a id="employee-prom-13-03-v0"></a>

## Файл: `employee (PROM) 13-03 v0.csv`

- **Путь:** `IN/SPOD/employee (PROM) 13-03 v0.csv`
- **Строк данных:** 726 (без учёта заголовка)
- **Разделитель:** `;`, кодировка UTF-8
- **Колонок:** 17

### Краткое назначение колонок

| Колонка | Назначение |
|---------|------------|
| `PERSON_NUMBER` | Табельный номер (20 знаков, ведущие нули). |
| `PERSON_NUMBER_ADD` | Дублирующий/нормализованный табельный номер. |
| `SURNAME` | Фамилия. |
| `FIRST_NAME` | Имя. |
| `MIDDLE_NAME` | Отчество. |
| `MANAGER_FULL_NAME` | ФИО руководителя (строкой). |
| `POSITION_NAME` | Наименование должности. |
| `TB_CODE` | Код территориального банка. |
| `GOSB_CODE` | Код ГОСБ (0 — аппарат ТБ). |
| `BUSINESS_BLOCK` | Код бизнес-блока сотрудника.  ПКАП |
| `PRIORITY_TYPE` | Тип приоритета (код, напр. 1). |
| `KPK_CODE` | Код КПК (если есть). |
| `KPK_NAME` | Наименование КПК. |
| `ROLE_CODE` | Код роли в системе промо. |
| `UCH_CODE` | Код участка/учёта (1/2 и т.д.). |
| `GENDER` | Пол (код). |
| `ORG_UNIT_CODE` | Код оргподразделения (связь с ORG_UNIT). |

### Плоские колонки (статистика значений)

| Колонка | Тип (оценка) | Непустых | Уникальных* | Варианты / комментарий |
|---------|--------------|----------|-------------|-------------------------|
| `PERSON_NUMBER` | целое (строкой в CSV) | 726/726 | 726 | **высокая кардинальность** (726 уник.); примеры: `['00000000000000000001', '00000000000000023642', '00000000000000044334', '00000000000000305862', '00000000000000306442', '00000000000000309576', '00000000000000311113', '00000000000000384088', '00000000000000398848', '00000000000000692964', '00000000000000751995', '00000000000000961964', '00000000000001004932', '00000000000001154264', '00000000000001204269']` |
| `PERSON_NUMBER_ADD` | целое (строкой в CSV) | 726/726 | 726 | **высокая кардинальность** (726 уник.); примеры: `['00000000000000000001', '00000000000000023642', '00000000000000044334', '00000000000000305862', '00000000000000306442', '00000000000000309576', '00000000000000311113', '00000000000000316631', '00000000000000384088', '00000000000000398848', '00000000000000692964', '00000000000000751995', '00000000000000960591', '00000000000000961964', '00000000000001004932']` |
| `SURNAME` | строка | 726/726 | 218 | **высокая кардинальность** (218 уник.); примеры: `['…', 'Ли', 'Алова', 'Белов', 'Дыбок', 'Ершов', 'Зыков', 'Ибаев', 'Кучук', 'Лукин', 'Львов', 'Малик', 'Сажин', 'Титов', 'Ухина']` |
| `FIRST_NAME` | строка | 726/726 | 533 | **высокая кардинальность** (533 уник.); примеры: `['Яна', 'Анна', 'Вера', 'Иван', 'Илья', 'Инга', 'Инна', 'Лана', 'Лена', 'Петр', 'Юлия', 'Адель', 'Айшат', 'Алена', 'Алина']` |
| `MIDDLE_NAME` | строка | 230/726 | 72 | **высокая кардинальность** (72 уник.); примеры: `['Юрьевич', 'Юрьевна', 'Глебовна', 'Иванович', 'Ивановна', 'Игоревич', 'Игоревна', 'Олегович', 'Олеговна', 'Павловна', 'Петрович', 'Петровна', 'Фомаевна', 'Андреевич', 'Вадимовна']` |
| `MANAGER_FULL_NAME` | строка | 726/726 | 662 | **высокая кардинальность** (662 уник.); примеры: `['КПК АПК', 'КПК Лев', 'КПК Вира', 'КПК Дзэн', 'КПК Лада', 'КПК Маяк', 'КПК Колос', 'КПК Лотос', 'КПК Перле', 'КПК Ротор', 'КПК Турбо', 'Коми ГОСБ', 'КПК Высота', 'КПК Ключ+7', 'КПК Космос']` |
| `POSITION_NAME` | строка | 726/726 | 55 | `['ТБ', 'КПК', 'ММБ', 'ОСБ', 'ГОСБ', 'Банкир', 'КМ ММБ', 'Аналитик', 'КМ КСБ МРБ', 'КМ КСБ /МРБ', 'Администратор', 'Управление МБ', 'Сбер Факторинг', 'Стажер-инженер', 'Сбербанк Лизинг', 'Начальник отдела', 'Директор дирекции', 'Специальный гость', 'Руководитель Деска', 'Руководитель деска', 'Директор управления', 'Клиентский менеджер', 'Начальник дивизиона', 'Не сотрудник банка1', 'Не сотрудник банка2', 'Не сотрудник банка3', 'Персональный банкир', 'Специальный гость20', 'Финансовый советник', 'Центральный аппарат', 'Начальник управления', 'Руководитель проекта', 'Руководитель проектов', 'Эксперт по Факторингу', 'Руководитель дивизиона', 'Исполнительный директор', 'Клиентский менеджер КСБ', 'Заместитель управляющего', 'Клиентский менеджер УРКК', 'Руководитель направления', 'Главный клиентский менеджер', 'Старший клиентский менеджер', 'Менеджер по развитию бизнеса', 'Мереджер развития Бизнеса ММБ', 'Руководитель ПС по Факторингу', 'Менеджер сопровождения бизнеса', 'Главный менеджер по развитию бизнеса', 'Менеджер сопровождения по Факторингу', 'Продуктовый специалист по Факторингу', 'Старший менеджер по развитию бизнеса', 'Руководитель территориальной дирекции', 'Старший менеджер сопровождения бизнеса', 'Руководитель менеджеров сопровождения по Факторингу', 'Специалист по обслуживанию клиентов Private Banking', 'Старший специалист по обслуживанию клиентов Private Banking']` |
| `TB_CODE` | целое (строкой в CSV) | 726/726 | 14 | `['13', '16', '18', '38', '40', '42', '44', '52', '54', '55', '70', '99', '101', '102']` |
| `GOSB_CODE` | целое (строкой в CSV) | 726/726 | 105 | **высокая кардинальность** (105 уник.); примеры: `['0', '17', '1023', '1024', '1025', '1026', '1300', '1802', '1806', '3000', '4157', '4200', '5200', '5221', '5230']` |
| `BUSINESS_BLOCK` | строка | 726/726 | 6 | `['KMSB1', 'KMKKSB', 'сбросить', 'KMFACTORING', 'Не участник', 'не участник']`  ПКАП |
| `PRIORITY_TYPE` | целое (строкой в CSV) | 726/726 | 2 | `['0', '1']` |
| `KPK_CODE` | целое (строкой в CSV) | 388/726 | 388 | **высокая кардинальность** (388 уник.); примеры: `['10241465', '10241466', '10241469', '10241470', '10241471', '10241472', '10241793', '10241794', '10241795', '10241796', '10241797', '10241798', '10241963', '10241964', '10241966']` |
| `KPK_NAME` | строка | 388/726 | 164 | **высокая кардинальность** (164 уник.); примеры: `['КПК', 'КПК №1', 'КПК №2', 'КПК АПК', 'КПК (УРМ)', 'КПК АПК №1', 'КПК АПК №2', 'КПК АПК №3', 'КПК Торговли', 'КПК АПК (УРМ)', 'КПК Транспорта', 'КПК Энергетики', 'КПК транспорта', 'КПК Металлургии', 'КПК АПК №3 (УРМ)']` |
| `ROLE_CODE` | строка | 230/726 | 9 | `['NOT_USED', 'TB_B2C_LOOK', 'KM_FAKTORING', 'LEASING_LOOK', 'DIR_UPR_UTB_M', 'FAKTORING_LOOK', 'OTHER_B2C_LOOK', 'RUK_FAKTORING_TOP', 'ZAM_UPR_GOSB_KIB_M']` |
| `UCH_CODE` | целое (строкой в CSV) | 726/726 | 4 | `['0', '1', '2', '4']` |
| `GENDER` | целое (строкой в CSV) | 726/726 | 3 | `['1', '2', '3']` |
| `ORG_UNIT_CODE` | целое (строкой в CSV) | 726/726 | 118 | **высокая кардинальность** (118 уник.); примеры: `['10000360', '10000367', '10016423', '10016438', '10016441', '10016443', '10016445', '10016449', '10016629', '10016633', '10016634', '10016635', '10016636', '10016639', '10016640']` |

\* Уникальных по непустым значениям; для длинных текстов перечисление ограничено.

<a id="group-prom-18-03-v0"></a>

## Файл: `GROUP (PROM) 18-03 v0.csv`

- **Путь:** `IN/SPOD/GROUP (PROM) 18-03 v0.csv`
- **Строк данных:** 437 (без учёта заголовка)
- **Разделитель:** `;`, кодировка UTF-8
- **Колонок:** 8

### Краткое назначение колонок

| Колонка | Назначение |
|---------|------------|
| `CONTEST_CODE` | Код конкурса (внешний ключ на `CONTEST.CONTEST_CODE`).  ПКАП |
| `GROUP_CODE` | Код уровня группировки (`BANK`, `TB`, `GOSB`, `GROUPING`).  ПКАП |
| `GROUP_VALUE` | Значения уровня (в т.ч. `*` или массив кодов оргструктуры).  ПКАП |
| `GET_CALC_METHOD` | Метод определения победителей (`1` — процент, `2` — TOP-N, `3` — по критерию).  ПКАП |
| `GET_CALC_CRITERION` | Основной порог/параметр отбора победителей.  ПКАП |
| `ADD_CALC_CRITERION` | Дополнительный критерий отбора участников.  ПКАП |
| `ADD_CALC_CRITERION_2` | Второй дополнительный критерий отбора участников.  ПКАП |
| `BASE_CALC_CODE` | Базовый уровень для расчёта критериев (`BANK`/`TB`/`GOSB`/`GROUPING`).  ПКАП |

### Плоские колонки (статистика значений)

| Колонка | Тип (оценка) | Непустых | Уникальных* | Варианты / комментарий |
|---------|--------------|----------|-------------|-------------------------|
| `CONTEST_CODE` | строка | 437/437 | 338 | **высокая кардинальность** (338 уник.); примеры: `['CONTEST_00', 'CONTEST_01', 'CONTEST_02', 'CONTEST_03', 'CONTEST_04', 'CONTEST_05', 'CONTEST_06', 'CONTEST_07', 'CONTEST_11', 'CONTEST_12', 'CONTEST_13', 'CONTEST_14', 'CONTEST_15', 'CONTEST_16', 'CONTEST_17']`  ПКАП |
| `GROUP_CODE` | строка | 437/437 | 4 | `['TB', 'BANK', 'GOSB', 'GROUPING']`  ПКАП |
| `GROUP_VALUE` | строка | 437/437 | 12 | `['*', '[13]', '[16]', '[18]', '[38]', '[40]', '[42]', '[44]', '[52]', '[54]', '[55]', '[70]']`  ПКАП |
| `GET_CALC_METHOD` | целое (строкой в CSV) | 437/437 | 3 | `['1', '2', '3']`  ПКАП |
| `GET_CALC_CRITERION` | число (строкой в CSV) | 265/437 | 12 | `['0', '1', '2', '3', '4', '5', '8', '10', '15', '20', '0.00000', '0.01000']`  ПКАП |
| `ADD_CALC_CRITERION` | число (строкой в CSV) | 265/437 | 13 | `['0', '1', '2', '3', '4', '5', '6', '10', '0.00000', '0.07000', '0.10000', '0.15000', '0.20000']`  ПКАП |
| `ADD_CALC_CRITERION_2` | число (строкой в CSV) | 265/437 | 9 | `['0', '1', '2', '3', '4', '5', '10', '0.00000', '0.10000']`  ПКАП |
| `BASE_CALC_CODE` | строка | 265/437 | 4 | `['TB', 'BANK', 'GOSB', 'GROUPING']`  ПКАП |

\* Уникальных по непустым значениям; для длинных текстов перечисление ограничено.

### JSON: колонка `GROUP_VALUE`

Предобработка: тройные кавычки в CSV → обычные `"`, затем `json.loads`. Учитываются только значения с корнем **object** или **array**; распарсено **29** ячеек из 437 строк.

- `GROUP_VALUE`
- `GROUP_VALUE[]`

##### Листья и узлы — `GROUP_VALUE`

- **`GROUP_VALUE`** — в 29 JSON; типы: `{'array': 29}`; длина массива: min=1, max=1
- **`GROUP_VALUE[]`** — в 29 JSON; типы: `{'integer': 29}`; числа (примеры): ['13', '16', '18', '38', '40', '42', '44', '52', '54', '55', '70']

<a id="indicator-prom-18-03-v0"></a>

## Файл: `INDICATOR (PROM) 18-03 v0.csv`

- **Путь:** `IN/SPOD/INDICATOR (PROM) 18-03 v0.csv`
- **Строк данных:** 325 (без учёта заголовка)
- **Разделитель:** `;`, кодировка UTF-8
- **Колонок:** 16

### Краткое назначение колонок

| Колонка | Назначение |
|---------|------------|
| `CONTEST_CODE` | Код конкурса (внешний ключ на `CONTEST`).  ПКАП |
| `INDICATOR_CALC_TYPE` | Тип расчёта индикатора (служебный код). |
| `INDICATOR_ADD_CALC_TYPE` | Роль индикатора в формуле: `NUMERATOR` (числитель), `DIVIDER` (знаменатель), либо пусто.  ПКАП |
| `FULL_NAME` | Человекочитаемое название индикатора. |
| `INDICATOR_CODE` | Код индикатора из источников данных.  ПКАП |
| `INDICATOR_AGG_FUNCTION` | Функция агрегации: `SUM`, `MAX`, `MIN`, `AVG`, `COUNT`, `COUNT_DISTINCT`, `COUNT_DISTINCT_CUSTOMER`, `COUNT_DISTINCT_DEAL`, `LAST_VALUE`, либо пусто.  ПКАП |
| `INDICATOR_WEIGHT` | Вес индикатора в итоговой формуле конкурса.  ПКАП |
| `INDICATOR_OBJECT` | Объект/уровень применения индикатора (в текущих данных обычно пусто). |
| `INDICATOR_MARK_TYPE` | Тип оценки индикатора (`GAIN`, `RATING`, `CRITERION`). |
| `INDICATOR_MATCH` | Оператор/правило сравнения для индикатора. |
| `INDICATOR_VALUE` | Пороговое или фиксированное значение индикатора. |
| `CONTEST_CRITERION` | Критерий конкурса на уровне индикатора (в выгрузке часто пусто). |
| `INDICATOR_FILTER` | JSON-фильтр операций/атрибутов, участвующих в расчёте.  ПКАП |
| `CONTESTANT_SELECTION` | Правило выбора участника (`0` — на дату операции, `1` — на дату окончания турнира).  ПКАП |
| `CALC_TYPE` | Тип расчёта (кодовое значение).  ПКАП |
| `N` | Технический порядковый/служебный параметр строки. |

### Плоские колонки (статистика значений)

| Колонка | Тип (оценка) | Непустых | Уникальных* | Варианты / комментарий |
|---------|--------------|----------|-------------|-------------------------|
| `CONTEST_CODE` | строка | 325/325 | 320 | **высокая кардинальность** (320 уник.); примеры: `['CONTEST_01', 'CONTEST_02', 'CONTEST_03', 'CONTEST_04', 'CONTEST_05', 'CONTEST_06', 'CONTEST_07', 'CONTEST_11', 'CONTEST_12', 'CONTEST_13', 'CONTEST_14', 'CONTEST_15', 'CONTEST_16', 'CONTEST_17', 'CONTEST_19']`  ПКАП |
| `INDICATOR_CALC_TYPE` | целое (строкой в CSV) | 325/325 | 1 | `['1']` |
| `INDICATOR_ADD_CALC_TYPE` | строка | 8/325 | 2 | выгрузка: `['DIVIDER', 'NUMERATOR']`; в `config.json` те же значения + пусто и короткие label.  ПКАП |
| `FULL_NAME` | строка | 325/325 | 25 | `['WD', 'WAIT', 'INCOME', 'PPO_IN', 'PPO_ALL', 'COMPASARS_KKP_ID', 'PULMIS_SDO_IN_RUB', 'PFIMIS_CUSTOMER_ID', 'CC360_NKD_DETAIL_CHKD', 'EFFICIENCYARSKKSB_EFF', 'PULMIS_AGRMNT_AMT_RUB', 'PULMIS_BALANCE_OUT_RUB', 'CC360_CLIENT_VOLUM_FOT_M', 'FUNNELARS_ACTIVE_DEAL_ID', 'TRUSTLEVELCC360_STAR_COUNT', 'INSURANCEMIS_BANK_COMMISION', 'FUNNELARS_ACTIVE_CUSTOMER_ID', 'FUNNELARS_ACTIVE_DEAL_MARGIN', 'TRUSTLEVELCC360_LEVEL0_COUNT', 'TRUSTLEVELCC360_LEVEL3_COUNT', 'TRUSTLEVELCC360_LEVEL4_COUNT', 'TRUSTLEVELCC360_LEVEL5_COUNT', 'EFFICIENCYARSKKSB_OD_YEAR_TEMP', 'EFFICIENCYARSKKSB_OD_YEAR_GROWTH', 'TRUSTLEVELCC360_STAR_START_COUNT']` |
| `INDICATOR_CODE` | строка | 325/325 | 26 | `['WD', 'WAIT', 'INCOME', 'PPO_IN', 'PPO_ALL', 'LEAGUEDEL', 'COMPASARS_KKP_ID', 'PULMIS_SDO_IN_RUB', 'PFIMIS_CUSTOMER_ID', 'CC360_NKD_DETAIL_CHKD', 'EFFICIENCYARSKKSB_EFF', 'PULMIS_AGRMNT_AMT_RUB', 'PULMIS_BALANCE_OUT_RUB', 'CC360_CLIENT_VOLUM_FOT_M', 'FUNNELARS_ACTIVE_DEAL_ID', 'TRUSTLEVELCC360_STAR_COUNT', 'INSURANCEMIS_BANK_COMMISION', 'FUNNELARS_ACTIVE_CUSTOMER_ID', 'FUNNELARS_ACTIVE_DEAL_MARGIN', 'TRUSTLEVELCC360_LEVEL0_COUNT', 'TRUSTLEVELCC360_LEVEL3_COUNT', 'TRUSTLEVELCC360_LEVEL4_COUNT', 'TRUSTLEVELCC360_LEVEL5_COUNT', 'EFFICIENCYARSKKSB_OD_YEAR_TEMP', 'EFFICIENCYARSKKSB_OD_YEAR_GROWTH', 'TRUSTLEVELCC360_STAR_START_COUNT']`  ПКАП |
| `INDICATOR_AGG_FUNCTION` | строка | 74/325 | 5 | выгрузка: `['MAX', 'SUM', 'COUNT_DISTINCT', 'COUNT_DISTINCT_DEAL', 'COUNT_DISTINCT_CUSTOMER']`; в `config.json` расширено до полного набора из справочника (9 значений + пусто).  ПКАП |
| `INDICATOR_WEIGHT` | целое (строкой в CSV) | 74/325 | 3 | `['1', '-1', '1000']`  ПКАП |
| `INDICATOR_OBJECT` | пусто | 0/325 | 0 | все пусто |
| `INDICATOR_MARK_TYPE` | строка | 325/325 | 3 | `['GAIN', 'RATING', 'CRITERION']` |
| `INDICATOR_MATCH` | строка | 325/325 | 7 | `['=', '>=', 'X2', 'X3', 'X4', 'MAX', 'MIN']` |
| `INDICATOR_VALUE` | целое (строкой в CSV) | 191/325 | 18 | `['0', '1', '2', '3', '4', '5', '10', '50', '100', '100000', '500000', '3000000', '5000000', '7000000', '10000000', '12000000', '500000000', '1000000000']` |
| `CONTEST_CRITERION` | пусто | 0/325 | 0 | все пусто |
| `INDICATOR_FILTER` | строка | 24/325 | 11 | `['[{"filtered_attribute_code""":"""action_code""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""12"""]}]"', '[{"filtered_attribute_code""":"""segment_mk""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""10100""","""20201""","""20202""","""20605"""]}]"', '[{"filtered_attribute_code""":"""product""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""БАНКОВСКИЕ ГАРАНТИИ""","""ЭЛЕКТРОННЫЕ ГАРАНТИИ (ВОЗМЕЩЕНИЕ НАЛОГОВ)"""]}]"', '[{"filtered_attribute_code""":"""action_code""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""12"""]},{"""filtered_attribute_code""":"""action_new_customer""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""1"""]}]"', '[{"filtered_attribute_code""":"""polis_dt""","""filtered_attribute_type""":"""date""","""filtered_attribute_match""":""">=""","""filtered_attribute_dt""":"""2025-01-01"""},{"""filtered_attribute_code""":"""category""","""filtered_attribute_type""":"""string""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""РЫНОЧНЫЕ ПРОДАЖИ"""]},{"""filtered_attribute_code""":"""sale_channel""","""filtered_attribute_type""":"""string""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""БРОКЕР"""]},{"""filtered_attribute_code""":"""segment""","""filtered_attribute_type""":"""string""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""СКБ-СРЕДНИЕ""","""СКБ-КРУПНЫЕ"""]}]"', '[{"filtered_attribute_code""":"""deal_is_msh""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""0"""]},{"""filtered_attribute_code""":"""kkp_status_code""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""IMPLEMENTED""","""PARTLY_IMPLEMENTED"""]},{"""filtered_attribute_code""":"""e2e_product_code""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""NOT_IN""","""filtered_attribute_condition""":["""016"""]},{"""filtered_attribute_code""":"""customer_segment""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""Крупнейшие""","""Крупные""","""Средние"""]}]"', '[{"filtered_attribute_code""":"""segment""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""20201""","""10100""","""20202""","""20605"""]},{"""filtered_attribute_code""":"""tb""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""NOT_IN""","""filtered_attribute_condition""":["""99"""]},{"""filtered_attribute_code""":"""is_manual_correct""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""0"""]},{"""filtered_attribute_code""":"""is_cva_product""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""0"""]},{"""filtered_attribute_code""":"""product_group""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""1""","""2""","""14""","""8"""]}]"', '[{"filtered_attribute_code""":"""kross_cnt""","""filtered_attribute_type""":"""INTEGER""","""filtered_attribute_match""":""">""","""filtered_attribute_value""":1},{"""filtered_attribute_code""":"""deal_is_msh""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""0"""]},{"""filtered_attribute_code""":"""kkp_status_code""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""IMPLEMENTED""","""PARTLY_IMPLEMENTED"""]},{"""filtered_attribute_code""":"""e2e_product_code""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""NOT_IN""","""filtered_attribute_condition""":["""016"""]},{"""filtered_attribute_code""":"""customer_segment""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""Крупнейшие""","""Крупные""","""Средние"""]}]"', '[{"filtered_attribute_code""":"""segment_mk""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""10100""","""20201""","""20202""","""20605"""]},{"""filtered_attribute_code""":"""coa_type_id""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""41102""","""41103""","""41104""","""41402""","""41403""","""41404""","""41405""","""41502""","""41503""","""41504""","""41505""","""41506""","""41602""","""41603""","""41604""","""41605""","""41702""","""41703""","""41704""","""41705""","""41802""","""41803""","""41804""","""41805""","""41806""","""41902""","""41903""","""41904""","""41905""","""41906""","""41907""","""42002""","""42003""","""42004""","""42005""","""42006""","""42007""","""42102""","""42103""","""42104""","""42105""","""42106""","""42107""","""42109""","""42110""","""42111""","""42112""","""42113""","""42114""","""42202""","""42203""","""42204""","""42205""","""42206""","""42207""","""42502""","""42503""","""42504""","""42505""","""42506""","""42507""","""42802""","""43207""","""43707""","""43806""","""43807""","""43907""","""47426""","""47440""","""47442""","""47445""","""47453""","""47459""","""47607"""]},{"""filtered_attribute_code""":"""coa_open_dt""","""filtered_attribute_type""":"""DATE""","""filtered_attribute_match""":""">=""","""filtered_attribute_dt""":"""2025-01-01"""}]"', '[{"filtered_attribute_code""":"""segment_mk""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""10100""","""20201""","""20202""","""20605"""]},{"""filtered_attribute_code""":"""coa_type_id""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""41102""","""41103""","""41104""","""41402""","""41403""","""41404""","""41405""","""41502""","""41503""","""41504""","""41505""","""41506""","""41602""","""41603""","""41604""","""41605""","""41702""","""41703""","""41704""","""41705""","""41802""","""41803""","""41804""","""41805""","""41806""","""41902""","""41903""","""41904""","""41905""","""41906""","""41907""","""42002""","""42003""","""42004""","""42005""","""42006""","""42007""","""42102""","""42103""","""42104""","""42105""","""42106""","""42107""","""42109""","""42110""","""42111""","""42112""","""42113""","""42114""","""42202""","""42203""","""42204""","""42205""","""42206""","""42207""","""42502""","""42503""","""42504""","""42505""","""42506""","""42507""","""42802""","""43207""","""43707""","""43806""","""43807""","""43907""","""47426""","""47440""","""47442""","""47445""","""47453""","""47459""","""47607"""]},{"""filtered_attribute_code""":"""ccy_code""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""RUR"""]}]"', '[{"filtered_attribute_code""":"""segment_mk""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""10100""","""20201""","""20202""","""20605"""]},{"""filtered_attribute_code""":"""coa_type_id""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""41102""","""41103""","""41104""","""41402""","""41403""","""41404""","""41405""","""41502""","""41503""","""41504""","""41505""","""41506""","""41602""","""41603""","""41604""","""41605""","""41702""","""41703""","""41704""","""41705""","""41802""","""41803""","""41804""","""41805""","""41806""","""41902""","""41903""","""41904""","""41905""","""41906""","""41907""","""42002""","""42003""","""42004""","""42005""","""42006""","""42007""","""42102""","""42103""","""42104""","""42105""","""42106""","""42107""","""42109""","""42110""","""42111""","""42112""","""42113""","""42114""","""42202""","""42203""","""42204""","""42205""","""42206""","""42207""","""42502""","""42503""","""42504""","""42505""","""42506""","""42507""","""42802""","""43207""","""43707""","""43806""","""43807""","""43907""","""47426""","""47440""","""47442""","""47445""","""47453""","""47459""","""47607"""]},{"""filtered_attribute_code""":"""ccy_code""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""RUR"""]},{"""filtered_attribute_code""":"""early_termination""","""filtered_attribute_type""":"""STRING""","""filtered_attribute_match""":"""IN""","""filtered_attribute_condition""":["""0"""]},{"""filtered_attribute_code""":"""deposit_period""","""filtered_attribute_type""":"""DECIMAL (38,12)""","""filtered_attribute_match""":""">=""","""filtered_attribute_value""":31}]"']`  ПКАП |
| `CONTESTANT_SELECTION` | целое (строкой в CSV) | 50/325 | 2 | `['0', '1']`  ПКАП |
| `CALC_TYPE` | целое (строкой в CSV) | 325/325 | 4 | `['0', '1', '2', '3']`  ПКАП |
| `N` | целое (строкой в CSV) | 325/325 | 325 | **высокая кардинальность** (325 уник.); примеры: `['4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18']` |

\* Уникальных по непустым значениям; для длинных текстов перечисление ограничено.

<a id="org-unit-v20-20-03-v0"></a>

## Файл: `ORG_UNIT_V20 20-03 v0.csv`

- **Путь:** `IN/SPOD/ORG_UNIT_V20 20-03 v0.csv`
- **Строк данных:** 128 (без учёта заголовка)
- **Разделитель:** `;`, кодировка UTF-8
- **Колонок:** 11

### Краткое назначение колонок

| Колонка | Назначение |
|---------|------------|
| `TB_CODE` | Код территориального банка. |
| `TB_FULL_NAME` | Полное название ТБ. |
| `TB_SHORT_NAME` | Краткое название ТБ. |
| `GOSB_CODE` | Код ГОСБ. |
| `GOSB_NAME` | Полное название ГОСБ. |
| `GOSB_SHORT_NAME` | Краткое название ГОСБ. |
| `CLUSTER_CODE` | Код кластера. |
| `GROUPING_CODE` | Код группировки в иерархии. |
| `GOSB_CNT` | Счётчик ГОСБ (число). |
| `GROUPING_CNT` | Счётчик группировки. |
| `ORG_UNIT_CODE` | Уникальный код оргподразделения (ключ). |

### Плоские колонки (статистика значений)

| Колонка | Тип (оценка) | Непустых | Уникальных* | Варианты / комментарий |
|---------|--------------|----------|-------------|-------------------------|
| `TB_CODE` | целое (строкой в CSV) | 128/128 | 22 | `['13', '16', '18', '38', '40', '42', '44', '52', '54', '55', '70', '99', '100', '101', '102', '103', '104', '105', '106', '107', '108', '999']` |
| `TB_FULL_NAME` | строка | 128/128 | 21 | `['ДЗО', 'Сбербанк', 'Экосистема', 'Дочерние Банки', 'Сбер Факторинг', 'Сибирский банк', 'Уральский банк', 'Московский банк', 'Поволжский банк', 'Сбербанк Лизинг', 'Байкальский банк', 'Юго-Западный банк', 'Волго-Вятский банк', 'Среднерусский банк', 'Центральный аппарат', 'Дальневосточный банк', 'Северо-Западный банк', 'Подрядные организации', 'Филиал ПАО Сбербанк в Индии', 'Центрально-Черноземный банк', 'Подразделения центрального подчинения']` |
| `TB_SHORT_NAME` | строка | 128/128 | 21 | `['ББ', 'МБ', 'ПБ', 'УБ', 'ЦА', 'ШД', 'ВВБ', 'ДВБ', 'ДЗО', 'ПЦП', 'СЗБ', 'СИБ', 'СРБ', 'ЦЧБ', 'ЮЗБ', 'Сбер', 'Экосистема', 'Дочерние Банки', 'Сбер Факторинг', 'Сбербанк Лизинг', 'Сбербанк в Индии']` |
| `GOSB_CODE` | целое (строкой в CSV) | 128/128 | 107 | **высокая кардинальность** (107 уник.); примеры: `['0', '17', '1023', '1024', '1025', '1026', '1300', '1802', '1806', '3000', '4157', '4200', '5200', '5221', '5230']` |
| `GOSB_NAME` | строка | 117/128 | 107 | **высокая кардинальность** (107 уник.); примеры: `['Коми ГОСБ', 'Южное ГОСБ', 'Омское ГОСБ', 'Курское ГОСБ', 'Томское ГОСБ', 'Брянское ГОСБ', 'Западное ГОСБ', 'Ингушское ОСБ', 'Калмыцкое ОСБ', 'Липецкое ГОСБ', 'Марий Эл ГОСБ', 'Пермское ГОСБ', 'Северное ГОСБ', 'Тверское ГОСБ', 'Тульское ГОСБ']` |
| `GOSB_SHORT_NAME` | строка | 128/128 | 28 | `['ЦА', 'ДЗО', 'ПЦП', 'ГОСБ', 'Сбер', 'ЦПКК ББ', 'ЦПКК ПБ', 'ЦПКК УБ', 'ЦПКК ВВБ', 'ЦПКК ДВБ', 'ЦПКК СЗБ', 'ЦПКК СИБ', 'ЦПКК СРБ', 'ЦПКК ЦЧБ', 'ЦПКК ЮЗБ', 'Аппарат ББ', 'Аппарат МБ', 'Аппарат ПБ', 'Аппарат УБ', 'Управление', 'Аппарат ВВБ', 'Аппарат ДВБ', 'Аппарат СЗБ', 'Аппарат СИБ', 'Аппарат СРБ', 'Аппарат ЦЧБ', 'Аппарат ЮЗБ', 'Подразделение']` |
| `CLUSTER_CODE` | целое (строкой в CSV) | 128/128 | 6 | `['0', '1', '2', '3', '4', '5']` |
| `GROUPING_CODE` | целое (строкой в CSV) | 128/128 | 1 | `['1']` |
| `GOSB_CNT` | целое (строкой в CSV) | 128/128 | 37 | `['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '21', '22', '23', '24', '26', '27', '28', '29', '30', '31', '33', '36', '38', '43', '48', '64', '78']` |
| `GROUPING_CNT` | целое (строкой в CSV) | 128/128 | 35 | `['0', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15', '16', '17', '18', '19', '20', '21', '22', '23', '24', '26', '27', '28', '29', '30', '31', '33', '36', '38', '43', '48', '64', '78']` |
| `ORG_UNIT_CODE` | целое (строкой в CSV) | 128/128 | 128 | **высокая кардинальность** (128 уник.); примеры: `['10000001', '10000002', '10000360', '10000367', '10016423', '10016438', '10016441', '10016443', '10016445', '10016449', '10016629', '10016633', '10016634', '10016635', '10016636']` |

\* Уникальных по непустым значениям; для длинных текстов перечисление ограничено.

<a id="report-prom-18-03-v0"></a>

## Файл: `REPORT (PROM) 18-03 v0.csv`

- **Путь:** `IN/SPOD/REPORT (PROM) 18-03 v0.csv`
- **Строк данных:** 19711 (без учёта заголовка)
- **Разделитель:** `;`, кодировка UTF-8
- **Колонок:** 7

### Краткое назначение колонок

| Колонка | Назначение |
|---------|------------|
| `MANAGER_PERSON_NUMBER` | Табельный номер сотрудника (менеджер/участник отчёта). |
| `CONTEST_CODE` | Код конкурса.  ПКАП |
| `TOURNAMENT_CODE` | Код турнира/периода расчёта.  ПКАП |
| `CONTEST_DATE` | Дата среза показателя. |
| `PLAN_VALUE` | Плановое значение (число). |
| `FACT_VALUE` | Фактическое значение (число). |
| `priority_type` | Тип приоритета строки отчёта. |

### Плоские колонки (статистика значений)

| Колонка | Тип (оценка) | Непустых | Уникальных* | Варианты / комментарий |
|---------|--------------|----------|-------------|-------------------------|
| `MANAGER_PERSON_NUMBER` | целое (строкой в CSV) | 19711/19711 | 3387 | **высокая кардинальность** (3387 уник.); примеры: `['00000000000000007557', '00000000000000007713', '00000000000000007851', '00000000000000009127', '00000000000000011228', '00000000000000011297', '00000000000000012522', '00000000000000013701', '00000000000000014533', '00000000000000016056', '00000000000000017233', '00000000000000017816', '00000000000000019043', '00000000000000019605', '00000000000000019961']` |
| `CONTEST_CODE` | строка | 19711/19711 | 40 | `['CONTEST_57', 'CONTEST_93', '01_2025-0_00-2_1', '01_2025-0_00-2_2', '01_2025-0_03-2-7', '01_2025-0_12-1_1', '01_2025-2_02-1_2', '01_2025-2_02-1_3', '01_2025-2_02-1_4', '01_2025-2_02-2_7', '01_2025-2_09-1_2', '01_2025-2_09-1_3', '01_2025-2_09-1_4', '01_2025-2_14-1_2', '01_2025-2_14-1_3', '01_2025-2_14-2_4', '01_2025-2_14-2_5', '01_2026-0_09-1_2', '01_2026-0_09-1_3', '01_2026-0_09-1_4', '01_2026-0_13-1_4', '01_2026-0_13-1_5', '01_2026-0_13-1_6', '01_2026-0_16-1_1', '01_2026-1_01-7_1', '01_2026-1_08-2_3', '01_2026-1_08-2_6', '01_2026-1_10-1_6', '01_2026-1_11-1_1', '01_2026-1_14-1_1', '01_2026-1_14-2_1', '01_2026-1_14-2_2', '01_2026-1_14-2_3', '01_2026-1_15-1_2', '01_2026-1_16-1_1', '01_2026-1_16-2_1', '02_2025-2_03-5_1', '04_2026-0_15-2_1', '04_2026-0_15-2_2', '04_2026-0_15-2_3']`  ПКАП |
| `TOURNAMENT_CODE` | строка | 19711/19711 | 42 | `['TOURNAMENT_57_01', 'TOURNAMENT_93_01', 't_01_2025-0_00-2_1_1001', 't_01_2025-0_00-2_2_1001', 't_01_2025-0_03-2-7_1001', 't_01_2025-0_12-1_1_1001', 't_01_2025-0_12-1_1_1002', 't_01_2025-2_02-1_2_1001', 't_01_2025-2_02-1_3_1001', 't_01_2025-2_02-1_4_1001', 't_01_2025-2_02-2_7_1001', 't_01_2025-2_09-1_2_2041', 't_01_2025-2_09-1_3_2041', 't_01_2025-2_09-1_4_2041', 't_01_2025-2_14-1_2_1001', 't_01_2025-2_14-1_3_1001', 't_01_2025-2_14-2_4_1001', 't_01_2025-2_14-2_5_1001', 't_01_2026-0_09-1_2_2041', 't_01_2026-0_09-1_3_2041', 't_01_2026-0_09-1_4_2041', 't_01_2026-0_13-1_4_1001', 't_01_2026-0_13-1_5_1001', 't_01_2026-0_13-1_6_1001', 't_01_2026-0_16-1_1_1001', 't_01_2026-1_01-7_1_4001', 't_01_2026-1_08-2_3_2011', 't_01_2026-1_08-2_6_2011', 't_01_2026-1_10-1_6_2011', 't_01_2026-1_11-1_1_2011', 't_01_2026-1_14-1_1_3021', 't_01_2026-1_14-1_1_3031', 't_01_2026-1_14-2_1_2041', 't_01_2026-1_14-2_2_2041', 't_01_2026-1_14-2_3_2041', 't_01_2026-1_15-1_2_2011', 't_01_2026-1_16-1_1_2011', 't_01_2026-1_16-2_1_2011', 't_02_2025-2_03-5_1_2041', 't_04_2026-0_15-2_1_2011', 't_04_2026-0_15-2_2_2011', 't_04_2026-0_15-2_3_2011']`  ПКАП |
| `CONTEST_DATE` | строка | 19711/19711 | 19 | `['2025-03-05', '2025-04-01', '2025-07-14', '2025-12-07', '2025-12-09', '2025-12-14', '2025-12-16', '2025-12-18', '2025-12-24', '2025-12-31', '2026-01-26', '2026-02-05', '2026-02-20', '2026-02-27', '2026-03-08', '2026-03-11', '2026-03-12', '2026-03-13', '2026-03-17']` |
| `PLAN_VALUE` | число (строкой в CSV) | 19711/19711 | 11 | `['0.00000', '1.00000', '2.00000', '3.00000', '5.00000', '10.00000', '50.00000', '300000.00000', '500000.00000', '10000000.00000', '1000000000.00000']` |
| `FACT_VALUE` | число (строкой в CSV) | 19711/19711 | 9237 | **высокая кардинальность** (9237 уник.); примеры: `['0.00000', '0.00952', '0.01031', '0.01124', '0.01493', '0.01667', '0.01905', '0.01961', '0.02000', '0.02062', '0.02174', '0.02247', '0.02564', '0.02857', '0.02985']` |
| `priority_type` | целое (строкой в CSV) | 19711/19711 | 1 | `['1']` |

\* Уникальных по непустым значениям; для длинных текстов перечисление ограничено.

<a id="reward-link-prom-18-03-v0"></a>

## Файл: `REWARD-LINK (PROM) 18-03 v0.csv`

- **Путь:** `IN/SPOD/REWARD-LINK (PROM) 18-03 v0.csv`
- **Строк данных:** 598 (без учёта заголовка)
- **Разделитель:** `;`, кодировка UTF-8
- **Колонок:** 3

### Краткое назначение колонок

| Колонка | Назначение |
|---------|------------|
| `CONTEST_CODE` | Код конкурса (ссылка на `CONTEST.CONTEST_CODE`).  ПКАП |
| `GROUP_CODE` | Код уровня конкурса (`BANK`/`TB`/`GOSB`/`GROUPING`).  ПКАП |
| `REWARD_CODE` | Код награды (ссылка на `REWARD.REWARD_CODE`) для указанной связки конкурса и уровня.  ПКАП |

### Плоские колонки (статистика значений)

| Колонка | Тип (оценка) | Непустых | Уникальных* | Варианты / комментарий |
|---------|--------------|----------|-------------|-------------------------|
| `CONTEST_CODE` | строка | 598/598 | 338 | **высокая кардинальность** (338 уник.); примеры: `['CONTEST_00', 'CONTEST_01', 'CONTEST_02', 'CONTEST_03', 'CONTEST_04', 'CONTEST_05', 'CONTEST_06', 'CONTEST_07', 'CONTEST_11', 'CONTEST_12', 'CONTEST_13', 'CONTEST_14', 'CONTEST_15', 'CONTEST_16', 'CONTEST_17']`  ПКАП |
| `GROUP_CODE` | строка | 598/598 | 4 | `['TB', 'BANK', 'GOSB', 'GROUPING']`  ПКАП |
| `REWARD_CODE` | строка | 598/598 | 598 | **высокая кардинальность** (598 уник.); примеры: `['ITEM_01', 'ITEM_02', 'ITEM_03', 'ITEM_04', 'ITEM_05', 'ITEM_06', 'ITEM_07', 'ITEM_08', 'ITEM_09', 'ITEM_10', 'ITEM_11', 'ITEM_12', 'ITEM_13', 'ITEM_14', 'LABEL_01']`  ПКАП |

\* Уникальных по непустым значениям; для длинных текстов перечисление ограничено.

<a id="schedule-prom-18-03-v0"></a>

## Файл: `SCHEDULE (PROM) 18-03 v0.csv`

- **Путь:** `IN/SPOD/SCHEDULE (PROM) 18-03 v0.csv`
- **Строк данных:** 579 (без учёта заголовка)
- **Разделитель:** `;`, кодировка UTF-8
- **Колонок:** 15

### Краткое назначение колонок

| Колонка | Назначение |
|---------|------------|
| `TOURNAMENT_CODE` | Уникальный код турнира/периода в конкурсе.  ПКАП |
| `PERIOD_TYPE` | Тип периодичности турнира (месяц/квартал/произвольный и т.п.).  ПКАП |
| `START_DT` | Дата начала основного периода турнира.  ПКАП |
| `END_DT` | Дата окончания основного периода турнира.  ПКАП |
| `RESULT_DT` | Дата подведения/публикации итогов турнира.  ПКАП |
| `PLAN_PERIOD_START_DT` | Начало планового периода для сравнения/оценки роста.  ПКАП |
| `PLAN_PERIOD_END_DT` | Конец планового периода для сравнения/оценки роста.  ПКАП |
| `CRITERION_MARK_TYPE` | Оператор критерия допуска участника: `>=`, `>`, `=`, `<=`, `<`, `<>`, либо пусто.  ПКАП |
| `CRITERION_MARK_VALUE` | Пороговое значение критерия допуска участника.  ПКАП |
| `FILTER_PERIOD_ARR` | JSON дополнительных периодов и критериев (`period_code`, даты, пороги). |
| `TOURNAMENT_STATUS` | Статус турнира (`АКТИВНЫЙ`, `ЗАВЕРШЕН`, `ОТМЕНЕН`, и др.).  ПКАП |
| `CONTEST_CODE` | Код родительского конкурса (ссылка на `CONTEST`).  ПКАП |
| `TARGET_TYPE` | JSON с параметрами цели турнира (в т.ч. `seasonCode`); см. разбор ниже.  ПКАП |
| `CALC_TYPE` | Тип расчёта турнира (промышленный/ручной, код).  ПКАП |
| `TRN_INDICATOR_FILTER` | Дополнительный фильтр индикаторов турнира (в текущей выборке пусто). |

### Плоские колонки (статистика значений)

| Колонка | Тип (оценка) | Непустых | Уникальных* | Варианты / комментарий |
|---------|--------------|----------|-------------|-------------------------|
| `TOURNAMENT_CODE` | строка | 579/579 | 579 | **высокая кардинальность** (579 уник.); примеры: `['TOURNAMENT_01_01', 'TOURNAMENT_02_01', 'TOURNAMENT_03_01', 'TOURNAMENT_04_01', 'TOURNAMENT_05_01', 'TOURNAMENT_05_02', 'TOURNAMENT_05_03', 'TOURNAMENT_05_04', 'TOURNAMENT_05_05', 'TOURNAMENT_05_06', 'TOURNAMENT_06_01', 'TOURNAMENT_06_02', 'TOURNAMENT_06_03', 'TOURNAMENT_06_04', 'TOURNAMENT_06_05']`  ПКАП |
| `PERIOD_TYPE` | строка | 579/579 | 29 | `['март-июль', 'турнир мая', '1 полугодие', 'турнир года', 'турнир июля', 'турнир июня', 'произвольный', 'турнир марта', 'турнир апреля', 'турнир месяца', 'турнир ноября', 'турнир января', 'турнир августа', 'турнир декабря', 'турнир октября', 'турнир февраля', 'турнир 2 месяца', 'турнир 2 недели', 'турнир 3 месяца', 'турнир 3 недели', 'турнир 4 месяца', 'турнир квартала', 'турнир сентября', 'турнир 1 квартала', 'турнир 2 квартала', 'турнир 3 квартала', 'турнир 4 квартала', 'турнир 1 полугодия', 'турнир 2 полугодия']`  ПКАП |
| `START_DT` | строка | 579/579 | 47 | `['2023-01-01', '2023-07-01', '2023-08-01', '2023-09-01', '2023-10-01', '2023-11-01', '2023-12-01', '2024-01-01', '2024-02-01', '2024-02-05', '2024-02-12', '2024-02-26', '2024-03-01', '2024-03-04', '2024-03-11', '2024-03-25', '2024-04-01', '2024-04-22', '2024-04-25', '2024-04-27', '2024-05-01', '2024-05-13', '2024-05-27', '2024-06-01', '2024-06-10', '2024-07-01', '2024-08-01', '2024-09-01', '2024-10-01', '2024-11-01', '2024-12-01', '2025-01-01', '2025-02-01', '2025-03-01', '2025-04-01', '2025-05-01', '2025-06-01', '2025-07-01', '2025-08-01', '2025-09-01', '2025-10-01', '2025-11-01', '2025-12-01', '2026-01-01', '2026-02-01', '2026-03-01', '2026-04-01']`  ПКАП |
| `END_DT` | строка | 579/579 | 53 | `['2023-06-30', '2023-07-31', '2023-08-31', '2023-09-30', '2023-10-31', '2023-11-30', '2023-12-31', '2024-01-31', '2024-02-18', '2024-02-25', '2024-02-29', '2024-03-10', '2024-03-24', '2024-03-31', '2024-04-07', '2024-04-30', '2024-05-12', '2024-05-26', '2024-05-31', '2024-06-09', '2024-06-23', '2024-06-30', '2024-07-29', '2024-07-31', '2024-08-26', '2024-08-31', '2024-09-30', '2024-10-31', '2024-11-01', '2024-11-30', '2024-12-24', '2024-12-31', '2025-01-01', '2025-02-28', '2025-03-31', '2025-04-30', '2025-05-28', '2025-05-31', '2025-06-02', '2025-06-30', '2025-07-31', '2025-08-31', '2025-09-30', '2025-10-31', '2025-11-16', '2025-11-30', '2025-12-20', '2025-12-31', '2026-02-28', '2026-03-31', '2026-06-30', '2026-12-31', '4000-01-01']`  ПКАП |
| `RESULT_DT` | строка | 560/579 | 140 | **высокая кардинальность** (140 уник.); примеры: `['2023-08-31', '2023-09-04', '2023-10-07', '2023-10-10', '2023-11-13', '2023-12-13', '2023-12-14', '2023-12-29', '2024-01-15', '2024-01-24', '2024-01-30', '2024-02-14', '2024-02-20', '2024-02-22', '2024-03-01']`  ПКАП |
| `PLAN_PERIOD_START_DT` | строка | 124/579 | 17 | `['2023-06-01', '2023-07-01', '2023-08-01', '2023-09-01', '2023-10-01', '2023-11-01', '2023-12-01', '2024-01-01', '2024-02-01', '2024-03-01', '2024-04-01', '2024-05-01', '2024-06-01', '2024-07-01', '2024-08-01', '2024-09-01', '2024-10-01']`  ПКАП |
| `PLAN_PERIOD_END_DT` | строка | 124/579 | 16 | `['2023-06-30', '2023-07-31', '2023-08-31', '2023-09-30', '2023-10-31', '2023-11-30', '2023-12-31', '2024-02-29', '2024-03-31', '2024-04-30', '2024-05-31', '2024-06-30', '2024-07-31', '2024-08-31', '2024-09-30', '2024-10-31']`  ПКАП |
| `CRITERION_MARK_TYPE` | строка | 40/579 | 2 | выгрузка: `['>', '>=']`; в `config.json` доступны `>=`, `>`, `=`, `<=`, `<`, `<>` и пусто (с label).  ПКАП |
| `CRITERION_MARK_VALUE` | целое (строкой в CSV) | 40/579 | 2 | `['0', '50000']`  ПКАП |
| `FILTER_PERIOD_ARR` | строка | 56/579 | 38 | `['[{"period_code""": 1, """start_dt""":"""2024-01-01""", """end_dt""":"""2024-12-31"""}]"', '[{"period_code""": 1, """start_dt""":"""2025-01-01""", """end_dt""":"""2025-01-01"""}]"', '[{"period_code""": 1, """start_dt""": """2025-02-01""" , """end_dt""": """2025-02-28"""}]"', '[{"period_code""": 1, """start_dt""": """2025-03-01""" , """end_dt""": """2025-03-31"""}]"', '[{"period_code""": 1, """start_dt""": """2025-04-01""" , """end_dt""": """2025-04-30"""}]"', '[{"period_code""": 1, """start_dt""": """2025-05-01""" , """end_dt""": """2025-05-31"""}]"', '[{"period_code""": 1, """start_dt""": """2025-06-01""" , """end_dt""": """2025-06-30"""}]"', '[{"period_code""": 1, """start_dt""": """2025-07-01""" , """end_dt""": """2025-07-31"""}]"', '[{"period_code""": 1, """start_dt""": """2025-08-01""" , """end_dt""": """2025-08-31"""}]"', '[{"period_code""": 1, """start_dt""": """2025-09-01""" , """end_dt""": """2025-09-30"""}]"', '[{"period_code""": 1, """start_dt""": """2025-10-01""" , """end_dt""": """2025-10-31"""}]"', '[{"period_code""": 1, """start_dt""": """2025-11-01""" , """end_dt""": """2025-11-30"""}]"', '[{"period_code""": 1, """start_dt""": """2026-01-01""" , """end_dt""": """2026-01-31"""}]"', '[{"period_code""": 1, """start_dt""": """2026-02-01""" , """end_dt""": """2026-02-28"""}]"', '[{"period_code": 1, "criterion_mark_type": ">=", "criterion_mark_value": 0, "start_dt":"2025-01-01", "end_dt":"2025-01-31"}]', '[{"period_code": 1, "criterion_mark_type": ">=", "criterion_mark_value": 0, "start_dt":"2025-02-01", "end_dt":"2025-02-28"}]', '[{"period_code": 0, "criterion_mark_type": ">", "criterion_mark_value": 0, "start_dt": "2023-06-01" , "end_dt": "2023-06-30"}]', '[{"period_code": 1, "criterion_mark_type": ">", "criterion_mark_value": 0, "start_dt": "2023-06-01" , "end_dt": "2023-06-30"}]', '[{"period_code": 1, "criterion_mark_type": ">", "criterion_mark_value": 0, "start_dt": "2023-07-01" , "end_dt": "2023-07-31"}]', '[{"period_code": 1, "criterion_mark_type": ">", "criterion_mark_value": 0, "start_dt": "2023-08-01" , "end_dt": "2023-08-31"}]', '[{"period_code": 1, "criterion_mark_type": ">", "criterion_mark_value": 0, "start_dt": "2023-09-01" , "end_dt": "2023-09-30"}]', '[{"period_code": 1, "criterion_mark_type": ">", "criterion_mark_value": 0, "start_dt": "2023-10-01" , "end_dt": "2023-10-31"}]', '[{"period_code": 1, "criterion_mark_type": ">", "criterion_mark_value": 0, "start_dt": "2023-11-01" , "end_dt": "2023-11-30"}]', '[{"period_code": 1, "criterion_mark_type": ">", "criterion_mark_value": 0, "start_dt": "2023-12-01" , "end_dt": "2023-12-31"}]', '[{"period_code": 1, "criterion_mark_type": ">", "criterion_mark_value": 0, "start_dt": "2024-02-01" , "end_dt": "2024-02-29"}]', '[{"period_code": 1, "criterion_mark_type": ">", "criterion_mark_value": 0, "start_dt": "2024-03-01" , "end_dt": "2024-03-31"}]', '[{"period_code": 1, "criterion_mark_type": ">", "criterion_mark_value": 0, "start_dt": "2024-04-01" , "end_dt": "2024-04-30"}]', '[{"period_code": 1, "criterion_mark_type": ">", "criterion_mark_value": 0, "start_dt": "2024-05-01" , "end_dt": "2024-05-31"}]', '[{"period_code": 1, "criterion_mark_type": ">", "criterion_mark_value": 0, "start_dt": "2024-06-01" , "end_dt": "2024-06-30"}]', '[{"period_code": 1, "criterion_mark_type": ">", "criterion_mark_value": 0, "start_dt": "2024-07-01" , "end_dt": "2024-07-31"}]', '[{"period_code": 1, "criterion_mark_type": ">", "criterion_mark_value": 0, "start_dt": "2024-08-01" , "end_dt": "2024-08-31"}]', '[{"period_code": 1, "criterion_mark_type": ">", "criterion_mark_value": 0, "start_dt": "2024-09-01" , "end_dt": "2024-09-30"}]', '[{"period_code": 1, "criterion_mark_type": ">", "criterion_mark_value": 0, "start_dt": "2024-10-01" , "end_dt": "2024-10-31"}]', '[{"period_code""": 1, """criterion_mark_type""": """>""", """criterion_mark_value""": 0, """start_dt""": """2025-01-01""" , """end_dt""": """2025-01-31"""}]"', '[{"period_code""": 1, """criterion_mark_type""": """>""", """criterion_mark_value""": 0, """start_dt""": """2025-02-01""" , """end_dt""": """2025-02-28"""}]"', '[{"period_code""": 1, """criterion_mark_type""": """>""", """criterion_mark_value""": 0, """start_dt""": """2025-03-01""" , """end_dt""": """2025-03-31"""}]"', '[{"period_code""": 1, """criterion_mark_type""": """>""", """criterion_mark_value""": 0, """start_dt""": """2025-04-01""" , """end_dt""": """2025-04-30"""}]"', '[{"period_code""": 1, """criterion_mark_type""": """>""", """criterion_mark_value""": 0, """start_dt""": """2025-05-01""" , """end_dt""": """2025-05-31"""}]"']` |
| `TOURNAMENT_STATUS` | строка | 579/579 | 5 | `['УДАЛЕН', 'ОТМЕНЕН', 'АКТИВНЫЙ', 'ЗАВЕРШЕН', 'ПОДВЕДЕНИЕ ИТОГОВ']`  ПКАП |
| `CONTEST_CODE` | строка | 579/579 | 316 | **высокая кардинальность** (316 уник.); примеры: `['CONTEST_01', 'CONTEST_02', 'CONTEST_03', 'CONTEST_04', 'CONTEST_05', 'CONTEST_06', 'CONTEST_07', 'CONTEST_11', 'CONTEST_12', 'CONTEST_13', 'CONTEST_14', 'CONTEST_15', 'CONTEST_16', 'CONTEST_17', 'CONTEST_20']`  ПКАП |
| `TARGET_TYPE` | строка | 527/579 | 17 | `['{"""seasonCode""": """"""}', '{"""seasonCode""": """NON"""}', '{"""seasonCode""": """SEASON_2024"""}', '{"""seasonCode""": """SEASON_2025_1"""}', '{"""seasonCode""": """SEASON_2025_2"""}', '{"""seasonCode""": """SEASON_2026_1"""}', '{"""seasonCode""": """SEASON_f_2025"""}', '{"""seasonCode""": """SEASON_f_2026"""}', '{"""seasonCode""": """SEASON_m_2024"""}', '{"""seasonCode""": """SEASON_s_2024"""}', '{"""seasonCode""": """SEASON_s_2025"""}', '{"""seasonCode""": """SEASON_m_2025_1"""}', '{"""seasonCode""": """SEASON_m_2025_2"""}', '{"""seasonCode""": """SEASON_imub_2025"""}', '{"""seasonCode""": """SEASON_rnub_2025"""}', '{"""seasonCode""": """SEASON_rsb1_2025"""}', '{"""seasonCode""": """SEASON_kmsb1_2025"""}']`  ПКАП |
| `CALC_TYPE` | целое (строкой в CSV) | 579/579 | 2 | `['0', '1']`  ПКАП |
| `TRN_INDICATOR_FILTER` | пусто | 0/579 | 0 | все пусто |

\* Уникальных по непустым значениям; для длинных текстов перечисление ограничено.

### JSON: колонка `TARGET_TYPE`

Предобработка: тройные кавычки в CSV → обычные `"`, затем `json.loads`. Учитываются только значения с корнем **object** или **array**; распарсено **527** ячеек из 579 строк.

- `TARGET_TYPE`
  - `seasonCode`

##### Листья и узлы — `TARGET_TYPE`

- **`TARGET_TYPE`** — в 527 JSON; типы: `{'object': 527}`
- **`TARGET_TYPE.seasonCode`** — в 527 JSON; типы: `{'string': 527}`; примеры строк: `['', 'NON', 'SEASON_2024', 'SEASON_2025_1', 'SEASON_2025_2', 'SEASON_2026_1', 'SEASON_f_2025', 'SEASON_f_2026', 'SEASON_m_2024', 'SEASON_s_2024', 'SEASON_s_2025', 'SEASON_m_2025_1', 'SEASON_m_2025_2', 'SEASON_imub_2025', 'SEASON_rnub_2025', 'SEASON_rsb1_2025', 'SEASON_kmsb1_2025']`

### JSON: колонка `FILTER_PERIOD_ARR`

Предобработка: тройные кавычки в CSV → обычные `"`, затем `json.loads`. Учитываются только значения с корнем **object** или **array**; распарсено **23** ячеек из 579 строк.

- `FILTER_PERIOD_ARR`
- `FILTER_PERIOD_ARR[]`
  - `criterion_mark_type`
  - `criterion_mark_value`
  - `end_dt`
  - `period_code`
  - `start_dt`

##### Листья и узлы — `FILTER_PERIOD_ARR`

- **`FILTER_PERIOD_ARR`** — в 23 JSON; типы: `{'array': 23}`; длина массива: min=1, max=1
- **`FILTER_PERIOD_ARR[]`** — в 23 JSON; типы: `{'object': 23}`
- **`FILTER_PERIOD_ARR[].criterion_mark_type`** — в 23 JSON; типы: `{'string': 23}`; примеры строк: `['>', '>=']`
- **`FILTER_PERIOD_ARR[].criterion_mark_value`** — в 23 JSON; типы: `{'integer': 23}`; числа (примеры): ['0']
- **`FILTER_PERIOD_ARR[].end_dt`** — в 23 JSON; типы: `{'string': 23}`; примеры строк: `['2023-06-30', '2023-07-31', '2023-08-31', '2023-09-30', '2023-10-31', '2023-11-30', '2023-12-31', '2024-02-29', '2024-03-31', '2024-04-30', '2024-05-31', '2024-06-30', '2024-07-31', '2024-08-31', '2024-09-30', '2024-10-31', '2025-01-31', '2025-02-28']`
- **`FILTER_PERIOD_ARR[].period_code`** — в 23 JSON; типы: `{'integer': 23}`; числа (примеры): ['0', '1']
- **`FILTER_PERIOD_ARR[].start_dt`** — в 23 JSON; типы: `{'string': 23}`; примеры строк: `['2023-06-01', '2023-07-01', '2023-08-01', '2023-09-01', '2023-10-01', '2023-11-01', '2023-12-01', '2024-02-01', '2024-03-01', '2024-04-01', '2024-05-01', '2024-06-01', '2024-07-01', '2024-08-01', '2024-09-01', '2024-10-01', '2025-01-01', '2025-02-01']`

<a id="user-role-prom-13-03-v0"></a>

## Файл: `USER_ROLE (PROM) 13-03 v0.csv`

- **Путь:** `IN/SPOD/USER_ROLE (PROM) 13-03 v0.csv`
- **Строк данных:** 197 (без учёта заголовка)
- **Разделитель:** `;`, кодировка UTF-8
- **Колонок:** 13

### Краткое назначение колонок

| Колонка | Назначение |
|---------|------------|
| `RULE_NUM` | Номер правила роли. |
| `ROLE_CODE` | Код роли. |
| `ROLE_NAME` | Наименование роли. |
| `PERSON_NUMBER_ARR` | Список табельных номеров (JSON-массив или строка). |
| `STAGE_ETALONE_CODE_ARR` | Коды этапов (массив). |
| `POST_ETALONE_CODE_ARR` | Коды должностей/постов. |
| `DIV_CODE_ARR` | Коды подразделений. |
| `EXCLUDE_DIV_CODE_ARR` | Исключаемые коды подразделений. |
| `BUSINESS_BLOCK` | Бизнес-блок действия правила.  ПКАП |
| `UCH_CODE` | Код участка. |
| `ORG_UNIT_CODE` | Код оргподразделения. |
| `TB_CODE` | Код ТБ. |
| `GOSB_CODE` | Код ГОСБ. |

### Плоские колонки (статистика значений)

| Колонка | Тип (оценка) | Непустых | Уникальных* | Варианты / комментарий |
|---------|--------------|----------|-------------|-------------------------|
| `RULE_NUM` | целое (строкой в CSV) | 197/197 | 197 | **высокая кардинальность** (197 уник.); примеры: `['102131001', '102161001', '102181001', '102381381', '102381382', '102381383', '102381384', '102381385', '102381386', '102401001', '102421001', '102441001', '102521001', '102521002', '102541001']` |
| `ROLE_CODE` | строка | 197/197 | 40 | `['GMNS', 'CA_B2C', 'KI_KIB', 'KM_MNS', 'KM_SB1', 'SB_TOP', 'DRKB_CA', 'KIB_TOP', 'KM_KKSB', 'PRED_TB', 'RUK_MNS', 'RUK_NUB', 'RUK_SB1', 'AKM_KKSB', 'CA_OTHER', 'RUK_CPKK', 'UPR_GOSB', 'DTAAS_CSM', 'CA_B2C_TOP', 'GAME_ADMIN', 'INV_MR_SB1', 'MP_TB_KKSB', 'MR_SERVICE', 'DRKB_CA_TOP', 'TB_B2C_LOOK', 'KM_FAKTORING', 'RUK_KPK_KKSB', 'RUK_SB1_LOOK', 'OTHER_NOT_UCH', 'RUK_DTAAS_CSM', 'FAKTORING_LOOK', 'OTHER_B2C_LOOK', 'RUK_N_UPR_KKSB', 'SERVICEMEN_LOOK', 'ZAM_PRED_TB_KIB', 'ZAM_UPR_GOSB_KIB', 'RUK_FAKTORING_TOP', 'ZAM_PRED_TB_RB_SP', 'RUK_SERVICEMEN_TOP', 'ZAM_UPR_GOSB_OTHER']` |
| `ROLE_NAME` | строка | 197/197 | 195 | **высокая кардинальность** (195 уник.); примеры: `['КМ Факторинга', 'Сотрудники ЦА', 'Председатель ТБ', 'Руководство КИБ', 'Руководство ЦПКК', 'Управляющий ГОСБ', 'Сотрудник ДРКБ ЦА', 'Менеджер по сервису', 'Менеджер проекта ТБ', 'Руководитель DTaaS в ТБ', 'Сотрудник ДРКБ ЦА (ТОП)', 'Наблюдатель от Факторинга', 'Сотрудники ЦА B2C Розница', 'Руководитель ТОП Факторинг', 'Кредитный инспектор (по ТН)']` |
| `PERSON_NUMBER_ARR` | строка | 22/197 | 22 | `['[00035080]', '[00399098]', '[01335082]', '[01700680]', '[01729301]', '[01811697]', '[00013701, 01839748]', '[00459480, 01511227]', '[00673892, 01340230]', '[00706433, 00932239]', '[00956864, 00031436]', '[01343404, 01815602]', '[1000000483, 999036748]', '[999012014, 1000000202]', '[1000001058, 1000001125, 999089501, 999086770]', '[00964794, 02159541, 02159584, 02164804, 00402780]', '[01810861, 01724398, 00442417, 01809912, 00642554]', '[00377803, 01436313, 00390531, 01639579, 00360165, 01476482]', '[00860322, 01783787, 01811892, 01991929, 01501054, 01737337, 00360691]', '[00682262, 02094104, 00684147, 00687532, 00701809, 01373780, 01324585, 00691228, 00705008]', '[01669912, 01715569, 00284871, 01082511, 00340417, 01665393, 00354252, 00297138, 01040092, 01235690, 00043992]', '[01363292, 01862827, 01552023, 00011297, 00332420, 01543299, 00461998, 01590955, 00873796, 00399098, 00884940, 00390031, 00025355, 01759223, 00124904]']` |
| `STAGE_ETALONE_CODE_ARR` | строка | 8/197 | 8 | `['[34635056]', '[34635433]', '[34635667]', '[34635682]', '[34635686]', '[34635738]', '[35243612, 35244584, 35245003, 35241422, 35243754, 35244656, 35484769, 35244931, 35240388, 35236045, 35244402]', '[35245001, 34453507, 34453514, 35243617, 35243622, 35244632, 35244627, 33622228, 35244638, 35244635, 33763354, 34238032, 35244355, 35140717, 34237575, 35244359, 32518258, 35244358, 31850274, 35244553, 32532637, 35263869, 32494382, 32544141, 32582575, 35244225, 35457582, 34228638, 35244229, 34227762, 34850999, 34850994, 34227292, 34227305, 35244407, 34254474, 35244411, 34250691, 35244413, 35243966, 34564634, 34564637, 34263140, 34264732, 35243758, 34564631, 34838994, 34564630, 34264429, 34263142, 34838987, 34263149, 34839032, 35236446, 35042937, 35236440, 35236432, 35255706, 35047163, 35116306, 34614214, 34613436, 34213687, 34610923, 34216396, 34214975, 34102864, 35440425, 33201185, 35175323, 35175186, 35236396, 35244925, 35244757, 35244760, 35244929, 35236392]']` |
| `POST_ETALONE_CODE_ARR` | строка | 175/197 | 28 | `['[20000054]', '[20000070]', '[20000082]', '[20000255]', '[20000282]', '[20000435]', '[20000456]', '[20008477]', '[20012580]', '[20013927]', '[20000012, 20000013]', '[20000054, 20013926]', '[20000082, 20000108]', '[20000282, 20000157]', '[20000454, 20000015]', '[20000468, 20000017]', '[20003301, 20004105]', '[20008479, 20008478]', '[20012581, 20013283]', '[20000082, 20000108, 20004560]', '[20000326, 20000156, 20006376]', '[20000460, 20000193, 20011553]', '[20000726, 20000727, 20000195]', '[20000295, 20003328, 20006776, 20002967]', '[20009532, 20009545, 20002904, 20003713]', '[20005201, 20000106, 20001828, 20000054, 20003328]', '[20010577, 20006026, 20009052, 20009051, 20012734, 20012301, 20010601, 20010576, 20009101, 20000627, 20015451, 20015452, 20015453, 20014777]', '[20000007, 20000008, 20008702, 20012703, 20000010, 20007930, 20000009, 20006426, 20011126, 20000952, 20004056, 20014077, 20010076, 20011752, 20014076, 20011676, 20014426]']` |
| `DIV_CODE_ARR` | строка | 184/197 | 59 | **длинный текст**, до 1730 симв.; примеры (обрезка): `['[10241967]', '[10242114]', '[10242078]', '[10240714]', '[10241463]', '[10241962]', '[10293924]', '[10293489]']`; всего **59** уникальных |
| `EXCLUDE_DIV_CODE_ARR` | строка | 2/197 | 1 | `['[10323500]']` |
| `BUSINESS_BLOCK` | строка | 197/197 | 8 | `['MNS', 'IMUB', 'RNUB', 'RSB1', 'KMSB1', 'KMKKSB', 'SERVICEMEN', 'KMFACTORING']`  ПКАП |
| `UCH_CODE` | целое (строкой в CSV) | 197/197 | 4 | `['0', '1', '2', '3']` |
| `ORG_UNIT_CODE` | целое (строкой в CSV) | 122/197 | 28 | `['10000360', '10000367', '10016678', '10086553', '10086573', '10156582', '10182580', '10182581', '10182582', '10182583', '10240714', '10241463', '10241962', '10241967', '10242078', '10242114', '10290247', '10293489', '10293924', '10295424', '10295859', '10295911', '10296390', '10298976', '10299006', '10300825', '10337151', '10353225']` |
| `TB_CODE` | целое (строкой в CSV) | 3/197 | 1 | `['101']` |
| `GOSB_CODE` | целое (строкой в CSV) | 18/197 | 1 | `['0']` |

\* Уникальных по непустым значениям; для длинных текстов перечисление ограничено.

### JSON: колонка `PERSON_NUMBER_ARR`

Предобработка: тройные кавычки в CSV → обычные `"`, затем `json.loads`. Учитываются только значения с корнем **object** или **array**; распарсено **3** ячеек из 197 строк.

- `PERSON_NUMBER_ARR`
- `PERSON_NUMBER_ARR[]`

##### Листья и узлы — `PERSON_NUMBER_ARR`

- **`PERSON_NUMBER_ARR`** — в 3 JSON; типы: `{'array': 3}`; длина массива: min=2, max=4
- **`PERSON_NUMBER_ARR[]`** — в 3 JSON; типы: `{'integer': 8}`; числа (примеры): ['999012014', '999036748', '999086770', '999089501', '1000000202', '1000000483', '1000001058', '1000001125']

### JSON: колонка `STAGE_ETALONE_CODE_ARR`

Предобработка: тройные кавычки в CSV → обычные `"`, затем `json.loads`. Учитываются только значения с корнем **object** или **array**; распарсено **8** ячеек из 197 строк.

- `STAGE_ETALONE_CODE_ARR`
- `STAGE_ETALONE_CODE_ARR[]`

##### Листья и узлы — `STAGE_ETALONE_CODE_ARR`

- **`STAGE_ETALONE_CODE_ARR`** — в 8 JSON; типы: `{'array': 8}`; длина массива: min=1, max=77
- **`STAGE_ETALONE_CODE_ARR[]`** — в 8 JSON; типы: `{'integer': 94}`; числа (примеры): ['31850274', '32494382', '32518258', '32532637', '32544141', '32582575', '33622228', '33763354', '34227292', '34227305', '34227762', '34228638', '34237575', '34238032', '34250691', '34254474', '34263140', '34264732', '34453507', '34453514', '34564634', '34564637', '34635056', '34635433', '34635667']

### JSON: колонка `POST_ETALONE_CODE_ARR`

Предобработка: тройные кавычки в CSV → обычные `"`, затем `json.loads`. Учитываются только значения с корнем **object** или **array**; распарсено **175** ячеек из 197 строк.

- `POST_ETALONE_CODE_ARR`
- `POST_ETALONE_CODE_ARR[]`

##### Листья и узлы — `POST_ETALONE_CODE_ARR`

- **`POST_ETALONE_CODE_ARR`** — в 175 JSON; типы: `{'array': 175}`; длина массива: min=1, max=17
- **`POST_ETALONE_CODE_ARR[]`** — в 175 JSON; типы: `{'integer': 581}`; числа (примеры): ['20000007', '20000008', '20000009', '20000010', '20000012', '20000013', '20000015', '20000017', '20000054', '20000070', '20000082', '20000106', '20000108', '20000156', '20000157', '20000193', '20000195', '20000255', '20000282', '20000295', '20000326', '20000435', '20000454', '20000456', '20000460']

### JSON: колонка `DIV_CODE_ARR`

Предобработка: тройные кавычки в CSV → обычные `"`, затем `json.loads`. Учитываются только значения с корнем **object** или **array**; распарсено **184** ячеек из 197 строк.

- `DIV_CODE_ARR`
- `DIV_CODE_ARR[]`

##### Листья и узлы — `DIV_CODE_ARR`

- **`DIV_CODE_ARR`** — в 184 JSON; типы: `{'array': 184}`; длина массива: min=1, max=173
- **`DIV_CODE_ARR[]`** — в 184 JSON; типы: `{'integer': 1420}`; числа (примеры): ['10000360', '10000367', '10001214', '10016438', '10016441', '10016443', '10016445', '10016449', '10016678', '10037179', '10038020', '10086568', '10101758', '10108866', '10158108', '10162480', '10167595', '10174916', '10177884', '10178650', '10178847', '10189369', '10189453', '10189534', '10189671']

### JSON: колонка `EXCLUDE_DIV_CODE_ARR`

Предобработка: тройные кавычки в CSV → обычные `"`, затем `json.loads`. Учитываются только значения с корнем **object** или **array**; распарсено **2** ячеек из 197 строк.

- `EXCLUDE_DIV_CODE_ARR`
- `EXCLUDE_DIV_CODE_ARR[]`

##### Листья и узлы — `EXCLUDE_DIV_CODE_ARR`

- **`EXCLUDE_DIV_CODE_ARR`** — в 2 JSON; типы: `{'array': 2}`; длина массива: min=1, max=1
- **`EXCLUDE_DIV_CODE_ARR[]`** — в 2 JSON; типы: `{'integer': 2}`; числа (примеры): ['10323500']

---

## Мета

- **Дата сборки каталога:** 2026-03-24
- **Источник данных:** файлы в `IN/SPOD/` на момент запуска `build_spod_input_catalog.py`.
- **Глоссарии JSON:** `src/Tools/catalog_glossary/` (правки вручную при необходимости).
- **Примеры JSON:** `Docs/JSON/examples/` — по одному файлу на каждую выгрузку из `export_spod_json_examples.py` (структура `columns` + `rows`; вложенный JSON в ячейках как в каталоге).
- **Актуализация описаний (2026-04-18):** уточнены связи и терминология по материалам HDP/contestscheme (`CONTEST` ↔ `REWARD-LINK` ↔ `REWARD`, роли `INDICATOR`, `TOURNAMENT-SCHEDULE`).
