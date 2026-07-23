/* =========================================================
   config.js — Global site configuration
   Add your GitHub-hosted (or any static-hosted) videos.json files to
   JSON_URLS below — every page merges all of them into one video pool.
   ========================================================= */

/* =========================================================
   DAILY JSON MANIFEST
   Your data project gets a new file added every day (1day.json,
   2day.json, 3day.json, ...). We deliberately do NOT hardcode each
   day's filename here — that would mean editing + redeploying
   config.js (and therefore the whole SITE project) every single day
   just to add one line. Instead, this reads a tiny manifest.json file
   — hosted in the DATA project, right next to the day-files — that
   simply LISTS which files currently exist. Adding a new day becomes
   a change to the DATA project only; this file never needs to change
   again.
   ========================================================= */

// Your data project's own Pages URL (or a custom domain pointed at
// it), including the subfolder your content files live in. No
// trailing slash.
const DATA_BASE_URL = "https://json-9xs.pages.dev/meta";

// Your daily files are named content1.json, content2.json, content3.json…
// rather than being listed in a hand-maintained manifest.json, so
// instead of fetching a manifest we just PROBE for files with this
// prefix/number pattern up to CONTENT_FILE_MAX and keep whichever ones
// actually exist (HEAD request — cheap, no body download). Add a new
// day's file to the data project and it's picked up automatically next
// time the cache below expires — no code change here, ever.
const CONTENT_FILE_PREFIX = "content";
const CONTENT_FILE_MAX = 200; // bump this once you have more than 200 files

// Discovery cache TTL: intentionally much shorter than the 15-minute
// video-pool cache below (PERSISTENT_CACHE_TTL_MS) — this is the
// discovery mechanism for brand-new files, so it has to refresh far
// more often. sessionStorage only (per tab), so every new tab checks
// again in case a new day was added since the last tab was opened.
const MANIFEST_CACHE_KEY = "streamhub_manifest_cache_v1";
const MANIFEST_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Used ONLY if discovery can't reach the data host at all (data
// project down, typo in DATA_BASE_URL, offline). Keeps the site
// showing something instead of a blank grid.
const FALLBACK_JSON_URLS = [`${DATA_BASE_URL}/content1.json`];

// Resolves which content*.json files currently exist, with its own
// short cache so this doesn't re-probe on every render — only once per
// 5 minutes per tab. Falls back to FALLBACK_JSON_URLS (never throws)
// so a broken/unreachable data host degrades gracefully instead of
// taking the whole site down.
async function resolveJsonUrls() {
  try {
    const cachedRaw = sessionStorage.getItem(MANIFEST_CACHE_KEY);
    if (cachedRaw) {
      const cached = JSON.parse(cachedRaw);
      if (Date.now() - cached.savedAt < MANIFEST_CACHE_TTL_MS) {
        return cached.files.map((f) => `${DATA_BASE_URL}/${f}`);
      }
    }
  } catch (e) { /* ignore cache errors */ }

  try {
    // no-cache: always ask the network (small HEAD requests, cheap)
    // so new days show up as soon as the 5-min sessionStorage window
    // above expires, not whenever some browser HTTP cache happens to
    // expire on its own.
    const checks = [];
    for (let i = 1; i <= CONTENT_FILE_MAX; i++) {
      const file = `${CONTENT_FILE_PREFIX}${i}.json`;
      checks.push(
        fetch(`${DATA_BASE_URL}/${file}`, { method: "HEAD", cache: "no-cache" })
          .then((res) => (res.ok ? file : null))
          .catch(() => null)
      );
    }
    const settled = await Promise.all(checks);
    const files = settled.filter(Boolean);
    if (!files.length) {
      throw new Error(`No ${CONTENT_FILE_PREFIX}N.json files found under ${DATA_BASE_URL}`);
    }
    try {
      sessionStorage.setItem(MANIFEST_CACHE_KEY, JSON.stringify({ files, savedAt: Date.now() }));
    } catch (e) { /* ignore */ }
    return files.map((f) => `${DATA_BASE_URL}/${f}`);
  } catch (err) {
    console.warn("[data] could not discover content*.json files — using FALLBACK_JSON_URLS:", err);
    return FALLBACK_JSON_URLS;
  }
}

