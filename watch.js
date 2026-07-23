/* =========================================================
   watch.js — logic for the single dynamic watch template (v/watch.html)
   Depends on config.js having already loaded (fetchAllVideos,
   fetchVideoApiData, fetchDirectVideoUrl, videoHref, authorHref,
   currentVideoIdFromUrl, normalizeName, videosByAuthorName,
   PLACEHOLDER_IMAGE, RELATED_INITIAL_COUNT, RELATED_LOAD_MORE_COUNT).
   ========================================================= */

(function () {
  "use strict";

  let allVideos = [];
  let currentVideo = null;
  let relatedPool = [];      // full candidate list (search-filtered or not)
  let relatedShownCount = 0;
  let searchActive = false;

  function formatViews(n) {
    n = Number(n) || 0;
    if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, "") + "M views";
    if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, "") + "K views";
    return n + " views";
  }

  function formatDate(d) {
    if (!d) return "";
    const dt = new Date(d);
    if (isNaN(dt)) return "";
    return dt.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  }

  /* ---------------- Player ---------------- */
  // Video hosting/embed URLs commonly look nothing like a plain file —
  // treat anything ending in a known video-file extension as a direct
  // file for <video>, and everything else (embed pages, iframes from a
  // third-party host) as something that needs an <iframe> instead.
  function looksLikeDirectVideoFile(url) {
    return /\.(mp4|webm|ogg|ogv|mov|m3u8)(\?.*)?$/i.test(url);
  }

  // Fetches the worker's data for this video ONCE and returns it, so
  // both the player and the live view count can be filled in from the
  // same network call instead of hitting the worker twice.
  async function resolveVideoApiData(video) {
    // 1) Already embedded in this video's own JSON entry — no network
    //    call needed. Covers datasets where the playable link ships
    //    directly instead of being looked up from VIDEO_API_URL. In
    //    this case there's no live view count from the worker either.
    const inline = video.directVideoUrl || video.videoUrl || video.src || video.embedUrl;
    if (inline) return { directVideoUrl: inline, views: null };

    // 2) Fall back to the Cloudflare Worker lookup by uniqueId (or id,
    //    if that's the field this video's JSON entry uses instead),
    //    which returns both directVideoUrl and views together.
    try {
      const data = await fetchVideoApiData(video.uniqueId ?? video.id);
      return data || { directVideoUrl: null, views: null };
    } catch (err) {
      console.error("[watch] fetchVideoApiData threw:", err);
      return { directVideoUrl: null, views: null };
    }
  }

  async function renderPlayer(video, apiData) {
    const wrap = document.getElementById("playerWrap");
    const directUrl = apiData.directVideoUrl;

    if (!directUrl) {
      wrap.innerHTML = `
        <div class="player-error">
          This video isn't available to play right now — no playable link is on
          file for it yet (checked the video's own JSON entry and the
          VIDEO_API_URL worker for uniqueId "${video.uniqueId ?? video.id}", both came back
          empty). If you expect one, check DevTools → Network for a failed
          request to ${VIDEO_API_URL} — a 404 there means no row exists yet for
          this uniqueId; a CORS error means the Worker needs to allow this
          site's origin.
        </div>`;
      return;
    }

    if (looksLikeDirectVideoFile(directUrl)) {
      wrap.innerHTML = `
        <video class="watch-player" controls preload="metadata"
               poster="${video.thumbnail || video.thumb || PLACEHOLDER_IMAGE}">
          <source src="${directUrl}">
          Your browser doesn't support HTML5 video.
        </video>`;
      const videoEl = wrap.querySelector("video");
      videoEl.addEventListener("error", () => {
        console.error("[watch] <video> failed to load source:", directUrl, videoEl.error);
        wrap.innerHTML = `
          <div class="player-error">
            The video source didn't load (HTTP error, wrong format, or the host
            blocked this site from embedding it). Direct link:
            <a href="${directUrl}" target="_blank" rel="noopener noreferrer">open it directly</a>.
          </div>`;
      });
    } else {
      // Not a recognizable direct file — treat as an embeddable page
      // (common for third-party video hosts that only give you an
      // embed/player URL, not a raw .mp4).
      wrap.innerHTML = `
        <iframe class="watch-player" src="${directUrl}" allowfullscreen
                allow="autoplay; encrypted-media; picture-in-picture"
                style="border:0; width:100%; height:100%;"></iframe>`;
    }
  }

  /* ---------------- Info / meta ---------------- */
  function renderInfo(video) {
    document.getElementById("watchTitle").textContent = video.title || "Untitled";

    const authorLink = document.getElementById("watchAuthorLink");
    if (video.author) {
      authorLink.textContent = video.author;
      authorLink.href = authorHref({ name: video.author });
      authorLink.style.display = "";
    }

    // Views are NOT taken from the static JSON here — they're only
    // ever set from the live TurboVIPlay fetch, in updateViewsDisplay(),
    // once resolveVideoApiData() resolves. Kept hidden until then.
    document.getElementById("watchViews").style.display = "none";
    document.getElementById("watchDate").textContent = formatDate(video.uploadDate || video.date);

    const tagsEl = document.getElementById("watchTags");
    const tags = Array.isArray(video.tags) ? video.tags : [];
    tagsEl.innerHTML = tags.map((t) =>
      `<button class="tag-pill" data-tag="${escapeHtml(t)}">${escapeHtml(t)}</button>`
    ).join("");
    tagsEl.querySelectorAll(".tag-pill").forEach((btn) => {
      btn.addEventListener("click", () => runSearch(btn.dataset.tag));
    });

    document.getElementById("watchDescription").textContent = video.description || "";
  }

  // Sets the live view count from TurboVIPlay, fetched via the D1/
  // Worker lookup. If the worker didn't return a number (lookup
  // failed, video's URL was inline with no worker record, etc.), the
  // whole views element stays hidden rather than showing a stale/fake
  // number or an empty icon with no text next to it.
  function updateViewsDisplay(views) {
    const wrap = document.getElementById("watchViews");
    if (typeof views !== "number") { wrap.style.display = "none"; return; }
    document.getElementById("watchViewsCount").textContent = formatViews(views);
    wrap.style.display = "";
  }

  function wireLikeButton(video) {
    const btn = document.getElementById("likeBtn");
    const lib = window.StreamHubLibrary;
    if (!lib) { btn.style.display = "none"; return; }
    function refresh() {
      const liked = lib.isLiked(video.uniqueId ?? video.id);
      btn.textContent = liked ? "♥ Liked" : "♡ Like";
      btn.style.color = liked ? "var(--accent)" : "";
    }
    refresh();
    btn.addEventListener("click", () => { lib.toggleLike(video); refresh(); });
  }

  function updateHeadMeta(video) {
    const title = `${video.title || "Watch"} — StreamHub`;
    document.getElementById("pageTitle").textContent = title;
    document.title = title;
    const desc = (video.description || `Watch ${video.title || "this video"} on StreamHub.`).slice(0, 160);
    document.getElementById("pageDescription").setAttribute("content", desc);
    document.getElementById("ogTitle").setAttribute("content", title);
    document.getElementById("ogDescription").setAttribute("content", desc);
    document.getElementById("twitterTitle").setAttribute("content", title);
    document.getElementById("twitterDescription").setAttribute("content", desc);
    const thumb = video.thumbnail || video.thumb;
    if (thumb) {
      document.getElementById("ogImage").setAttribute("content", thumb);
      document.getElementById("twitterImage").setAttribute("content", thumb);
    }
    const canonicalUrl = window.location.origin + window.location.pathname + window.location.search;
    document.getElementById("canonicalLink").setAttribute("href", canonicalUrl);
    document.getElementById("ogUrl").setAttribute("content", canonicalUrl);
  }

  /* ---------------- Related videos (+ in-page search) ---------------- */
  function buildDefaultRelatedPool(video) {
    const sameAuthor = video.author ? videosByAuthorName(video.author, allVideos) : [];
    const sameAuthorIds = new Set(sameAuthor.map((v) => String(v.uniqueId ?? v.id)));
    const videoTags = new Set((video.tags || []).map((t) => String(t).toLowerCase()));

    const byTag = allVideos.filter((v) => {
      const id = String(v.uniqueId ?? v.id);
      if (id === String(video.uniqueId ?? video.id)) return false;
      if (sameAuthorIds.has(id)) return false;
      return Array.isArray(v.tags) && v.tags.some((t) => videoTags.has(String(t).toLowerCase()));
    });

    const rest = allVideos.filter((v) => {
      const id = String(v.uniqueId ?? v.id);
      return id !== String(video.uniqueId ?? video.id) && !sameAuthorIds.has(id) && !byTag.includes(v);
    });

    return [
      ...sameAuthor.filter((v) => String(v.uniqueId ?? v.id) !== String(video.uniqueId ?? video.id)),
      ...byTag,
      ...shuffleArray(rest),
    ];
  }

  function renderRelatedBatch() {
    const grid = document.getElementById("relatedGrid");
    const nextBatch = relatedPool.slice(relatedShownCount, relatedShownCount + RELATED_LOAD_MORE_COUNT);
    grid.insertAdjacentHTML("beforeend", nextBatch.map(videoCardHtml).join(""));
    relatedShownCount += nextBatch.length;
    wireVideoCardPreviews(grid);

    const loaderWrap = document.getElementById("relatedLoaderWrap");
    loaderWrap.style.display = relatedShownCount < relatedPool.length ? "" : "none";
  }

  function resetRelatedGrid(pool) {
    relatedPool = pool;
    relatedShownCount = 0;
    document.getElementById("relatedGrid").innerHTML = "";
    const initialBatch = Math.min(RELATED_INITIAL_COUNT, relatedPool.length);
    // Temporarily borrow LOAD_MORE logic for the first paint too, in
    // fixed-size chunks up to RELATED_INITIAL_COUNT.
    while (relatedShownCount < initialBatch) {
      const chunk = relatedPool.slice(relatedShownCount, relatedShownCount + RELATED_LOAD_MORE_COUNT);
      document.getElementById("relatedGrid").insertAdjacentHTML("beforeend", chunk.map(videoCardHtml).join(""));
      relatedShownCount += chunk.length;
    }
    wireVideoCardPreviews(document.getElementById("relatedGrid"));
    document.getElementById("relatedLoaderWrap").style.display =
      relatedShownCount < relatedPool.length ? "" : "none";
  }

  document.getElementById("relatedLoadMoreBtn").addEventListener("click", renderRelatedBatch);

  /* In-page search: filters the related pool without leaving the page,
     so playback of the current video is never interrupted. */
  function runSearch(query) {
    const searchInput = document.getElementById("searchInput");
    searchInput.value = query;
    const heading = document.querySelector(".related-heading");
    const q = normalizeName(query);

    if (!q) {
      searchActive = false;
      heading.textContent = "Related Videos";
      resetRelatedGrid(buildDefaultRelatedPool(currentVideo));
      return;
    }

    searchActive = true;
    heading.textContent = `Search results for "${query}"`;
    const matches = allVideos.filter((v) => {
      const id = String(v.uniqueId ?? v.id);
      if (id === String(currentVideo.uniqueId ?? currentVideo.id)) return false;
      const inTitle = normalizeName(v.title).includes(q);
      const inAuthor = normalizeName(v.author).includes(q);
      const inTags = Array.isArray(v.tags) && v.tags.some((t) => normalizeName(t).includes(q));
      return inTitle || inAuthor || inTags;
    });

    if (matches.length) {
      resetRelatedGrid(matches);
    } else {
      // Never dead-end a search — fall back to a random pool instead.
      heading.textContent = `No matches for "${query}" — more videos`;
      resetRelatedGrid(shuffleArray(allVideos.filter((v) =>
        String(v.uniqueId ?? v.id) !== String(currentVideo.uniqueId ?? currentVideo.id)
      )));
    }
  }

  function wireInPageSearch() {
    const input = document.getElementById("searchInput");
    let debounceTimer;
    input.addEventListener("input", () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => runSearch(input.value.trim()), 300);
    });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); clearTimeout(debounceTimer); runSearch(input.value.trim()); }
    });
  }

  /* ---------------- Boot ---------------- */
  async function init() {
    const id = currentVideoIdFromUrl();
    if (!id) {
      showNotFound();
      return;
    }

    try {
      allVideos = await fetchAllVideos();
    } catch (err) {
      console.error("[watch] fetchAllVideos failed:", err);
      showNotFound();
      return;
    }

    currentVideo = allVideos.find((v) => String(v.uniqueId ?? v.id) === String(id));
    if (!currentVideo) {
      showNotFound();
      return;
    }

    document.getElementById("watchContent").style.display = "";
    updateHeadMeta(currentVideo);
    renderInfo(currentVideo);

    const apiData = await resolveVideoApiData(currentVideo);
    renderPlayer(currentVideo, apiData);
    updateViewsDisplay(apiData.views);

    wireLikeButton(currentVideo);
    if (window.StreamHubLibrary) window.StreamHubLibrary.addToHistory(currentVideo);
    resetRelatedGrid(buildDefaultRelatedPool(currentVideo));
    wireInPageSearch();
  }

  function showNotFound() {
    document.getElementById("notFoundBanner").style.display = "";
    document.getElementById("watchContent").style.display = "none";
    document.querySelector(".related-section").style.display = "none";
    document.title = "Video not found — StreamHub";
  }

  document.addEventListener("DOMContentLoaded", init);
})();