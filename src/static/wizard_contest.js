/**
 * Мастер «Создать конкурс»: шаги до финального commit; черновик в wizard_draft при Далее/Назад/«Временное сохранение».
 * Схема в #wizard-schema-json (сервер). Защита ухода при несохранённом в БД черновике относительно последнего PUT.
 */
(function () {
  "use strict";

  var CUSTOM = "__SPOD_CUSTOM__";
  var schema = null;
  var state = {
    stepIndex: 0,
    contest: { cells: {} },
    groups: [],
    reward_links: [],
    rewards: [],
    indicators: [],
    schedules: [],
    groupCount: 1,
    linkCount: 1,
    indicatorCount: 1,
    scheduleCount: 1,
  };
  var draftUuid = null;
  /** После успешного PUT черновика — каноническая строка состояния; null = ещё ни разу не сохраняли на сервер. */
  var lastSavedDraftJson = null;
  var leaveGuardSuspended = false;
  var pendingLeave = null;
  var leaveOverlay = null;
  var leaveDialog = null;
  var draftSaveInFlight = false;

  function $(id) {
    return document.getElementById(id);
  }

  function ruleHasJsonPath(r) {
    return r && Object.prototype.hasOwnProperty.call(r, "json_path");
  }

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

  function findUi(sheetCode, column, jsonParts) {
    var list = schema.fieldUi || [];
    var jParts = jsonParts === undefined ? null : jsonParts;
    var found = null;
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r.sheet_code !== sheetCode || r.column !== column) {
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

  function fieldRequired(r) {
    if (!r) {
      return false;
    }
    return r.required === true || r.required === 1 || r.required === "yes";
  }

  function fieldAllowsEmpty(r) {
    if (!r || !Object.prototype.hasOwnProperty.call(r, "allows_empty")) {
      return true;
    }
    var v = r.allows_empty;
    return !(v === false || v === 0 || v === "no" || v === "false");
  }

  function validateCells(sheetCode, cells) {
    var errs = [];
    var sh = schema.sheets[sheetCode];
    if (!sh) {
      return ["Неизвестный лист в схеме: " + sheetCode];
    }
    (sh.flat_columns || []).forEach(function (col) {
      var v = cells[col] != null ? String(cells[col]) : "";
      var r = findUi(sheetCode, col, null);
      if (fieldRequired(r) && v.trim() === "") {
        errs.push(col + ": обязательное поле.");
      }
      if (!fieldAllowsEmpty(r) && v.trim() === "") {
        errs.push(col + ": пустое значение недопустимо.");
      }
    });
    (sh.json_columns || []).forEach(function (jc) {
      var raw = cells[jc] != null ? String(cells[jc]) : "";
      var r0 = findUi(sheetCode, jc, null);
      if (fieldRequired(r0) && raw.trim() === "") {
        errs.push(jc + ": обязательная JSON-колонка.");
      }
      if (!fieldAllowsEmpty(r0) && raw.trim() === "") {
        errs.push(jc + ": JSON не может быть пустым.");
      }
    });
    return errs;
  }

  function findEnum(sheetCode, col) {
    var list = schema.fieldEnums || [];
    for (var i = 0; i < list.length; i++) {
      var r = list[i];
      if (r.sheet_code === sheetCode && r.column === col && !ruleHasJsonPath(r)) {
        return r;
      }
    }
    return null;
  }

  function findDateHint(sheetCode, col) {
    var list = schema.editorTextareas || [];
    var api = typeof window !== "undefined" ? window.SpodDatePicker : null;
    for (var j = 0; j < list.length; j++) {
      var h = list[j];
      if (h.sheet_code !== sheetCode || h.column !== col) {
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
      if (isDate && !ruleHasJsonPath(h)) {
        return h;
      }
    }
    return null;
  }

  /** Подсказка textarea: записи про календарь (в т.ч. только storage_format) не используются как min_rows. */
  function findTextareaHint(sheetCode, col) {
    var list = schema.editorTextareas || [];
    var api = typeof window !== "undefined" ? window.SpodDatePicker : null;
    for (var j = 0; j < list.length; j++) {
      var h = list[j];
      if (h.sheet_code !== sheetCode || h.column !== col || ruleHasJsonPath(h)) {
        continue;
      }
      if (api && typeof api.hintIsDate === "function" && api.hintIsDate(h)) {
        continue;
      }
      return h;
    }
    return null;
  }

  function fillSelect(sel, options, allowCustom, current) {
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
      ox.textContent = "(текущее) " + (curStr.length > 40 ? curStr.slice(0, 37) + "…" : curStr);
      sel.insertBefore(ox, sel.firstChild);
    }
    if (allowCustom) {
      var oc = document.createElement("option");
      oc.value = CUSTOM;
      oc.textContent = "Задать своё…";
      sel.appendChild(oc);
    }
    if (seen[curStr] || allowCustom) {
      sel.value = allowCustom && !seen[curStr] ? CUSTOM : curStr;
    } else if (sel.options.length) {
      sel.selectedIndex = 0;
    }
  }

  function collectForm(root, sheetCode) {
    var cells = {};
    root.querySelectorAll("[data-wiz-col]").forEach(function (inp) {
      var c = inp.getAttribute("data-wiz-col");
      if (inp.type === "checkbox") {
        cells[c] = inp.checked ? "1" : "";
      } else {
        cells[c] = inp.value;
      }
    });
    root.querySelectorAll("textarea[data-wiz-json]").forEach(function (ta) {
      cells[ta.getAttribute("data-wiz-json")] = ta.value;
    });
    root.querySelectorAll(".wiz-enum-wrap").forEach(function (wrap) {
      var hid = wrap.querySelector("input[type=hidden][data-wiz-col]");
      var sel = wrap.querySelector("select");
      var ta = wrap.querySelector("textarea.wiz-enum-custom");
      if (!hid || !sel) {
        return;
      }
      if (sel.value === CUSTOM && ta) {
        hid.value = ta.value;
      } else {
        hid.value = sel.value;
      }
      cells[hid.getAttribute("data-wiz-col")] = hid.value;
    });
    return cells;
  }

  function renderFieldRow(sheetCode, col, val, locked) {
    var row = document.createElement("div");
    row.className = "scalar-cell grid-cell wiz-field";
    var isLocked = locked && Object.prototype.hasOwnProperty.call(locked, col);
    var lab = document.createElement("label");
    lab.className = "wiz-label";
    var r = findUi(sheetCode, col, null);
    var dh = findDateHint(sheetCode, col);
    var top = document.createElement("span");
    top.className = "spod-field-ui-label-top";
    var cap = document.createElement("span");
    cap.className = "spod-field-ui-caption";
    cap.textContent = col;
    var signals = document.createElement("span");
    signals.className = "spod-field-ui-signals";
    if (fieldRequired(r)) {
      var st = document.createElement("span");
      st.className = "spod-field-req-star";
      st.setAttribute("aria-hidden", "true");
      st.textContent = "*";
      signals.appendChild(st);
    }
    if (!fieldAllowsEmpty(r)) {
      var fillMk = document.createElement("span");
      fillMk.className = "spod-field-fill-mark";
      fillMk.setAttribute("aria-hidden", "true");
      signals.appendChild(fillMk);
    }
    if (signals.firstChild) {
      top.appendChild(signals);
    }
    top.appendChild(cap);
    if (dh) {
      var fmtSpan = document.createElement("span");
      fmtSpan.className = "muted spod-date-format-hint";
      fmtSpan.textContent = " · " + (dh.storage_format || "YYYY-MM-DD");
      top.appendChild(fmtSpan);
    }
    lab.appendChild(top);
    var slot = document.createElement("span");
    slot.className = "spod-field-ui-desc-slot";
    if (r && r.show_description && String(r.description || "").trim()) {
      var d = document.createElement("span");
      d.className = "spod-field-ui-desc";
      d.textContent = String(r.description).trim();
      slot.appendChild(d);
    }
    lab.appendChild(slot);
    row.appendChild(lab);
    if (isLocked) {
      var ro = document.createElement("input");
      ro.type = "text";
      ro.readOnly = true;
      ro.className = "spod-leaf-control";
      ro.setAttribute("data-wiz-col", col);
      ro.value = locked[col] != null ? String(locked[col]) : "";
      row.appendChild(ro);
      return row;
    }
    var en = findEnum(sheetCode, col);
    var initV = val != null ? String(val) : "";
    if (dh) {
      var api = typeof window !== "undefined" ? window.SpodDatePicker : null;
      if (api && typeof api.buildShell === "function") {
        var dateWrap = api.buildShell(initV, {
          column: col,
          valueAttribute: "data-wiz-col",
          isJsonLeaf: false,
        });
        row.appendChild(dateWrap);
      } else {
        var inp = document.createElement("input");
        inp.type = "text";
        inp.className = "spod-leaf-control";
        inp.setAttribute("data-wiz-col", col);
        inp.value = initV;
        inp.placeholder = dh.storage_format || "YYYY-MM-DD";
        row.appendChild(inp);
      }
    } else if (en) {
      var wrap = document.createElement("div");
      wrap.className = "wiz-enum-wrap spod-enum-block spod-enum-block--flat";
      var hidden = document.createElement("input");
      hidden.type = "hidden";
      hidden.setAttribute("data-wiz-col", col);
      hidden.value = initV;
      var sel = document.createElement("select");
      sel.className = "spod-enum-select spod-leaf-control";
      fillSelect(sel, en.options, !!en.allow_custom, initV);
      var taC = document.createElement("textarea");
      taC.className = "wiz-enum-custom spod-enum-custom spod-leaf-control is-hidden";
      taC.rows = 3;
      if (sel.value === CUSTOM) {
        taC.classList.remove("is-hidden");
        taC.value = initV;
      }
      sel.addEventListener("change", function () {
        if (sel.value === CUSTOM) {
          taC.classList.remove("is-hidden");
        } else {
          taC.classList.add("is-hidden");
        }
        hidden.value = sel.value === CUSTOM ? taC.value : sel.value;
      });
      taC.addEventListener("input", function () {
        hidden.value = taC.value;
      });
      wrap.appendChild(hidden);
      wrap.appendChild(sel);
      wrap.appendChild(taC);
      row.appendChild(wrap);
    } else {
      var hint = findTextareaHint(sheetCode, col);
      var thr = schema.longTextThreshold || 120;
      var long = (initV || "").length > thr || (hint && hint.min_rows);
      if (long) {
        var ta = document.createElement("textarea");
        ta.className = "spod-leaf-control";
        ta.rows = hint && hint.min_rows ? Math.min(22, Math.max(3, hint.min_rows)) : 4;
        ta.setAttribute("data-wiz-col", col);
        ta.value = initV;
        row.appendChild(ta);
      } else {
        var inp2 = document.createElement("input");
        inp2.type = "text";
        inp2.className = "spod-leaf-control";
        inp2.setAttribute("data-wiz-col", col);
        inp2.value = initV;
        row.appendChild(inp2);
      }
    }
    return row;
  }

  function renderSheetForm(sheetCode, cells, locked) {
    var sh = schema.sheets[sheetCode];
    var grid = document.createElement("div");
    grid.className = "scalar-field-grid wiz-grid";
    (sh.flat_columns || []).forEach(function (col) {
      grid.appendChild(renderFieldRow(sheetCode, col, cells[col], locked));
    });
    (sh.json_columns || []).forEach(function (jc) {
      var row = document.createElement("div");
      row.className = "scalar-cell grid-cell wiz-field wiz-json-cell";
      var lab = document.createElement("label");
      lab.className = "wiz-label";
      var rj = findUi(sheetCode, jc, null);
      var jtop = document.createElement("span");
      jtop.className = "spod-field-ui-label-top";
      var jcap = document.createElement("span");
      jcap.className = "spod-field-ui-caption";
      jcap.textContent = jc + " (JSON)";
      var jsig = document.createElement("span");
      jsig.className = "spod-field-ui-signals";
      if (fieldRequired(rj)) {
        var jst = document.createElement("span");
        jst.className = "spod-field-req-star";
        jst.setAttribute("aria-hidden", "true");
        jst.textContent = "*";
        jsig.appendChild(jst);
      }
      if (!fieldAllowsEmpty(rj)) {
        var jfill = document.createElement("span");
        jfill.className = "spod-field-fill-mark";
        jfill.setAttribute("aria-hidden", "true");
        jsig.appendChild(jfill);
      }
      if (jsig.firstChild) {
        jtop.appendChild(jsig);
      }
      jtop.appendChild(jcap);
      lab.appendChild(jtop);
      row.appendChild(lab);
      var ta = document.createElement("textarea");
      ta.className = "spod-leaf-control wiz-json-ta";
      ta.rows = 10;
      ta.setAttribute("data-wiz-json", jc);
      ta.value = cells[jc] != null ? String(cells[jc]) : "{}";
      row.appendChild(ta);
      grid.appendChild(row);
    });
    return grid;
  }

  function contestCode() {
    return String((state.contest.cells || {}).CONTEST_CODE || "").trim();
  }

  function uniqGroupCodes() {
    var u = {};
    (state.groups || []).forEach(function (g) {
      var c = String((g.cells || {}).GROUP_CODE || "").trim();
      if (c) {
        u[c] = true;
      }
    });
    return Object.keys(u).sort();
  }

  function uniqRewardCodesFromLinks() {
    var u = {};
    (state.reward_links || []).forEach(function (ln) {
      var c = String((ln.cells || {}).REWARD_CODE || "").trim();
      if (c) {
        u[c] = true;
      }
    });
    return Object.keys(u).sort();
  }

  function newDraftUuid() {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return crypto.randomUUID();
    }
    return "wiz-" + String(Date.now()) + "-" + String(Math.random()).slice(2, 11);
  }

  function statePayloadForServer() {
    return {
      stepIndex: state.stepIndex,
      contest: state.contest,
      groups: state.groups,
      reward_links: state.reward_links,
      rewards: state.rewards,
      indicators: state.indicators,
      schedules: state.schedules,
      groupCount: state.groupCount,
      linkCount: state.linkCount,
      indicatorCount: state.indicatorCount,
      scheduleCount: state.scheduleCount,
    };
  }

  function serializeForDirty() {
    return JSON.stringify(statePayloadForServer());
  }

  function markSavedSnapshot() {
    lastSavedDraftJson = serializeForDirty();
  }

  function isPristine() {
    if (state.stepIndex !== 0) {
      return false;
    }
    var c = state.contest.cells || {};
    var keys = Object.keys(c);
    for (var i = 0; i < keys.length; i++) {
      if (String(c[keys[i]] || "").trim() !== "") {
        return false;
      }
    }
    return true;
  }

  function isWizardDirty() {
    if (leaveGuardSuspended) {
      return false;
    }
    if (lastSavedDraftJson === null) {
      return !isPristine();
    }
    return serializeForDirty() !== lastSavedDraftJson;
  }

  function showDraftNote(text, isErr) {
    var n = $("wiz-draft-note");
    if (!n) {
      return;
    }
    n.textContent = text || "";
    n.classList.toggle("is-hidden", !text);
    n.classList.toggle("wiz-draft-note--err", !!isErr);
  }

  function persistDraft(doneFn, silent) {
    if (!draftUuid) {
      draftUuid = newDraftUuid();
    }
    if (draftSaveInFlight) {
      if (doneFn) {
        doneFn(false);
      }
      return;
    }
    draftSaveInFlight = true;
    fetch("/wizard/new-contest/draft", {
      method: "PUT",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        draft_uuid: draftUuid,
        step_index: state.stepIndex,
        state: statePayloadForServer(),
      }),
    })
      .then(function (r) {
        if (!r.ok) {
          return r.json().then(function (j) {
            throw new Error((j && j.detail) || r.statusText);
          });
        }
        markSavedSnapshot();
        if (!silent) {
          showDraftNote("Черновик сохранён в базу (EDIT).", false);
          window.setTimeout(function () {
            showDraftNote("", false);
          }, 2500);
        }
        if (doneFn) {
          doneFn(true);
        }
      })
      .catch(function () {
        if (!silent) {
          showDraftNote("Не удалось сохранить черновик.", true);
        }
        if (doneFn) {
          doneFn(false);
        }
      })
      .finally(function () {
        draftSaveInFlight = false;
      });
  }

  function applyStateFromDraft(st) {
    if (!st || typeof st !== "object") {
      return;
    }
    state.stepIndex = Math.max(0, Math.min(6, parseInt(String(st.stepIndex), 10) || 0));
    state.contest = st.contest && typeof st.contest === "object" ? st.contest : { cells: {} };
    state.groups = Array.isArray(st.groups) ? st.groups : [];
    state.reward_links = Array.isArray(st.reward_links) ? st.reward_links : [];
    state.rewards = Array.isArray(st.rewards) ? st.rewards : [];
    state.indicators = Array.isArray(st.indicators) ? st.indicators : [];
    state.schedules = Array.isArray(st.schedules) ? st.schedules : [];
    state.groupCount = Math.max(1, parseInt(String(st.groupCount), 10) || state.groups.length || 1);
    state.linkCount = Math.max(1, parseInt(String(st.linkCount), 10) || state.reward_links.length || 1);
    state.indicatorCount = Math.max(1, parseInt(String(st.indicatorCount), 10) || state.indicators.length || 1);
    state.scheduleCount = Math.max(1, parseInt(String(st.scheduleCount), 10) || state.schedules.length || 1);
  }

  function ensureLeaveModal() {
    if (leaveOverlay) {
      return;
    }
    leaveOverlay = document.createElement("div");
    leaveOverlay.className =
      "spod-date-modal-overlay spod-leave-modal-overlay spod-wiz-leave-overlay spod-date-modal-overlay--closed";
    leaveOverlay.setAttribute("role", "alertdialog");
    leaveOverlay.setAttribute("aria-modal", "true");
    leaveOverlay.setAttribute("aria-labelledby", "wiz-leave-modal-title");
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
      '<h2 id="wiz-leave-modal-title" class="spod-leave-modal-title">Несохранённый черновик</h2>' +
      '<p class="muted spod-leave-modal-text">Есть изменения, которые ещё не записаны в черновик в базе (последнее «Временное сохранение» / переход по шагам). Что сделать?</p>' +
      '<div class="spod-leave-modal-actions">' +
      '<button type="button" class="btn btn-primary btn-sm wiz-leave-save">Сохранить черновик и выйти</button>' +
      '<button type="button" class="btn btn-secondary btn-sm wiz-leave-discard">Выйти без сохранения</button>' +
      '<button type="button" class="btn btn-ghost btn-sm wiz-leave-stay">Остаться</button>' +
      "</div>";
    leaveOverlay.appendChild(leaveDialog);
    document.body.appendChild(leaveOverlay);
    leaveDialog.querySelector(".wiz-leave-stay").addEventListener("click", function () {
      pendingLeave = null;
      closeLeaveModal();
    });
    leaveDialog.querySelector(".wiz-leave-discard").addEventListener("click", function () {
      leaveGuardSuspended = true;
      executePendingLeave();
    });
    leaveDialog.querySelector(".wiz-leave-save").addEventListener("click", function () {
      persistDraft(function (ok) {
        if (ok) {
          leaveGuardSuspended = true;
          executePendingLeave();
        }
      }, true);
    });
  }

  function openLeaveModal(pending) {
    ensureLeaveModal();
    pendingLeave = pending;
    leaveOverlay.classList.remove("spod-date-modal-overlay--closed");
    document.body.classList.add("spod-date-modal-open");
    var st = leaveDialog.querySelector(".wiz-leave-stay");
    if (st) {
      st.focus();
    }
  }

  function closeLeaveModal() {
    if (leaveOverlay) {
      leaveOverlay.classList.add("spod-date-modal-overlay--closed");
    }
    document.body.classList.remove("spod-date-modal-open");
  }

  function executePendingLeave() {
    var p = pendingLeave;
    pendingLeave = null;
    closeLeaveModal();
    if (!p) {
      return;
    }
    if (p.kind === "href") {
      window.location.href = p.url;
    } else if (p.kind === "stop") {
      try {
        p.form.requestSubmit();
      } catch (e0) {
        p.form.submit();
      }
      window.setTimeout(function () {
        leaveGuardSuspended = false;
      }, 300);
    }
  }

  function installWizardLeaveGuard() {
    window.addEventListener("beforeunload", function (e) {
      if (!isWizardDirty()) {
        return;
      }
      e.preventDefault();
      e.returnValue = "";
    });
    document.addEventListener(
      "click",
      function (e) {
        if (!isWizardDirty()) {
          return;
        }
        if (e.target && e.target.closest && e.target.closest(".spod-wiz-leave-overlay")) {
          return;
        }
        if (e.target && e.target.closest && e.target.closest("#wiz-btn-save-draft, #wiz-btn-next, #wiz-btn-back")) {
          return;
        }
        var a = e.target.closest && e.target.closest("a[href]");
        if (a && a.href) {
          var u;
          try {
            u = new URL(a.href, window.location.origin);
          } catch (e1) {
            return;
          }
          if (u.origin === window.location.origin && u.pathname === window.location.pathname) {
            return;
          }
          if (u.origin === window.location.origin && u.pathname.indexOf("/wizard/new-contest") === 0) {
            return;
          }
          e.preventDefault();
          e.stopPropagation();
          openLeaveModal({ kind: "href", url: a.href });
          return;
        }
        var stopForm = e.target.closest && e.target.closest("#form-stop-server");
        if (stopForm) {
          e.preventDefault();
          e.stopPropagation();
          openLeaveModal({ kind: "stop", form: stopForm });
        }
      },
      true
    );
  }

  function renderDraftPanel(rows) {
    var panel = $("wiz-draft-panel");
    if (!panel) {
      return;
    }
    panel.innerHTML = "";
    if (!rows || !rows.length) {
      panel.classList.add("is-hidden");
      return;
    }
    panel.classList.remove("is-hidden");
    var h = document.createElement("h3");
    h.textContent = "Незавершённые черновики (EDIT)";
    panel.appendChild(h);
    var p = document.createElement("p");
    p.className = "muted";
    p.textContent = "Можно продолжить сохранённое создание конкурса или начать новое (новый идентификатор черновика).";
    panel.appendChild(p);
    rows.forEach(function (row) {
      var line = document.createElement("div");
      line.className = "wiz-draft-row";
      var code = row.contest_code_preview || "— код не указан —";
      var when = row.updated_at || "";
      var sid = row.draft_uuid || "";
      line.innerHTML =
        "<span class=\"wiz-draft-meta\">" +
        escapeHtml(code) +
        " · шаг " +
        (parseInt(row.step_index, 10) + 1) +
        " · " +
        escapeHtml(when) +
        "</span>";
      var btnOpen = document.createElement("button");
      btnOpen.type = "button";
      btnOpen.className = "btn btn-primary btn-sm";
      btnOpen.textContent = "Продолжить";
      btnOpen.addEventListener("click", function () {
        window.location.href = "/wizard/new-contest?draft=" + encodeURIComponent(sid);
      });
      var btnDel = document.createElement("button");
      btnDel.type = "button";
      btnDel.className = "btn btn-ghost btn-sm";
      btnDel.textContent = "Удалить";
      btnDel.addEventListener("click", function () {
        if (!confirm("Удалить этот черновик из базы?")) {
          return;
        }
        fetch("/wizard/new-contest/draft/" + encodeURIComponent(sid), { method: "DELETE" })
          .then(function () {
            return fetch("/wizard/new-contest/drafts");
          })
          .then(function (r) {
            return r.json();
          })
          .then(function (nr) {
            renderDraftPanel(nr);
          });
      });
      line.appendChild(btnOpen);
      line.appendChild(btnDel);
      panel.appendChild(line);
    });
    var btnNew = document.createElement("button");
    btnNew.type = "button";
    btnNew.className = "btn btn-secondary";
    btnNew.textContent = "Начать новый конкурс (игнорировать список)";
    btnNew.addEventListener("click", function () {
      draftUuid = newDraftUuid();
      lastSavedDraftJson = null;
      state.stepIndex = 0;
      state.contest = { cells: {} };
      state.groups = [];
      state.reward_links = [];
      state.rewards = [];
      state.indicators = [];
      state.schedules = [];
      state.groupCount = 1;
      state.linkCount = 1;
      state.indicatorCount = 1;
      state.scheduleCount = 1;
      panel.classList.add("is-hidden");
      render();
    });
    panel.appendChild(btnNew);
  }

  function escapeHtml(s) {
    var d = document.createElement("div");
    d.textContent = s != null ? String(s) : "";
    return d.innerHTML;
  }

  function showErr(msg) {
    var e = $("wiz-error");
    if (e) {
      e.textContent = msg || "";
      e.classList.toggle("is-hidden", !msg);
    } else if (msg) {
      alert(msg);
    }
  }

  function render() {
    var host = $("wiz-body");
    if (!host) {
      return;
    }
    host.innerHTML = "";
    showErr("");
    var steps = schema.steps || [];
    var st = steps[state.stepIndex] || { title: "?" };
    $("wiz-step-title").textContent = st.title || "";
    $("wiz-progress").textContent = "Шаг " + (state.stepIndex + 1) + " / " + steps.length;

    if (state.stepIndex === 0) {
      host.appendChild(renderSheetForm("CONTEST-DATA", state.contest.cells || {}, {}));
    } else if (state.stepIndex === 1) {
      var p = document.createElement("p");
      p.className = "muted";
      p.textContent = "Число строк GROUP для кода конкурса «" + (contestCode() || "…") + "».";
      host.appendChild(p);
      var row = document.createElement("div");
      row.className = "wiz-toolbar";
      var inp = document.createElement("input");
      inp.type = "number";
      inp.min = "1";
      inp.max = "200";
      inp.value = String(state.groupCount || 1);
      inp.id = "wiz-inp-group-count";
      row.appendChild(inp);
      var btn = document.createElement("button");
      btn.type = "button";
      btn.className = "btn btn-secondary";
      btn.textContent = "Сформировать строки";
      btn.addEventListener("click", function () {
        var n = parseInt(inp.value, 10) || 1;
        state.groupCount = Math.max(1, Math.min(200, n));
        var cc = contestCode();
        state.groups = [];
        for (var i = 0; i < state.groupCount; i++) {
          state.groups.push({ cells: { CONTEST_CODE: cc } });
        }
        render();
      });
      row.appendChild(btn);
      host.appendChild(row);
      var box = document.createElement("div");
      box.id = "wiz-group-forms";
      host.appendChild(box);
      (state.groups || []).forEach(function (g, ix) {
        var sec = document.createElement("section");
        sec.className = "panel wiz-subpanel";
        var h = document.createElement("h3");
        h.textContent = "Группа " + (ix + 1);
        sec.appendChild(h);
        sec.appendChild(renderSheetForm("GROUP", g.cells || {}, { CONTEST_CODE: contestCode() }));
        box.appendChild(sec);
      });
    } else if (state.stepIndex === 2) {
      var ug = uniqGroupCodes();
      var p2 = document.createElement("p");
      p2.className = "muted";
      p2.textContent =
        "Различных GROUP_CODE: " +
        ug.length +
        ". Строк REWARD-LINK не меньше этого числа (сейчас минимум " +
        Math.max(1, ug.length) +
        ").";
      host.appendChild(p2);
      var row2 = document.createElement("div");
      row2.className = "wiz-toolbar";
      var inp2 = document.createElement("input");
      inp2.type = "number";
      inp2.min = String(Math.max(1, ug.length));
      inp2.max = "500";
      inp2.value = String(Math.max(state.linkCount || 1, ug.length));
      inp2.id = "wiz-inp-link-count";
      row2.appendChild(inp2);
      var b2 = document.createElement("button");
      b2.type = "button";
      b2.className = "btn btn-secondary";
      b2.textContent = "Сформировать строки";
      b2.addEventListener("click", function () {
        var n = parseInt(inp2.value, 10) || ug.length;
        n = Math.max(ug.length, Math.min(500, n));
        state.linkCount = n;
        var cc = contestCode();
        state.reward_links = [];
        for (var j = 0; j < n; j++) {
          state.reward_links.push({ cells: { CONTEST_CODE: cc, GROUP_CODE: ug[j % ug.length] || "", REWARD_CODE: "" } });
        }
        render();
      });
      row2.appendChild(b2);
      host.appendChild(row2);
      var box2 = document.createElement("div");
      box2.id = "wiz-link-box";
      host.appendChild(box2);
      if (!ug.length) {
        var warn = document.createElement("p");
        warn.className = "muted";
        warn.textContent = "Сначала заполните шаг GROUP (нужны GROUP_CODE).";
        host.appendChild(warn);
      }
      (state.reward_links || []).forEach(function (ln, ix) {
        var sec = document.createElement("section");
        sec.className = "panel wiz-subpanel";
        var h = document.createElement("h3");
        h.textContent = "Связь " + (ix + 1);
        sec.appendChild(h);
        sec.appendChild(
          renderSheetForm("REWARD-LINK", ln.cells || {}, {
            CONTEST_CODE: contestCode(),
          })
        );
        box2.appendChild(sec);
      });
    } else if (state.stepIndex === 3) {
      var codes = uniqRewardCodesFromLinks();
      var p3 = document.createElement("p");
      p3.className = "muted";
      p3.textContent = "По одной строке REWARD на каждый уникальный REWARD_CODE из связей (" + codes.length + ").";
      host.appendChild(p3);
      while ((state.rewards || []).length < codes.length) {
        state.rewards.push({ cells: {} });
      }
      state.rewards = state.rewards.slice(0, codes.length);
      var box3 = document.createElement("div");
      box3.id = "wiz-reward-box";
      host.appendChild(box3);
      if (!codes.length) {
        var w3 = document.createElement("p");
        w3.className = "muted";
        w3.textContent = "Нет уникальных REWARD_CODE в связях. Вернитесь к шагу REWARD-LINK.";
        host.appendChild(w3);
      }
      codes.forEach(function (rc, ix) {
        var cells = state.rewards[ix].cells || {};
        cells.REWARD_CODE = rc;
        state.rewards[ix] = { cells: cells };
        var sec = document.createElement("section");
        sec.className = "panel wiz-subpanel";
        var h = document.createElement("h3");
        h.textContent = "Награда " + rc;
        sec.appendChild(h);
        sec.appendChild(renderSheetForm("REWARD", state.rewards[ix].cells || {}, { REWARD_CODE: rc }));
        box3.appendChild(sec);
      });
    } else if (state.stepIndex === 4) {
      var p4 = document.createElement("p");
      p4.className = "muted";
      p4.textContent = "Число строк INDICATOR (один CONTEST_CODE).";
      host.appendChild(p4);
      var row4 = document.createElement("div");
      row4.className = "wiz-toolbar";
      var inp4 = document.createElement("input");
      inp4.type = "number";
      inp4.min = "1";
      inp4.max = "300";
      inp4.value = String(state.indicatorCount || 1);
      var b4 = document.createElement("button");
      b4.type = "button";
      b4.className = "btn btn-secondary";
      b4.textContent = "Сформировать строки";
      b4.addEventListener("click", function () {
        state.indicatorCount = Math.max(1, Math.min(300, parseInt(inp4.value, 10) || 1));
        var cc = contestCode();
        state.indicators = [];
        for (var k = 0; k < state.indicatorCount; k++) {
          state.indicators.push({ cells: { CONTEST_CODE: cc } });
        }
        render();
      });
      row4.appendChild(inp4);
      row4.appendChild(b4);
      host.appendChild(row4);
      var box4 = document.createElement("div");
      box4.id = "wiz-ind-box";
      host.appendChild(box4);
      (state.indicators || []).forEach(function (ind, ix) {
        var sec = document.createElement("section");
        sec.className = "panel wiz-subpanel";
        var h = document.createElement("h3");
        h.textContent = "Показатель " + (ix + 1);
        sec.appendChild(h);
        sec.appendChild(renderSheetForm("INDICATOR", ind.cells || {}, { CONTEST_CODE: contestCode() }));
        box4.appendChild(sec);
      });
    } else if (state.stepIndex === 5) {
      var p5 = document.createElement("p");
      p5.className = "muted";
      p5.textContent = "Число строк TOURNAMENT-SCHEDULE.";
      host.appendChild(p5);
      var row5 = document.createElement("div");
      row5.className = "wiz-toolbar";
      var inp5 = document.createElement("input");
      inp5.type = "number";
      inp5.min = "1";
      inp5.max = "200";
      inp5.value = String(state.scheduleCount || 1);
      var b5 = document.createElement("button");
      b5.type = "button";
      b5.className = "btn btn-secondary";
      b5.textContent = "Сформировать строки";
      b5.addEventListener("click", function () {
        state.scheduleCount = Math.max(1, Math.min(200, parseInt(inp5.value, 10) || 1));
        var cc = contestCode();
        state.schedules = [];
        for (var s = 0; s < state.scheduleCount; s++) {
          state.schedules.push({ cells: { CONTEST_CODE: cc } });
        }
        render();
      });
      row5.appendChild(inp5);
      row5.appendChild(b5);
      host.appendChild(row5);
      var box5 = document.createElement("div");
      box5.id = "wiz-sch-box";
      host.appendChild(box5);
      (state.schedules || []).forEach(function (sc, ix) {
        var sec = document.createElement("section");
        sec.className = "panel wiz-subpanel";
        var h = document.createElement("h3");
        h.textContent = "Расписание " + (ix + 1);
        sec.appendChild(h);
        sec.appendChild(renderSheetForm("TOURNAMENT-SCHEDULE", sc.cells || {}, { CONTEST_CODE: contestCode() }));
        box5.appendChild(sec);
      });
    } else if (state.stepIndex === 6) {
      var pre = document.createElement("pre");
      pre.className = "wiz-preview-json";
      pre.textContent = JSON.stringify(
        {
          contest: state.contest,
          groups: state.groups,
          reward_links: state.reward_links,
          rewards: state.rewards,
          indicators: state.indicators,
          schedules: state.schedules,
        },
        null,
        2
      );
      host.appendChild(pre);
      var actions = document.createElement("div");
      actions.className = "wiz-preview-actions";
      var ok = document.createElement("button");
      ok.type = "button";
      ok.className = "btn btn-primary";
      ok.textContent = "Подтвердить создание в базе";
      ok.addEventListener("click", submitWizard);
      actions.appendChild(ok);
      host.appendChild(actions);
    }
    var nxBtn = $("wiz-btn-next");
    if (nxBtn) {
      if (state.stepIndex === (schema.steps || []).length - 1) {
        nxBtn.classList.add("is-hidden");
      } else {
        nxBtn.classList.remove("is-hidden");
      }
    }
  }

  function readStepIntoState() {
    var host = $("wiz-body");
    if (!host) {
      return;
    }
    if (state.stepIndex === 0) {
      state.contest = { cells: collectForm(host, "CONTEST-DATA") };
    } else if (state.stepIndex === 1) {
      var secs = host.querySelectorAll("#wiz-group-forms .wiz-subpanel");
      state.groups = [];
      secs.forEach(function (sec) {
        var c = collectForm(sec, "GROUP");
        c.CONTEST_CODE = contestCode();
        state.groups.push({ cells: c });
      });
    } else if (state.stepIndex === 2) {
      state.reward_links = [];
      host.querySelectorAll("#wiz-link-box .wiz-subpanel").forEach(function (sec) {
        var c = collectForm(sec, "REWARD-LINK");
        c.CONTEST_CODE = contestCode();
        state.reward_links.push({ cells: c });
      });
    } else if (state.stepIndex === 3) {
      state.rewards = [];
      host.querySelectorAll("#wiz-reward-box .wiz-subpanel").forEach(function (sec) {
        state.rewards.push({ cells: collectForm(sec, "REWARD") });
      });
    } else if (state.stepIndex === 4) {
      state.indicators = [];
      host.querySelectorAll("#wiz-ind-box .wiz-subpanel").forEach(function (sec) {
        var c = collectForm(sec, "INDICATOR");
        c.CONTEST_CODE = contestCode();
        state.indicators.push({ cells: c });
      });
    } else if (state.stepIndex === 5) {
      state.schedules = [];
      host.querySelectorAll("#wiz-sch-box .wiz-subpanel").forEach(function (sec) {
        var c = collectForm(sec, "TOURNAMENT-SCHEDULE");
        c.CONTEST_CODE = contestCode();
        state.schedules.push({ cells: c });
      });
    }
  }

  function validateCurrent() {
    var host = $("wiz-body");
    if (!host) {
      return [];
    }
    if (state.stepIndex === 0) {
      return validateCells("CONTEST-DATA", collectForm(host, "CONTEST-DATA"));
    }
    if (state.stepIndex === 1) {
      if (!state.groups || state.groups.length < 1) {
        return ["Сформируйте хотя бы одну строку GROUP."];
      }
      var all = [];
      host.querySelectorAll("#wiz-group-forms .wiz-subpanel").forEach(function (sec, ix) {
        var c = collectForm(sec, "GROUP");
        c.CONTEST_CODE = contestCode();
        var e = validateCells("GROUP", c);
        e.forEach(function (x) {
          all.push("Группа " + (ix + 1) + ": " + x);
        });
      });
      return all;
    }
    if (state.stepIndex === 2) {
      var ug = uniqGroupCodes();
      if (!state.reward_links || state.reward_links.length < ug.length) {
        return ["Нужно не меньше " + ug.length + " строк REWARD-LINK."];
      }
      var all2 = [];
      host.querySelectorAll("#wiz-link-box .wiz-subpanel").forEach(function (sec, ix) {
        var c = collectForm(sec, "REWARD-LINK");
        c.CONTEST_CODE = contestCode();
        var e = validateCells("REWARD-LINK", c);
        e.forEach(function (x) {
          all2.push("Связь " + (ix + 1) + ": " + x);
        });
      });
      return all2;
    }
    if (state.stepIndex === 3) {
      var codes = uniqRewardCodesFromLinks();
      if (!codes.length) {
        return ["Нет ни одного REWARD_CODE в связях. Заполните шаг REWARD-LINK."];
      }
      var all3 = [];
      host.querySelectorAll("#wiz-reward-box .wiz-subpanel").forEach(function (sec, ix) {
        var c = collectForm(sec, "REWARD");
        var e = validateCells("REWARD", c);
        e.forEach(function (x) {
          all3.push("Награда " + (codes[ix] || ix) + ": " + x);
        });
      });
      return all3;
    }
    if (state.stepIndex === 4) {
      if (!state.indicators || !state.indicators.length) {
        return ["Сформируйте строки INDICATOR."];
      }
      var all4 = [];
      host.querySelectorAll("#wiz-ind-box .wiz-subpanel").forEach(function (sec, ix) {
        var c = collectForm(sec, "INDICATOR");
        c.CONTEST_CODE = contestCode();
        validateCells("INDICATOR", c).forEach(function (x) {
          all4.push("Показатель " + (ix + 1) + ": " + x);
        });
      });
      return all4;
    }
    if (state.stepIndex === 5) {
      if (!state.schedules || !state.schedules.length) {
        return ["Сформируйте строки расписания."];
      }
      var all5 = [];
      host.querySelectorAll("#wiz-sch-box .wiz-subpanel").forEach(function (sec, ix) {
        var c = collectForm(sec, "TOURNAMENT-SCHEDULE");
        c.CONTEST_CODE = contestCode();
        validateCells("TOURNAMENT-SCHEDULE", c).forEach(function (x) {
          all5.push("Расписание " + (ix + 1) + ": " + x);
        });
      });
      return all5;
    }
    return [];
  }

  function goNext() {
    readStepIntoState();
    persistDraft(function () {
      var err = validateCurrent();
      if (err.length) {
        showErr(err.join("\n"));
        return;
      }
      showErr("");
      if (state.stepIndex < (schema.steps || []).length - 1) {
        state.stepIndex++;
        render();
      }
    }, true);
  }

  function goBack() {
    readStepIntoState();
    persistDraft(function () {
      if (state.stepIndex > 0) {
        state.stepIndex--;
        render();
      }
    }, true);
  }

  function submitWizard() {
    readStepIntoState();
    var body = {
      draft_uuid: draftUuid,
      contest: state.contest,
      groups: state.groups,
      reward_links: state.reward_links,
      rewards: state.rewards,
      indicators: state.indicators,
      schedules: state.schedules,
    };
    fetch("/wizard/new-contest/commit", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      redirect: "manual",
    })
      .then(function (r) {
        if (r.status === 303 || r.status === 302) {
          leaveGuardSuspended = true;
          var loc = r.headers.get("Location");
          if (loc) {
            window.location.href = loc;
          }
          return;
        }
        return r.json().then(function (j) {
          var d = (j && j.detail) || r.statusText;
          showErr(typeof d === "string" ? d : JSON.stringify(d));
        });
      })
      .catch(function () {
        showErr("Ошибка сети.");
      });
  }

  function bind() {
    var nx = $("wiz-btn-next");
    var bk = $("wiz-btn-back");
    var cn = $("wiz-btn-cancel");
    if (nx) {
      nx.addEventListener("click", function () {
        if (state.stepIndex === (schema.steps || []).length - 1) {
          return;
        }
        goNext();
      });
    }
    if (bk) {
      bk.addEventListener("click", goBack);
    }
    if (cn) {
      cn.addEventListener("click", function () {
        if (!isWizardDirty()) {
          if (confirm("Выйти на главный экран?")) {
            leaveGuardSuspended = true;
            window.location.href = "/";
          }
          return;
        }
        openLeaveModal({ kind: "href", url: "/" });
      });
    }
    var sd = $("wiz-btn-save-draft");
    if (sd) {
      sd.addEventListener("click", function () {
        readStepIntoState();
        persistDraft(null, false);
      });
    }
  }

  function init() {
    var el = $("wizard-schema-json");
    if (!el) {
      return;
    }
    try {
      schema = JSON.parse(el.textContent);
    } catch (e) {
      console.error(e);
      return;
    }
    installWizardLeaveGuard();
    var params = new URLSearchParams(window.location.search || "");
    var draftParam = params.get("draft");
    function afterSchemaReady() {
      bind();
      render();
    }
    if (draftParam) {
      draftUuid = draftParam;
      fetch("/wizard/new-contest/draft/" + encodeURIComponent(draftParam))
        .then(function (r) {
          if (!r.ok) {
            throw new Error("draft");
          }
          return r.json();
        })
        .then(function (rec) {
          applyStateFromDraft(rec.state || {});
          markSavedSnapshot();
          var panel = $("wiz-draft-panel");
          if (panel) {
            panel.classList.add("is-hidden");
          }
          afterSchemaReady();
        })
        .catch(function () {
          draftUuid = newDraftUuid();
          lastSavedDraftJson = null;
          fetch("/wizard/new-contest/drafts")
            .then(function (r2) {
              return r2.json();
            })
            .then(function (rows) {
              renderDraftPanel(rows);
            })
            .finally(function () {
              afterSchemaReady();
            });
        });
    } else {
      draftUuid = newDraftUuid();
      lastSavedDraftJson = null;
      fetch("/wizard/new-contest/drafts")
        .then(function (r) {
          return r.json();
        })
        .then(function (rows) {
          renderDraftPanel(rows);
        })
        .finally(function () {
          afterSchemaReady();
        });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