/* =========================================================
   MODEL / AUTHOR PROFILE JSON POOL
   Completely separate dataset from JSON_URLS above — these files hold
   *profile* data only (name + photo, not video listings): one entry
   per model/actor. A video's own "author" text field (in videos.json)
   is what links the two together at render time — see
   models/actor-template.html.

   Paste your 10+ author/model JSON file URLs below (jsDelivr form).
   Each file is an array of objects shaped like:
     { "id": "1001", "name": "Jane Doe", "profilePhoto": "https://.../jane.jpg" }
   ========================================================= */
const AUTHOR_JSON_URLS = [
  "https://json-9xs.pages.dev/model/authors.json"
  // ...add the rest of your 10+ author/model files here, one URL per line.
];

// THE single source of truth for comparing names across the three
// places they show up — a video's "author" text field, a model's
// "name" field, and a models/*.html filename — so "Jane Doe",
// "jane-doe", "JANE_DOE!!", and "janedoe.html" all resolve to the
// identical key "janedoe". Strips case, accents, spaces, and every
// symbol/punctuation character. Every place that compares two names
// or builds a filename from a name MUST go through this — never
// compare the raw strings directly.
function normalizeName(str) {
  return String(str || "")
    .normalize("NFKD")                 // separate accented letters from their marks
    .replace(/[\u0300-\u036f]/g, "")   // drop the accent marks
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");        // strip everything but letters/digits
}

// Every video whose "author" field normalizes to the same key as this
// model's "name" — i.e. this model's videos. Handles case and symbol
// differences between the two separate JSON pools automatically.
function videosByAuthorName(name, allVideos) {
  const key = normalizeName(name);
  if (!key) return [];
  return allVideos.filter((v) => normalizeName(v.author) === key);
}

// Site branding
const SITE_NAME = "StreamHub";

// Pagination
const INITIAL_LOAD_COUNT = 27;   // videos shown on first paint
const LOAD_MORE_COUNT = 9;       // videos appended per infinite-scroll batch
const RELATED_INITIAL_COUNT = 18; // related videos shown on video page
const RELATED_LOAD_MORE_COUNT = 9;

// Model/actor page pagination (models/*.html)
const AUTHOR_VIDEOS_INITIAL_COUNT = 12; // this model's own videos, shown first
const AUTHOR_VIDEOS_LOAD_MORE_COUNT = 9;
const MORE_VIDEOS_INITIAL_COUNT = 18;   // "More Videos" section below it
const MORE_VIDEOS_LOAD_MORE_COUNT = 9;

// Ads
const ADS_AFTER_ROWS = 2;   // insert an inline ad after every N rows
const GRID_COLUMNS_DESKTOP = 3;

// Cache (sessionStorage, per browser tab session)
const CACHE_KEY = "streamhub_videos_cache_v1";           // main grid / watch-page pool
const UP_NEXT_CACHE_KEY = "streamhub_upnext_cache_v1";    // Up Next pool (separate files/list)
const AUTHOR_CACHE_KEY = "streamhub_authors_cache_v1";    // model/author profile pool

// PERFORMANCE: how long a localStorage-cached JSON pool is trusted
// across TABS/SESSIONS before being treated as stale (ms).
const PERSISTENT_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Placeholder image shown while thumbnails lazy-load or on error
const PLACEHOLDER_IMAGE = "placeholder.webp";

// Placeholder avatar shown while a model's profile photo loads or on error
const PLACEHOLDER_AVATAR = "placeholder-avatar.webp";

// Folder that the (single, dynamic) watch-page template lives in.
// IMPORTANT: this used to be a folder full of one static HTML file per
// video (v/<uniqueId>.html — 91+ files and counting). It is now just
// ONE template file, v/watch.html, that reads ?id=<uniqueId> from the
// URL and renders whichever video matches at runtime. See videoHref()
// and currentVideoIdFromUrl() below, and v/watch.js.
const VIDEO_FOLDER = "v";
const WATCH_PAGE_FILE = "watch.html"; // the single template file inside VIDEO_FOLDER

// Folder that model/actor profile pages live in (models/<name>.html —
// mirrors the VIDEO_FOLDER convention but as its own top-level folder).
const MODELS_FOLDER = "models";

// Cloudflare Worker + D1 backend that stores extended profile fields
// (city, country, phone, gender, photoUrl) Firebase Auth has no field for.
// Expected routes (adjust to match your actual Worker):
//   POST /users            -> create a row  { uid, email, provider, city?, country?, phone?, gender?, photoUrl? }
//   GET  /users/:uid       -> fetch a row, 404 if none yet
//   PUT  /users/:uid       -> update a row  { email, city, country, phone, gender, photoUrl }
const PROFILE_API_URL = "https://data.bots62340.workers.dev";

