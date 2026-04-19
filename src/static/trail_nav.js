/**
 * Цепочка переходов при редактировании строк и переходах по блоку «Связи».
 * Хранение: sessionStorage, ключ spod_edit_trail — массив { title, href } страниц,
 * с которых пользователь ушёл по связи (для «Шаг назад» и хлебных крошек).
 */
(function () {
  "use strict";

  var STORAGE_KEY = "spod_edit_trail";

  function readTrail() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      var t = JSON.parse(raw);
      return Array.isArray(t) ? t : [];
    } catch (e) {
      return [];
    }
  }

  function writeTrail(arr) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(arr));
  }

  function clearTrail() {
    sessionStorage.removeItem(STORAGE_KEY);
  }

  function esc(s) {
    var d = document.createElement("div");
    d.textContent = s == null ? "" : String(s);
    return d.innerHTML;
  }

  function currentListHref(meta) {
    var base = "/sheet/" + encodeURIComponent(meta.dataset.sheetCode);
    var q = meta.dataset.listQuery || "";
    return q ? base + "?" + q : base;
  }

  function pushCurrentToTrail(meta) {
    var href = window.location.pathname + (window.location.search || "");
    var title =
      meta.dataset.trailCurrentTitle ||
      meta.dataset.sheetCode + " · #" + meta.dataset.rowIndex;
    var t = readTrail();
    if (t.length && t[t.length - 1].href === href) return;
    t.push({ title: title, href: href });
    writeTrail(t);
  }

  function goBackOne(meta) {
    var t = readTrail();
    if (!t.length) {
      window.location.href = currentListHref(meta);
      return;
    }
    var prev = t.pop();
    writeTrail(t);
    window.location.href = prev.href;
  }

  function goTrailIndex(i) {
    var t = readTrail();
    if (i < 0 || i >= t.length) return;
    var target = t[i];
    writeTrail(t.slice(0, i));
    window.location.href = target.href;
  }

  /** Один обработчик на документ: ссылки «Главная» в шапке и в крошках сбрасывают цепочку. */
  function bindRootClearDelegation() {
    if (bindRootClearDelegation._done) return;
    bindRootClearDelegation._done = true;
    document.body.addEventListener("click", function (e) {
      var a = e.target.closest && e.target.closest("a.spod-trail-clear-root");
      if (a) clearTrail();
    });
  }

  function bindListClears(meta) {
    var listHref = currentListHref(meta);
    document.querySelectorAll(".spod-trail-clear-to-list").forEach(function (a) {
      a.addEventListener("click", function () {
        if (a.getAttribute("href") === listHref) clearTrail();
      });
    });
  }

  function bindRelNav() {
    document.querySelectorAll("a.spod-rel-nav").forEach(function (a) {
      a.addEventListener("click", function (e) {
        var meta = document.getElementById("row-page-meta");
        if (!meta) return;
        e.preventDefault();
        pushCurrentToTrail(meta);
        var href = a.getAttribute("href") || "";
        var q = meta.dataset.listQuery || "";
        if (q) {
          var sep = href.indexOf("?") >= 0 ? "&" : "?";
          href = href + sep + "list_qs=" + encodeURIComponent(q);
        }
        window.location.href = href;
      });
    });
  }

  function renderTrailBar(meta, navEl) {
    var t = readTrail();
    var currentTitle =
      meta.dataset.trailCurrentTitle ||
      meta.dataset.sheetCode + " · строка " + meta.dataset.rowIndex;

    var parts = [];
    parts.push(
      '<span class="trail-nav-label">Цепочка:</span> ' +
        '<a href="/" class="trail-crumb trail-crumb-root spod-trail-clear-root">Главная</a>'
    );

    for (var i = 0; i < t.length; i++) {
      parts.push(
        '<span class="trail-sep">›</span><a href="#" class="trail-crumb" data-trail-go="' +
          i +
          '">' +
          esc(t[i].title) +
          "</a>"
      );
    }
    parts.push(
      '<span class="trail-sep">›</span><span class="trail-crumb trail-current">' +
        esc(currentTitle) +
        "</span>"
    );

    var actions =
      '<div class="trail-nav-actions">' +
      '<button type="button" class="btn btn-ghost btn-sm" id="spod-trail-back" title="' +
      (t.length ? "Предыдущая страница в цепочке" : "Цепочка пуста — откроется список этого листа") +
      '">Шаг назад</button> ' +
      '<a class="btn btn-ghost btn-sm spod-trail-clear-to-list" href="' +
      esc(currentListHref(meta)) +
      '">К списку листа</a> ' +
      '<a class="btn btn-ghost btn-sm spod-trail-clear-root" href="/">На главную</a>' +
      "</div>";

    navEl.innerHTML =
      '<div class="trail-nav-inner">' +
      '<div class="trail-nav-crumbs">' +
      parts.join("") +
      "</div>" +
      actions +
      "</div>";

    navEl.querySelectorAll("[data-trail-go]").forEach(function (link) {
      link.addEventListener("click", function (e) {
        e.preventDefault();
        goTrailIndex(parseInt(link.getAttribute("data-trail-go"), 10));
      });
    });

    var backBtn = navEl.querySelector("#spod-trail-back");
    if (backBtn) {
      backBtn.addEventListener("click", function () {
        goBackOne(meta);
      });
    }

    bindRootClearDelegation();
  }

  function initRowPage() {
    var meta = document.getElementById("row-page-meta");
    var navEl = document.getElementById("spod-trail-nav");
    if (!meta || !navEl) return;

    var params = new URLSearchParams(window.location.search);
    if (params.get("from_list") === "1") {
      var st = meta.dataset.sheetTitle || meta.dataset.sheetCode;
      writeTrail([
        {
          title: "Список: " + st,
          href: currentListHref(meta),
        },
      ]);
      params.delete("from_list");
      var qs = params.toString();
      var nw = window.location.pathname + (qs ? "?" + qs : "");
      window.history.replaceState(null, "", nw);
    }

    renderTrailBar(meta, navEl);
    bindRelNav();
    bindListClears(meta);
    bindRootClearDelegation();
  }

  function onReady() {
    var path = window.location.pathname || "";
    if (path === "/" || path === "") {
      clearTrail();
      bindRootClearDelegation();
      return;
    }
    initRowPage();
    if (!document.getElementById("row-page-meta")) {
      bindRootClearDelegation();
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", onReady);
  } else {
    onReady();
  }
})();
