/**
 * Редактор строки: сетка плоских полей, развёртка JSON в параметры, сборка при сохранении.
 * Списки допустимых значений и «Задать своё» задаются в config.json (field_enums по листам);
 * календарь для дат — в editor_textareas (подсказка с input_type "date" или date_picker: true);
 * в bootstrap приходят плоские списки (развёртка на сервере).
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

  /**
   * Подсказка «поле-дата»: в editor_textareas — input_type "date" или date_picker true.
   * Логика путей json_path такая же, как у findTextareaHint (плоская колонка или лист JSON).
   */
  function findDatePickerHint(bootstrap, column, jsonParts) {
    var list = bootstrap.editorTextareas || [];
    var sc = bootstrap.sheetCode;
    var jParts = jsonParts === undefined ? null : jsonParts;
    for (var j = 0; j < list.length; j++) {
      var h = list[j];
      if (h.sheet_code !== sc || h.column !== column) {
        continue;
      }
      var isDate =
        h.input_type === "date" ||
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

  /** Строка YYYY-MM-DD, допустимая для input[type=date] без сдвига дня. */
  function isStrictIsoCalendarDate(s) {
    var t = (s || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t)) {
      return false;
    }
    var p = t.split("-");
    var y = parseInt(p[0], 10);
    var m = parseInt(p[1], 10);
    var d = parseInt(p[2], 10);
    var dt = new Date(y, m - 1, d);
    return dt.getFullYear() === y && dt.getMonth() === m - 1 && dt.getDate() === d;
  }

  /** Двузначный компонент даты для ISO. */
  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  /** Сборка YYYY-MM-DD (месяц 1–12). */
  function formatYMD(y, m, d) {
    return y + "-" + pad2(m) + "-" + pad2(d);
  }

  /** Разбор валидной ISO-даты → {y,m,d} или null. */
  function parseYMDParts(s) {
    var t = (s || "").trim();
    if (!isStrictIsoCalendarDate(t)) {
      return null;
    }
    var p = t.split("-");
    return { y: parseInt(p[0], 10), m: parseInt(p[1], 10), d: parseInt(p[2], 10) };
  }

  /** Сегодня по локальному времени браузера. */
  function localTodayYmd() {
    var t = new Date();
    return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
  }

  var MONTHS_RU = [
    "Январь",
    "Февраль",
    "Март",
    "Апрель",
    "Май",
    "Июнь",
    "Июль",
    "Август",
    "Сентябрь",
    "Октябрь",
    "Ноябрь",
    "Декабрь",
  ];

  /**
   * Одно модальное окно поверх страницы: сетка месяца, черновик даты до «ОК»,
   * кнопки Сегодня / Начало года / Конец года (для года, отображаемого в шапке календаря).
   */
  var SpodDateModal = (function () {
    var overlay = null;
    var monthTrigger = null;
    var monthDropdown = null;
    var monthWrap = null;
    var yearInputEl = null;
    var yearHint = null;
    var quickBar = null;
    var gridEl = null;
    var targetHidden = null;
    var afterCommit = null;
    var viewY = 2020;
    var viewM = 0;
    var draft = null;

    /** Скрыть выпадающий список месяцев. */
    function hideMonthDropdown() {
      if (monthDropdown) {
        monthDropdown.classList.add("is-hidden");
      }
    }

    /** Если есть черновик даты — ограничить число дня длиной месяца (год/месяц из черновика). */
    function clampDraftDay() {
      if (!draft) {
        return;
      }
      var dim = new Date(draft.y, draft.m, 0).getDate();
      if (draft.d > dim) {
        draft.d = dim;
      }
    }

    /** Применить год из поля ввода (число в допустимом диапазоне). */
    function applyYearFromInput() {
      if (!yearInputEl) {
        return;
      }
      var y = parseInt(String(yearInputEl.value).trim(), 10);
      if (!isFinite(y)) {
        yearInputEl.value = String(viewY);
        return;
      }
      y = Math.max(1000, Math.min(3999, y));
      viewY = y;
      clampDraftDay();
      renderCalendar();
    }

    function onEscape(e) {
      if (e.key === "Escape") {
        e.preventDefault();
        hideMonthDropdown();
        cancel();
      }
    }

    function ensureDom() {
      if (overlay) {
        return;
      }
      overlay = document.createElement("div");
      /* Не используем общий класс .is-hidden: у него display:none !important — конфликты при показе. */
      overlay.className = "spod-date-modal-overlay spod-date-modal-overlay--closed";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-label", "Выбор даты");
      overlay.addEventListener("click", function (e) {
        if (e.target === overlay) {
          hideMonthDropdown();
          cancel();
        }
      });

      var dlg = document.createElement("div");
      dlg.className = "spod-date-modal-dialog";
      dlg.addEventListener("click", function (e) {
        e.stopPropagation();
      });
      /* Клик вне блока месяца — закрыть список месяцев. */
      dlg.addEventListener("click", function (e) {
        if (monthWrap && !monthWrap.contains(e.target)) {
          hideMonthDropdown();
        }
      });

      var head = document.createElement("div");
      head.className = "spod-date-modal-head";
      var navL = document.createElement("div");
      navL.className = "spod-date-modal-nav";
      var bPrevY = document.createElement("button");
      bPrevY.type = "button";
      bPrevY.className = "btn btn-ghost btn-sm spod-date-nav-btn";
      bPrevY.title = "Предыдущий год";
      bPrevY.textContent = "«";
      var bPrevM = document.createElement("button");
      bPrevM.type = "button";
      bPrevM.className = "btn btn-ghost btn-sm spod-date-nav-btn";
      bPrevM.title = "Предыдущий месяц";
      bPrevM.textContent = "‹";

      monthWrap = document.createElement("div");
      monthWrap.className = "spod-date-month-wrap";
      monthTrigger = document.createElement("button");
      monthTrigger.type = "button";
      monthTrigger.className = "btn btn-ghost btn-sm spod-date-month-trigger";
      monthTrigger.setAttribute("aria-expanded", "false");
      monthTrigger.setAttribute("aria-haspopup", "listbox");
      monthTrigger.title = "Список месяцев";
      monthDropdown = document.createElement("div");
      monthDropdown.className = "spod-date-month-dropdown is-hidden";
      monthDropdown.setAttribute("role", "listbox");
      monthDropdown.setAttribute("aria-label", "Выбор месяца");
      for (var mi = 0; mi < 12; mi++) {
        (function (mIdx) {
          var opt = document.createElement("button");
          opt.type = "button";
          opt.className = "spod-date-month-option";
          opt.setAttribute("role", "option");
          opt.textContent = MONTHS_RU[mIdx];
          opt.addEventListener("click", function (ev) {
            ev.stopPropagation();
            viewM = mIdx;
            clampDraftDay();
            hideMonthDropdown();
            monthTrigger.setAttribute("aria-expanded", "false");
            renderCalendar();
          });
          monthDropdown.appendChild(opt);
        })(mi);
      }
      monthTrigger.addEventListener("click", function (ev) {
        ev.stopPropagation();
        if (monthDropdown.classList.contains("is-hidden")) {
          monthDropdown.classList.remove("is-hidden");
          monthTrigger.setAttribute("aria-expanded", "true");
        } else {
          monthDropdown.classList.add("is-hidden");
          monthTrigger.setAttribute("aria-expanded", "false");
        }
      });
      monthWrap.appendChild(monthTrigger);
      monthWrap.appendChild(monthDropdown);

      yearInputEl = document.createElement("input");
      yearInputEl.type = "number";
      yearInputEl.className = "spod-date-year-input";
      yearInputEl.min = "1000";
      yearInputEl.max = "3999";
      yearInputEl.step = "1";
      yearInputEl.title = "Год (можно ввести с клавиатуры)";
      yearInputEl.setAttribute("aria-label", "Год");
      yearInputEl.addEventListener("change", function () {
        applyYearFromInput();
      });
      yearInputEl.addEventListener("blur", function () {
        applyYearFromInput();
      });
      yearInputEl.addEventListener("keydown", function (ev) {
        if (ev.key === "Enter") {
          ev.preventDefault();
          applyYearFromInput();
          yearInputEl.blur();
        }
      });

      var bNextM = document.createElement("button");
      bNextM.type = "button";
      bNextM.className = "btn btn-ghost btn-sm spod-date-nav-btn";
      bNextM.title = "Следующий месяц";
      bNextM.textContent = "›";
      var bNextY = document.createElement("button");
      bNextY.type = "button";
      bNextY.className = "btn btn-ghost btn-sm spod-date-nav-btn";
      bNextY.title = "Следующий год";
      bNextY.textContent = "»";
      navL.appendChild(bPrevY);
      navL.appendChild(bPrevM);
      navL.appendChild(monthWrap);
      navL.appendChild(yearInputEl);
      navL.appendChild(bNextM);
      navL.appendChild(bNextY);
      head.appendChild(navL);
      yearHint = document.createElement("p");
      yearHint.className = "muted spod-date-modal-year-hint";
      head.appendChild(yearHint);

      bPrevY.addEventListener("click", function () {
        viewY -= 1;
        clampDraftDay();
        renderCalendar();
      });
      bNextY.addEventListener("click", function () {
        viewY += 1;
        clampDraftDay();
        renderCalendar();
      });
      bPrevM.addEventListener("click", function () {
        viewM -= 1;
        if (viewM < 0) {
          viewM = 11;
          viewY -= 1;
        }
        clampDraftDay();
        renderCalendar();
      });
      bNextM.addEventListener("click", function () {
        viewM += 1;
        if (viewM > 11) {
          viewM = 0;
          viewY += 1;
        }
        clampDraftDay();
        renderCalendar();
      });

      quickBar = document.createElement("div");
      quickBar.className = "spod-date-modal-quick";

      function mkBtn(text, cls, handler) {
        var b = document.createElement("button");
        b.type = "button";
        b.className = cls || "btn btn-secondary btn-sm";
        b.textContent = text;
        b.addEventListener("click", handler);
        return b;
      }

      quickBar.appendChild(
        mkBtn("Начало", "btn btn-secondary btn-sm", function () {
          draft = { y: viewY, m: 1, d: 1 };
          viewM = 0;
          hideMonthDropdown();
          renderCalendar();
        })
      );
      quickBar.appendChild(
        mkBtn("Конец", "btn btn-secondary btn-sm", function () {
          draft = { y: viewY, m: 12, d: 31 };
          viewM = 11;
          hideMonthDropdown();
          renderCalendar();
        })
      );

      gridEl = document.createElement("div");
      gridEl.className = "spod-date-modal-grid";

      var actions = document.createElement("div");
      actions.className = "spod-date-modal-actions";

      actions.appendChild(
        mkBtn("ОК", "btn btn-primary btn-sm spod-date-btn-ok", function () {
          if (!targetHidden) {
            return;
          }
          if (draft) {
            targetHidden.value = formatYMD(draft.y, draft.m, draft.d);
          } else {
            targetHidden.value = "";
          }
          if (afterCommit) {
            afterCommit();
          }
          document.dispatchEvent(new Event("spod-editor-change"));
          hideMonthDropdown();
          close();
        })
      );
      actions.appendChild(
        mkBtn("Сегодня", "btn btn-secondary btn-sm", function () {
          var t = localTodayYmd();
          draft = { y: t.y, m: t.m, d: t.d };
          viewY = t.y;
          viewM = t.m - 1;
          hideMonthDropdown();
          renderCalendar();
        })
      );
      actions.appendChild(
        mkBtn("Отмена", "btn btn-ghost btn-sm", function () {
          hideMonthDropdown();
          cancel();
        })
      );

      dlg.appendChild(head);
      dlg.appendChild(quickBar);
      dlg.appendChild(gridEl);
      dlg.appendChild(actions);
      overlay.appendChild(dlg);
      document.body.appendChild(overlay);
    }

    function renderCalendar() {
      if (!gridEl || !monthTrigger || !yearInputEl || !yearHint) {
        return;
      }
      monthTrigger.textContent = MONTHS_RU[viewM];
      if (document.activeElement !== yearInputEl) {
        yearInputEl.value = String(viewY);
      }
      monthTrigger.setAttribute("aria-expanded", monthDropdown.classList.contains("is-hidden") ? "false" : "true");
      var opts = monthDropdown.querySelectorAll(".spod-date-month-option");
      for (var oi = 0; oi < opts.length; oi++) {
        opts[oi].classList.toggle("is-current-month", oi === viewM);
      }
      yearHint.textContent =
        "«Начало» и «Конец» — 1 января и 31 декабря года " +
        viewY +
        ". Год можно ввести в поле справа от названия месяца.";
      gridEl.innerHTML = "";
      var weekHead = document.createElement("div");
      weekHead.className = "spod-date-cal-week spod-date-cal-week--head";
      ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].forEach(function (w) {
        var c = document.createElement("div");
        c.className = "spod-date-cal-hd";
        c.textContent = w;
        weekHead.appendChild(c);
      });
      gridEl.appendChild(weekHead);

      var dim = new Date(viewY, viewM + 1, 0).getDate();
      var firstWd = new Date(viewY, viewM, 1).getDay();
      var pad = (firstWd + 6) % 7;
      var total = pad + dim;
      var rows = Math.ceil(total / 7);
      var dayNum = 1;
      var tloc = localTodayYmd();
      for (var r = 0; r < rows; r++) {
        var row = document.createElement("div");
        row.className = "spod-date-cal-week";
        for (var c = 0; c < 7; c++) {
          var cell = document.createElement("button");
          cell.type = "button";
          cell.className = "spod-date-cal-cell";
          var idx = r * 7 + c;
          if (idx < pad || dayNum > dim) {
            cell.classList.add("spod-date-cal-cell--empty");
            cell.disabled = true;
            cell.textContent = "";
          } else {
            var d = dayNum++;
            cell.textContent = String(d);
            cell.classList.add("spod-date-cal-cell--day");
            if (draft && draft.y === viewY && draft.m === viewM + 1 && draft.d === d) {
              cell.classList.add("is-selected");
            }
            if (viewY === tloc.y && viewM + 1 === tloc.m && d === tloc.d) {
              cell.classList.add("is-today");
            }
            (function (dd) {
              cell.addEventListener("click", function () {
                draft = { y: viewY, m: viewM + 1, d: dd };
                renderCalendar();
              });
            })(d);
          }
          row.appendChild(cell);
        }
        gridEl.appendChild(row);
      }
    }

    function close() {
      hideMonthDropdown();
      if (overlay) {
        overlay.classList.add("spod-date-modal-overlay--closed");
      }
      document.body.classList.remove("spod-date-modal-open");
      document.removeEventListener("keydown", onEscape, true);
      targetHidden = null;
      afterCommit = null;
    }

    function cancel() {
      close();
    }

    function open(hiddenInput, syncCallback) {
      try {
        ensureDom();
        hideMonthDropdown();
        targetHidden = hiddenInput;
        afterCommit = syncCallback || null;
        var p = parseYMDParts(hiddenInput.value);
        var t = localTodayYmd();
        if (p) {
          viewY = p.y;
          viewM = p.m - 1;
          draft = { y: p.y, m: p.m, d: p.d };
        } else {
          viewY = t.y;
          viewM = t.m - 1;
          draft = null;
        }
        overlay.classList.remove("spod-date-modal-overlay--closed");
        document.body.classList.add("spod-date-modal-open");
        renderCalendar();
        document.addEventListener("keydown", onEscape, true);
        var okBtn = overlay.querySelector(".spod-date-btn-ok");
        if (okBtn) {
          okBtn.focus();
        }
      } catch (err) {
        console.error("SpodDateModal.open", err);
      }
    }

    return { open: open };
  })();

  /**
   * Поле даты: скрытое значение (YYYY-MM-DD) + кнопка-поле со значением + компактная кнопка с иконкой календаря.
   * @param {string} initV начальное значение ячейки
   * @param {string|null} col имя колонки для data-col или null в JSON-листьях
   * @param {string|null} dispId id для подписи label (только плоские поля)
   * @param {boolean} isJsonLeaf добавить класс json-leaf-input на скрытое поле
   */
  function buildDatePickerShell(initV, col, dispId, isJsonLeaf) {
    var wrap = document.createElement("div");
    wrap.className = "spod-date-field";

    var hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.className = "spod-date-value";
    if (isJsonLeaf) {
      hidden.classList.add("json-leaf-input");
    }
    if (col) {
      hidden.setAttribute("data-col", col);
    }
    var s0 = initV != null ? String(initV) : "";
    hidden.setAttribute("data-initial", s0);
    hidden.value = s0;

    var row = document.createElement("div");
    row.className = "spod-date-picker-row";

    /* Кнопка вместо readonly input: стабильно получает клик и фокус с клавиатуры (в т.ч. с label[for]). */
    var dispBtn = document.createElement("button");
    dispBtn.type = "button";
    dispBtn.className = isJsonLeaf
      ? "spod-date-display-btn spod-date-display-btn--json"
      : "spod-leaf-control spod-date-display-btn";
    if (dispId) {
      dispBtn.id = dispId;
    }
    dispBtn.setAttribute("aria-haspopup", "dialog");
    dispBtn.setAttribute(
      "aria-label",
      "Выбрать дату, формат YYYY-MM-DD. Текущее значение в подписи кнопки."
    );

    var btn = document.createElement("button");
    btn.type = "button";
    btn.className = "spod-date-open-btn spod-date-open-btn--icon";
    btn.setAttribute("aria-haspopup", "dialog");
    btn.setAttribute("aria-label", "Открыть календарь");
    btn.title = "Календарь";
    /* Компактная иконка календаря (SVG), без текста — подсказка в title и aria-label. */
    btn.innerHTML =
      '<svg class="spod-date-open-icon" aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="3" y="5" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.85"/>' +
      '<path d="M3 10h18M8 3V7M16 3V7" stroke="currentColor" stroke-width="1.85" stroke-linecap="round"/>' +
      "</svg>";

    function syncDisplay() {
      var v = hidden.value || "";
      dispBtn.textContent = v || "— нажмите, чтобы выбрать дату —";
      dispBtn.classList.toggle("spod-date-display-btn--empty", !v);
    }
    syncDisplay();

    function openModal() {
      try {
        SpodDateModal.open(hidden, syncDisplay);
      } catch (err) {
        console.error("spod-date-modal", err);
      }
    }

    btn.addEventListener("click", function (e) {
      e.preventDefault();
      openModal();
    });
    dispBtn.addEventListener("click", function (e) {
      e.preventDefault();
      openModal();
    });

    row.appendChild(dispBtn);
    row.appendChild(btn);
    wrap.appendChild(hidden);
    wrap.appendChild(row);
    return wrap;
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
        var dateHj = findDatePickerHint(bootstrap, col, leaf.parts);
        if (dateHj) {
          row.setAttribute("data-json-date", "1");
          var fmtJ = dateHj.storage_format || "YYYY-MM-DD";
          var fmtLab = document.createElement("span");
          fmtLab.className = "muted spod-date-format-hint";
          fmtLab.textContent = " · " + fmtJ;
          lab.appendChild(fmtLab);
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
      cell.setAttribute("data-filter-text", col.toLowerCase());
      var safeId = "col-" + col.replace(/[^a-zA-Z0-9_]/g, "_");
      var lab = document.createElement("label");
      lab.setAttribute("for", safeId);
      lab.textContent = col;
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
        lab.appendChild(fmtSpan);
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
})();
