/**
 * Редактор строки: сетка плоских полей, развёртка JSON в параметры, сборка при сохранении.
 * Списки допустимых значений и «Задать своё» задаются в config.json (field_enums по листам);
 * в bootstrap приходит уже плоский список (развёртка на сервере).
 */
(function () {
  "use strict";

  /** Внутреннее значение select для режима произвольного ввода (см. allow_custom). */
  var CUSTOM_SENTINEL = "__SPOD_CUSTOM__";

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

  /** Подсказка по min_rows/max_rows для textarea (плоское поле или путь в JSON). */
  function findTextareaHint(bootstrap, column, jsonParts) {
    var list = bootstrap.editorTextareas || [];
    var sc = bootstrap.sheetCode;
    var jParts = jsonParts === undefined ? null : jsonParts;
    for (var j = 0; j < list.length; j++) {
      var h = list[j];
      if (h.sheet_code !== sc || h.column !== column) {
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

  function fillSelectOptions(sel, options, allowCustom, current) {
    sel.innerHTML = "";
    var seen = Object.create(null);
    (options || []).forEach(function (op) {
      seen[op] = true;
      var o = document.createElement("option");
      o.value = op;
      o.textContent = op === "" ? "(пусто)" : String(op);
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

    var leaves = [];
    flattenLeaves(parsed, [], leaves);

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
      row.setAttribute("data-filter-text", formatPath(leaf.parts).toLowerCase());

      var lab = document.createElement("label");
      lab.className = "json-path-label";
      lab.textContent = formatPath(leaf.parts);
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
      cell.setAttribute("data-filter-text", col.toLowerCase());
      var safeId = "col-" + col.replace(/[^a-zA-Z0-9_]/g, "_");
      var lab = document.createElement("label");
      lab.setAttribute("for", safeId);
      lab.textContent = col;
      var was = document.createElement("div");
      was.className = "was-value is-hidden";

      var rule = findFieldEnum(bootstrap, col, null);
      var initV = flat[col] != null ? String(flat[col]) : "";

      if (rule) {
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
        sel.setAttribute("aria-label", col);
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
    var sorted = Object.keys(p)
      .sort()
      .map(function (k) {
        return [k, p[k]];
      });
    return JSON.stringify(Object.fromEntries(sorted));
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
            window.location.href = loc;
            return;
          }
        }
        if (res.ok) {
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
    var btnCancel = document.getElementById("btn-cancel");
    if (btnCancel) {
      btnCancel.addEventListener("click", function () {
        window.location.reload();
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
