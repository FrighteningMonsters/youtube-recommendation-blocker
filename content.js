console.log("YT EXTENSION LOADED");

let THRESHOLD = 5;
const DEBUG = false;
let PAUSE_ALL = false;
let PAUSE_TRACKING = false;
let PAUSE_BLOCKING = false;
let ALLOWLISTED_VIDEOS = [];
let ALLOWLISTED_CHANNELS = [];

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

function isAllowlistedVideo(videoId) {
  return ALLOWLISTED_VIDEOS.some((item) => item && item.id === videoId);
}

function isAllowlistedChannel(channelId) {
  return ALLOWLISTED_CHANNELS.some((item) => item && item.id === channelId);
}

function extractVideoTitle(card) {
  const titleLink = card.querySelector("a#video-title, yt-formatted-string#video-title");

  if (titleLink) {
    const title = titleLink.textContent?.trim();

    if (title) {
      return title;
    }
  }

  return "Video";
}

function extractChannelInfo(card) {
  const channelLink = card.querySelector(
    "a#channel-name, a.yt-simple-endpoint[href*='/channel/'], a.yt-simple-endpoint[href*='/@']"
  );

  if (!channelLink || !channelLink.href) {
    return null;
  }

  let channelId = null;
  try {
    const url = new URL(channelLink.href, window.location.origin);
    const channelMatch = url.pathname.match(/\/channel\/([^/?]+)/);
    const handleMatch = url.pathname.match(/\/@([^/?]+)/);
    channelId = channelMatch?.[1] || handleMatch?.[1] || null;
  } catch (e) {
    channelId = null;
  }

  if (!channelId) {
    return null;
  }

  const channelName = channelLink.textContent?.trim() || channelLink.getAttribute("aria-label") || channelId;

  return { channelId, channelName };
}

function ensureAllowButtons(card, videoId, videoName, channelInfo) {
  let buttonContainer = card.querySelector(".yt-extension-allow-buttons");

  if (buttonContainer) {
    return;
  }

  const badgeHost = card.querySelector("#thumbnail") || card;

  if (getComputedStyle(badgeHost).position === "static") {
    badgeHost.style.position = "relative";
  }

  buttonContainer = document.createElement("div");
  buttonContainer.className = "yt-extension-allow-buttons";
  buttonContainer.style.cssText = `
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 9998;
    display: flex;
    gap: 4px;
    pointer-events: auto;
  `;

  // Allow video button
  const allowVideoBtn = document.createElement("button");
  allowVideoBtn.title = "Allow this video";
  allowVideoBtn.style.cssText = `
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 3px;
    background: rgba(0, 0, 0, 0.7);
    color: #fff;
    font-size: 12px;
    font-weight: bold;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
  `;
  allowVideoBtn.textContent = "V";
  allowVideoBtn.addEventListener("mouseenter", () => {
    allowVideoBtn.style.background = "rgba(0, 0, 0, 0.9)";
  });
  allowVideoBtn.addEventListener("mouseleave", () => {
    allowVideoBtn.style.background = "rgba(0, 0, 0, 0.7)";
  });
  allowVideoBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    chrome.runtime.sendMessage({ action: "addAllowlistVideo", videoId, videoName });
    allowVideoBtn.style.opacity = "0.5";
    allowVideoBtn.disabled = true;
  });

  buttonContainer.appendChild(allowVideoBtn);

  // Allow channel button
  if (channelInfo?.channelId) {
    const allowChannelBtn = document.createElement("button");
    allowChannelBtn.title = "Allow channel";
    allowChannelBtn.style.cssText = `
      width: 24px;
      height: 24px;
      padding: 0;
      border: none;
      border-radius: 3px;
      background: rgba(0, 0, 0, 0.7);
      color: #fff;
      font-size: 12px;
      font-weight: bold;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s;
    `;
    allowChannelBtn.textContent = "C";
    allowChannelBtn.addEventListener("mouseenter", () => {
      allowChannelBtn.style.background = "rgba(0, 0, 0, 0.9)";
    });
    allowChannelBtn.addEventListener("mouseleave", () => {
      allowChannelBtn.style.background = "rgba(0, 0, 0, 0.7)";
    });
    allowChannelBtn.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      chrome.runtime.sendMessage({
        action: "addAllowlistChannel",
        channelId: channelInfo.channelId,
        channelName: channelInfo.channelName
      });
      allowChannelBtn.style.opacity = "0.5";
      allowChannelBtn.disabled = true;
    });

    buttonContainer.appendChild(allowChannelBtn);
  }

  badgeHost.appendChild(buttonContainer);
}

function updateCountBadge(card, count) {
  if (!Number.isFinite(count) || count < 2) {
    return;
  }

  const badge = ensureCountBadge(card);

  badge.textContent = `Seen ${count - 1}x`;
}

async function getCounts() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "getCounts" }, (response) => {
      resolve(response.counts || {});
    });
  });
}

async function saveCounts(counts) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { action: "updateCounts", counts },
      () => resolve()
    );
  });
}

async function getThreshold() {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ action: "getThreshold" }, (response) => {
      resolve(response.threshold || 5);
    });
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

function removeCardFromLayout(card) {
  const container = card.closest(
    "ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-video-renderer, ytd-grid-video-renderer"
  ) || card;

  container.style.display = "none";
}

