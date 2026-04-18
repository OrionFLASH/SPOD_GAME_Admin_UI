# План нормализации `paths` в `editor_field_ui`

Статус: **выполнено**. План реализован в `config.json` (блок `editor_field_ui`) для `CONTEST_FEATURE`, `REWARD_ADD_DATA`, `FILTER_PERIOD_ARR`, `INDICATOR_FILTER`.

Основание:
- текущий `config.json` (`editor_field_ui`);
- `Docs/GAMIFICATION_FIELD_LABELS_PROPOSAL.md`;
- `Docs/ПКАП параметры/(GAME) [HDP] Справочники по геймификации`;
- `Docs/ПКАП параметры/contestscheme_v0.json`.

---

## 1) Объём планируемых правок

- `CONTEST_FEATURE` — `47` paths.
- `REWARD_ADD_DATA` — `101` paths.
- `FILTER_PERIOD_ARR` — `5` paths.
- `INDICATOR_FILTER` — поле без `paths`, но планируется уточнение описания структуры.

---

## 2) Цель второго прохода

Привести подписи и описания к единому стилю:

- убрать техничные метки (`feature[2]`, `itemGroupAmount[3].itemParam`, `vid`, `masking` и т.п.);
- сделать краткий `label` на русском;
- сделать `description` немного подробнее, но без перегруза;
- для массивов использовать единый паттерн: «Элемент N …», а не «raw path».

---

## 3) Правила нормализации (глобально)

1. **Label**:
   - 2–5 слов, русский, без snake_case;
   - если это элемент массива: `… (элемент N)`.

2. **Description**:
   - 1 короткое предложение про назначение;
   - если это флаг `Y/N`, явно писать бизнес-смысл (`включает/отключает`).

3. **Массивы**:
   - контейнер: «Список …»;
   - элемент: «… (элемент N)».

4. **Служебные коды**:
   - добавлять расшифровку в description (например, `AFTER/DURIN`, `AIPROMPT/TEMPLATE`).

---

## 4) `CONTEST_FEATURE`: как сейчас → как будет

### 4.1 Наиболее проблемные техничные поля

| Сейчас (path / label / description) | Планируемый вариант |
|---|---|
| `["avatarShow"]` / `avatarShow` / `avatarShow` | **label:** `Показывать аватар`  **description:** `Флаг отображения аватара участника в карточке конкурса.` |
| `["feature"]` / `feature` / `feature` | **label:** `Особенности конкурса`  **description:** `Список коротких пояснений, которые показываются участнику.` |
| `["feature", 2]` / `feature[2]` / `feature[2]` | **label:** `Особенность конкурса (элемент 3)`  **description:** `Текст дополнительной особенности конкурса.` |
| `["helpCodeList", 0]` / `helpCodeList[0]` / `helpCodeList[0]` | **label:** `Код помощи (элемент 1)`  **description:** `Код справочного блока/подсказки для UI.` |
| `["masking"]` / `masking` / `masking` | **label:** `Скрытие персональных данных`  **description:** `Флаг маскирования персональных данных в витрине конкурса.` |
| `["preferences"]` / `preferences` / `preferences` | **label:** `Преференции`  **description:** `Список дополнительных преимуществ/условий для участника.` |
| `["preferences", 1]` / `preferences[1]` / `preferences[1]` | **label:** `Преференция (элемент 2)`  **description:** `Текст конкретной преференции.` |
| `["tournamentListMailing"]` / `tournamentListMailing` / `tournamentListMailing` | **label:** `Рассылка списка участников`  **description:** `Параметры рассылки списка участников турнира.` |
| `["tournamentRewardingMailing"]` / `tournamentRewardingMailing` / `tournamentRewardingMailing` | **label:** `Рассылка о награждении`  **description:** `Параметры рассылки уведомлений о награждении.` |
| `["typeRewarding"]` / `typeRewarding` / `typeRewarding` | **label:** `Режим награждения`  **description:** `Тип выдачи наград (например, всем/одному лучшему).` |
| `["vid"]` / `Метка типа турнира` / `vid` | **label:** `Тип витрины`  **description:** `Тип витрины/режим отображения конкурса (например, ПРОМ/ТЕСТ).` |

### 4.2 Что оставить без изменений

Эти поля уже близки к целевому стилю и требуют только косметики (по ситуации):
- `accuracy`, `capacity`, `minNumber`, `momentRewarding`;
- `gosbHidden`, `gosbVisible`, `tbHidden`, `tbVisible`;
- `persomanNumberHidden`, `persomanNumberVisible`;
- `tournamentStartMailing`, `tournamentEndMailing`, `tournamentLikeMailing`, `tournamentTeam`.

---

