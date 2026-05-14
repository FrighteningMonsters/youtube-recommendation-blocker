console.log("YT EXTENSION LOADED");

const THRESHOLD = 5;

const processedCards = new WeakSet();

function ensureCountBadge(card) {
  let badge = card.querySelector(".yt-extension-count-badge");

  if (badge) {
    return badge;
  }

  if (getComputedStyle(card).position === "static") {
    card.style.position = "relative";
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
  `;

  card.appendChild(badge);

  return badge;
}

function updateCountBadge(card, count) {
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

function extractVideoId(urlString) {
  try {
    const url = new URL(urlString);

    return url.searchParams.get("v");
  } catch {
    return null;
  }
}

function findCards() {
  return document.querySelectorAll(`
    ytd-rich-item-renderer,
    ytd-compact-video-renderer,
    ytd-video-renderer
  `);
}

async function processVideos() {
  const counts = await getCounts();

  const cards = findCards();

  console.log("PROCESSING CARDS:", cards.length);

  for (const card of cards) {
    const link = card.querySelector("a#thumbnail");

    if (!link || !link.href) {
      continue;
    }

    const videoId = extractVideoId(link.href);

    if (!videoId) {
      continue;
    }

    if (!processedCards.has(card)) {
      processedCards.add(card);
      counts[videoId] = (counts[videoId] || 0) + 1;
    }

    console.log(
      `VIDEO ${videoId} COUNT ${counts[videoId]}`
    );

    card.dataset.videoId = videoId;
    updateCountBadge(card, counts[videoId]);

    if (counts[videoId] > THRESHOLD) {
      card.style.display = "none";

      console.log(
        `HIDING ${videoId}`
      );
    } else {
      card.style.outline = "2px solid lime";
    }
  }

  await saveCounts(counts);
}

const observer = new MutationObserver(() => {
  processVideos();
});

observer.observe(document.body, {
  childList: true,
  subtree: true
});

processVideos();