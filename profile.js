/* =========================================================
   models/profile.js — logic for the single dynamic profile template
   ========================================================= */

(function () {
  "use strict";

  let allVideos = [];
  let allAuthors = [];
  let currentAuthor = null;
  let authorVideos = [];
  let authorShown = 0;
  let moreVideos = [];
  let moreShown = 0;

  function renderChunk(pool, shownRef, gridId, loaderWrapId, chunkSize) {
    const grid = document.getElementById(gridId);
    const next = pool.slice(shownRef.count, shownRef.count + chunkSize);
    grid.insertAdjacentHTML("beforeend", next.map(videoCardHtml).join(""));
    shownRef.count += next.length;
    wireVideoCardPreviews(grid);
    document.getElementById(loaderWrapId).style.display = shownRef.count < pool.length ? "" : "none";
  }

  async function init() {
    const key = currentAuthorKeyFromUrl();
    if (!key) { showNotFound(); return; }

    try {
      [allVideos, allAuthors] = await Promise.all([fetchAllVideos(), fetchAllAuthors()]);
    } catch (err) {
      console.error("[profile] failed to load data:", err);
      showNotFound();
      return;
    }

    currentAuthor = allAuthors.find((a) => normalizeName(a.name) === key);
    // Fall back to building a lightweight author record from the video
    // pool itself if this creator only ever appears as a video's
    // "author" text field and has no entry in AUTHOR_JSON_URLS yet.
    if (!currentAuthor) {
      const matchVideo = allVideos.find((v) => normalizeName(v.author) === key);
      if (matchVideo) currentAuthor = { name: matchVideo.author, profilePhoto: PLACEHOLDER_AVATAR };
    }
    if (!currentAuthor) { showNotFound(); return; }

    authorVideos = videosByAuthorName(currentAuthor.name, allVideos);
    const authorIds = new Set(authorVideos.map((v) => String(v.uniqueId ?? v.id)));
    moreVideos = shuffleArray(allVideos.filter((v) => !authorIds.has(String(v.uniqueId ?? v.id))));

    renderProfile();
  }

  function renderProfile() {
    document.getElementById("profileContent").style.display = "";
    document.getElementById("profileAvatar").src = currentAuthor.profilePhoto || PLACEHOLDER_AVATAR;
    document.getElementById("profileAvatar").onerror = function () { this.src = PLACEHOLDER_AVATAR; };
    document.getElementById("profileName").textContent = currentAuthor.name;
    document.getElementById("profileVideoCount").textContent =
      `${authorVideos.length} video${authorVideos.length === 1 ? "" : "s"}`;

    const title = `${currentAuthor.name} — StreamHub`;
    document.title = title;
    document.getElementById("pageTitle").textContent = title;
    document.getElementById("pageDescription").setAttribute(
      "content", `Watch all videos from ${currentAuthor.name} on StreamHub.`
    );

    const authorShownRef = { count: 0 };
    const initial = Math.min(AUTHOR_VIDEOS_INITIAL_COUNT, authorVideos.length);
    while (authorShownRef.count < initial) {
      renderChunk(authorVideos, authorShownRef, "authorVideoGrid", "authorLoaderWrap", AUTHOR_VIDEOS_LOAD_MORE_COUNT);
    }
    document.getElementById("authorLoadMoreBtn").addEventListener("click", () =>
      renderChunk(authorVideos, authorShownRef, "authorVideoGrid", "authorLoaderWrap", AUTHOR_VIDEOS_LOAD_MORE_COUNT)
    );

    const moreShownRef = { count: 0 };
    const initialMore = Math.min(MORE_VIDEOS_INITIAL_COUNT, moreVideos.length);
    while (moreShownRef.count < initialMore) {
      renderChunk(moreVideos, moreShownRef, "moreVideosGrid", "moreLoaderWrap", MORE_VIDEOS_LOAD_MORE_COUNT);
    }
    document.getElementById("moreLoadMoreBtn").addEventListener("click", () =>
      renderChunk(moreVideos, moreShownRef, "moreVideosGrid", "moreLoaderWrap", MORE_VIDEOS_LOAD_MORE_COUNT)
    );
  }

  function showNotFound() {
    document.getElementById("notFoundBanner").style.display = "";
    document.title = "Creator not found — StreamHub";
  }

  // Header search on this page just sends the visitor to the home page
  // with the query prefilled, since this page has no grid of its own to
  // filter beyond the two sections above.
  function wireHeaderSearch() {
    const input = document.getElementById("searchInput");
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && input.value.trim()) {
        window.location.href = `../index.html?q=${encodeURIComponent(input.value.trim())}`;
      }
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    wireHeaderSearch();
    init();
  });
})();