## 5) `REWARD_ADD_DATA`: как сейчас → как будет

### 5.1 Техничные блоки, которые обязательно переименовать

| Сейчас (path / label / description) | Планируемый вариант |
|---|---|
| `["bookingRequired"]` / `bookingRequired` / `bookingRequired` | **label:** `Требуется бронирование`  **description:** `Флаг: для награды необходимо предварительное бронирование.` |
| `["deliveryRequired"]` / `deliveryRequired` / `deliveryRequired` | **label:** `Требуется доставка`  **description:** `Флаг: награда требует оформления доставки.` |
| `["fileName"]` / `fileName` / `fileName` | **label:** `Код медиа-файла`  **description:** `Идентификатор файла/ресурса награды в витрине.` |
| `["getCondition","nonRewards"]` / `getCondition.nonRewards` | **label:** `Запрещающие награды`  **description:** `Список кодов наград, при наличии которых текущая награда не выдаётся.` |
| `["getCondition","nonRewards","nonRewardCode"]` (канонический `path` в `editor_field_ui`; в JSON это `… nonRewards → <индекс> → nonRewardCode`) | **label:** `Код исключающей награды`  **description:** `Код награды-исключения из условий получения.` |
| `["getCondition","rewards"]` / `getCondition.rewards` | **label:** `Требуемые награды`  **description:** `Список наград, необходимых для получения текущей.` |
| `["getCondition","rewards","rewardCode"]` (в JSON: `… rewards → <индекс> → rewardCode`) | **label:** `Код требуемой награды`  **description:** `Код награды, которую участник должен иметь для выдачи текущей.` |
| `["getCondition","rewards","amount"]` (в JSON: `… rewards → <индекс> → amount`) | **label:** `Количество требуемых наград`  **description:** `Сколько единиц указанной награды требуется (в конфиге допустимые значения 1, 2, 3).` |
| `["ignoreConditions",10]` / `ignoreConditions[10]` / `ignoreConditions[10]` | **label:** `Табельный номер без проверки условий (элемент 11)`  **description:** `Участник, для которого ограничения выдачи не применяются.` |
| `["isGrouping"]` / `isGrouping` / `isGrouping` | **label:** `Групповая выдача`  **description:** `Флаг групповой механики выдачи награды.` |
| `["isGroupingName"]` / `isGroupingName` / `isGroupingName` | **label:** `Название группировки`  **description:** `Подпись группировки для отображения в UI.` |
| `["isGroupingTitle"]` / `isGroupingTitle` / `isGroupingTitle` | **label:** `Заголовок группировки`  **description:** `Заголовок секции группировки в интерфейсе награды.` |
| `["isGroupingTultip"]` / `isGroupingTultip` / `isGroupingTultip` | **label:** `Подсказка группировки`  **description:** `Текст подсказки для блока групповой выдачи.` |
| `["itemFeature",4]` / `itemFeature[4]` / `itemFeature[4]` | **label:** `Особенность товара (элемент 5)`  **description:** `Пояснение по характеристике награды-типа ITEM.` |
| `["itemGroupAmount","itemParam"]` (в JSON: `itemGroupAmount → <индекс> → itemParam`) | **label:** `Параметр группового лимита`  **description:** `Наименование параметра ограничения для групповой выдачи (например, месяц).` |
| `["itemGroupAmount","itemParamAmount"]` (в JSON: `itemGroupAmount → <индекс> → itemParamAmount`) | **label:** `Значение группового лимита`  **description:** `Числовое значение ограничения по выбранному параметру (ввод со сверкой по списку допустимых строк).` |
| `["itemLimitPeriod"]` / `itemLimitPeriod` / `itemLimitPeriod` | **label:** `Период лимита выдачи`  **description:** `Период, в рамках которого действует лимит количества выдач.` |
| `["masterBadge"]` / `masterBadge` / `masterBadge` | **label:** `Мастер-бейдж`  **description:** `Флаг принадлежности награды к мастер-бейджам.` |
| `["newsType"]` / `Тип новости` / `newsType` | **label:** `Тип новости`  **description:** `Формат новости о награде (например, AIPROMPT/TEMPLATE).` |
| `["nftFlg"]` / `NFT флаг` / `nftFlg` | **label:** `NFT-награда`  **description:** `Флаг NFT-формата награды.` |
| `["outstanding"]` / `Формировать новость` / `outstanding` | **label:** `Публиковать в ленте`  **description:** `Флаг публикации новости о получении награды в ленте.` |
| `["parentRewardCode"]` / `parentRewardCode` / `parentRewardCode` | **label:** `Родительская награда`  **description:** `Код родительской награды в иерархии.` |
| `["priority"]` / `priority` / `priority` | **label:** `Приоритет награды`  **description:** `Приоритет отображения/обработки награды.` |
| `["recommendationLevel"]` / `recommendationLevel` / `recommendationLevel` | **label:** `Уровень рекомендации`  **description:** `Рекомендуемый уровень применения награды (BANK/TB/GOSB/NON).` |
| `["refreshOldNews"]` / `refreshOldNews` / `refreshOldNews` | **label:** `Обновлять старые новости`  **description:** `Флаг обновления ранее созданных новостей по награде.` |
| `["rewardAgainGlobal"]` / `rewardAgainGlobal` / `rewardAgainGlobal` | **label:** `Повторная выдача (глобально)`  **description:** `Разрешение на повторное получение награды в целом.` |
| `["rewardAgainTournament"]` / `rewardAgainTournament` / `rewardAgainTournament` | **label:** `Повторная выдача (в турнире)`  **description:** `Разрешение на повторное получение награды в рамках одного турнира.` |
| `["rewardRule"]` / `rewardRule` / `rewardRule` | **label:** `Правило выдачи`  **description:** `Текстовое правило получения награды.` |
| `["seasonItem"]` / `seasonItem` / `seasonItem` | **label:** `Сезоны действия`  **description:** `Список сезонов, в которых действует награда.` |
| `["singleNews"]` / `singleNews` / `singleNews` | **label:** `Текст личной новости`  **description:** `Шаблон персональной новости о выдаче награды.` |
| `["teamNews"]` / `teamNews` / `teamNews` | **label:** `Текст командной новости`  **description:** `Шаблон новости для командного формата.` |
| `["tagColor"]` / `tagColor` / `tagColor` | **label:** `Цвет тега`  **description:** `Цветовой код тега (для наград типа LABEL).` |
| `["tagEndDT"]` / `tagEndDT` / `tagEndDT` | **label:** `Дата окончания тега`  **description:** `Дата, до которой тег активен.` |
| `["winCriterion"]` / `Критерий для AI-новости` / `winCriterion` | **label:** `Критерий победы для новости`  **description:** `Формулировка критерия победы для генерации новости.` |

