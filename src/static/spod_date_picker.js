/**
 * Общий виджет даты: скрытое значение YYYY-MM-DD + кнопка отображения + иконка календаря,
 * модальное окно выбора даты (используется в row_editor.js и wizard_contest.js).
 * Подключение: до скриптов, которые вызывают window.SpodDatePicker.buildShell / hintIsDate.
 */
(function (global) {
  "use strict";

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

  function pad2(n) {
    return n < 10 ? "0" + n : String(n);
  }

  function formatYMD(y, m, d) {
    return y + "-" + pad2(m) + "-" + pad2(d);
  }

  function parseYMDParts(s) {
    var t = (s || "").trim();
    if (!isStrictIsoCalendarDate(t)) {
      return null;
    }
    var p = t.split("-");
    return { y: parseInt(p[0], 10), m: parseInt(p[1], 10), d: parseInt(p[2], 10) };
  }

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

    function hideMonthDropdown() {
      if (monthDropdown) {
        monthDropdown.classList.add("is-hidden");
      }
    }

    function clampDraftDay() {
      if (!draft) {
        return;
      }
      var dim = new Date(draft.y, draft.m, 0).getDate();
      if (draft.d > dim) {
        draft.d = dim;
      }
    }

    function applyYearFromInput() {
      if (!yearInputEl) {
        return;
      }
      var y = parseInt(String(yearInputEl.value).trim(), 10);
      if (!isFinite(y)) {
        yearInputEl.value = String(viewY);
        return;
      }
      /* До 4000 включительно — в данных встречается «бессрочная» дата 4000-01-01. */
      y = Math.max(1000, Math.min(4000, y));
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
      yearInputEl.max = "4000";
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
        viewY = Math.max(1000, viewY - 1);
        clampDraftDay();
        renderCalendar();
      });
      bNextY.addEventListener("click", function () {
        viewY = Math.min(4000, viewY + 1);
        clampDraftDay();
        renderCalendar();
      });
      bPrevM.addEventListener("click", function () {
        viewM -= 1;
        if (viewM < 0) {
          viewM = 11;
          viewY -= 1;
        }
        viewY = Math.max(1000, viewY);
        clampDraftDay();
        renderCalendar();
      });
      bNextM.addEventListener("click", function () {
        viewM += 1;
        if (viewM > 11) {
          viewM = 0;
          viewY += 1;
        }
        viewY = Math.min(4000, viewY);
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
      quickBar.appendChild(
        mkBtn("4000-01-01", "btn btn-secondary btn-sm", function () {
          draft = { y: 4000, m: 1, d: 1 };
          viewY = 4000;
          viewM = 0;
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
        ". «4000-01-01» — условная дата «без срока» (как в выгрузках). Год можно ввести в поле справа от названия месяца (1000–4000).";
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
   * Запись editor_textareas — про поле-дату: input_type date / datepicker, date_picker
   * или шаблон storage_format с годом, месяцем и днём (например YYYY-MM-DD без обязательного input_type).
   */
  function editorHintIsDatePicker(h) {
    if (!h || typeof h !== "object") {
      return false;
    }
    var it = String(h.input_type || "").toLowerCase();
    if (it === "date" || it === "datepicker") {
      return true;
    }
    if (h.date_picker === true || h.date_picker === 1 || h.date_picker === "yes" || h.date_picker === "true") {
      return true;
    }
    var sf = String(h.storage_format || "").trim();
    if (!sf) {
      return false;
    }
    var up = sf.toUpperCase();
    return up.indexOf("YYYY") >= 0 && up.indexOf("MM") >= 0 && up.indexOf("DD") >= 0;
  }

  /**
   * @param {string} initV начальное значение ячейки
   * @param {{ column?: string|null, valueAttribute?: string, displayId?: string|null, isJsonLeaf?: boolean }} options
   */
  function buildShell(initV, options) {
    options = options || {};
    var col = options.column;
    var valueAttr = options.valueAttribute || "data-col";
    var dispId = options.displayId || null;
    var isJsonLeaf = !!options.isJsonLeaf;

    var wrap = document.createElement("div");
    wrap.className = "spod-date-field";

    var hidden = document.createElement("input");
    hidden.type = "hidden";
    hidden.className = "spod-date-value";
    if (isJsonLeaf) {
      hidden.classList.add("json-leaf-input");
    }
    if (col) {
      hidden.setAttribute(valueAttr, col);
    }
    var s0 = initV != null ? String(initV) : "";
    hidden.setAttribute("data-initial", s0);
    hidden.value = s0;

    var row = document.createElement("div");
    row.className = "spod-date-picker-row";

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

  global.SpodDatePicker = {
    buildShell: buildShell,
    hintIsDate: editorHintIsDatePicker,
    openModalForHidden: function (hiddenInput, syncCallback) {
      SpodDateModal.open(hiddenInput, syncCallback);
    },
  };
})(typeof window !== "undefined" ? window : this);
