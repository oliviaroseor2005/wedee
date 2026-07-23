/* =========================================================
   script.js — Home page (index.html) grid, search, filters
   Depends on config.js (fetchAllVideos, videoHref, normalizeName,
   PLACEHOLDER_IMAGE, INITIAL_LOAD_COUNT, LOAD_MORE_COUNT, etc.)
   ========================================================= */

(function () {
  "use strict";

  let allVideos = [];
  let filtered = [];       // current working set after search/filters/sort
  let shownCount = 0;

  const state = {
    query: "",
    category: null,
    quick: null,      // "recent" | "popular" | "trending" | "random"
    length: null,     // "short" | "long"
    sort: "random",
    tag: null,
  };

  function durationToSeconds(d) {
    if (typeof d === "number") return d;
    if (!d) return 0;
    const parts = String(d).split(":").map(Number);
    return parts.reduce((acc, p) => acc * 60 + p, 0);
  }

  /* ---------------- Filtering / sorting ---------------- */
  function applyFilters() {
    let list = allVideos.slice();

    if (state.query) {
      const q = normalizeName(state.query);
      list = list.filter((v) => {
        const inTitle = normalizeName(v.title).includes(q);
        const inAuthor = normalizeName(v.author).includes(q);
        const inTags = Array.isArray(v.tags) && v.tags.some((t) => normalizeName(t).includes(q));
        return inTitle || inAuthor || inTags;
      });
    }

    if (state.category) {
      list = list.filter((v) => normalizeName(v.category) === normalizeName(state.category));
    }

    if (state.tag) {
      const t = normalizeName(state.tag);
      list = list.filter((v) => Array.isArray(v.tags) && v.tags.some((x) => normalizeName(x) === t));
    }

    if (state.length === "short") list = list.filter((v) => durationToSeconds(v.duration) < 20 * 60);
    if (state.length === "long") list = list.filter((v) => durationToSeconds(v.duration) >= 20 * 60);

    if (state.quick === "popular" || state.quick === "trending") {
      list = list.slice().sort((a, b) => (b.views || 0) - (a.views || 0));
    } else if (state.quick === "recent") {
      list = list.slice().sort((a, b) => new Date(b.uploadDate || b.date || 0) - new Date(a.uploadDate || a.date || 0));
    } else if (state.quick === "random") {
      list = shuffleArray(list);
    } else {
      switch (state.sort) {
        case "newest": list = list.slice().sort((a, b) => new Date(b.uploadDate || b.date || 0) - new Date(a.uploadDate || a.date || 0)); break;
        case "oldest": list = list.slice().sort((a, b) => new Date(a.uploadDate || a.date || 0) - new Date(b.uploadDate || b.date || 0)); break;
        case "views": list = list.slice().sort((a, b) => (b.views || 0) - (a.views || 0)); break;
        case "alpha": list = list.slice().sort((a, b) => (a.title || "").localeCompare(b.title || "")); break;
        default: list = shuffleArray(list);
      }
    }

    return list;
  }

  function updateTitle() {
    const titleEl = document.getElementById("gridTitle");
    if (state.query) titleEl.textContent = `Search results for "${state.query}"`;
    else if (state.tag) titleEl.textContent = `Tag: ${state.tag}`;
    else if (state.category) titleEl.textContent = state.category;
    else if (state.quick === "recent") titleEl.textContent = "Recently Added";
    else if (state.quick === "popular" || state.quick === "trending") titleEl.textContent = "Most Viewed";
    else titleEl.textContent = "All Videos";
  }

  function renderBatch() {
    const grid = document.getElementById("videoGrid");
    const next = filtered.slice(shownCount, shownCount + (shownCount === 0 ? INITIAL_LOAD_COUNT : LOAD_MORE_COUNT));
    grid.insertAdjacentHTML("beforeend", next.map(videoCardHtml).join(""));
    shownCount += next.length;
    wireVideoCardPreviews(grid);
    document.getElementById("resultCount").textContent = `${filtered.length} video${filtered.length === 1 ? "" : "s"}`;
    document.getElementById("loaderWrap").style.display = shownCount < filtered.length ? "" : "none";
  }

  function renderMoreVideosFallback() {
    // When a search/filter comes back empty, never dead-end — show a
    // "More Videos" section of random videos instead of a blank page.
    const section = document.getElementById("moreVideosSection");
    const grid = document.getElementById("moreVideosGrid");
    if (filtered.length === 0) {
      section.style.display = "";
      grid.innerHTML = shuffleArray(allVideos).slice(0, MORE_VIDEOS_INITIAL_COUNT || 18).map(videoCardHtml).join("");
      wireVideoCardPreviews(grid);
    } else {
      section.style.display = "none";
      grid.innerHTML = "";
    }
  }

  function rerender() {
    filtered = applyFilters();
    shownCount = 0;
    document.getElementById("videoGrid").innerHTML = "";
    updateTitle();
    renderBatch();
    renderMoreVideosFallback();
  }

  /* ---------------- Sidebar: categories + tags ---------------- */
  function renderCategoryFilters() {
    const wrap = document.getElementById("categoryFilters");
    const categories = [...new Set(allVideos.map((v) => v.category).filter(Boolean))].sort();
    wrap.innerHTML = categories.map((c) =>
      `<button class="filter-btn" data-category="${escapeHtml(c)}">${escapeHtml(c)}</button>`
    ).join("");
    wrap.querySelectorAll("[data-category]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const isActive = btn.classList.contains("active");
        wrap.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
        state.category = isActive ? null : btn.dataset.category;
        if (!isActive) btn.classList.add("active");
        state.quick = null; state.tag = null;
        rerender();
      });
    });
  }

  function renderTagCloud() {
    const wrap = document.getElementById("tagCloud");
    const tagCounts = {};
    allVideos.forEach((v) => (v.tags || []).forEach((t) => { tagCounts[t] = (tagCounts[t] || 0) + 1; }));
    const topTags = Object.entries(tagCounts).sort((a, b) => b[1] - a[1]).slice(0, 24).map(([t]) => t);
    wrap.innerHTML = topTags.map((t) => `<button class="tag-pill" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`).join("");
    wrap.querySelectorAll("[data-tag]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.tag = state.tag === btn.dataset.tag ? null : btn.dataset.tag;
        state.category = null; state.quick = null;
        document.querySelectorAll("#categoryFilters .filter-btn").forEach((b) => b.classList.remove("active"));
        rerender();
      });
    });
  }

  /* ---------------- Wiring ---------------- */
  function wireQuickFilters() {
    document.querySelectorAll(".sidebar-section [data-quick]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const isActive = btn.classList.contains("active");
        document.querySelectorAll("[data-quick]").forEach((b) => b.classList.remove("active"));
        state.quick = isActive ? null : btn.dataset.quick;
        if (!isActive) btn.classList.add("active");
        rerender();
      });
    });
  }

  function wireLengthFilters() {
    document.querySelectorAll("[data-length]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const isActive = btn.classList.contains("active");
        document.querySelectorAll("[data-length]").forEach((b) => b.classList.remove("active"));
        state.length = isActive ? null : btn.dataset.length;
        if (!isActive) btn.classList.add("active");
        rerender();
      });
    });
  }

  function wireSort() {
    document.getElementById("sortSelect").addEventListener("change", (e) => {
      state.sort = e.target.value;
      state.quick = null;
      document.querySelectorAll("[data-quick]").forEach((b) => b.classList.remove("active"));
      rerender();
    });
  }

  function wireSearch() {
    const input = document.getElementById("searchInput");
    let debounceTimer;
    input.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        state.query = input.value.trim();
        rerender();
      }, 300);
    });
  }

  function wireInfiniteScroll() {
    const sentinel = document.getElementById("scrollSentinel");
    const observer = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && shownCount < filtered.length) renderBatch();
    }, { rootMargin: "600px" });
    observer.observe(sentinel);
  }

  function wireMobileSidebar() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebarOverlay");
    document.getElementById("hamburgerBtn").addEventListener("click", () => {
      sidebar.classList.add("open");
      overlay.classList.add("show");
    });
    document.getElementById("sidebarClose").addEventListener("click", closeSidebar);
    overlay.addEventListener("click", closeSidebar);
    function closeSidebar() {
      sidebar.classList.remove("open");
      overlay.classList.remove("show");
    }
  }

  /* ---------------- Boot ---------------- */
  async function init() {
    try {
      allVideos = await fetchAllVideos();
    } catch (err) {
      console.error("[script] fetchAllVideos failed:", err);
      document.getElementById("resultCount").textContent = "Couldn't load videos — check console.";
      return;
    }
    renderCategoryFilters();
    renderTagCloud();
    wireQuickFilters();
    wireLengthFilters();
    wireSort();
    wireSearch();
    wireMobileSidebar();

    const q = new URLSearchParams(window.location.search).get("q");
    if (q) {
      document.getElementById("searchInput").value = q;
      state.query = q;
    }

    rerender();
    wireInfiniteScroll();
  }

  document.addEventListener("DOMContentLoaded", init);
})();