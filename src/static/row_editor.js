/**
 * Редактор строки: сетка плоских полей, развёртка JSON в параметры, сборка при сохранении.
 * Для листа REWARD и колонки REWARD_ADD_DATA список полей и шаблон зависят от REWARD_TYPE (см. каталог JSON).
 * Пустой объект JSON дополняется шаблоном из field_enums и обязательных json_path в editor_field_ui;
 * экспорт window.SpodJsonEditor — тот же UI в мастере создания конкурса.
 * Списки допустимых значений и «Задать своё» задаются в config.json (field_enums по листам);
 * календарь для дат — `spod_date_picker.js` + подсказки в editor_textareas (`input_type` date / datepicker);
 * подписи и описания полей — editor_field_ui (развёртка в bootstrap.fieldUi);
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

  /** Есть ли у листа непустое значение (чтобы показать поле, не предусмотренное для типа). */
  function rewardAddDataLeafHasMeaningfulValue(leaf) {
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
   * Оставляет в списке листьев только те, что относятся к текущему REWARD_TYPE,
   * плюс «лишние» ключи каталога с непустыми данными и любые неизвестные ключи верхнего уровня.
   */
  function filterRewardAddDataLeaves(leaves, column, bootstrap) {
    if (bootstrap.sheetCode !== "REWARD" || column !== "REWARD_ADD_DATA") {
      return leaves;
    }
    var rt = rewardTypeFromBootstrap(bootstrap);
    if (!rt) {
      return leaves;
    }
    return leaves.filter(function (leaf) {
      if (rewardAddDataPathAllowedForType(leaf.parts, rt)) {
        return true;
      }
      return rewardAddDataLeafHasMeaningfulValue(leaf);
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
   * с ключом json_path (включая []) — соответствие пути внутри JSON-колонки.
   */
  function findFieldEnum(bootstrap, column, jsonParts) {
    var list = bootstrap.fieldEnums || [];
    var sc = bootstrap.sheetCode;
    var jParts = jsonParts === undefined ? null : jsonParts;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r.sheet_code !== sc || r.column !== column) {
        continue;
      }
      if (!ruleHasJsonPath(r)) {
        if (jParts === null) {
          return r;
        }
      } else if (partsMatchJsonPath(jParts || [], r.json_path)) {
        return r;
      }
    }
    return null;
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

  function flattenLeaves(value, pathParts, out) {
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
      if (value.length === 0) {
        out.push({ parts: pathParts.slice(), vtype: "empty-array", display: "" });
        return;
      }
      value.forEach(function (item, i) {
        flattenLeaves(item, pathParts.concat(i), out);
      });
      return;
    }
    var keys = Object.keys(value);
    if (keys.length === 0) {
      out.push({ parts: pathParts.slice(), vtype: "empty-object", display: "" });
      return;
    }
    keys.forEach(function (k) {
      flattenLeaves(value[k], pathParts.concat(k), out);
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
    if (leaves.length === 0) {
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

    leaves.forEach(function (row) {
      var vt3 = row.getAttribute("data-vtype");
      if (vt3 === "empty-array" || vt3 === "empty-object") {
        return;
      }
      var parts = JSON.parse(row.getAttribute("data-json-path"));
      var val = coerceLeafValue(row);
      setDeep(root, parts, val);
    });

    return JSON.stringify(root);
  }

  function renderJsonColumn(container, jc, bootstrap) {
    var col = jc.column;
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
    flattenLeaves(parsed, [], leaves);
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

    leaves.forEach(function (leaf) {
      var row = document.createElement("div");
      row.className = "json-leaf-row grid-cell";
      row.setAttribute("data-json-path", JSON.stringify(leaf.parts));
      row.setAttribute("data-vtype", leaf.vtype);
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
        var enumN = findFieldEnum(bootstrap, col, leaf.parts);
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

    fieldsWrap.appendChild(grid);

    taRaw.value =
      typeof parsed === "object" && parsed !== null
        ? JSON.stringify(parsed, null, 2)
        : JSON.stringify(parsed);

    wireEnumControls(container);

    container.setAttribute("data-initial-json-norm", normalizeJsonCell(buildJsonFromFields(container)));

    var filterInp = toolbar.querySelector(".json-filter");
    filterInp.addEventListener("input", function (ev) {
      var q = (ev.target.value || "").trim().toLowerCase();
      grid.querySelectorAll(".json-leaf-row").forEach(function (r) {
        var t = r.getAttribute("data-filter-text") || "";
        r.style.display = !q || t.indexOf(q) !== -1 ? "" : "none";
      });
    });

    toolbar.querySelector(".js-mode-fields").addEventListener("click", function () {
      container.setAttribute("data-edit-mode", "fields");
      fieldsWrap.classList.remove("is-hidden");
      rawWrap.classList.add("is-hidden");
      document.dispatchEvent(new Event("spod-editor-change"));
    });
    toolbar.querySelector(".js-mode-raw").addEventListener("click", function () {
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

  function renderFlatSection(bootstrap) {
    var grid = document.getElementById("flat-field-grid");
    if (!grid) {
      return;
    }
    var flat = bootstrap.flat || {};
    var keys = Object.keys(flat);
    if (keys.length === 0) {
      grid.innerHTML = '<p class="muted">Все колонки этого листа относятся к JSON-блокам справа.</p>';
      return;
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
      var safeId = "col-" + col.replace(/[^a-zA-Z0-9_]/g, "_");
      var lab = document.createElement("label");
      lab.setAttribute("for", safeId);
      applyFieldUiLabel(bootstrap, lab, col, null, col);
      var was = document.createElement("div");
      was.className = "was-value is-hidden";

      var dateHint = findDatePickerHint(bootstrap, col, null);
      var rule = findFieldEnum(bootstrap, col, null);
      var initV = flat[col] != null ? String(flat[col]) : "";

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
    document.querySelectorAll("[data-col]").forEach(function (el) {
      o[el.dataset.col] = el.value;
    });
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

  /** Сравнение JSON-ячеек с учётом нормализации пробелов в компактном виде. */
  function normalizeJsonCell(raw) {
    var t = (raw != null ? String(raw) : "").trim();
    if (!t) {
      return "";
    }
    try {
      return JSON.stringify(JSON.parse(t));
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
    return (
      bootstrap &&
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

  function refreshDirtyState(bootstrap) {
    var dock = document.getElementById("edit-dock");
    var btnSave = document.getElementById("btn-save");
    var btnCancel = document.getElementById("btn-cancel");
    var banner = document.getElementById("edit-dirty-banner");
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

    document.querySelectorAll("[data-col]").forEach(function (inp) {
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
  };

  /** Общие бейджи ограничений для мастера (те же правила, что в applyFieldUiLabel). */
  window.SpodFieldUiSignals = {
    appendConstraintBadges: appendConstraintBadges,
  };
})();
