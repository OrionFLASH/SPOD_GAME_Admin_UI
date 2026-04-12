/**
 * Редактор строки: сетка плоских полей, развёртка JSON в параметры, сборка при сохранении.
 */
(function () {
  "use strict";

  function formatPath(parts) {
    let s = "";
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

  function flattenLeaves(value, pathParts, out) {
    if (value === null) {
      out.push({ parts: pathParts.slice(), vtype: "null", display: "" });
      return;
    }
    const t = typeof value;
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
    const keys = Object.keys(value);
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
    let cur = root;
    for (let i = 0; i < parts.length - 1; i++) {
      const p = parts[i];
      const nxt = parts[i + 1];
      if (cur[p] === undefined || cur[p] === null) {
        cur[p] = typeof nxt === "number" ? [] : {};
      }
      cur = cur[p];
    }
    cur[parts[parts.length - 1]] = val;
  }

  function coerceLeafValue(row) {
    const vt = row.getAttribute("data-vtype");
    if (vt === "null") {
      return null;
    }
    if (vt === "boolean") {
      const cb = row.querySelector('input[type="checkbox"]');
      return !!(cb && cb.checked);
    }
    if (vt === "number") {
      const inp = row.querySelector("input.json-leaf-input");
      const n = parseFloat(inp && inp.value);
      return Number.isFinite(n) ? n : 0;
    }
    const inp = row.querySelector("input.json-leaf-input, textarea.json-leaf-input");
    return inp ? inp.value : "";
  }

  function findJsonBox(col) {
    const nodes = document.querySelectorAll("[data-json-column]");
    for (let i = 0; i < nodes.length; i++) {
      if (nodes[i].getAttribute("data-json-column") === col) {
        return nodes[i];
      }
    }
    return null;
  }

  function buildJsonFromFields(container) {
    const mode = container.getAttribute("data-edit-mode") || "fields";
    if (mode === "raw") {
      const ta = container.querySelector("textarea[data-json-raw]");
      const t = (ta && ta.value.trim()) || "";
      if (!t) {
        return "";
      }
      try {
        return JSON.stringify(JSON.parse(t));
      } catch (e) {
        return ta.value;
      }
    }

    const rk = container.getAttribute("data-root-kind");
    if (rk === "null") {
      return "";
    }

    if (rk === "primitive") {
      const one = container.querySelector(".json-leaf-row");
      if (!one) {
        return "";
      }
      return JSON.stringify(coerceLeafValue(one));
    }

    const leaves = container.querySelectorAll(".json-leaf-row[data-json-path]");
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
      const only = leaves[0];
      const vt = only.getAttribute("data-vtype");
      if (vt === "empty-array") {
        return "[]";
      }
      if (vt === "empty-object") {
        return "{}";
      }
    }

    let root;
    if (rk === "array") {
      root = [];
    } else {
      root = {};
    }

    leaves.forEach(function (row) {
      const vt = row.getAttribute("data-vtype");
      if (vt === "empty-array" || vt === "empty-object") {
        return;
      }
      const parts = JSON.parse(row.getAttribute("data-json-path"));
      const val = coerceLeafValue(row);
      setDeep(root, parts, val);
    });

    return JSON.stringify(root);
  }

  function renderJsonColumn(container, jc) {
    const col = jc.column;
    container.setAttribute("data-json-column", col);
    container.setAttribute("data-edit-mode", "fields");

    const toolbar = document.createElement("div");
    toolbar.className = "json-column-toolbar";
    toolbar.innerHTML =
      '<input type="search" class="json-filter" placeholder="Фильтр по имени параметра…" aria-label="Фильтр JSON" />' +
      '<div class="json-mode-toggle">' +
      '<button type="button" class="btn btn-ghost btn-sm js-mode-fields">По полям</button>' +
      '<button type="button" class="btn btn-ghost btn-sm js-mode-raw">Сырой JSON</button>' +
      "</div>";
    container.appendChild(toolbar);

    const fieldsWrap = document.createElement("div");
    fieldsWrap.className = "json-fields-wrap";
    container.appendChild(fieldsWrap);

    const rawWrap = document.createElement("div");
    rawWrap.className = "json-raw-wrap is-hidden";
    const ta = document.createElement("textarea");
    ta.className = "json-raw-textarea";
    ta.setAttribute("data-json-raw", "1");
    ta.rows = 14;
    ta.value = jc.raw || "";
    rawWrap.appendChild(ta);
    container.appendChild(rawWrap);

    if (!jc.ok) {
      fieldsWrap.innerHTML =
        '<p class="muted">Не удалось разобрать как JSON. Используйте режим «Сырой JSON».</p>';
      container.setAttribute("data-edit-mode", "raw");
      fieldsWrap.classList.add("is-hidden");
      rawWrap.classList.remove("is-hidden");
      toolbar.querySelector(".json-filter").style.display = "none";
      container.setAttribute("data-initial-json-norm", normalizeJsonCell(jc.raw));
      ta.addEventListener("input", function () {
        document.dispatchEvent(new Event("spod-editor-change"));
      });
      return;
    }

    const parsed = jc.parsed;
    const rk = rootKindOf(parsed);
    container.setAttribute("data-root-kind", rk);

    if (rk === "null") {
      fieldsWrap.innerHTML =
        '<p class="muted">Пустое значение. При необходимости введите JSON во вкладке «Сырой JSON».</p>';
      ta.value = jc.raw || "";
      container.setAttribute("data-initial-json-norm", normalizeJsonCell(jc.raw));
      ta.addEventListener("input", function () {
        document.dispatchEvent(new Event("spod-editor-change"));
      });
      return;
    }

    const leaves = [];
    flattenLeaves(parsed, [], leaves);

    const grid = document.createElement("div");
    grid.className = "json-field-grid";

    if (leaves.length === 0) {
      const hint = document.createElement("p");
      hint.className = "muted json-empty-hint";
      hint.textContent = "Нет вложенных полей — при необходимости откройте «Сырой JSON».";
      fieldsWrap.appendChild(hint);
    }

    leaves.forEach(function (leaf) {
      const row = document.createElement("div");
      row.className = "json-leaf-row grid-cell";
      row.setAttribute("data-json-path", JSON.stringify(leaf.parts));
      row.setAttribute("data-vtype", leaf.vtype);
      row.setAttribute("data-filter-text", formatPath(leaf.parts).toLowerCase());

      const lab = document.createElement("label");
      lab.className = "json-path-label";
      lab.textContent = formatPath(leaf.parts);
      row.appendChild(lab);

      if (leaf.vtype === "empty-array" || leaf.vtype === "empty-object") {
        const span = document.createElement("span");
        span.className = "muted";
        span.textContent = leaf.vtype === "empty-array" ? "(пустой массив)" : "(пустой объект)";
        row.appendChild(span);
      } else if (leaf.vtype === "boolean") {
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.className = "json-leaf-input";
        cb.checked = leaf.display === "1" || leaf.display === "true";
        row.appendChild(cb);
      } else if (leaf.vtype === "number") {
        const inp = document.createElement("input");
        inp.type = "number";
        inp.step = "any";
        inp.className = "json-leaf-input";
        inp.value = leaf.display;
        row.appendChild(inp);
      } else if (leaf.vtype === "null") {
        const inp = document.createElement("input");
        inp.type = "text";
        inp.className = "json-leaf-input";
        inp.placeholder = "null";
        inp.value = "";
        row.appendChild(inp);
      } else {
        const inp = document.createElement("input");
        inp.type = "text";
        inp.className = "json-leaf-input";
        inp.value = leaf.display;
        row.appendChild(inp);
      }

      grid.appendChild(row);
    });

    fieldsWrap.appendChild(grid);

    ta.value =
      typeof parsed === "object" && parsed !== null
        ? JSON.stringify(parsed, null, 2)
        : JSON.stringify(parsed);

    container.setAttribute("data-initial-json-norm", normalizeJsonCell(buildJsonFromFields(container)));

    const filterInp = toolbar.querySelector(".json-filter");
    filterInp.addEventListener("input", function (ev) {
      const q = (ev.target.value || "").trim().toLowerCase();
      grid.querySelectorAll(".json-leaf-row").forEach(function (r) {
        const t = r.getAttribute("data-filter-text") || "";
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
    const grid = document.getElementById("flat-field-grid");
    if (!grid) {
      return;
    }
    const flat = bootstrap.flat || {};
    const keys = Object.keys(flat);
    if (keys.length === 0) {
      grid.innerHTML = '<p class="muted">Все колонки этого листа относятся к JSON-блокам справа.</p>';
      return;
    }
    keys.forEach(function (col) {
      const cell = document.createElement("div");
      cell.className = "scalar-cell grid-cell";
      cell.setAttribute("data-filter-text", col.toLowerCase());
      const safeId = "col-" + col.replace(/[^a-zA-Z0-9_]/g, "_");
      const lab = document.createElement("label");
      lab.setAttribute("for", safeId);
      lab.textContent = col;
      const inp = document.createElement("input");
      inp.id = safeId;
      inp.type = "text";
      inp.setAttribute("data-col", col);
      inp.setAttribute("data-initial", flat[col] != null ? String(flat[col]) : "");
      inp.value = flat[col] != null ? String(flat[col]) : "";
      const was = document.createElement("div");
      was.className = "was-value is-hidden";
      cell.appendChild(lab);
      cell.appendChild(inp);
      cell.appendChild(was);
      inp.addEventListener("input", function () {
        document.dispatchEvent(new Event("spod-editor-change"));
      });
      grid.appendChild(cell);
    });

    const flt = document.getElementById("flat-field-filter");
    if (flt) {
      flt.addEventListener("input", function () {
        const q = (flt.value || "").trim().toLowerCase();
        grid.querySelectorAll(".scalar-cell").forEach(function (c) {
          const t = c.getAttribute("data-filter-text") || "";
          c.style.display = !q || t.indexOf(q) !== -1 ? "" : "none";
        });
      });
    }
  }

  function wireNav() {
    document.querySelectorAll(".edit-nav a[href^='#']").forEach(function (a) {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        const id = a.getAttribute("href").slice(1);
        const el = document.getElementById(id);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      });
    });
  }

  function collectPayload(bootstrap) {
    const o = Object.assign({}, bootstrap.fullRow || {});
    document.querySelectorAll("[data-col]").forEach(function (el) {
      o[el.dataset.col] = el.value;
    });
    (bootstrap.jsonCols || []).forEach(function (jc) {
      const box = findJsonBox(jc.column);
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
    const t = (raw != null ? String(raw) : "").trim();
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
    const p = collectPayload(bootstrap);
    const sorted = Object.keys(p)
      .sort()
      .map(function (k) {
        return [k, p[k]];
      });
    return JSON.stringify(Object.fromEntries(sorted));
  }

  function refreshDirtyState(bootstrap) {
    const dock = document.getElementById("edit-dock");
    const btnSave = document.getElementById("btn-save");
    const btnCancel = document.getElementById("btn-cancel");
    const banner = document.getElementById("edit-dirty-banner");
    if (!btnSave || typeof bootstrap.__initialCanonical === "undefined") {
      return;
    }
    const cur = canonicalPayload(bootstrap);
    const dirty = cur !== bootstrap.__initialCanonical;
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
      const cell = inp.closest(".scalar-cell");
      const was = cell && cell.querySelector(".was-value");
      if (!was) {
        return;
      }
      const init = inp.getAttribute("data-initial") || "";
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
      const box = findJsonBox(jc.column);
      const wrap = document.getElementById("sec-json-" + (jc.section_slug || jc.column.replace(/[^a-zA-Z0-9_-]/g, "_")));
      if (!box || !wrap) {
        return;
      }
      const initN = box.getAttribute("data-initial-json-norm") || "";
      const curN = normalizeJsonCell(buildJsonFromFields(box));
      if (initN !== curN) {
        wrap.classList.add("json-column-panel--changed");
        let hint = box.querySelector(".json-changed-hint");
        if (!hint) {
          hint = document.createElement("div");
          hint.className = "json-changed-hint";
          hint.innerHTML =
            '<p class="muted json-changed-title">Колонка изменена (ещё не сохранено в новую версию строки).</p>' +
            '<div class="was-json-wrap"><span class="was-json-label">Было (в базе):</span><pre class="json-was-pre"></pre></div>';
          const tb = box.querySelector(".json-column-toolbar");
          if (tb) {
            tb.after(hint);
          } else {
            box.prepend(hint);
          }
        }
        let prevDisplay = initN === "" ? "∅" : initN;
        if (initN !== "") {
          try {
            prevDisplay = JSON.stringify(JSON.parse(initN), null, 2);
          } catch (e0) {
            /* не JSON — показываем как текст */
          }
        }
        const pre = hint.querySelector(".json-was-pre");
        if (pre) {
          pre.textContent = prevDisplay;
        }
      } else {
        wrap.classList.remove("json-column-panel--changed");
        const hint = box.querySelector(".json-changed-hint");
        if (hint) {
          hint.remove();
        }
      }
    });
  }

  function init() {
    const el = document.getElementById("row-editor-bootstrap");
    if (!el) {
      return;
    }
    let bootstrap;
    try {
      bootstrap = JSON.parse(el.textContent);
    } catch (e) {
      console.error(e);
      return;
    }

    renderFlatSection(bootstrap);

    const jsonRoot = document.getElementById("json-columns-mount");
    if (jsonRoot) {
      (bootstrap.jsonCols || []).forEach(function (jc) {
        const wrap = document.createElement("section");
        wrap.className = "panel json-column-panel";
        wrap.id = "sec-json-" + (jc.section_slug || jc.column.replace(/[^a-zA-Z0-9_-]/g, "_"));
        const h = document.createElement("h2");
        h.textContent = "JSON · " + jc.column;
        wrap.appendChild(h);
        const inner = document.createElement("div");
        inner.className = "json-column-card";
        renderJsonColumn(inner, jc);
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

    const btn = document.getElementById("btn-save");
    if (btn) {
      btn.addEventListener("click", async function () {
        const payload = collectPayload(bootstrap);
        const sc = bootstrap.sheetCode;
        const rid = bootstrap.rowId;
        const res = await fetch("/sheet/" + encodeURIComponent(sc) + "/row/" + rid + "/save", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          redirect: "manual",
        });
        if (res.status === 303 || res.status === 302) {
          const loc = res.headers.get("Location");
          if (loc) {
            window.location.href = loc;
            return;
          }
        }
        if (res.ok) {
          window.location.href = "/sheet/" + encodeURIComponent(sc) + "/row/" + rid;
          return;
        }
        const txt = await res.text();
        try {
          const j = JSON.parse(txt);
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
    const btnCancel = document.getElementById("btn-cancel");
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
