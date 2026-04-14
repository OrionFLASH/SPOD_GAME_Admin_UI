/**
 * Редактор строки: сетка плоских полей, развёртка JSON в параметры, сборка при сохранении.
 * Для листа REWARD и колонки REWARD_ADD_DATA список полей и шаблон зависят от REWARD_TYPE (см. каталог JSON):
 * тип выбран — только поля для этого типа; тип пуст — пересечение полей по всем типам из матрицы; смена типа пересобирает JSON-блок.
 * Пустой объект JSON дополняется шаблоном из field_enums и обязательных json_path в editor_field_ui;
 * экспорт window.SpodJsonEditor — тот же UI в мастере создания конкурса.
 * Списки допустимых значений и «Задать своё» задаются в config.json (field_enums по листам);
 * календарь для дат — `spod_date_picker.js` + подсказки в editor_textareas (`input_type` date / datepicker);
 * подписи и описания полей — editor_field_ui (развёртка в bootstrap.fieldUi);
 * массивы примитивов в JSON — подсказки editor_textareas с json_scalar_array и json_path на корень массива;
 * в bootstrap приходят плоские списки (развёртка на сервере).
 */
(function () {
  "use strict";

  /** Внутреннее значение select для режима произвольного ввода (см. allow_custom). */
  var CUSTOM_SENTINEL = "__SPOD_CUSTOM__";

  /**
   * Матрица «ключ верхнего уровня в REWARD_ADD_DATA → допустимые значения REWARD_TYPE».
   * Источник: Docs/JSON/SPOD_INPUT_DATA_CATALOG.md, раздел «2. Матрица: поле ↔ REWARD_TYPE».
   * Ключи, отсутствующие в объекте, считаются не описанными в каталоге: такие поля не скрываем.
   */
  var REWARD_ADD_DATA_ROOT_KEYS_BY_TYPE = {
    bookingRequired: ["ITEM"],
    businessBlock: ["BADGE", "ITEM"],
    commingSoon: ["ITEM"],
    deliveryRequired: ["ITEM"],
    feature: ["BADGE", "ITEM", "LABEL", "CRYSTAL"],
    fileName: ["BADGE", "ITEM", "LABEL", "CRYSTAL"],
    getCondition: ["ITEM"],
    hidden: ["BADGE", "ITEM", "LABEL", "CRYSTAL"],
    hiddenRewardList: ["BADGE", "ITEM"],
    ignoreConditions: ["ITEM"],
    isGrouping: ["ITEM"],
    isGroupingName: ["ITEM"],
    isGroupingTitle: ["ITEM"],
    isGroupingTultip: ["ITEM"],
    itemAmount: ["ITEM"],
    itemFeature: ["ITEM"],
    itemGroupAmount: ["ITEM"],
    itemLimitCount: ["ITEM"],
    itemLimitPeriod: ["ITEM"],
    itemMinShow: ["ITEM"],
    helpCodeList: ["BADGE"],
    masterBadge: ["BADGE"],
    newsType: ["BADGE"],
    nftFlg: ["BADGE", "ITEM", "LABEL", "CRYSTAL"],
    outstanding: ["BADGE", "ITEM", "LABEL", "CRYSTAL"],
    parentRewardCode: ["BADGE", "LABEL"],
    persomanNumberVisible: ["ITEM"],
    preferences: ["BADGE"],
    priority: ["BADGE"],
    recommendationLevel: ["BADGE"],
    refreshOldNews: ["BADGE", "ITEM", "LABEL"],
    rewardAgainGlobal: ["BADGE", "ITEM", "LABEL", "CRYSTAL"],
    rewardAgainTournament: ["BADGE", "ITEM", "LABEL", "CRYSTAL"],
    rewardRule: ["BADGE", "ITEM", "LABEL", "CRYSTAL"],
    seasonItem: ["BADGE", "ITEM"],
    singleNews: ["BADGE", "ITEM", "LABEL", "CRYSTAL"],
    tagColor: ["LABEL"],
    tagEndDT: ["LABEL"],
    teamNews: ["BADGE", "ITEM", "LABEL", "CRYSTAL"],
    tournamentTeam: ["BADGE"],
    winCriterion: ["BADGE"],
  };

  /** Первый строковой сегмент пути (ключ объекта); индексы массива пропускаем до первого ключа. */
  function firstStringJsonPathSegment(parts) {
    if (!parts || !parts.length) {
      return null;
    }
    var i;
    for (i = 0; i < parts.length; i++) {
      if (typeof parts[i] === "string") {
        return parts[i];
      }
    }
    return null;
  }

  /** Текущий REWARD_TYPE из bootstrap (плоская ячейка или fullRow для мастера). */
  function rewardTypeFromBootstrap(bootstrap) {
    if (!bootstrap) {
      return "";
    }
    var f = (bootstrap.flat && bootstrap.flat.REWARD_TYPE) || "";
    if (!String(f).trim() && bootstrap.fullRow) {
      f = bootstrap.fullRow.REWARD_TYPE || "";
    }
    return String(f != null ? f : "").trim();
  }

  /** Разрешён ли путь для типа награды (только лист REWARD, колонка REWARD_ADD_DATA). */
  function rewardAddDataPathAllowedForType(parts, rewardType) {
    if (!rewardType) {
      return true;
    }
    var top = firstStringJsonPathSegment(parts);
    if (!top) {
      return true;
    }
    var allowed = REWARD_ADD_DATA_ROOT_KEYS_BY_TYPE[top];
    if (!allowed) {
      return true;
    }
    return allowed.indexOf(rewardType) !== -1;
  }

  /** Все значения REWARD_TYPE, встречающиеся в матрице каталога (для пересечения при пустом типе). */
  function allRewardTypesInCatalogMatrix() {
    var u = Object.create(null);
    var k;
    for (k in REWARD_ADD_DATA_ROOT_KEYS_BY_TYPE) {
      if (!Object.prototype.hasOwnProperty.call(REWARD_ADD_DATA_ROOT_KEYS_BY_TYPE, k)) {
        continue;
      }
      var arr = REWARD_ADD_DATA_ROOT_KEYS_BY_TYPE[k];
      var i;
      for (i = 0; i < arr.length; i++) {
        u[arr[i]] = true;
      }
    }
    return Object.keys(u);
  }

  /**
   * Ключ верхнего уровня из каталога допустим для каждого типа из матрицы (пересечение).
   * Если REWARD_TYPE не выбран — в UI показываем только такие поля.
   */
  function rewardAddDataPathAllowedForAllCatalogTypes(parts) {
    var top = firstStringJsonPathSegment(parts);
    if (!top) {
      return true;
    }
    var allowed = REWARD_ADD_DATA_ROOT_KEYS_BY_TYPE[top];
    if (!allowed || !allowed.length) {
      return true;
    }
    var allT = allRewardTypesInCatalogMatrix();
    var j;
    for (j = 0; j < allT.length; j++) {
      if (allowed.indexOf(allT[j]) === -1) {
        return false;
      }
    }
    return true;
  }

  /** Есть ли у листа непустое значение (чтобы показать поле, не предусмотренное для типа). */
  function rewardAddDataLeafHasMeaningfulValue(leaf) {
    if (leaf.vtype === "json-scalar-array") {
      var ai = leaf.arrayItems || [];
      var zi = 0;
      for (zi = 0; zi < ai.length; zi++) {
        if (String(ai[zi] != null ? ai[zi] : "").trim() !== "") {
          return true;
        }
      }
      return false;
    }
    if (leaf.vtype === "empty-array" || leaf.vtype === "empty-object") {
      return false;
    }
    if (leaf.vtype === "null") {
      return false;
    }
    if (leaf.vtype === "string") {
      return String(leaf.display != null ? leaf.display : "").trim() !== "";
    }
    if (leaf.vtype === "number" || leaf.vtype === "boolean") {
      return true;
    }
    return true;
  }

  /**
   * Оставляет листья REWARD_ADD_DATA:
   * — выбран REWARD_TYPE — только ключи из каталога, разрешённые для этого типа (без «чужих» с данными);
   * — тип не выбран — ключи из каталога только из пересечения всех типов; вне каталога — если есть смысл в данных.
   */
  function filterRewardAddDataLeaves(leaves, column, bootstrap) {
    if (bootstrap.sheetCode !== "REWARD" || column !== "REWARD_ADD_DATA") {
      return leaves;
    }
    var rt = rewardTypeFromBootstrap(bootstrap);
    return leaves.filter(function (leaf) {
      var top = firstStringJsonPathSegment(leaf.parts);
      var inCatalog =
        top && Object.prototype.hasOwnProperty.call(REWARD_ADD_DATA_ROOT_KEYS_BY_TYPE, top);

      if (!rt) {
        if (!inCatalog) {
          return rewardAddDataLeafHasMeaningfulValue(leaf);
        }
        return rewardAddDataPathAllowedForAllCatalogTypes(leaf.parts);
      }

      if (inCatalog) {
        return rewardAddDataPathAllowedForType(leaf.parts, rt);
      }
      return rewardAddDataPathAllowedForType(leaf.parts, rt) || rewardAddDataLeafHasMeaningfulValue(leaf);
    });
  }

  function formatPath(parts) {
    var s = "";
    parts.forEach(function (p) {
      if (typeof p === "number") {
        s += "[" + p + "]";
      } else if (s === "") {
        s = p;
      } else if (s.endsWith("]")) {
        s += "." + p;
      } else {
        s += "." + p;
      }
    });
    return s || "(корень)";
  }

  /** Сравнение пути в JSON с массивом из конфигурации (ключи и индексы). */
  function partsMatchJsonPath(parts, jsonPath) {
    var a = parts || [];
    var b = jsonPath || [];
    if (b.length !== a.length) {
      return false;
    }
    for (var i = 0; i < a.length; i++) {
      if (b[i] !== a[i]) {
        return false;
      }
    }
    return true;
  }

  /** У правила есть поле json_path (даже [] для примитива в корне ячейки). */
  function ruleHasJsonPath(r) {
    return Object.prototype.hasOwnProperty.call(r, "json_path");
  }

  /**
   * Правило перечисления: без ключа json_path — только плоские колонки;
   * с ключом json_path — точное совпадение пути внутри JSON-колонки;
   * если последний сегмент пути — индекс массива (число), дополнительно ищется правило
   * для пути без этого индекса (список допустимых значений для каждого элемента массива,
   * в т.ч. внутри json_scalar_array).
   */
  function findFieldEnum(bootstrap, column, jsonParts) {
    var list = bootstrap.fieldEnums || [];
    var sc = bootstrap.sheetCode;
    var jParts = jsonParts === undefined ? null : jsonParts;

    function matchInList(partsToTry) {
      var i = 0;
      for (i = 0; i < list.length; i++) {
        var r = list[i];
        if (r.sheet_code !== sc || r.column !== column) {
          continue;
        }
        if (!ruleHasJsonPath(r)) {
          if (partsToTry === null) {
            return r;
          }
        } else if (partsMatchJsonPath(partsToTry || [], r.json_path)) {
          return r;
        }
      }
      return null;
    }

    var hit = matchInList(jParts);
    if (hit || jParts === null) {
      return hit;
    }
    if (jParts.length >= 2 && typeof jParts[jParts.length - 1] === "number") {
      hit = matchInList(jParts.slice(0, -1));
    }
    return hit || null;
  }

  /** Подсказка по min_rows/max_rows для textarea (плоское поле или путь в JSON). Записи-календарь пропускаются. */
  function findTextareaHint(bootstrap, column, jsonParts) {
    var list = bootstrap.editorTextareas || [];
    var sc = bootstrap.sheetCode;
    var jParts = jsonParts === undefined ? null : jsonParts;
    var api = typeof window !== "undefined" ? window.SpodDatePicker : null;
    for (var j = 0; j < list.length; j++) {
      var h = list[j];
      if (h.sheet_code !== sc || h.column !== column) {
        continue;
      }
      if (api && typeof api.hintIsDate === "function" && api.hintIsDate(h)) {
        continue;
      }
      if (truthyJsonScalarArrayHint(h)) {
        continue;
      }
      if (!ruleHasJsonPath(h)) {
        if (jParts === null) {
          return h;
        }
      } else if (partsMatchJsonPath(jParts || [], h.json_path)) {
        return h;
      }
    }
    return null;
  }

  /** Флаг «массив скаляров» в editor_textareas (json_scalar_array). */
  function truthyJsonScalarArrayHint(h) {
    return (
      h &&
      (h.json_scalar_array === true ||
        h.json_scalar_array === 1 ||
        h.json_scalar_array === "yes" ||
        h.json_scalar_array === "true")
    );
  }

  /**
   * Подсказка editor_textareas: массив примитивов (строка/число/boolean) по пути к самому массиву.
   * Опционально: array_max_items (число), array_allows_empty (по умолчанию true).
   */
  function jsonScalarArrayHintForPath(bootstrap, column, pathToArray) {
    if (!bootstrap || !pathToArray || !pathToArray.length) {
      return null;
    }
    var list = bootstrap.editorTextareas || [];
    var sc = bootstrap.sheetCode;
    var j = 0;
    for (j = 0; j < list.length; j++) {
      var h = list[j];
      if (h.sheet_code !== sc || h.column !== column || !ruleHasJsonPath(h)) {
        continue;
      }
      if (!truthyJsonScalarArrayHint(h)) {
        continue;
      }
      if (partsMatchJsonPath(pathToArray, h.json_path)) {
        return h;
      }
    }
    return null;
  }

  /** Массив непустой и каждый элемент — null или примитив (не объект). */
  function isPrimitiveScalarArray(arr) {
    if (!Array.isArray(arr) || !arr.length) {
      return false;
    }
    var i = 0;
    for (i = 0; i < arr.length; i++) {
      var x = arr[i];
      var t = typeof x;
      if (x !== null && t !== "string" && t !== "number" && t !== "boolean") {
        return false;
      }
    }
    return true;
  }

  /** Путь вида [..., i] — индекс в массиве с корнем, для которого задан json_scalar_array. */
  function jsonPathIsIndexedUnderScalarArrayRoot(bootstrap, column, parts) {
    if (!parts || parts.length < 2) {
      return false;
    }
    var last = parts[parts.length - 1];
    if (typeof last !== "number") {
      return false;
    }
    return !!jsonScalarArrayHintForPath(bootstrap, column, parts.slice(0, -1));
  }

  /**
   * Подсказка «поле-дата»: в editor_textareas — input_type "date" или date_picker true.
   * Логика путей json_path такая же, как у findTextareaHint (плоская колонка или лист JSON).
   */
  function findDatePickerHint(bootstrap, column, jsonParts) {
    var list = bootstrap.editorTextareas || [];
    var sc = bootstrap.sheetCode;
    var jParts = jsonParts === undefined ? null : jsonParts;
    var api = typeof window !== "undefined" ? window.SpodDatePicker : null;
    for (var j = 0; j < list.length; j++) {
      var h = list[j];
      if (h.sheet_code !== sc || h.column !== column) {
        continue;
      }
      var isDate =
        api && typeof api.hintIsDate === "function"
          ? api.hintIsDate(h)
          : h.input_type === "date" ||
            h.input_type === "datepicker" ||
            h.date_picker === true ||
            h.date_picker === 1 ||
            h.date_picker === "yes";
      if (!isDate) {
        continue;
      }
      if (truthyJsonScalarArrayHint(h)) {
        continue;
      }
      if (!ruleHasJsonPath(h)) {
        if (jParts === null) {
          return h;
        }
      } else if (partsMatchJsonPath(jParts || [], h.json_path)) {
        return h;
      }
    }
    return null;
  }

  /**
   * Числовые поля editor_field_numeric: плоская колонка (jsonParts не задан) или лист JSON (column + json_path в правиле).
   */
  function findNumericRuleDef(bootstrap, column, jsonParts) {
    var list = bootstrap.fieldNumeric || bootstrap.field_numeric || [];
    var sc = bootstrap.sheetCode;
    var col = String(column || "").trim();
    var jParts = jsonParts;
    var i = 0;
    for (i = 0; i < list.length; i++) {
      var r = list[i];
      if (!r || r.sheet_code !== sc || String(r.column || "").trim() !== col) {
        continue;
      }
      var jp = r.json_path;
      var hasJp = jp && jp.length;
      if (jParts == null || !Array.isArray(jParts) || jParts.length === 0) {
        if (hasJp) {
          continue;
        }
      } else {
        if (!hasJp || !partsMatchJsonPath(jParts, jp)) {
          continue;
        }
      }
      return r;
    }
    return null;
  }

  function readFlatControlValue(grid, col, flatFallback, attrName) {
    var attr = attrName || "data-col";
    if (grid && grid.querySelector) {
      var el = grid.querySelector("[" + attr + '="' + col + '"]');
      if (el) {
        if (
          el.type === "hidden" &&
          el.closest &&
          (el.closest(".spod-enum-block") || el.closest(".wiz-enum-wrap"))
        ) {
          return String(el.value || "");
        }
        return String(el.value != null ? el.value : "");
      }
    }
    if (flatFallback && flatFallback[col] != null) {
      return String(flatFallback[col]);
    }
    return "";
  }

  function resolveActiveNumericSpec(ruleDef, getVal) {
    if (!ruleDef) {
      return null;
    }
    var cfs = ruleDef.conditional_formats || ruleDef.conditionalFormats || [];
    if (cfs && cfs.length) {
      var j = 0;
      for (j = 0; j < cfs.length; j++) {
        var cf = cfs[j];
        var w = cf.when || {};
        var wcol = w.column;
        if (!wcol) {
          continue;
        }
        if (String(getVal(wcol)).trim() === String(w.equals != null ? w.equals : "").trim()) {
          return cf;
        }
      }
      return ruleDef.default_format || ruleDef.defaultFormat || { format: "empty_only" };
    }
    return ruleDef;
  }

  function clampInt(n, lo, hi) {
    var x = Math.round(n);
    if (x < lo) {
      x = lo;
    }
    if (x > hi) {
      x = hi;
    }
    return x;
  }

  function formatDecimalToPlaces(num, places) {
    var p = places != null ? parseInt(String(places), 10) : 5;
    if (!isFinite(p) || p < 0) {
      p = 5;
    }
    var f = Math.round(num * Math.pow(10, p)) / Math.pow(10, p);
    var s = String(f);
    var neg = false;
    if (s.charAt(0) === "-") {
      neg = true;
      s = s.slice(1);
    }
    var parts = s.split(".");
    var intp = parts[0] || "0";
    var frac = parts.length > 1 ? parts[1] : "";
    while (frac.length < p) {
      frac += "0";
    }
    if (frac.length > p) {
      frac = frac.slice(0, p);
    }
    return (neg ? "-" : "") + intp + "." + frac;
  }

  function normalizeNumericInputString(raw) {
    return String(raw != null ? raw : "")
      .trim()
      .replace(/\s/g, "")
      .replace(",", ".");
  }

  function applyNumericFormatToValue(raw, spec) {
    if (!spec || spec.format === "empty_only") {
      return { ok: true, value: "", warn: "" };
    }
    var t = normalizeNumericInputString(raw);
    if (t === "" || t === "-") {
      return { ok: true, value: "", warn: "" };
    }
    if (!/^-?\d+(\.\d*)?$/.test(t)) {
      return {
        ok: false,
        value: String(raw || ""),
        warn: "Введите число (для дроби допустимы точка или запятая).",
      };
    }
    var n = parseFloat(t);
    if (!isFinite(n)) {
      return { ok: false, value: String(raw || ""), warn: "Некорректное число." };
    }
    var lo = spec.min != null ? Number(spec.min) : null;
    var hi = spec.max != null ? Number(spec.max) : null;
    if (spec.format === "integer") {
      if (Math.abs(n - Math.round(n)) > 1e-9) {
        return { ok: false, value: String(raw || ""), warn: "Ожидается целое число." };
      }
      var xi = clampInt(n, lo != null ? lo : -1e15, hi != null ? hi : 1e15);
      if (lo != null && xi < lo) {
        xi = lo;
      }
      if (hi != null && xi > hi) {
        xi = hi;
      }
      var ws = "";
      if (n < lo || n > hi) {
        ws = "Значение ограничено диапазоном " + String(lo) + "…" + String(hi) + ".";
      }
      return { ok: true, value: String(xi), warn: ws };
    }
    if (spec.format === "decimal") {
      var pl = spec.decimal_places != null ? parseInt(String(spec.decimal_places), 10) : 5;
      var rounded = Math.round(n * Math.pow(10, pl)) / Math.pow(10, pl);
      if (lo != null && rounded < lo) {
        rounded = lo;
      }
      if (hi != null && rounded > hi) {
        rounded = hi;
      }
      var out = formatDecimalToPlaces(rounded, pl);
      var w2 = "";
      if (n < (lo != null ? lo : n - 1) || n > (hi != null ? hi : n + 1)) {
        w2 = "Значение приведено к диапазону " + String(lo) + "…" + String(hi) + " и формату знаков после запятой.";
      } else if (normalizeNumericInputString(raw) !== out) {
        w2 = "Формат: ровно " + String(pl) + " знаков после запятой (дополнение нулями или округление).";
      }
      return { ok: true, value: out, warn: w2 };
    }
    return { ok: true, value: String(raw || ""), warn: "" };
  }

  function attachNumericFlatInput(inp, grid, bootstrap, col, attrName, rowCellsFallback, jsonPartsForRule) {
    var attr = attrName || "data-col";
    var fb = rowCellsFallback != null ? rowCellsFallback : bootstrap.flat || {};
    var jpRule = jsonPartsForRule;
    var warnEl = document.createElement("div");
    warnEl.className = "muted spod-numeric-warn";
    warnEl.style.marginTop = "0.25rem";
    inp.classList.add("spod-numeric-input");
    function refreshState() {
      var active = resolveActiveNumericSpec(findNumericRuleDef(bootstrap, col, jpRule), function (wc) {
        return readFlatControlValue(grid, wc, fb, attr);
      });
      if (!active || active.format === "empty_only") {
        inp.disabled = true;
        inp.value = "";
        inp.title = "Поле не заполняется при текущем значении условной колонки.";
        warnEl.textContent = "";
        inp.setAttribute("data-numeric-active", "0");
        return;
      }
      inp.disabled = false;
      inp.removeAttribute("title");
      inp.setAttribute("data-numeric-active", "1");
      inp.setAttribute("inputmode", active.format === "integer" ? "numeric" : "decimal");
    }
    function onBlurFmt() {
      refreshState();
      if (inp.disabled) {
        return;
      }
      var active = resolveActiveNumericSpec(findNumericRuleDef(bootstrap, col, jpRule), function (wc) {
        return readFlatControlValue(grid, wc, fb, attr);
      });
      if (!active || active.format === "empty_only") {
        return;
      }
      var res = applyNumericFormatToValue(inp.value, active);
      if (!res.ok) {
        warnEl.textContent = res.warn || "";
        return;
      }
      inp.value = res.value;
      warnEl.textContent = res.warn || "";
    }
    inp.addEventListener("blur", onBlurFmt);
    inp.addEventListener("input", function () {
      warnEl.textContent = "";
    });
    refreshState();
    inp.__spodRefreshNumericState = refreshState;
    return { warnEl: warnEl, refresh: refreshState };
  }

  /**
   * Метаданные подписи поля из editor_field_ui (плоская колонка или json_path внутри JSON-колонки).
   * jsonParts: null — только плоские поля; иначе массив пути как у field_enums.
   */
  /**
   * Последнее подходящее правило выигрывает (можно переопределить сгенерированное правило ниже по файлу).
   */
  function findFieldUi(bootstrap, column, jsonParts) {
    var list = bootstrap.fieldUi || [];
    var sc = bootstrap.sheetCode;
    var jParts = jsonParts === undefined ? null : jsonParts;
    var found = null;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r.sheet_code !== sc || r.column !== column) {
        continue;
      }
      if (!ruleHasJsonPath(r)) {
        if (jParts === null) {
          found = r;
        }
      } else if (partsMatchJsonPath(jParts || [], r.json_path)) {
        found = r;
      }
    }
    return found;
  }

  function showDescriptionEnabled(r) {
    if (!r) {
      return false;
    }
    var v = r.show_description;
    return v === true || v === 1 || v === "yes" || v === "true" || v === "Y";
  }

  function fieldUiRequired(r) {
    if (!r) {
      return false;
    }
    var v = r.required;
    return v === true || v === 1 || v === "yes" || v === "true";
  }

  /** По умолчанию true, если ключ отсутствует (старые конфиги). */
  function fieldUiAllowsEmpty(r) {
    if (!r) {
      return true;
    }
    if (!Object.prototype.hasOwnProperty.call(r, "allows_empty")) {
      return true;
    }
    var v = r.allows_empty;
    if (v === false || v === 0 || v === "no" || v === "false") {
      return false;
    }
    return true;
  }

  /**
   * Наглядные подписи вместо «*» и точки: два независимых правила из editor_field_ui.
   * rule — элемент field_ui или null (ничего не добавляется).
   */
  function appendConstraintBadges(signals, rule) {
    if (fieldUiRequired(rule)) {
      var br = document.createElement("span");
      br.className = "spod-field-badge spod-field-badge--required";
      br.setAttribute("role", "note");
      br.setAttribute(
        "title",
        "Обязательное поле: его нужно учитывать при заполнении формы (в карточке строки и в мастере)."
      );
      br.textContent = "Обязательно";
      signals.appendChild(br);
    }
    if (!fieldUiAllowsEmpty(rule)) {
      var bn = document.createElement("span");
      bn.className = "spod-field-badge spod-field-badge--noempty";
      bn.setAttribute("role", "note");
      bn.setAttribute(
        "title",
        "Пустое значение недопустимо: нужно ввести содержимое; одни пробелы не считаются заполнением."
      );
      bn.textContent = "Не пусто";
      signals.appendChild(bn);
    }
  }

  /**
   * Подпись поля: верхняя строка (название + опционально формат даты снаружи), слот описания с min-height
   * — чтобы при отсутствии текста описания поля ввода в сетке оставались на одной линии с соседними ячейками.
   */
  function applyFieldUiLabel(bootstrap, labEl, column, jsonParts, fallbackText) {
    var r = findFieldUi(bootstrap, column, jsonParts);
    var display = fallbackText;
    var desc = "";
    if (r) {
      if (r.label != null && String(r.label).trim() !== "") {
        display = String(r.label);
      }
      if (r.description != null) {
        desc = String(r.description);
      }
    }
    labEl.textContent = "";
    labEl.removeAttribute("title");
    var top = document.createElement("span");
    top.className = "spod-field-ui-label-top";
    var cap = document.createElement("span");
    cap.className = "spod-field-ui-caption";
    cap.textContent = display;
    top.appendChild(cap);
    var signals = document.createElement("span");
    signals.className = "spod-field-ui-signals";
    appendConstraintBadges(signals, r);
    if (signals.firstChild) {
      top.appendChild(signals);
    }
    labEl.appendChild(top);
    var slot = document.createElement("span");
    slot.className = "spod-field-ui-desc-slot";
    if (showDescriptionEnabled(r) && desc.trim()) {
      var d = document.createElement("span");
      d.className = "spod-field-ui-desc";
      d.textContent = desc.trim();
      slot.appendChild(d);
    }
    labEl.appendChild(slot);
  }

  /** Куда вешать «· YYYY-MM-DD» рядом с названием: внутрь .spod-field-ui-label-top. */
  function fieldUiLabelTop(labEl) {
    return labEl.querySelector(".spod-field-ui-label-top");
  }

  /**
   * Поле даты: модальное окно календаря вынесено в /static/spod_date_picker.js (подключать в шаблоне до этого файла).
   */
  function buildDatePickerShell(initV, col, dispId, isJsonLeaf) {
    var api = typeof window !== "undefined" ? window.SpodDatePicker : null;
    if (!api || typeof api.buildShell !== "function") {
      console.error("Не загружен /static/spod_date_picker.js");
      var fb = document.createElement("input");
      fb.type = "text";
      fb.className = "spod-leaf-control";
      if (col) {
        fb.setAttribute("data-col", col);
      }
      fb.value = initV != null ? String(initV) : "";
      return fb;
    }
    return api.buildShell(initV, {
      column: col,
      valueAttribute: "data-col",
      displayId: dispId,
      isJsonLeaf: !!isJsonLeaf,
    });
  }

  /** Число строк textarea: из подсказки конфига и/или по длине текста. */
  function textareaRows(str, hint, threshold) {
    var len = (str || "").length;
    var thr = threshold > 0 ? threshold : 120;
    if (hint && hint.min_rows) {
      var mn = hint.min_rows;
      var mx = hint.max_rows || 22;
      return Math.max(mn, Math.min(mx, Math.ceil(len / 88) || mn));
    }
    if (len <= thr) {
      return 0;
    }
    return Math.max(4, Math.min(22, Math.ceil(len / 88)));
  }

  /**
   * Заполняет select: элемент options — строка (как раньше) или объект { label, value } (в ячейку пишется value, в списке — label).
   */
  function fillSelectOptions(sel, options, allowCustom, current) {
    sel.innerHTML = "";
    var seen = Object.create(null);
    (options || []).forEach(function (op) {
      var val;
      var text;
      if (op !== null && typeof op === "object" && !Array.isArray(op)) {
        val = op.value != null ? String(op.value) : "";
        text = op.label != null ? String(op.label) : val;
      } else {
        val = String(op);
        text = val;
      }
      seen[val] = true;
      var o = document.createElement("option");
      o.value = val;
      o.textContent = text !== "" ? text : val === "" ? "(пусто)" : val;
      sel.appendChild(o);
    });
    var curStr = current != null ? String(current) : "";
    if (!Object.prototype.hasOwnProperty.call(seen, curStr)) {
      var ox = document.createElement("option");
      ox.value = curStr;
      var shorted = curStr.length > 52 ? curStr.slice(0, 49) + "…" : curStr;
      ox.textContent = "(текущее) " + shorted;
      sel.insertBefore(ox, sel.firstChild);
    }
    if (allowCustom) {
      var oc = document.createElement("option");
      oc.value = CUSTOM_SENTINEL;
      oc.textContent = "Задать своё…";
      sel.appendChild(oc);
    }
  }

  function syncFlatHidden(hidden, sel, ta) {
    if (!hidden) {
      return;
    }
    if (sel.value === CUSTOM_SENTINEL && ta) {
      hidden.value = ta.value;
    } else {
      hidden.value = sel.value;
    }
  }

  function initEnumSelectState(sel, ta, hidden, allowCustom, current) {
    var curStr = current != null ? String(current) : "";
    var optValues = [];
    sel.querySelectorAll("option").forEach(function (o) {
      if (o.value !== CUSTOM_SENTINEL) {
        optValues.push(o.value);
      }
    });
    if (optValues.indexOf(curStr) !== -1) {
      sel.value = curStr;
      if (ta) {
        ta.value = curStr;
        ta.classList.add("is-hidden");
      }
    } else if (allowCustom && ta) {
      sel.value = CUSTOM_SENTINEL;
      ta.value = curStr;
      ta.classList.remove("is-hidden");
    } else if (sel.options.length) {
      sel.selectedIndex = 0;
      if (ta) {
        ta.classList.add("is-hidden");
      }
    }
    syncFlatHidden(hidden, sel, ta);
  }

  /** Подписка на select/textarea в блоке перечисления (плоские поля и JSON). */
  function wireEnumControls(root) {
    root.querySelectorAll(".spod-enum-block").forEach(function (blk) {
      if (blk.getAttribute("data-spod-enum-wired") === "1") {
        return;
      }
      blk.setAttribute("data-spod-enum-wired", "1");
      var sel = blk.querySelector(".spod-enum-select");
      var ta = blk.querySelector(".spod-enum-custom");
      var hidden = blk.querySelector("input[type='hidden'][data-col]");
      function sync() {
        if (sel.value === CUSTOM_SENTINEL && ta) {
          ta.classList.remove("is-hidden");
        } else if (ta) {
          ta.classList.add("is-hidden");
        }
        syncFlatHidden(hidden, sel, ta);
        document.dispatchEvent(new Event("spod-editor-change"));
      }
      if (sel) {
        sel.addEventListener("change", sync);
      }
      if (ta) {
        ta.addEventListener("input", sync);
      }
    });
  }

  function flattenLeaves(value, pathParts, out, bootstrap, column) {
    var boot = bootstrap;
    var col = column;
    if (value === null) {
      out.push({ parts: pathParts.slice(), vtype: "null", display: "" });
      return;
    }
    var t = typeof value;
    if (t === "string" || t === "number" || t === "boolean") {
      out.push({
        parts: pathParts.slice(),
        vtype: t,
        display: t === "boolean" ? (value ? "1" : "") : String(value),
      });
      return;
    }
    if (Array.isArray(value)) {
      if (
        boot &&
        col &&
        pathParts.length &&
        jsonScalarArrayHintForPath(boot, col, pathParts) &&
        (value.length === 0 || isPrimitiveScalarArray(value))
      ) {
        out.push({
          parts: pathParts.slice(),
          vtype: "json-scalar-array",
          arrayItems: value.map(function (x) {
            return x;
          }),
        });
        return;
      }
      if (value.length === 0) {
        /* Пустой [] без json_scalar_array: один слот […, 0] (см. editor_textareas). */
        out.push({
          parts: pathParts.concat(0),
          vtype: "string",
          display: "",
          fromEmptyArrayPlaceholder: true,
        });
        return;
      }
      value.forEach(function (item, i) {
        flattenLeaves(item, pathParts.concat(i), out, boot, col);
      });
      return;
    }
    var keys = Object.keys(value);
    if (keys.length === 0) {
      out.push({ parts: pathParts.slice(), vtype: "empty-object", display: "" });
      return;
    }
    keys.forEach(function (k) {
      flattenLeaves(value[k], pathParts.concat(k), out, boot, col);
    });
  }

  function rootKindOf(parsed) {
    if (parsed === null || parsed === undefined) {
      return "null";
    }
    if (Array.isArray(parsed)) {
      return "array";
    }
    if (typeof parsed === "object") {
      return "object";
    }
    return "primitive";
  }

  function setDeep(root, parts, val) {
    if (parts.length === 0) {
      return;
    }
    var cur = root;
    for (var i = 0; i < parts.length - 1; i++) {
      var p = parts[i];
      var nxt = parts[i + 1];
      if (cur[p] === undefined || cur[p] === null) {
        cur[p] = typeof nxt === "number" ? [] : {};
      }
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = val;
  }

  /**
   * Значение по пути в объекте JSON; отсутствие ключа — undefined (отличие от null в данных).
   */
  function getDeepValue(obj, parts) {
    var c = obj;
    for (var i = 0; i < parts.length; i++) {
      if (c == null || typeof c !== "object") {
        return undefined;
      }
      var key = parts[i];
      if (!(key in c)) {
        return undefined;
      }
      c = c[key];
    }
    return c;
  }

  /**
   * Первое значение из справочника field_enums для шаблона: если все варианты — числа, в объект кладётся number.
   */
  function defaultValueFromEnumRule(rule) {
    var opts = rule.options || [];
    if (!opts.length) {
      return "";
    }
    function optVal(o) {
      if (o !== null && typeof o === "object" && !Array.isArray(o)) {
        return o.value != null ? o.value : "";
      }
      return o;
    }
    var first = optVal(opts[0]);
    if (typeof first === "number") {
      return first;
    }
    var allNumeric = true;
    for (var i = 0; i < opts.length; i++) {
      var v = optVal(opts[i]);
      if (v === "" || v === null) {
        continue;
      }
      if (typeof v !== "string" || isNaN(parseFloat(v)) || !isFinite(parseFloat(v))) {
        allNumeric = false;
        break;
      }
    }
    if (allNumeric) {
      var n0 = parseFloat(String(optVal(opts[0])));
      return isFinite(n0) ? n0 : String(first);
    }
    return first;
  }

  /**
   * Дополняет объект корня JSON объявленными в конфиге путями (без перезаписи уже заданных ключей):
   * — все json_path из field_enums для этой колонки (первое допустимое значение);
   * — json_path из editor_field_ui с required: true (если нет enum — пустая строка, setDeep создаст вложенность).
   * Пути — корни json_scalar_array из editor_textareas не дополняются из field_enums (перечисление задаётся по элементам).
   * Длинные пути обрабатываются раньше коротких, чтобы массивы/объекты создавались корректно.
   */
  function mergeDeclaredJsonTemplate(parsed, column, bootstrap) {
    var out = JSON.parse(JSON.stringify(parsed));
    var sc = bootstrap.sheetCode;
    var paths = [];
    var seen = Object.create(null);
    function addPath(jp) {
      if (!jp || jp.length === 0) {
        return;
      }
      var k = JSON.stringify(jp);
      if (seen[k]) {
        return;
      }
      seen[k] = true;
      paths.push(jp.slice());
    }
    var fe = bootstrap.fieldEnums || [];
    var ii;
    for (ii = 0; ii < fe.length; ii++) {
      var r = fe[ii];
      if (r && r.sheet_code === sc && r.column === column && ruleHasJsonPath(r)) {
        addPath(r.json_path);
      }
    }
    var fu = bootstrap.fieldUi || [];
    for (ii = 0; ii < fu.length; ii++) {
      var u = fu[ii];
      if (u && u.sheet_code === sc && u.column === column && ruleHasJsonPath(u) && fieldUiRequired(u)) {
        addPath(u.json_path);
      }
    }
    paths.sort(function (aParts, bParts) {
      return bParts.length - aParts.length;
    });
    for (ii = 0; ii < paths.length; ii++) {
      var parts = paths[ii];
      /* Не создаём из шаблона поля JSON, которые для данного REWARD_TYPE в каталоге не допускаются. */
      if (sc === "REWARD" && column === "REWARD_ADD_DATA") {
        var rt0 = rewardTypeFromBootstrap(bootstrap);
        if (rt0 && !rewardAddDataPathAllowedForType(parts, rt0)) {
          continue;
        }
        if (!rt0 && !rewardAddDataPathAllowedForAllCatalogTypes(parts)) {
          continue;
        }
      }
      if (jsonPathIsIndexedUnderScalarArrayRoot(bootstrap, column, parts)) {
        continue;
      }
      /* Корень json_scalar_array: enum с json_path на массив задаёт варианты по элементам, не значение всего ключа. */
      if (jsonScalarArrayHintForPath(bootstrap, column, parts)) {
        continue;
      }
      if (getDeepValue(out, parts) !== undefined) {
        continue;
      }
      var enumRule = findFieldEnum(bootstrap, column, parts);
      var defL;
      if (enumRule && enumRule.options && enumRule.options.length) {
        defL = defaultValueFromEnumRule(enumRule);
      } else {
        defL = "";
      }
      setDeep(out, parts, defL);
    }
    return out;
  }

  function coerceLeafValue(row) {
    if (row.getAttribute("data-json-enum") === "1") {
      var sel = row.querySelector(".spod-enum-select");
      var ta = row.querySelector(".spod-enum-custom");
      if (!sel) {
        return "";
      }
      var vt = row.getAttribute("data-vtype");
      if (sel.value === CUSTOM_SENTINEL && ta) {
        if (vt === "number") {
          var n1 = parseFloat(ta.value);
          return Number.isFinite(n1) ? n1 : 0;
        }
        return ta.value;
      }
      if (vt === "number") {
        var n2 = parseFloat(sel.value);
        return Number.isFinite(n2) ? n2 : 0;
      }
      return sel.value;
    }
    var vt2 = row.getAttribute("data-vtype");
    if (vt2 === "null") {
      return null;
    }
    if (vt2 === "boolean") {
      var cb = row.querySelector('input[type="checkbox"]');
      return !!(cb && cb.checked);
    }
    if (vt2 === "number") {
      var inpN = row.querySelector("input.json-leaf-input");
      var n3 = parseFloat(inpN && inpN.value);
      return Number.isFinite(n3) ? n3 : 0;
    }
    var inp = row.querySelector("input.json-leaf-input, textarea.json-leaf-input");
    return inp ? inp.value : "";
  }

  function findJsonBox(col) {
    var nodes = document.querySelectorAll("[data-json-column]");
    for (var i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute("data-json-column") === col) {
        return nodes[i];
      }
    }
    return null;
  }

  function buildJsonFromFields(container) {
    var mode = container.getAttribute("data-edit-mode") || "fields";
    if (mode === "raw") {
      var ta = container.querySelector("textarea[data-json-raw]");
      var t = (ta && ta.value.trim()) || "";
      if (!t) {
        return "";
      }
      try {
        return JSON.stringify(JSON.parse(t));
      } catch (e) {
        return ta.value;
      }
    }

    var rk = container.getAttribute("data-root-kind");
    if (rk === "null") {
      return "";
    }

    if (rk === "primitive") {
      var one = container.querySelector(".json-leaf-row");
      if (!one) {
        return "";
      }
      return JSON.stringify(coerceLeafValue(one));
    }

    var leaves = container.querySelectorAll(".json-leaf-row[data-json-path]");
    var scalarHosts = container.querySelectorAll(".json-leaf-row[data-json-scalar-array-host='1']");
    if (leaves.length === 0 && scalarHosts.length === 0) {
      if (rk === "array") {
        return "[]";
      }
      if (rk === "object") {
        return "{}";
      }
      return "";
    }

    if (leaves.length === 1) {
      var only = leaves[0];
      var vt = only.getAttribute("data-vtype");
      if (vt === "empty-array") {
        return "[]";
      }
      if (vt === "empty-object") {
        return "{}";
      }
    }

    var root;
    if (rk === "array") {
      root = [];
    } else {
      root = {};
    }

    var emptyArrayParentsToRestore = [];

    leaves.forEach(function (row) {
      var vt3 = row.getAttribute("data-vtype");
      if (vt3 === "empty-array" || vt3 === "empty-object") {
        return;
      }
      var parts = JSON.parse(row.getAttribute("data-json-path"));
      if (row.getAttribute("data-spod-empty-array-slot") === "1") {
        var valSlot = coerceLeafValue(row);
        if (valSlot === "" || valSlot === null) {
          if (parts.length > 0) {
            emptyArrayParentsToRestore.push(parts.slice(0, parts.length - 1));
          }
          return;
        }
      }
      var val = coerceLeafValue(row);
      setDeep(root, parts, val);
    });

    /* Пустой массив из копии БД: слот не трогали — сохраняем [] вместо отсутствия ключа. */
    for (var pi = 0; pi < emptyArrayParentsToRestore.length; pi++) {
      var par = emptyArrayParentsToRestore[pi];
      if (getDeepValue(root, par) === undefined) {
        setDeep(root, par, []);
      }
    }

    /* Массивы скаляров (json_scalar_array): при нуле строк ввода — явно []. */
    scalarHosts.forEach(function (host) {
      var bp = host.getAttribute("data-json-base-path");
      if (!bp) {
        return;
      }
      var baseParts;
      try {
        baseParts = JSON.parse(bp);
      } catch (eH) {
        return;
      }
      if (!baseParts || !baseParts.length) {
        return;
      }
      if (getDeepValue(root, baseParts) === undefined) {
        setDeep(root, baseParts, []);
      }
    });

    return JSON.stringify(root);
  }

  /**
   * Подставить в bootstrap.flat актуальный REWARD_TYPE из формы карточки строки (плоская сетка).
   */
  function syncRewardTypeFromDomToBootstrap(bootstrap) {
    if (!bootstrap || bootstrap.sheetCode !== "REWARD") {
      return;
    }
    bootstrap.flat = bootstrap.flat || {};
    var h = document.querySelector('#flat-field-grid input[data-col="REWARD_TYPE"]');
    if (h) {
      bootstrap.flat.REWARD_TYPE = String(h.value || "").trim();
    }
  }

  /**
   * Пересобрать UI колонки REWARD_ADD_DATA после смены REWARD_TYPE (мастер или карточка строки).
   */
  function refreshRewardAddDataJsonUi(bootstrap, container) {
    if (!bootstrap || bootstrap.sheetCode !== "REWARD" || !container || !container.getAttribute) {
      return;
    }
    var col = container.getAttribute("data-json-column") || "REWARD_ADD_DATA";
    if (col !== "REWARD_ADD_DATA") {
      return;
    }
    var raw = buildJsonFromFields(container);
    var pr = tryParseSpodJsonCell(raw);
    var parsed = pr.parsed === null || pr.parsed === undefined ? {} : pr.parsed;
    var rk = rootKindOf(parsed);
    var jcNew = {
      column: col,
      section_slug: String(col).replace(/[^a-zA-Z0-9_-]/g, "_"),
      raw: raw,
      ok: pr.ok,
      parsed: parsed,
    };
    if (!jcNew.ok) {
      renderJsonColumn(container, jcNew, bootstrap);
      wireEnumControls(container);
      return;
    }
    if (rk === "object" && parsed !== null && !Array.isArray(parsed)) {
      jcNew.parsed = mergeDeclaredJsonTemplate(JSON.parse(JSON.stringify(parsed)), col, bootstrap);
    } else {
      jcNew.parsed = parsed;
    }
    renderJsonColumn(container, jcNew, bootstrap);
    wireEnumControls(container);
  }

  function renderJsonColumn(container, jc, bootstrap) {
    var col = jc.column;
    while (container.firstChild) {
      container.removeChild(container.firstChild);
    }
    container.setAttribute("data-json-column", col);
    container.setAttribute("data-edit-mode", "fields");

    var toolbar = document.createElement("div");
    toolbar.className = "json-column-toolbar";
    toolbar.innerHTML =
      '<input type="search" class="json-filter" placeholder="Фильтр по имени параметра…" aria-label="Фильтр JSON" />' +
      '<div class="json-mode-toggle">' +
      '<button type="button" class="btn btn-ghost btn-sm js-mode-fields">По полям</button>' +
      '<button type="button" class="btn btn-ghost btn-sm js-mode-raw">Сырой JSON</button>' +
      "</div>";
    container.appendChild(toolbar);

    var fieldsWrap = document.createElement("div");
    fieldsWrap.className = "json-fields-wrap";
    container.appendChild(fieldsWrap);

    var rawWrap = document.createElement("div");
    rawWrap.className = "json-raw-wrap is-hidden";
    var taRaw = document.createElement("textarea");
    taRaw.className = "json-raw-textarea";
    taRaw.setAttribute("data-json-raw", "1");
    taRaw.rows = 14;
    taRaw.value = jc.raw || "";
    rawWrap.appendChild(taRaw);
    container.appendChild(rawWrap);

    if (!jc.ok) {
      fieldsWrap.innerHTML =
        '<p class="muted">Не удалось разобрать как JSON. Используйте режим «Сырой JSON».</p>';
      container.setAttribute("data-edit-mode", "raw");
      fieldsWrap.classList.add("is-hidden");
      rawWrap.classList.remove("is-hidden");
      toolbar.querySelector(".json-filter").style.display = "none";
      container.setAttribute("data-initial-json-norm", normalizeJsonCell(jc.raw));
      taRaw.addEventListener("input", function () {
        document.dispatchEvent(new Event("spod-editor-change"));
      });
      return;
    }

    var parsed = jc.parsed;
    /* Пустая ячейка с валидным «отсутствием» значения — показываем как объект с шаблоном полей. */
    if (jc.ok && (parsed === null || parsed === undefined)) {
      parsed = {};
    }
    var rk = rootKindOf(parsed);
    container.setAttribute("data-root-kind", rk);

    if (rk === "null") {
      fieldsWrap.innerHTML =
        '<p class="muted">Пустое значение. При необходимости введите JSON во вкладке «Сырой JSON».</p>';
      taRaw.value = jc.raw || "";
      container.setAttribute("data-initial-json-norm", normalizeJsonCell(jc.raw));
      taRaw.addEventListener("input", function () {
        document.dispatchEvent(new Event("spod-editor-change"));
      });
      return;
    }

    if (rk === "object" && parsed !== null && !Array.isArray(parsed)) {
      parsed = mergeDeclaredJsonTemplate(parsed, col, bootstrap);
      jc.parsed = parsed;
    }

    var leaves = [];
    flattenLeaves(parsed, [], leaves, bootstrap, col);
    leaves = filterRewardAddDataLeaves(leaves, col, bootstrap);

    var grid = document.createElement("div");
    grid.className = "json-field-grid";

    if (leaves.length === 0) {
      var hint = document.createElement("p");
      hint.className = "muted json-empty-hint";
      hint.textContent = "Нет вложенных полей — при необходимости откройте «Сырой JSON».";
      fieldsWrap.appendChild(hint);
    }

    var thr = (bootstrap && bootstrap.longTextThreshold) || 120;

    /** Перенумерация индексов в data-json-path у строк массива скаляров после вставки/удаления. */
    function reindexJsonScalarArrayItems(host) {
      var bpRaw = host.getAttribute("data-json-base-path");
      if (!bpRaw) {
        return;
      }
      var baseParts;
      try {
        baseParts = JSON.parse(bpRaw);
      } catch (eRe) {
        return;
      }
      var nodes = host.querySelectorAll(".json-scalar-array-item[data-json-path]");
      var ix;
      for (ix = 0; ix < nodes.length; ix++) {
        nodes[ix].setAttribute("data-json-path", JSON.stringify(baseParts.concat(ix)));
      }
    }

    function jsonScalarArrayHostAllowsEmpty(host) {
      return host.getAttribute("data-array-allows-empty") !== "0";
    }

    function jsonScalarArrayHostMaxItems(host) {
      var m = host.getAttribute("data-array-max-items");
      if (m == null || m === "") {
        return null;
      }
      var n = parseInt(m, 10);
      return isFinite(n) && n > 0 ? n : null;
    }

    function updateJsonScalarArrayAddButton(host) {
      var btn = host.querySelector(".js-json-scalar-array-add");
      if (!btn) {
        return;
      }
      var maxN = jsonScalarArrayHostMaxItems(host);
      var n = host.querySelectorAll(".json-scalar-array-item[data-json-path]").length;
      if (maxN != null && n >= maxN) {
        btn.disabled = true;
      } else {
        btn.disabled = false;
      }
    }

    /** Тип элемента примитивного массива для атрибута data-vtype (как у обычных листьев). */
    function vtypeForScalarArrayElement(val) {
      if (val === null) {
        return "null";
      }
      var t = typeof val;
      if (t === "number" || t === "boolean" || t === "string") {
        return t;
      }
      return "string";
    }

    function displayForScalarArrayElement(val, vtype) {
      if (vtype === "boolean") {
        return val ? "1" : "";
      }
      if (val === null || val === undefined) {
        return "";
      }
      return String(val);
    }

    /**
     * Одна группа UI: массив примитивов по json_scalar_array (хост без data-json-path, строки — с индексами).
     */
    function appendOneJsonScalarArrayHost(grid, leaf, bootstrapLocal, colLocal, thrLocal, jsonColumnEl) {
      var basePath = leaf.parts || [];
      var arrayHint = jsonScalarArrayHintForPath(bootstrapLocal, colLocal, basePath) || {};
      var maxRaw = arrayHint.array_max_items;
      var maxN =
        typeof maxRaw === "number" && maxRaw > 0
          ? maxRaw
          : (function () {
              var p = parseInt(maxRaw, 10);
              return isFinite(p) && p > 0 ? p : null;
            })();
      var allowsEmpty = !(
        arrayHint.array_allows_empty === false ||
        arrayHint.array_allows_empty === 0 ||
        arrayHint.array_allows_empty === "false" ||
        arrayHint.array_allows_empty === "no"
      );

      var items = Array.isArray(leaf.arrayItems) ? leaf.arrayItems.slice() : [];
      if (items.length === 0 && !allowsEmpty) {
        items.push("");
      }

      var pathDisp = formatPath(basePath);
      var uiR = findFieldUi(bootstrapLocal, colLocal, basePath);
      var labForFilter =
        uiR && uiR.label != null && String(uiR.label).trim() !== "" ? String(uiR.label) : pathDisp;
      var descJf =
        uiR && showDescriptionEnabled(uiR) && uiR.description != null ? String(uiR.description) : "";
      var filterText = (pathDisp + " " + labForFilter + " " + descJf).toLowerCase();

      var host = document.createElement("div");
      host.className = "json-leaf-row json-scalar-array-host grid-cell";
      host.setAttribute("data-json-scalar-array-host", "1");
      host.setAttribute("data-json-base-path", JSON.stringify(basePath));
      host.setAttribute("data-vtype", "json-scalar-array");
      host.setAttribute("data-array-allows-empty", allowsEmpty ? "1" : "0");
      if (maxN != null) {
        host.setAttribute("data-array-max-items", String(maxN));
      }
      host.setAttribute("data-filter-text", filterText);

      var lab = document.createElement("label");
      lab.className = "json-path-label";
      applyFieldUiLabel(bootstrapLocal, lab, colLocal, basePath, pathDisp);
      host.appendChild(lab);

      var body = document.createElement("div");
      body.className = "json-scalar-array-body";
      var lines = document.createElement("div");
      lines.className = "json-scalar-array-lines";

      var taHint = jsonScalarArrayHintForPath(bootstrapLocal, colLocal, basePath);

      function buildItemRow(val, index) {
        var vt = vtypeForScalarArrayElement(val);
        var disp = displayForScalarArrayElement(val, vt);
        var pathPartsItem = basePath.concat(index);
        var line = document.createElement("div");
        line.className = "json-scalar-array-line";

        var itemRow = document.createElement("div");
        itemRow.className = "json-leaf-row json-scalar-array-item grid-cell";
        itemRow.setAttribute("data-json-path", JSON.stringify(pathPartsItem));
        itemRow.setAttribute("data-vtype", vt);
        itemRow.setAttribute("data-filter-text", filterText);

        if (vt === "boolean") {
          var cb = document.createElement("input");
          cb.type = "checkbox";
          cb.className = "json-leaf-input";
          cb.checked = disp === "1" || disp === "true";
          itemRow.appendChild(cb);
        } else if (vt === "number") {
          var enumN = findFieldEnum(bootstrapLocal, colLocal, pathPartsItem);
          if (enumN) {
            itemRow.setAttribute("data-json-enum", "1");
            var wrapN = document.createElement("div");
            wrapN.className = "spod-enum-block spod-enum-block--json";
            var selN = document.createElement("select");
            selN.className = "spod-enum-select spod-leaf-control";
            var taN = document.createElement("textarea");
            taN.className = "spod-enum-custom spod-leaf-control is-hidden";
            taN.rows = 2;
            fillSelectOptions(selN, enumN.options, !!enumN.allow_custom, disp);
            initEnumSelectState(selN, taN, null, !!enumN.allow_custom, disp);
            wrapN.appendChild(selN);
            wrapN.appendChild(taN);
            itemRow.appendChild(wrapN);
          } else {
            var inpNum = document.createElement("input");
            inpNum.type = "number";
            inpNum.step = "any";
            inpNum.className = "json-leaf-input";
            inpNum.value = disp;
            itemRow.appendChild(inpNum);
          }
        } else if (vt === "null") {
          var inpNull = document.createElement("input");
          inpNull.type = "text";
          inpNull.className = "json-leaf-input";
          inpNull.placeholder = "null";
          inpNull.value = "";
          itemRow.appendChild(inpNull);
        } else {
          var dateHItem = findDatePickerHint(bootstrapLocal, colLocal, pathPartsItem);
          if (dateHItem) {
            itemRow.setAttribute("data-json-date", "1");
            var fmtItem = dateHItem.storage_format || "YYYY-MM-DD";
            var fmtLabItem = document.createElement("span");
            fmtLabItem.className = "muted spod-date-format-hint";
            fmtLabItem.textContent = " · " + fmtItem;
            itemRow.appendChild(fmtLabItem);
            itemRow.appendChild(buildDatePickerShell(disp, null, null, true));
          } else {
            var enumRule = findFieldEnum(bootstrapLocal, colLocal, pathPartsItem);
            if (enumRule) {
              itemRow.setAttribute("data-json-enum", "1");
              var wrapS = document.createElement("div");
              wrapS.className = "spod-enum-block spod-enum-block--json";
              var selS = document.createElement("select");
              selS.className = "spod-enum-select spod-leaf-control";
              var taS = document.createElement("textarea");
              taS.className = "spod-enum-custom spod-leaf-control is-hidden";
              taS.rows = 3;
              fillSelectOptions(selS, enumRule.options, !!enumRule.allow_custom, disp);
              initEnumSelectState(selS, taS, null, !!enumRule.allow_custom, disp);
              wrapS.appendChild(selS);
              wrapS.appendChild(taS);
              itemRow.appendChild(wrapS);
            } else {
              var rows = textareaRows(disp, taHint, thrLocal);
              if (rows > 0) {
                var taStr = document.createElement("textarea");
                taStr.className = "json-leaf-input spod-leaf-control";
                taStr.rows = rows;
                taStr.value = disp;
                itemRow.appendChild(taStr);
              } else {
                var inpStr = document.createElement("input");
                inpStr.type = "text";
                inpStr.className = "json-leaf-input";
                inpStr.value = disp;
                itemRow.appendChild(inpStr);
              }
            }
          }
        }

        var rm = document.createElement("button");
        rm.type = "button";
        rm.className = "btn btn-ghost btn-sm js-json-scalar-array-remove";
        rm.textContent = "Удалить";
        rm.addEventListener("click", function () {
          var cnt = host.querySelectorAll(".json-scalar-array-item[data-json-path]").length;
          if (cnt <= 1 && !jsonScalarArrayHostAllowsEmpty(host)) {
            return;
          }
          line.remove();
          reindexJsonScalarArrayItems(host);
          updateJsonScalarArrayAddButton(host);
          document.dispatchEvent(new Event("spod-editor-change"));
        });

        line.appendChild(itemRow);
        line.appendChild(rm);
        return line;
      }

      var ii;
      for (ii = 0; ii < items.length; ii++) {
        lines.appendChild(buildItemRow(items[ii], ii));
      }

      var addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "btn btn-ghost btn-sm js-json-scalar-array-add";
      addBtn.textContent = "Добавить значение";
      addBtn.addEventListener("click", function () {
        var cnt0 = host.querySelectorAll(".json-scalar-array-item[data-json-path]").length;
        var max0 = jsonScalarArrayHostMaxItems(host);
        if (max0 != null && cnt0 >= max0) {
          return;
        }
        var firstItem = host.querySelector(".json-scalar-array-item[data-json-path]");
        var sampleVt = (firstItem && firstItem.getAttribute("data-vtype")) || "string";
        var defaultVal =
          sampleVt === "number" ? 0 : sampleVt === "boolean" ? false : sampleVt === "null" ? null : "";
        lines.appendChild(buildItemRow(defaultVal, cnt0));
        reindexJsonScalarArrayItems(host);
        updateJsonScalarArrayAddButton(host);
        if (jsonColumnEl) {
          wireEnumControls(jsonColumnEl);
        }
        document.dispatchEvent(new Event("spod-editor-change"));
      });

      body.appendChild(lines);
      body.appendChild(addBtn);
      host.appendChild(body);
      grid.appendChild(host);
      reindexJsonScalarArrayItems(host);
      updateJsonScalarArrayAddButton(host);

      lines.addEventListener("input", function () {
        document.dispatchEvent(new Event("spod-editor-change"));
      });
      lines.addEventListener("change", function () {
        document.dispatchEvent(new Event("spod-editor-change"));
      });
    }

    /** Сетка листьев: общая отрисовка и пересборка при переходе «Сырой JSON» → «По полям». */
    function appendJsonLeafRowsToGrid(grid, leaves, jsonColumnEl) {
      leaves.forEach(function (leaf) {
        if (leaf.vtype === "json-scalar-array") {
          appendOneJsonScalarArrayHost(grid, leaf, bootstrap, col, thr, jsonColumnEl);
          return;
        }
        var row = document.createElement("div");
        row.className = "json-leaf-row grid-cell";
        row.setAttribute("data-json-path", JSON.stringify(leaf.parts));
        row.setAttribute("data-vtype", leaf.vtype);
        if (leaf.fromEmptyArrayPlaceholder) {
          row.setAttribute("data-spod-empty-array-slot", "1");
          row.setAttribute(
            "title",
            "Массив в данных пустой: введите первый элемент; если оставить поле пустым, при сохранении останется []."
          );
        }
        {
          var pathDisp = formatPath(leaf.parts);
          var uiR = findFieldUi(bootstrap, col, leaf.parts);
          var labForFilter = uiR && uiR.label != null && String(uiR.label).trim() !== "" ? String(uiR.label) : pathDisp;
          var descJf =
            uiR && showDescriptionEnabled(uiR) && uiR.description != null ? String(uiR.description) : "";
          row.setAttribute("data-filter-text", (pathDisp + " " + labForFilter + " " + descJf).toLowerCase());
        }

        var lab = document.createElement("label");
        lab.className = "json-path-label";
        applyFieldUiLabel(bootstrap, lab, col, leaf.parts, formatPath(leaf.parts));
        row.appendChild(lab);

        if (leaf.vtype === "empty-array" || leaf.vtype === "empty-object") {
          var span = document.createElement("span");
          span.className = "muted";
          span.textContent = leaf.vtype === "empty-array" ? "(пустой массив)" : "(пустой объект)";
          row.appendChild(span);
        } else if (leaf.vtype === "boolean") {
          var cb = document.createElement("input");
          cb.type = "checkbox";
          cb.className = "json-leaf-input";
          cb.checked = leaf.display === "1" || leaf.display === "true";
          row.appendChild(cb);
        } else if (leaf.vtype === "number") {
          var numDefJ = findNumericRuleDef(bootstrap, col, leaf.parts);
          var enumN = numDefJ ? null : findFieldEnum(bootstrap, col, leaf.parts);
          if (enumN) {
            row.setAttribute("data-json-enum", "1");
            var wrapN = document.createElement("div");
            wrapN.className = "spod-enum-block spod-enum-block--json";
            var selN = document.createElement("select");
            selN.className = "spod-enum-select spod-leaf-control";
            var taN = document.createElement("textarea");
            taN.className = "spod-enum-custom spod-leaf-control is-hidden";
            taN.rows = 2;
            fillSelectOptions(selN, enumN.options, !!enumN.allow_custom, leaf.display);
            initEnumSelectState(selN, taN, null, !!enumN.allow_custom, leaf.display);
            wrapN.appendChild(selN);
            wrapN.appendChild(taN);
            row.appendChild(wrapN);
          } else if (numDefJ) {
            var inpJN = document.createElement("input");
            inpJN.type = "text";
            inpJN.className = "json-leaf-input spod-leaf-control";
            inpJN.setAttribute("data-initial", leaf.display != null ? String(leaf.display) : "");
            var flatGridJ = flatGridFor(bootstrap);
            var activeJN = resolveActiveNumericSpec(numDefJ, function (wc) {
              return readFlatControlValue(flatGridJ, wc, bootstrap.flat || {}, "data-col");
            });
            var initNumStr = leaf.display != null ? String(leaf.display) : "";
            var resJN = applyNumericFormatToValue(initNumStr, activeJN);
            inpJN.value = resJN.ok ? resJN.value : initNumStr;
            var numPairJ = attachNumericFlatInput(
              inpJN,
              flatGridJ,
              bootstrap,
              col,
              "data-col",
              null,
              leaf.parts
            );
            row.appendChild(inpJN);
            row.appendChild(numPairJ.warnEl);
          } else {
            var inpNum = document.createElement("input");
            inpNum.type = "number";
            inpNum.step = "any";
            inpNum.className = "json-leaf-input";
            inpNum.value = leaf.display;
            row.appendChild(inpNum);
          }
        } else if (leaf.vtype === "null") {
          var inpNull = document.createElement("input");
          inpNull.type = "text";
          inpNull.className = "json-leaf-input";
          inpNull.placeholder = "null";
          inpNull.value = "";
          row.appendChild(inpNull);
        } else if (leaf.vtype === "string") {
          var dateHj = findDatePickerHint(bootstrap, col, leaf.parts);
          if (dateHj) {
            row.setAttribute("data-json-date", "1");
            var fmtJ = dateHj.storage_format || "YYYY-MM-DD";
            var fmtLab = document.createElement("span");
            fmtLab.className = "muted spod-date-format-hint";
            fmtLab.textContent = " · " + fmtJ;
            var topJ = fieldUiLabelTop(lab);
            if (topJ) {
              topJ.appendChild(fmtLab);
            } else {
              lab.appendChild(fmtLab);
            }
            var dispLeaf = leaf.display != null ? String(leaf.display) : "";
            row.appendChild(buildDatePickerShell(dispLeaf, null, null, true));
          } else {
            var enumRule = findFieldEnum(bootstrap, col, leaf.parts);
            if (enumRule) {
              row.setAttribute("data-json-enum", "1");
              var wrapS = document.createElement("div");
              wrapS.className = "spod-enum-block spod-enum-block--json";
              var selS = document.createElement("select");
              selS.className = "spod-enum-select spod-leaf-control";
              var taS = document.createElement("textarea");
              taS.className = "spod-enum-custom spod-leaf-control is-hidden";
              taS.rows = 3;
              fillSelectOptions(selS, enumRule.options, !!enumRule.allow_custom, leaf.display);
              initEnumSelectState(selS, taS, null, !!enumRule.allow_custom, leaf.display);
              wrapS.appendChild(selS);
              wrapS.appendChild(taS);
              row.appendChild(wrapS);
            } else {
              var hintT = findTextareaHint(bootstrap, col, leaf.parts);
              var rows = textareaRows(leaf.display, hintT, thr);
              if (rows > 0) {
                var taStr = document.createElement("textarea");
                taStr.className = "json-leaf-input spod-leaf-control";
                taStr.rows = rows;
                taStr.value = leaf.display;
                row.appendChild(taStr);
              } else {
                var inpStr = document.createElement("input");
                inpStr.type = "text";
                inpStr.className = "json-leaf-input";
                inpStr.value = leaf.display;
                row.appendChild(inpStr);
              }
            }
          }
        }

        grid.appendChild(row);
      });
    }

    appendJsonLeafRowsToGrid(grid, leaves, container);

    fieldsWrap.appendChild(grid);

    wireEnumControls(container);

    function syncRawTextareaFromFields() {
      var built = buildJsonFromFields(container);
      var t = (built || "").trim();
      if (t) {
        try {
          taRaw.value = JSON.stringify(JSON.parse(built), null, 2);
        } catch (eSync) {
          taRaw.value = built;
        }
      } else {
        taRaw.value = "";
      }
      container.setAttribute("data-initial-json-norm", normalizeJsonCell(built));
    }

    syncRawTextareaFromFields();

    var filterInp = toolbar.querySelector(".json-filter");
    filterInp.addEventListener("input", function (ev) {
      var q = (ev.target.value || "").trim().toLowerCase();
      /* Только строки верхнего уровня сетки: строки элементов json_scalar_array вложены и не фильтруются отдельно. */
      fieldsWrap.querySelectorAll(".json-field-grid > .json-leaf-row").forEach(function (r) {
        var t = r.getAttribute("data-filter-text") || "";
        r.style.display = !q || t.indexOf(q) !== -1 ? "" : "none";
      });
    });

    toolbar.querySelector(".js-mode-fields").addEventListener("click", function () {
      var curMode = container.getAttribute("data-edit-mode") || "fields";
      if (curMode === "fields") {
        return;
      }
      var txt = (taRaw.value || "").trim();
      var pr = tryParseSpodJsonCell(txt);
      if (!pr.ok) {
        alert(
          "Не удалось разобрать JSON из режима «Сырой JSON». Исправьте текст или оставайтесь в сыром режиме."
        );
        return;
      }
      var newParsed = pr.parsed === null || pr.parsed === undefined ? {} : pr.parsed;
      var newRk = rootKindOf(newParsed);
      if (newRk === "null") {
        alert("Пустое значение нельзя развернуть по полям — задайте объект или массив во «Сыром JSON».");
        return;
      }
      container.setAttribute("data-root-kind", newRk);
      if (newRk === "object" && newParsed !== null && !Array.isArray(newParsed)) {
        newParsed = mergeDeclaredJsonTemplate(JSON.parse(JSON.stringify(newParsed)), col, bootstrap);
      }
      var newLeaves = [];
      flattenLeaves(newParsed, [], newLeaves, bootstrap, col);
      newLeaves = filterRewardAddDataLeaves(newLeaves, col, bootstrap);
      fieldsWrap.innerHTML = "";
      var newGrid = document.createElement("div");
      newGrid.className = "json-field-grid";
      if (newLeaves.length === 0) {
        var hint2 = document.createElement("p");
        hint2.className = "muted json-empty-hint";
        hint2.textContent = "Нет вложенных полей — при необходимости откройте «Сырой JSON».";
        fieldsWrap.appendChild(hint2);
      }
      appendJsonLeafRowsToGrid(newGrid, newLeaves, container);
      fieldsWrap.appendChild(newGrid);
      wireEnumControls(container);
      container.setAttribute("data-edit-mode", "fields");
      syncRawTextareaFromFields();
      fieldsWrap.classList.remove("is-hidden");
      rawWrap.classList.add("is-hidden");
      document.dispatchEvent(new Event("spod-editor-change"));
    });
    toolbar.querySelector(".js-mode-raw").addEventListener("click", function () {
      syncRawTextareaFromFields();
      container.setAttribute("data-edit-mode", "raw");
      rawWrap.classList.remove("is-hidden");
      fieldsWrap.classList.add("is-hidden");
      document.dispatchEvent(new Event("spod-editor-change"));
    });

    container.addEventListener("input", function () {
      document.dispatchEvent(new Event("spod-editor-change"));
    });
    container.addEventListener("change", function () {
      document.dispatchEvent(new Event("spod-editor-change"));
    });
  }

  /** Сетка плоских полей для bootstrap: общая #flat-field-grid или #flat-field-grid-{rowId} для листа GROUP (несколько уровней). */
  function flatGridFor(bootstrap) {
    if (bootstrap && bootstrap.__flatGridId) {
      return document.getElementById(bootstrap.__flatGridId);
    }
    return document.getElementById("flat-field-grid");
  }

  function renderFlatSection(bootstrap) {
    var grid = flatGridFor(bootstrap);
    if (!grid) {
      return;
    }
    var flat = bootstrap.flat || {};
    var keys = Object.keys(flat);
    if (keys.length === 0) {
      grid.innerHTML = '<p class="muted">Все колонки этого листа относятся к JSON-блокам справа.</p>';
      return;
    }
    if (bootstrap.sheetCode === "GROUP") {
      keys.sort(function (a, b) {
        var order = { GET_CALC_METHOD: 0, GET_CALC_CRITERION: 1 };
        var oa = Object.prototype.hasOwnProperty.call(order, a) ? order[a] : 50;
        var ob = Object.prototype.hasOwnProperty.call(order, b) ? order[b] : 50;
        if (oa !== ob) {
          return oa - ob;
        }
        return a.localeCompare(b);
      });
    } else {
      keys.sort();
    }
    var thr = bootstrap.longTextThreshold || 120;
    keys.forEach(function (col) {
      var cell = document.createElement("div");
      cell.className = "scalar-cell grid-cell";
      {
        var ui0 = findFieldUi(bootstrap, col, null);
        var labDisp0 = ui0 && ui0.label != null && String(ui0.label).trim() !== "" ? String(ui0.label) : col;
        var descF =
          ui0 && showDescriptionEnabled(ui0) && ui0.description != null ? String(ui0.description) : "";
        cell.setAttribute("data-filter-text", (col + " " + labDisp0 + " " + descF).toLowerCase());
      }
      var ridpfx =
        bootstrap && bootstrap.rowId != null && String(bootstrap.rowId) !== ""
          ? "r" + String(bootstrap.rowId) + "_"
          : "";
      var safeId = ridpfx + "col-" + col.replace(/[^a-zA-Z0-9_]/g, "_");
      var lab = document.createElement("label");
      lab.setAttribute("for", safeId);
      applyFieldUiLabel(bootstrap, lab, col, null, col);
      var was = document.createElement("div");
      was.className = "was-value is-hidden";

      var dateHint = findDatePickerHint(bootstrap, col, null);
      var numDef = findNumericRuleDef(bootstrap, col);
      /* Числовое правило editor_field_numeric имеет приоритет над field_enums для той же колонки. */
      var rule = numDef ? null : findFieldEnum(bootstrap, col, null);
      var initV = flat[col] != null ? String(flat[col]) : "";
      var activeNum = numDef ? resolveActiveNumericSpec(numDef, function (wc) {
        return readFlatControlValue(grid, wc, flat, "data-col");
      }) : null;

      if (dateHint) {
        var fmt = dateHint.storage_format || "YYYY-MM-DD";
        var fmtSpan = document.createElement("span");
        fmtSpan.className = "muted spod-date-format-hint";
        fmtSpan.textContent = " · " + fmt;
        var topD = fieldUiLabelTop(lab);
        if (topD) {
          topD.appendChild(fmtSpan);
        } else {
          lab.appendChild(fmtSpan);
        }
        cell.appendChild(lab);
        cell.appendChild(buildDatePickerShell(initV, col, safeId, false));
        cell.appendChild(was);
      } else if (numDef) {
        cell.appendChild(lab);
        if (!activeNum || activeNum.format === "empty_only") {
          var inpE = document.createElement("input");
          inpE.type = "text";
          inpE.id = safeId;
          inpE.className = "spod-leaf-control";
          inpE.setAttribute("data-col", col);
          inpE.setAttribute("data-initial", initV);
          inpE.value = "";
          inpE.disabled = true;
          inpE.title = "Поле не заполняется при текущем значении условной колонки.";
          cell.appendChild(inpE);
          cell.appendChild(was);
        } else {
          var inpN = document.createElement("input");
          inpN.type = "text";
          inpN.id = safeId;
          inpN.className = "spod-leaf-control";
          inpN.setAttribute("data-col", col);
          inpN.setAttribute("data-initial", initV);
          var resN = applyNumericFormatToValue(initV, activeNum);
          inpN.value = resN.ok ? resN.value : initV;
          cell.appendChild(inpN);
          var numPair = attachNumericFlatInput(inpN, grid, bootstrap, col, "data-col", null);
          cell.appendChild(numPair.warnEl);
          cell.appendChild(was);
        }
      } else if (rule) {
        var wrap = document.createElement("div");
        wrap.className = "spod-enum-block spod-enum-block--flat";
        var hidden = document.createElement("input");
        hidden.type = "hidden";
        hidden.id = safeId;
        hidden.setAttribute("data-col", col);
        hidden.setAttribute("data-initial", initV);
        hidden.value = initV;
        var sel = document.createElement("select");
        sel.className = "spod-enum-select spod-leaf-control";
        sel.setAttribute("aria-label", lab.textContent || col);
        var taC = document.createElement("textarea");
        taC.className = "spod-enum-custom spod-leaf-control is-hidden";
        taC.rows = 4;
        fillSelectOptions(sel, rule.options, !!rule.allow_custom, initV);
        initEnumSelectState(sel, taC, hidden, !!rule.allow_custom, initV);
        wrap.appendChild(hidden);
        wrap.appendChild(sel);
        wrap.appendChild(taC);
        cell.appendChild(lab);
        cell.appendChild(wrap);
        cell.appendChild(was);
      } else {
        var hintF = findTextareaHint(bootstrap, col, null);
        var rows = textareaRows(initV, hintF, thr);
        if (rows > 0) {
          var taF = document.createElement("textarea");
          taF.id = safeId;
          taF.className = "spod-leaf-control";
          taF.rows = rows;
          taF.setAttribute("data-col", col);
          taF.setAttribute("data-initial", initV);
          taF.value = initV;
          cell.appendChild(lab);
          cell.appendChild(taF);
          cell.appendChild(was);
          taF.addEventListener("input", function () {
            document.dispatchEvent(new Event("spod-editor-change"));
          });
        } else {
          var inp = document.createElement("input");
          inp.id = safeId;
          inp.type = "text";
          inp.setAttribute("data-col", col);
          inp.setAttribute("data-initial", initV);
          inp.value = initV;
          cell.appendChild(lab);
          cell.appendChild(inp);
          cell.appendChild(was);
          inp.addEventListener("input", function () {
            document.dispatchEvent(new Event("spod-editor-change"));
          });
        }
      }
      grid.appendChild(cell);
    });

    if (!grid.getAttribute("data-spod-numeric-delegation")) {
      grid.setAttribute("data-spod-numeric-delegation", "1");
      grid.addEventListener(
        "change",
        function () {
          grid.querySelectorAll("input.spod-numeric-input").forEach(function (el) {
            if (typeof el.__spodRefreshNumericState === "function") {
              el.__spodRefreshNumericState();
            }
          });
        },
        true
      );
    }

    wireEnumControls(grid);

    var flt = document.getElementById("flat-field-filter");
    if (flt) {
      flt.addEventListener("input", function () {
        var q = (flt.value || "").trim().toLowerCase();
        grid.querySelectorAll(".scalar-cell").forEach(function (c) {
          var t = c.getAttribute("data-filter-text") || "";
          c.style.display = !q || t.indexOf(q) !== -1 ? "" : "none";
        });
      });
    }
  }

  function wireNav() {
    document.querySelectorAll(".edit-nav a[href^='#']").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        var id = a.getAttribute("href").slice(1);
        var el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }

  function collectPayload(bootstrap) {
    var o = Object.assign({}, bootstrap.fullRow || {});
    var fg = flatGridFor(bootstrap);
    if (fg) {
      fg.querySelectorAll("input.spod-numeric-input").forEach(function (el) {
        el.dispatchEvent(new Event("blur", { bubbles: false }));
      });
      fg.querySelectorAll("[data-col]").forEach(function (el) {
        o[el.dataset.col] = el.value;
      });
    }
    (bootstrap.jsonCols || []).forEach(function (jc) {
      var box = findJsonBox(jc.column);
      if (!box) {
        o[jc.column] = jc.raw != null ? String(jc.raw) : "";
        return;
      }
      o[jc.column] = buildJsonFromFields(box);
    });
    return o;
  }

  /**
   * Нормализация строки JSON в нотации SPOD (тройные кавычки в CSV), как в `src/spod_json.py`.
   * Используется мастером и `normalizeJsonCell`, чтобы разбирать те же ячейки, что и сервер.
   */
  function normalizeSpodJsonString(s) {
    return String(s || "")
      .trim()
      .replace(/"""/g, '"');
  }

  /** Дублирует `_repair_csv_spod_string_quoting` в `spod_json.py` (лишняя " после ] или }; "" перед : , } ]). */
  function repairCsvSpodStringQuoting(s) {
    var out = String(s || "").trim();
    while (out.length >= 2 && out.charAt(out.length - 1) === '"' && (out.charAt(out.length - 2) === "]" || out.charAt(out.length - 2) === "}")) {
      try {
        JSON.parse(out.slice(0, -1));
        out = out.slice(0, -1);
      } catch (eStrip) {
        break;
      }
    }
    out = out.replace(/([0-9A-Za-z_])""}/g, "$1\"}");
    var prev = null;
    while (prev !== out) {
      prev = out;
      out = out.split('""":').join('":').split('""",').join('",');
    }
    return out;
  }

  /**
   * Разбор ячейки как JSON после нормализации SPOD; сигнатура удобна для мастера (`ok` + `parsed`).
   */
  function tryParseSpodJsonCell(raw) {
    var t = String(raw != null ? raw : "").trim();
    if (!t || t === "-" || t === "None" || t.toLowerCase() === "null") {
      return { ok: true, parsed: null };
    }
    try {
      return { ok: true, parsed: JSON.parse(t) };
    } catch (e0) {
      /* далее — как try_parse_cell в Python: normalize + regex + repairCsvSpodStringQuoting */
    }
    try {
      var fixed = normalizeSpodJsonString(t);
      fixed = fixed.replace(/"{2,}([^"\s]+)"{2,}/g, '"$1"');
      fixed = fixed.replace(/"{2,}([^"\s]+)"{2,}\s*:/g, '"$1":');
      fixed = repairCsvSpodStringQuoting(fixed);
      return { ok: true, parsed: JSON.parse(fixed) };
    } catch (e1) {
      return { ok: false, parsed: null, error: String((e1 && e1.message) || e1) };
    }
  }

  /** Сравнение JSON-ячеек с учётом нормализации пробелов в компактном виде. */
  function normalizeJsonCell(raw) {
    var t = (raw != null ? String(raw) : "").trim();
    if (!t) {
      return "";
    }
    var pr = tryParseSpodJsonCell(raw);
    if (!pr.ok) {
      return t;
    }
    if (pr.parsed === null || pr.parsed === undefined) {
      return "";
    }
    try {
      return JSON.stringify(pr.parsed);
    } catch (e) {
      return t;
    }
  }

  function canonicalPayload(bootstrap) {
    var p = collectPayload(bootstrap);
    var keys = Object.keys(p).sort();
    var o = {};
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      o[k] = p[k];
    }
    return JSON.stringify(o);
  }

  function isRowDirty(bootstrap) {
    if (!bootstrap) {
      return false;
    }
    if (bootstrap.__groupBlocks) {
      var packs = bootstrap.__groupBlocks;
      var i;
      for (i = 0; i < packs.length; i++) {
        var pb = packs[i].b;
        if (canonicalPayload(pb) !== pb.__initialCanonical) {
          return true;
        }
      }
      return false;
    }
    return (
      typeof bootstrap.__initialCanonical !== "undefined" &&
      canonicalPayload(bootstrap) !== bootstrap.__initialCanonical
    );
  }

  /**
   * Предупреждение при уходе со страницы строки с несохранёнными правками.
   * pendingLeave: { kind: 'href', url } | { kind: 'stop', form } | { kind: 'reload' } (служебно) | { kind: 'trailBack' } | { kind: 'trailGo', index }.
   */
  function installLeaveGuard(bootstrap) {
    if (bootstrap.__leaveGuardInstalled) {
      return;
    }
    bootstrap.__leaveGuardInstalled = true;
    var TRAIL_KEY = "spod_edit_trail";
    var leaveGuardSuspended = false;
    var pendingLeave = null;
    var leaveOverlay = null;
    var leaveDialog = null;

    function isDirtyNow() {
      if (leaveGuardSuspended) {
        return false;
      }
      return isRowDirty(bootstrap);
    }

    function navigateTrailBack() {
      var meta = document.getElementById("row-page-meta");
      var listHref = meta ? "/sheet/" + encodeURIComponent(meta.dataset.sheetCode || "") : "/";
      var t;
      try {
        t = JSON.parse(sessionStorage.getItem(TRAIL_KEY) || "[]");
      } catch (e0) {
        t = [];
      }
      if (!Array.isArray(t) || !t.length) {
        window.location.href = listHref;
        return;
      }
      var prev = t.pop();
      sessionStorage.setItem(TRAIL_KEY, JSON.stringify(t));
      window.location.href = prev.href || listHref;
    }

    function navigateTrailIndex(i) {
      var t;
      try {
        t = JSON.parse(sessionStorage.getItem(TRAIL_KEY) || "[]");
      } catch (e1) {
        t = [];
      }
      if (!Array.isArray(t) || i < 0 || i >= t.length) {
        return;
      }
      var target = t[i];
      var nt = t.slice(0, i);
      sessionStorage.setItem(TRAIL_KEY, JSON.stringify(nt));
      window.location.href = target.href;
    }

    function ensureLeaveModal() {
      if (leaveOverlay) {
        return;
      }
      leaveOverlay = document.createElement("div");
      leaveOverlay.className =
        "spod-date-modal-overlay spod-leave-modal-overlay spod-date-modal-overlay--closed";
      leaveOverlay.setAttribute("role", "alertdialog");
      leaveOverlay.setAttribute("aria-modal", "true");
      leaveOverlay.setAttribute("aria-labelledby", "spod-leave-modal-title");
      leaveOverlay.addEventListener("click", function (e) {
        if (e.target === leaveOverlay) {
          pendingLeave = null;
          closeLeaveModal();
        }
      });
      leaveDialog = document.createElement("div");
      leaveDialog.className = "spod-leave-modal-dialog spod-date-modal-dialog";
      leaveDialog.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      leaveDialog.innerHTML =
        '<h2 id="spod-leave-modal-title" class="spod-leave-modal-title">Несохранённые изменения</h2>' +
        '<p class="muted spod-leave-modal-text">Есть правки, которые ещё не записаны в базу (кнопка «Сохранить в базу»). Что сделать?</p>' +
        '<div class="spod-leave-modal-actions">' +
        '<button type="button" class="btn btn-primary btn-sm spod-leave-btn-save">Сохранить и выйти</button>' +
        '<button type="button" class="btn btn-secondary btn-sm spod-leave-btn-discard">Выйти без сохранения</button>' +
        '<button type="button" class="btn btn-ghost btn-sm spod-leave-btn-stay">Остаться</button>' +
        "</div>";
      leaveOverlay.appendChild(leaveDialog);
      document.body.appendChild(leaveOverlay);
      leaveDialog.querySelector(".spod-leave-btn-stay").addEventListener("click", function () {
        pendingLeave = null;
        closeLeaveModal();
      });
    }

    function openLeaveModal(pending) {
      ensureLeaveModal();
      pendingLeave = pending;
      leaveOverlay.classList.remove("spod-date-modal-overlay--closed");
      document.body.classList.add("spod-date-modal-open");
      var stay = leaveDialog.querySelector(".spod-leave-btn-stay");
      if (stay) {
        stay.focus();
      }
    }

    function closeLeaveModal() {
      if (leaveOverlay) {
        leaveOverlay.classList.add("spod-date-modal-overlay--closed");
      }
      document.body.classList.remove("spod-date-modal-open");
    }

    function executePendingAfterNavigate() {
      var p = pendingLeave;
      pendingLeave = null;
      closeLeaveModal();
      if (!p) {
        return;
      }
      /* Решение в модалке уже принято — иначе при «выйти без сохранения» форма ещё грязная и срабатывает beforeunload. */
      leaveGuardSuspended = true;
      if (p.kind === "href") {
        window.location.href = p.url;
      } else if (p.kind === "stop") {
        try {
          p.form.requestSubmit();
        } catch (e2) {
          p.form.submit();
        }
        setTimeout(function () {
          leaveGuardSuspended = false;
        }, 200);
      } else if (p.kind === "reload") {
        window.location.reload();
      } else if (p.kind === "trailBack") {
        navigateTrailBack();
      } else if (p.kind === "trailGo") {
        navigateTrailIndex(p.index);
      }
    }

    async function saveRowThenExecutePending() {
      if (bootstrap.__groupBlocks) {
        alert(
          "Для листа GROUP с несколькими уровнями сохраните каждый блок кнопкой «Сохранить эту строку», затем повторите уход со страницы."
        );
        return;
      }
      var payload = collectPayload(bootstrap);
      var sc = bootstrap.sheetCode;
      var rid = bootstrap.rowId;
      var res = await fetch("/sheet/" + encodeURIComponent(sc) + "/row/" + rid + "/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        redirect: "manual",
      });
      if (res.status === 303 || res.status === 302) {
        var loc = res.headers.get("Location") || "";
        if (loc) {
          try {
            var nu = new URL(loc, window.location.origin);
            var m = nu.pathname.match(/\/row\/(\d+)/);
            if (m) {
              bootstrap.rowId = parseInt(m[1], 10);
            }
          } catch (e3) {
            /* игнор */
          }
        }
        bootstrap.__initialCanonical = canonicalPayload(bootstrap);
        refreshDirtyState(bootstrap);
        executePendingAfterNavigate();
        return;
      }
      if (res.ok) {
        bootstrap.__initialCanonical = canonicalPayload(bootstrap);
        refreshDirtyState(bootstrap);
        executePendingAfterNavigate();
        return;
      }
      var txt = await res.text();
      var msg = "Ошибка сохранения: " + res.status;
      try {
        var j = JSON.parse(txt);
        if (j.detail) {
          msg = String(j.detail);
        }
      } catch (e4) {
        msg += " " + txt.slice(0, 300);
      }
      alert(msg);
    }

    ensureLeaveModal();
    leaveDialog.querySelector(".spod-leave-btn-save").addEventListener("click", function () {
      saveRowThenExecutePending();
    });
    leaveDialog.querySelector(".spod-leave-btn-discard").addEventListener("click", function () {
      executePendingAfterNavigate();
    });

    window.addEventListener("beforeunload", function (e) {
      if (!isDirtyNow()) {
        return;
      }
      e.preventDefault();
      e.returnValue = "";
    });

    document.addEventListener(
      "click",
      function (e) {
        if (!isDirtyNow()) {
          return;
        }
        if (e.target && e.target.closest && e.target.closest(".spod-leave-modal-overlay")) {
          return;
        }
        /* Кнопки дока «Сохранить в базу» / «Отменить правку» — не навигация; модалку ухода не показываем. */
        if (e.target && e.target.closest && e.target.closest("#btn-save, #btn-cancel")) {
          return;
        }
        var backBtn = e.target.closest && e.target.closest("#spod-trail-back");
        if (backBtn) {
          e.preventDefault();
          e.stopImmediatePropagation();
          openLeaveModal({ kind: "trailBack" });
          return;
        }
        var a = e.target.closest && e.target.closest("a[href]");
        if (!a) {
          return;
        }
        if (a.download) {
          return;
        }
        if (a.target === "_blank") {
          return;
        }
        if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
          return;
        }
        if (a.hasAttribute("data-trail-go")) {
          e.preventDefault();
          e.stopImmediatePropagation();
          var ix = parseInt(a.getAttribute("data-trail-go") || "-1", 10);
          openLeaveModal({ kind: "trailGo", index: ix });
          return;
        }
        var href = a.getAttribute("href") || "";
        if (!href || href === "#") {
          return;
        }
        if (href.charAt(0) === "#") {
          return;
        }
        try {
          var next = new URL(a.href, window.location.href);
          var cur = new URL(window.location.href);
          if (next.href.split("#")[0] === cur.href.split("#")[0]) {
            return;
          }
        } catch (e5) {
          return;
        }
        e.preventDefault();
        e.stopImmediatePropagation();
        openLeaveModal({ kind: "href", url: a.href });
      },
      true
    );

    var stopForm = document.getElementById("form-stop-server");
    if (stopForm) {
      stopForm.addEventListener(
        "submit",
        function (e) {
          if (!isDirtyNow()) {
            return;
          }
          e.preventDefault();
          e.stopImmediatePropagation();
          openLeaveModal({ kind: "stop", form: stopForm });
        },
        true
      );
    }

    /* Отмена правки: перезагрузка без системного диалога beforeunload (явное действие пользователя). */
    var btnCancelDock = document.getElementById("btn-cancel");
    if (btnCancelDock) {
      btnCancelDock.addEventListener("click", function () {
        leaveGuardSuspended = true;
        window.location.reload();
      });
    }

    /* Успешное сохранение с редиректом: до выгрузки форма ещё «грязная» — иначе снова сработает beforeunload. */
    bootstrap.__spodSuspendLeaveForNavigation = function () {
      leaveGuardSuspended = true;
    };
  }

  function refreshGroupMultiDirtyState(blocks) {
    var any = false;
    blocks.forEach(function (blk) {
      any = any || canonicalPayload(blk) !== blk.__initialCanonical;
    });
    var dock = document.getElementById("edit-dock");
    var banner = document.getElementById("edit-dirty-banner");
    if (dock) {
      dock.classList.toggle("edit-dock--dirty", any);
    }
    if (banner) {
      banner.classList.toggle("is-hidden", !any);
    }
  }

  function refreshDirtyState(bootstrap) {
    var dock = document.getElementById("edit-dock");
    var btnSave = document.getElementById("btn-save");
    var btnCancel = document.getElementById("btn-cancel");
    var banner = document.getElementById("edit-dirty-banner");
    if (bootstrap.__groupBlocks) {
      return;
    }
    if (!btnSave || typeof bootstrap.__initialCanonical === "undefined") {
      return;
    }
    var cur = canonicalPayload(bootstrap);
    var dirty = cur !== bootstrap.__initialCanonical;
    btnSave.disabled = !dirty;
    if (btnCancel) {
      btnCancel.disabled = !dirty;
    }
    if (dock) {
      dock.classList.toggle("edit-dock--dirty", dirty);
    }
    if (banner) {
      banner.classList.toggle("is-hidden", !dirty);
    }

    var fgFlat = flatGridFor(bootstrap);
    if (fgFlat) {
      fgFlat.querySelectorAll("[data-col]").forEach(function (inp) {
        var cell = inp.closest(".scalar-cell");
        var was = cell && cell.querySelector(".was-value");
        if (!was) {
          return;
        }
        var init = inp.getAttribute("data-initial") || "";
        if (inp.value !== init) {
          was.classList.remove("is-hidden");
          was.textContent = "Было: " + (init === "" ? "∅" : init);
          cell.classList.add("scalar-cell--changed");
        } else {
          was.classList.add("is-hidden");
          cell.classList.remove("scalar-cell--changed");
        }
      });
    }

    (bootstrap.jsonCols || []).forEach(function (jc) {
      var box = findJsonBox(jc.column);
      var wrap = document.getElementById(
        "sec-json-" + (jc.section_slug || jc.column.replace(/[^a-zA-Z0-9_-]/g, "_"))
      );
      if (!box || !wrap) {
        return;
      }
      var initN = box.getAttribute("data-initial-json-norm") || "";
      var curN = normalizeJsonCell(buildJsonFromFields(box));
      if (initN !== curN) {
        wrap.classList.add("json-column-panel--changed");
        var hint = box.querySelector(".json-changed-hint");
        if (!hint) {
          hint = document.createElement("div");
          hint.className = "json-changed-hint";
          hint.innerHTML =
            '<p class="muted json-changed-title">Колонка изменена (ещё не сохранено в новую версию строки).</p>' +
            '<div class="was-json-wrap"><span class="was-json-label">Было (в базе):</span><pre class="json-was-pre"></pre></div>';
          var tb = box.querySelector(".json-column-toolbar");
          if (tb) {
            tb.after(hint);
          } else {
            box.prepend(hint);
          }
        }
        var prevDisplay = initN === "" ? "∅" : initN;
        if (initN !== "") {
          try {
            prevDisplay = JSON.stringify(JSON.parse(initN), null, 2);
          } catch (e0) {
            /* не JSON — показываем как текст */
          }
        }
        var pre = hint.querySelector(".json-was-pre");
        if (pre) {
          pre.textContent = prevDisplay;
        }
      } else {
        wrap.classList.remove("json-column-panel--changed");
        var hint2 = box.querySelector(".json-changed-hint");
        if (hint2) {
          hint2.remove();
        }
      }
    });
  }

  function init() {
    var groupEl = document.getElementById("row-editor-group-blocks");
    if (groupEl) {
      var blocks;
      try {
        blocks = JSON.parse(groupEl.textContent);
      } catch (e0) {
        console.error(e0);
        return;
      }
      if (!Array.isArray(blocks) || !blocks.length) {
        return;
      }
      blocks.forEach(function (blk) {
        blk.__flatGridId = "flat-field-grid-" + blk.rowId;
      });
      var dock0 = document.getElementById("edit-dock");
      if (dock0) {
        dock0.classList.add("edit-dock--group-multi");
      }
      blocks.forEach(function (blk) {
        renderFlatSection(blk);
        blk.__initialCanonical = canonicalPayload(blk);
      });
      var globalFilter = document.getElementById("flat-field-filter-group-all");
      if (globalFilter) {
        globalFilter.addEventListener("input", function () {
          var q = (globalFilter.value || "").trim().toLowerCase();
          document.querySelectorAll(".group-contest-flat-grid .scalar-cell").forEach(function (c) {
            var t = c.getAttribute("data-filter-text") || "";
            c.style.display = !q || t.indexOf(q) !== -1 ? "" : "none";
          });
        });
      }
      document.querySelectorAll(".flat-field-filter--group-block").forEach(function (inp) {
        inp.addEventListener("input", function () {
          var tid = inp.getAttribute("data-target-grid");
          var g = tid ? document.getElementById(tid) : null;
          if (!g) {
            return;
          }
          var q = (inp.value || "").trim().toLowerCase();
          g.querySelectorAll(".scalar-cell").forEach(function (c) {
            var t = c.getAttribute("data-filter-text") || "";
            c.style.display = !q || t.indexOf(q) !== -1 ? "" : "none";
          });
        });
      });
      var lead = blocks[0];
      lead.__groupBlocks = blocks.map(function (b) {
        return { b: b, grid: flatGridFor(b) };
      });
      var jsonRootG = document.getElementById("json-columns-mount");
      if (jsonRootG && blocks[0]) {
        (blocks[0].jsonCols || []).forEach(function (jc) {
          var wrap = document.createElement("section");
          wrap.className = "panel json-column-panel";
          wrap.id = "sec-json-" + (jc.section_slug || jc.column.replace(/[^a-zA-Z0-9_-]/g, "_"));
          var h = document.createElement("h2");
          h.textContent = "JSON · " + jc.column;
          wrap.appendChild(h);
          var inner = document.createElement("div");
          inner.className = "json-column-card";
          renderJsonColumn(inner, jc, blocks[0]);
          wrap.appendChild(inner);
          jsonRootG.appendChild(wrap);
        });
      }
      wireNav();
      document.addEventListener("spod-editor-change", function () {
        refreshGroupMultiDirtyState(blocks);
      });
      refreshGroupMultiDirtyState(blocks);
      installLeaveGuard(lead);
      document.querySelectorAll(".btn-save-group-row").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var rid = parseInt(btn.getAttribute("data-row-id"), 10);
          var blk = null;
          var bi;
          for (bi = 0; bi < blocks.length; bi++) {
            if (blocks[bi].rowId === rid) {
              blk = blocks[bi];
              break;
            }
          }
          if (!blk) {
            return;
          }
          var payload = collectPayload(blk);
          var res = await fetch(
            "/sheet/" + encodeURIComponent(blk.sheetCode) + "/row/" + rid + "/save",
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(payload),
              redirect: "manual",
            }
          );
          if (res.status === 303 || res.status === 302) {
            var loc = res.headers.get("Location") || "";
            if (loc) {
              window.location.href = loc;
              return;
            }
          }
          if (res.ok) {
            window.location.reload();
            return;
          }
          var txt = await res.text();
          try {
            var j = JSON.parse(txt);
            if (j.detail) {
              alert(String(j.detail));
              return;
            }
          } catch (e2) {
            /* ignore */
          }
          alert("Ошибка сохранения: " + res.status + " " + txt.slice(0, 500));
        });
      });
      return;
    }

    var el = document.getElementById("row-editor-bootstrap");
    if (!el) {
      return;
    }
    var bootstrap;
    try {
      bootstrap = JSON.parse(el.textContent);
    } catch (e) {
      console.error(e);
      return;
    }

    renderFlatSection(bootstrap);

    if (bootstrap.sheetCode === "REWARD") {
      var flatMountRt = document.getElementById("flat-field-grid");
      if (flatMountRt) {
        var onRewardTypeDomChange = function () {
          syncRewardTypeFromDomToBootstrap(bootstrap);
          var jb = findJsonBox("REWARD_ADD_DATA");
          if (jb) {
            refreshRewardAddDataJsonUi(bootstrap, jb);
          }
        };
        flatMountRt.addEventListener("change", onRewardTypeDomChange);
      }
    }

    var jsonRoot = document.getElementById("json-columns-mount");
    if (jsonRoot) {
      (bootstrap.jsonCols || []).forEach(function (jc) {
        var wrap = document.createElement("section");
        wrap.className = "panel json-column-panel";
        wrap.id = "sec-json-" + (jc.section_slug || jc.column.replace(/[^a-zA-Z0-9_-]/g, "_"));
        var h = document.createElement("h2");
        h.textContent = "JSON · " + jc.column;
        wrap.appendChild(h);
        var inner = document.createElement("div");
        inner.className = "json-column-card";
        renderJsonColumn(inner, jc, bootstrap);
        wrap.appendChild(inner);
        jsonRoot.appendChild(wrap);
      });
    }

    wireNav();

    bootstrap.__initialCanonical = canonicalPayload(bootstrap);
    document.addEventListener("spod-editor-change", function () {
      refreshDirtyState(bootstrap);
    });
    refreshDirtyState(bootstrap);

    /* Перехват навигации и остановки сервера при несохранённых правках. */
    installLeaveGuard(bootstrap);

    var btn = document.getElementById("btn-save");
    if (btn) {
      btn.addEventListener("click", async function () {
        var payload = collectPayload(bootstrap);
        var sc = bootstrap.sheetCode;
        var rid = bootstrap.rowId;
        var res = await fetch("/sheet/" + encodeURIComponent(sc) + "/row/" + rid + "/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          redirect: "manual",
        });
        if (res.status === 303 || res.status === 302) {
          var loc = res.headers.get("Location");
          if (loc) {
            if (bootstrap.__spodSuspendLeaveForNavigation) {
              bootstrap.__spodSuspendLeaveForNavigation();
            }
            window.location.href = loc;
            return;
          }
        }
        if (res.ok) {
          if (bootstrap.__spodSuspendLeaveForNavigation) {
            bootstrap.__spodSuspendLeaveForNavigation();
          }
          window.location.href = "/sheet/" + encodeURIComponent(sc) + "/row/" + rid;
          return;
        }
        var txt = await res.text();
        try {
          var j = JSON.parse(txt);
          if (j.detail) {
            alert(String(j.detail));
            return;
          }
        } catch (e2) {
          /* ignore */
        }
        alert("Ошибка сохранения: " + res.status + " " + txt.slice(0, 500));
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  /**
   * API для мастера и внешних страниц: тот же рендер JSON-колонки, что и в карточке строки.
   */
  window.SpodJsonEditor = {
    renderJsonColumn: renderJsonColumn,
    buildJsonFromFields: buildJsonFromFields,
    normalizeJsonCell: normalizeJsonCell,
    mergeDeclaredJsonTemplate: mergeDeclaredJsonTemplate,
    tryParseSpodJsonCell: tryParseSpodJsonCell,
    refreshRewardAddDataJsonUi: refreshRewardAddDataJsonUi,
  };

  /** Общие бейджи ограничений для мастера (те же правила, что в applyFieldUiLabel). */
  window.SpodFieldUiSignals = {
    appendConstraintBadges: appendConstraintBadges,
  };

  /** Числовые поля по config editor_field_numeric (карточка строки и мастер). */
  window.SpodNumericField = {
    findDef: findNumericRuleDef,
    resolveActiveNumericSpec: resolveActiveNumericSpec,
    applyNumericFormatToValue: applyNumericFormatToValue,
    readFlatControlValue: readFlatControlValue,
    attachNumericFlatInput: attachNumericFlatInput,
  };
})();