function compactHomeGrid() {
  const rows = document.querySelectorAll("ytd-rich-grid-row");

  for (const row of rows) {
    const items = row.querySelectorAll("ytd-rich-item-renderer");

    for (const item of items) {
      if (item.style.display === "none" || !findVideoLink(item)) {
        item.remove();
      }
    }

    if (!row.querySelector("ytd-rich-item-renderer")) {
      row.remove();
    }
  }
}
async function fastBlockAlreadyBlocked() {
  if (!countsCache) {
    return;
  }

  const cards = findCards();

  for (const card of cards) {
    if (card.dataset.ytExtFastChecked) {
      continue;
    }

    const link = findVideoLink(card);

    if (!link || !link.href) {
      card.dataset.ytExtFastChecked = "true";
      continue;
    }

    const videoId = extractVideoId(link.href);

    if (!videoId) {
      card.dataset.ytExtFastChecked = "true";
      continue;
    }

    card.dataset.ytExtFastChecked = "true";

    const count = getValidCount(countsCache, videoId);

    if (count > THRESHOLD && !PAUSE_BLOCKING && !isAllowlistedVideo(videoId)) {
      removeCardFromLayout(card);
      log(`FAST BLOCKED ${videoId} (count: ${count})`);
    }
  }
}

  function restoreAllCards() {
    const cards = findCards();

    for (const card of cards) {
      const container = card.closest(
        "ytd-rich-item-renderer, ytd-compact-video-renderer, ytd-video-renderer, ytd-grid-video-renderer"
      ) || card;
      if (container.style.display === "none") {
        container.style.display = "";
      }

      // Clear internal markers so cards will be re-processed when blocking resumes
      try {
        delete card.dataset.ytExtRenderedVideoId;
        delete card.dataset.videoId;
        delete card.dataset.ytExtFastChecked;
      } catch (e) {}
    }
  }

function refreshHomeGridLayout() {
  compactHomeGrid();
  window.dispatchEvent(new Event("resize"));
}

async function processVideos() {
  if (PAUSE_TRACKING && PAUSE_BLOCKING) {
    isProcessing = false;
    return;
  }

  if (isProcessing) {
    hasPendingRun = true;
    return;
  }

  isProcessing = true;

  try {
  const counts = await getCountsCache();

  const cards = findCards();
  let removedAnyCard = false;

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
      if (!PAUSE_TRACKING) {
        counts[videoId] = getValidCount(counts, videoId) + 1;
      }
      cardVideoIds.set(card, videoId);
    }

    const currentCount = getValidCount(counts, videoId);

    log(`VIDEO ${videoId} COUNT ${currentCount}`);

    card.dataset.videoId = videoId;
    card.dataset.ytExtRenderedVideoId = videoId;
    updateCountBadge(card, currentCount);

    const videoName = extractVideoTitle(card);
    const channelInfo = extractChannelInfo(card);
    ensureAllowButtons(card, videoId, videoName, channelInfo);

    if (
      currentCount > THRESHOLD &&
      !PAUSE_BLOCKING &&
      !isAllowlistedVideo(videoId) &&
      !(channelInfo?.channelId && isAllowlistedChannel(channelInfo.channelId))
    ) {
      removeCardFromLayout(card);
      removedAnyCard = true;

      log(`HIDING ${videoId}`);
    }
  }

  if (removedAnyCard) {
    refreshHomeGridLayout();
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
  if (PAUSE_ALL) {
    restoreAllCards();
  } else {
    if (!PAUSE_BLOCKING) fastBlockAlreadyBlocked();
    compactHomeGrid();
    scheduleProcessVideos(150);
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

chrome.storage.local.get(["pauseTracking", "pauseBlocking", "pauseAll", "allowlistedVideos", "allowlistedChannels"], (res) => {
  const legacyPauseAll = res.pauseAll !== undefined ? !!res.pauseAll : false;
  PAUSE_TRACKING = res.pauseTracking !== undefined ? res.pauseTracking : legacyPauseAll;
  PAUSE_BLOCKING = res.pauseBlocking !== undefined ? res.pauseBlocking : legacyPauseAll;
  ALLOWLISTED_VIDEOS = res.allowlistedVideos || [];
  ALLOWLISTED_CHANNELS = res.allowlistedChannels || [];

  getCountsCache().then(() => {
    getThreshold().then((t) => {
      THRESHOLD = t;
      if (PAUSE_TRACKING && PAUSE_BLOCKING) {
        restoreAllCards();
      } else {
        fastBlockAlreadyBlocked();
        processVideos();
      }
    });
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "thresholdChanged") {
    THRESHOLD = message.threshold;
    processVideos();
  } else if (message.action === "pauseStatesChanged") {
    const s = message.states || {};
    PAUSE_TRACKING = !!s.pauseTracking;
    PAUSE_BLOCKING = !!s.pauseBlocking;
    if (PAUSE_TRACKING && PAUSE_BLOCKING) {
      restoreAllCards();
    } else {
      fastBlockAlreadyBlocked();
      processVideos();
    }
  } else if (message.action === "countsCleared") {
    countsCache = null;
    getCountsCache().then(() => {
      processVideos();
    });
  } else if (message.action === "allowlistUpdated") {
    ALLOWLISTED_VIDEOS = message.videos || [];
    ALLOWLISTED_CHANNELS = message.channels || [];
    processVideos();
  }
});