console.log("YT EXTENSION LOADED");

const THRESHOLD = 5;

const processedCards = new WeakSet();

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
    if (processedCards.has(card)) {
      continue;
    }

    processedCards.add(card);

    const link = card.querySelector("a#thumbnail");

    if (!link || !link.href) {
      continue;
    }

    const videoId = extractVideoId(link.href);

    if (!videoId) {
      continue;
    }

    counts[videoId] = (counts[videoId] || 0) + 1;

    console.log(
      `VIDEO ${videoId} COUNT ${counts[videoId]}`
    );

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