// Cloudflare Worker + D1 backend that stores the REAL playable video
// links, keyed by each video's uniqueId.
//   GET /video/:uniqueId  -> { uniqueId, directVideoUrl }, 404 if none
const VIDEO_API_URL = "https://video-api.olivia-rose-or2005.workers.dev";

// Fetches both the playable URL and the live view count in one call.
// Returns { directVideoUrl, views } — either field may be null if the
// worker didn't have it (no D1 row, or the TurboVIPlay lookup failed).
// Returns null entirely on a 404 (no row for this uniqueId at all) or
// a network error.
async function fetchVideoApiData(uniqueId) {
  if (!uniqueId) return null;
  try {
    const res = await fetch(`${VIDEO_API_URL}/video/${encodeURIComponent(uniqueId)}`);
    if (!res.ok) return null; // 404 -> no row for this uniqueId yet
    const data = await res.json();
    if (!data) return null;
    return {
      directVideoUrl: data.directVideoUrl || null,
      views: typeof data.views === "number" ? data.views : null,
    };
  } catch (err) {
    console.error("[video-api] fetchVideoApiData failed:", err);
    return null;
  }
}

// Kept for any existing callers that only want the URL.
async function fetchDirectVideoUrl(uniqueId) {
  const data = await fetchVideoApiData(uniqueId);
  return data ? data.directVideoUrl : null;
}

/* =========================================================
   PROFILE PHOTO UPLOAD — Cloudflare Worker + Cloudinary
   Separate Worker from PROFILE_API_URL above: this one holds the
   Cloudinary secrets (API key/secret/cloud name) and does a signed,
   server-side upload so the secret never reaches the browser. The
   Worker enforces a 200KB / JPEG-PNG-WEBP-only limit itself; the
   client-side compressImageToLimit() below re-encodes the photo
   first so uploads normally succeed on the first try instead of
   bouncing off that limit.

   Deploy the cloudinary-worker.js file (see below) with three
   secrets set: API_Key, API_Secret, "Key Name" (your Cloudinary
   cloud name), then put that Worker's URL here.
   ========================================================= */
const PHOTO_UPLOAD_API_URL = "https://still-star-bfbb.jaginisupriya7.workers.dev/";
const PROFILE_PHOTO_MAX_BYTES = 200 * 1024;
const PROFILE_PHOTO_MAX_DIMENSION = 800; // px, longest side

