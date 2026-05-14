console.log("YT EXTENSION LOADED");

const THRESHOLD = 5;
const DEBUG = false;

const cardVideoIds = new WeakMap();

let countsCache = null;
let isProcessing = false;
let hasPendingRun = false;
let saveTimer = null;
let processTimer = null;

function log(...args) {
  if (DEBUG) {
    console.log(...args);
  }
}

function ensureCountBadge(card) {
  let badge = card.querySelector(".yt-extension-count-badge");

  if (badge) {
    return badge;
  }

  const badgeHost = card.querySelector("#thumbnail") || card;

  if (getComputedStyle(badgeHost).position === "static") {
    badgeHost.style.position = "relative";
  }

  badge = document.createElement("div");
  badge.className = "yt-extension-count-badge";
  badge.style.cssText = `
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 9999;
    padding: 4px 8px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.8);
    color: #fff;
    font-size: 12px;
    font-weight: 700;
    line-height: 1;
    pointer-events: none;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.35);
  `;

  badgeHost.appendChild(badge);

  return badge;
}

function updateCountBadge(card, count) {
  if (!Number.isFinite(count) || count < 1) {
    return;
  }

  const badge = ensureCountBadge(card);

  badge.textContent = `Seen ${count}x`;
}

async function getCounts() {
  const result = await chrome.storage.local.get(["videoCounts"]);

  return result.videoCounts || {};
}

async function saveCounts(counts) {
  await chrome.storage.local.set({
    videoCounts: counts
  });
}

async function getCountsCache() {
  if (!countsCache) {
    countsCache = await getCounts();
  }

  return countsCache;
}

function getValidCount(counts, videoId) {
  const value = counts[videoId];

  return Number.isFinite(value) && value > 0 ? value : 0;
}

function scheduleCountsSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (countsCache) {
      saveCounts(countsCache);
    }
  }, 400);
}

function extractVideoId(urlString) {
  try {
    const url = new URL(urlString, window.location.origin);

    if (url.pathname.startsWith("/shorts/")) {
      const parts = url.pathname.split("/").filter(Boolean);

      return parts[1] || null;
    }

    return url.searchParams.get("v");
  } catch {
    return null;
  }
}

function findCards() {
  return document.querySelectorAll(`
    ytd-rich-item-renderer,
    ytd-compact-video-renderer,
    ytd-video-renderer,
    ytd-grid-video-renderer
  `);
}

function findVideoLink(card) {
  return card.querySelector(`
    a#thumbnail[href*="/watch"],
    a.yt-simple-endpoint[href*="/watch"],
    a[href*="/watch?v="],
    a[href*="/shorts/"]
  `);
}

async function processVideos() {
  if (isProcessing) {
    hasPendingRun = true;
    return;
  }

  isProcessing = true;

  try {
  const counts = await getCountsCache();

  const cards = findCards();

  log("PROCESSING CARDS:", cards.length);

  for (const card of cards) {
    const link = findVideoLink(card);

    if (!link || !link.href) {
      continue;
    }

    const videoId = extractVideoId(link.href);

    if (!videoId) {
      continue;
    }

    if (card.dataset.ytExtRenderedVideoId === videoId) {
      continue;
    }

    const previousVideoId = cardVideoIds.get(card);

    if (previousVideoId !== videoId) {
      counts[videoId] = getValidCount(counts, videoId) + 1;
      cardVideoIds.set(card, videoId);
    }

    const currentCount = getValidCount(counts, videoId);

    log(`VIDEO ${videoId} COUNT ${currentCount}`);

    card.dataset.videoId = videoId;
    card.dataset.ytExtRenderedVideoId = videoId;
    updateCountBadge(card, currentCount);

    if (currentCount > THRESHOLD) {
      card.style.display = "none";

      log(`HIDING ${videoId}`);
    }
  }

  scheduleCountsSave();
  } finally {
    isProcessing = false;

    if (hasPendingRun) {
      hasPendingRun = false;
      scheduleProcessVideos(100);
    }
  }
}

function scheduleProcessVideos(delay = 150) {
  if (processTimer) {
    clearTimeout(processTimer);
  }

  processTimer = setTimeout(() => {
    processTimer = null;
    processVideos();
  }, delay);
}

const observer = new MutationObserver(() => {
  scheduleProcessVideos(150);
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

processVideos();