### 5.2 Технический момент для массивов `ignoreConditions`

Сейчас перечислены фиксированные индексы (`0..13`) вразнобой.  
План: оставить те же пути, но унифицировать шаблон:
- label: `Табельный номер без проверки условий (элемент N)`;
- description: `Участник, для которого ограничения выдачи не применяются.`

---

## 6) `FILTER_PERIOD_ARR`: как сейчас → как будет

Текущее состояние уже близко к целевому, планируются только косметические унификации.

| Сейчас | План |
|---|---|
| `Код периода (period_code)` / `0 или 1: 0 - текущий период, 1 - прошлый период` | оставить смысл, оформить единообразно: `Код периода` / `Номер периода: 0 — текущий, 1..N — дополнительные.` |
| `Условие по критерию (criterion_mark_type)` | `Оператор критерия участия` |
| `Значение критерия (criterion_mark_value)` | `Порог критерия участия` |

---

## 7) `INDICATOR_FILTER`: как сейчас → как будет

Сейчас:
- `label`: `Фильтр индикатора (JSON)` (уже ок),
- `description`: `Ограничения выборки операций по атрибутам источника для расчёта индикатора.` (уже ок).

План:
- без структурных изменений;
- при необходимости добавить в description короткую подсказку формата:
  `filtered_attribute_code`, `filtered_attribute_match`, одно из `filtered_attribute_value` / `filtered_attribute_condition` / `filtered_attribute_dt`.

---

## 8) Порядок применения (когда дадите команду)

1. Обновить `label/description` в `config.json` только для перечисленных `paths`.
2. Не менять `json_path` и типы полей — только тексты.
3. Проверить JSON-валидность `config.json`.
4. Обновить `Docs/GAMIFICATION_FIELD_LABELS_PROPOSAL.md` статусом «второй проход выполнен».

---

## 9) Факт выполнения

- Применено в `config.json`: нормализация `label/description` для вложенных `paths`.
- Убраны основные техничные подписи вида `feature[2]`, `ignoreConditions[10]`, `itemGroupAmount[3].itemParam`.
- Для индексных путей введены единые шаблоны «элемент N».
- С версии приложения **0.2.47** для массивов объектов **`getCondition.nonRewards`**, **`getCondition.rewards`**, **`itemGroupAmount`** в **`editor_field_ui`** используются **канонические пути без фиксированного индекса** (см. таблицу в §**5.1** выше и **`README.md`**, §**4.5**): клиент сопоставляет их с реальным JSON, где между ключом массива и полем объекта стоит числовой индекс элемента.