// Resizes to PROFILE_PHOTO_MAX_DIMENSION and re-encodes as JPEG,
// stepping quality down until the blob clears PROFILE_PHOTO_MAX_BYTES.
// Throws if even the lowest quality step can't get under the limit.
async function compressImageToLimit(file, maxBytes = PROFILE_PHOTO_MAX_BYTES, maxDimension = PROFILE_PHOTO_MAX_DIMENSION) {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  if (width > maxDimension || height > maxDimension) {
    const scale = maxDimension / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(bitmap, 0, 0, width, height);

  let quality = 0.9;
  let blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
  while (blob && blob.size > maxBytes && quality > 0.3) {
    quality -= 0.1;
    blob = await new Promise((res) => canvas.toBlob(res, "image/jpeg", quality));
  }
  if (!blob || blob.size > maxBytes) {
    throw new Error("Couldn't compress this image below 200KB — try a smaller photo.");
  }
  return blob;
}

// Compresses, then uploads to the Cloudinary Worker. Returns the
// Cloudinary secure_url on success; throws with a user-facing message
// on failure (network error, Worker rejection, Cloudinary error, etc).
async function uploadProfilePhoto(uid, file) {
  if (typeof PHOTO_UPLOAD_API_URL === "undefined" || PHOTO_UPLOAD_API_URL.includes("YOUR-NEW-WORKER")) {
    throw new Error("Photo upload isn't configured yet (PHOTO_UPLOAD_API_URL in config.js).");
  }
  const compressed = await compressImageToLimit(file);

  const form = new FormData();
  form.append("file", compressed, "profile.jpg");
  form.append("uid", uid);

  const res = await fetch(`${PHOTO_UPLOAD_API_URL}/upload-photo`, { method: "POST", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Upload failed (HTTP ${res.status})`);
  return data.url; // Cloudinary secure_url
}

/* =========================================================
   MULTI-FILE VIDEO POOL — fetches every file listed in the daily
   manifest (see resolveJsonUrls() above), merges them into one array,
   and hands back a random order.
   ========================================================= */

// Fisher–Yates shuffle. Shared by every page that needs a random order.
function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function readPersistentCache(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const entry = JSON.parse(raw);
    if (!entry || !Array.isArray(entry.data)) return null;
    return entry; // { data, savedAt }
  } catch (e) {
    return null;
  }
}

function writePersistentCache(key, data) {
  try {
    localStorage.setItem(key, JSON.stringify({ data, savedAt: Date.now() }));
  } catch (e) { /* storage full/unavailable — non-fatal, just skip persistence */ }
}

function isPersistentCacheFresh(entry) {
  return !!entry && Date.now() - entry.savedAt < PERSISTENT_CACHE_TTL_MS;
}

async function fetchAllVideos(urls = null, cacheKey = CACHE_KEY) {
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (e) { /* ignore cache errors */ }

  const persistKey = cacheKey + "_persist";
  const persisted = readPersistentCache(persistKey);
  if (isPersistentCacheFresh(persisted)) {
    try { sessionStorage.setItem(cacheKey, JSON.stringify(persisted.data)); } catch (e) { /* ignore */ }
    return persisted.data;
  }
  if (persisted) {
    resolveJsonUrls().then((resolvedUrls) => {
      fetchAllVideos.__revalidate(urls || resolvedUrls, cacheKey, persistKey);
    });
    try { sessionStorage.setItem(cacheKey, JSON.stringify(persisted.data)); } catch (e) { /* ignore */ }
    return persisted.data;
  }

  if (!urls) urls = await resolveJsonUrls();

  const results = await Promise.allSettled(
    urls.map((url) =>
      fetch(url, { cache: "force-cache" }).then((res) => {
        if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
        return res.json();
      })
    )
  );

  const merged = [];
  const seen = new Set();
  let failCount = 0;

  results.forEach((r, i) => {
    if (r.status !== "fulfilled") {
      failCount++;
      console.error(`[fetchAllVideos] failed to load "${urls[i]}":`, r.reason);
      return;
    }
    const list = Array.isArray(r.value) ? r.value : (r.value.videos || []);
    list.forEach((video) => {
      const key = String(video.uniqueId ?? video.id ?? "");
      if (key) {
        if (seen.has(key)) return;
        seen.add(key);
      }
      merged.push(video);
    });
  });

  if (failCount === urls.length && urls.length > 0) {
    throw new Error(`All ${urls.length} JSON file(s) failed to load — check that your content*.json files are reachable and DATA_BASE_URL in config.js is correct.`);
  }

  const shuffled = shuffleArray(merged);

  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(shuffled));
  } catch (e) { /* storage may be full/unavailable — pool still works, just re-fetches next time */ }
  writePersistentCache(cacheKey + "_persist", shuffled);

  return shuffled;
}

fetchAllVideos.__revalidate = async function (urls, cacheKey, persistKey) {
  try {
    const results = await Promise.allSettled(
      urls.map((url) => fetch(url, { cache: "no-cache" }).then((res) => {
        if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
        return res.json();
      }))
    );
    const merged = [];
    const seen = new Set();
    results.forEach((r) => {
      if (r.status !== "fulfilled") return;
      const list = Array.isArray(r.value) ? r.value : (r.value.videos || []);
      list.forEach((video) => {
        const key = String(video.uniqueId ?? video.id ?? "");
        if (key) {
          if (seen.has(key)) return;
          seen.add(key);
        }
        merged.push(video);
      });
    });
    if (merged.length) writePersistentCache(persistKey, shuffleArray(merged));
  } catch (e) {
    console.warn("[fetchAllVideos] background revalidation failed (using stale cache):", e);
  }
};

/* =========================================================
   MULTI-FILE MODEL/AUTHOR PROFILE POOL
   Used by: models/*.html -> fetchAllAuthors()
   ========================================================= */
async function fetchAllAuthors(urls = AUTHOR_JSON_URLS, cacheKey = AUTHOR_CACHE_KEY) {
  try {
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) return JSON.parse(cached);
  } catch (e) { /* ignore cache errors */ }

  const persistKey = cacheKey + "_persist";
  const persisted = readPersistentCache(persistKey);
  if (isPersistentCacheFresh(persisted)) {
    try { sessionStorage.setItem(cacheKey, JSON.stringify(persisted.data)); } catch (e) { /* ignore */ }
    return persisted.data;
  }

  const results = await Promise.allSettled(
    urls.map((url) =>
      fetch(url, { cache: "force-cache" }).then((res) => {
        if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
        return res.json();
      })
    )
  );

  const merged = [];
  const seen = new Set();
  let failCount = 0;

  results.forEach((r, i) => {
    if (r.status !== "fulfilled") {
      failCount++;
      console.error(`[fetchAllAuthors] failed to load "${urls[i]}":`, r.reason);
      return;
    }
    const list = Array.isArray(r.value) ? r.value : (r.value.authors || []);
    list.forEach((author) => {
      const key = normalizeName(author.name) || String(author.id ?? "");
      if (key) {
        if (seen.has(key)) return;
        seen.add(key);
      }
      merged.push(author);
    });
  });

  if (failCount === urls.length && urls.length > 0) {
    throw new Error(`All ${urls.length} author JSON file(s) failed to load — check AUTHOR_JSON_URLS in config.js.`);
  }

  try {
    sessionStorage.setItem(cacheKey, JSON.stringify(merged));
  } catch (e) { /* storage may be full/unavailable — pool still works, just re-fetches next time */ }
  writePersistentCache(cacheKey + "_persist", merged);

  return merged;
}

/* =========================================================
   AD CODES
   ========================================================= */
const AD_CODES = {
  smartlinkUrl: `https://reactahead.com/c4wzssx484?key=dc68fb020c2eb81627b57d6ffb786adc`,

  nativeBanner: `<script async="async" data-cfasync="false" src="https://reactahead.com/ec9457550ad5ce8d7a3387c69e4a2a37/invoke.js"></script>
<div id="container-ec9457550ad5ce8d7a3387c69e4a2a37"></div>`,
  banner468x60: `<script>
  atOptions = {
    'key' : '028b7513756668e783905e43ad4e940f',
    'format' : 'iframe',
    'height' : 60,
    'width' : 468,
    'params' : {}
  };
</script>
<script src="https://reactahead.com/028b7513756668e783905e43ad4e940f/invoke.js"></script>`,
  banner300x250: `<script>
  atOptions = {
    'key' : 'e509b1345f1f74d5f712e43b1047345b',
    'format' : 'iframe',
    'height' : 250,
    'width' : 300,
    'params' : {}
  };
</script>
<script src="https://reactahead.com/e509b1345f1f74d5f712e43b1047345b/invoke.js"></script>`,
  banner160x300: `<script>
  atOptions = {
    'key' : '0582b1fa2e335c54fc693348ba38660e',
    'format' : 'iframe',
    'height' : 300,
    'width' : 160,
    'params' : {}
  };
</script>
<script src="https://reactahead.com/0582b1fa2e335c54fc693348ba38660e/invoke.js"></script>`,
  banner160x600: `<script>
  atOptions = {
    'key' : 'c81401802d42416704294ceadea4c35a',
    'format' : 'iframe',
    'height' : 600,
    'width' : 160,
    'params' : {}
  };
</script>
<script src="https://reactahead.com/c81401802d42416704294ceadea4c35a/invoke.js"></script>`,
  banner320x50: `<script>
  atOptions = {
    'key' : '32cfd76eff1b697e0aa3f977762e3293',
    'format' : 'iframe',
    'height' : 50,
    'width' : 320,
    'params' : {}
  };
</script>
<script src="https://reactahead.com/32cfd76eff1b697e0aa3f977762e3293/invoke.js"></script>`,
  banner728x90: `<script>
  atOptions = {
    'key' : 'd353454d1c82d0d1095355f65774ecb5',
    'format' : 'iframe',
    'height' : 90,
    'width' : 728,
    'params' : {}
  };
</script>
<script src="https://reactahead.com/d353454d1c82d0d1095355f65774ecb5/invoke.js"></script>`,
};

const AD_SLOT_DIMENSIONS = {
  banner468x60: [468, 60],
  banner300x250: [300, 250],
  banner160x300: [160, 300],
  banner160x600: [160, 600],
  banner320x50: [320, 50],
  banner728x90: [728, 90],
};

function injectAdCode(container, codeString, adKey) {
  if (!container || !codeString || !codeString.trim()) return false;
  container.innerHTML = "";

  const dims = AD_SLOT_DIMENSIONS[adKey];
  const iframe = document.createElement("iframe");
  iframe.title = "advertisement";
  iframe.scrolling = "no";
  iframe.style.border = "0";
  iframe.style.display = "block";
  iframe.style.margin = "0 auto";
  iframe.style.maxWidth = "100%";
  iframe.style.width = dims ? dims[0] + "px" : "100%";
  iframe.style.height = dims ? dims[1] + "px" : "100%";

  iframe.setAttribute(
    "sandbox",
    "allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
  );

  iframe.srcdoc =
    `<!DOCTYPE html><html><head><meta charset="utf-8"><style>` +
    `html,body{margin:0;padding:0;background:transparent;overflow:hidden;` +
    `display:flex;align-items:center;justify-content:center;}` +
    `</style></head><body>${codeString}</body></html>`;

  container.appendChild(iframe);
  return true;
}

function injectPageLevelAds() {
  [AD_CODES.socialBar, AD_CODES.popunder].forEach((code) => {
    if (!code || !code.trim()) return;
    const temp = document.createElement("div");
    temp.innerHTML = code;
    Array.from(temp.childNodes).forEach((node) => {
      if (node.tagName === "SCRIPT") {
        const s = document.createElement("script");
        Array.from(node.attributes).forEach((attr) => s.setAttribute(attr.name, attr.value));
        s.textContent = node.textContent;
        document.body.appendChild(s);
      } else {
        document.body.appendChild(node);
      }
    });
  });
}

function fillAdSlot(el, adKey) {
  if (!el) return false;
  const code = AD_CODES[adKey];
  if (code && code.trim()) return injectAdCode(el, code, adKey);
  return false;
}

const MOBILE_AD_KEY = "banner320x50";
const MOBILE_AD_BREAKPOINT = 840;
const MOBILE_AD_DISMISS_KEY = "streamhub_mobile_ad_dismissed";

function renderMobileAdBar() {
  if (document.getElementById("mobileAdBar")) return;
  if (window.innerWidth > MOBILE_AD_BREAKPOINT) return;
  if (typeof AD_CODES === "undefined" || !AD_CODES[MOBILE_AD_KEY] || !AD_CODES[MOBILE_AD_KEY].trim()) return;
  try {
    if (sessionStorage.getItem(MOBILE_AD_DISMISS_KEY) === "1") return;
  } catch (e) { /* storage unavailable — just show it */ }

  const bar = document.createElement("div");
  bar.id = "mobileAdBar";
  bar.className = "mobile-ad-bar";

  const slot = document.createElement("div");
  slot.className = "ad-slot";
  bar.appendChild(slot);

  const closeBtn = document.createElement("button");
  closeBtn.className = "mobile-ad-bar-close";
  closeBtn.type = "button";
  closeBtn.setAttribute("aria-label", "Close ad");
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", () => {
    bar.remove();
    try { sessionStorage.setItem(MOBILE_AD_DISMISS_KEY, "1"); } catch (e) { /* ignore */ }
  });
  bar.appendChild(closeBtn);

  document.body.appendChild(bar);
  fillAdSlot(slot, MOBILE_AD_KEY);
}

if (typeof window !== "undefined") {
  let mobileAdResizeTimer;
  window.addEventListener("resize", () => {
    clearTimeout(mobileAdResizeTimer);
    mobileAdResizeTimer = setTimeout(() => {
      const bar = document.getElementById("mobileAdBar");
      if (window.innerWidth > MOBILE_AD_BREAKPOINT) {
        if (bar) bar.remove();
      } else if (!bar) {
        renderMobileAdBar();
      }
    }, 200);
  });
}

function openSmartlink() {
  if (AD_CODES.smartlinkUrl) window.open(AD_CODES.smartlinkUrl, "_blank", "noopener,noreferrer");
}

// ---------------------------------------------------------------
// SINGLE WATCH-PAGE ROUTING
// One template (v/watch.html) handles every video via ?id=<uniqueId>
// instead of a pre-generated file per video. Every place in the site
// that links to a video (grid cards, related videos, search results,
// author pages) should build its link with videoHref() below — never
// hardcode "v/something.html".
// ---------------------------------------------------------------
// ---------------------------------------------------------------
// SITE-ROOT-AWARE LINKS
// videoHref()/authorHref() get called from THREE different depths:
// index.html (site root), v/watch.html (one folder down), and
// models/profile.html (also one folder down). A plain relative path
// like "v/watch.html?id=..." only resolves correctly from the root —
// clicking a related-video link FROM v/watch.html would resolve
// against /v/, producing /v/v/watch.html. siteRootPrefix() detects
// current depth and returns "../" when needed so every link works
// from anywhere.
// ---------------------------------------------------------------
// ---------------------------------------------------------------
// SHARED VIDEO CARD (thumbnail + hover preview)
// Used by script.js (home grid), v/watch.js (related videos),
// models/profile.js (author + more videos), and account.js
// (liked/history) — one implementation so preview-video playback
// works identically everywhere instead of 4 separate copies.
// ---------------------------------------------------------------
function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// Videos may carry a short hover-preview clip under any of these
// field names depending on which JSON source it came from.
// previewVideoUrl is the one your actual content*.json files use.
function getPreviewUrl(video) {
  const url = video.previewVideoUrl || video.previewUrl || video.preview || video.previewVideo || video.previewSrc || null;
  return url ? String(url).trim() : null;
}

function videoCardHtml(video) {
  const thumb = video.thumbnail || video.thumb || PLACEHOLDER_IMAGE;
  const title = escapeHtml(video.title || "Untitled");
  const author = escapeHtml(video.author || "");
  const preview = getPreviewUrl(video);
  return `
    <a class="video-card" href="${videoHref(video)}">
      <div class="video-thumb-wrap">
        <img class="video-thumb" src="${thumb}" alt="${title}" loading="lazy"
             onerror="this.onerror=null;this.src='${PLACEHOLDER_IMAGE}';">
        ${preview ? `<video class="video-preview" muted loop playsinline preload="none" src="${preview}"></video>` : ""}
        ${video.duration ? `<span class="video-duration">${escapeHtml(video.duration)}</span>` : ""}
      </div>
      <div class="video-card-info">
        <div class="video-card-title">${title}</div>
        ${author ? `<div class="video-card-author">${author}</div>` : ""}
      </div>
    </a>`;
}

// Hover-to-preview: swaps the thumbnail for the muted preview clip on
// mouseenter, swaps back and rewinds on mouseleave. Skipped entirely
// on touch-only devices (no hover to speak of, and autoplaying a clip
// on tap would be surprising). Call this after inserting any batch of
// .video-card markup into the DOM — safe to call repeatedly; already-
// wired cards are ignored via a data attribute guard.
function wireVideoCardPreviews(container) {
  if (!container || !window.matchMedia || !window.matchMedia("(hover: hover)").matches) return;
  container.querySelectorAll(".video-card").forEach((card) => {
    if (card.dataset.previewWired) return;
    card.dataset.previewWired = "1";
    const video = card.querySelector(".video-preview");
    if (!video) return;
    const img = card.querySelector(".video-thumb");
    let hoverTimer;
    card.addEventListener("mouseenter", () => {
      // Small delay so quickly skimming past thumbnails doesn't fire
      // a burst of unnecessary network requests for preview clips.
      hoverTimer = setTimeout(() => {
        video.style.display = "block";
        video.currentTime = 0;
        video.play().catch(() => { /* autoplay blocked — thumbnail stays visible, non-fatal */ });
      }, 250);
    });
    card.addEventListener("mouseleave", () => {
      clearTimeout(hoverTimer);
      video.pause();
      video.style.display = "none";
    });
  });
}

function siteRootPrefix() {
  const path = window.location.pathname;
  if (new RegExp(`/${VIDEO_FOLDER}/[^/]*$`).test(path)) return "../";
  if (new RegExp(`/${MODELS_FOLDER}/[^/]*$`).test(path)) return "../";
  return "";
}

function videoHref(video) {
  return `${siteRootPrefix()}${VIDEO_FOLDER}/${WATCH_PAGE_FILE}?id=${encodeURIComponent(video.uniqueId)}`;
}

// Reads the ?id= param on v/watch.html itself, to know which video to render.
function currentVideoIdFromUrl() {
  return new URLSearchParams(window.location.search).get("id");
}

const AUTHOR_PAGE_FILE = "profile.html"; // the single template file inside MODELS_FOLDER

function authorHref(author) {
  return `${siteRootPrefix()}${MODELS_FOLDER}/${AUTHOR_PAGE_FILE}?name=${encodeURIComponent(normalizeName(author.name))}`;
}

// Reads the ?name= param on models/profile.html itself.
function currentAuthorKeyFromUrl() {
  return new URLSearchParams(window.location.search).get("name");
}