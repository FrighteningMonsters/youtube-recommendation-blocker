let videoCounts = null;
let threshold = null;
let pauseAll = null;
let allowlistedVideos = null;
let allowlistedChannels = null;

const BACKUP_SCHEMA_VERSION = 1;
const BACKUP_KEYS = [
  "videoCounts",
  "threshold",
  "pauseAll",
  "allowlistedVideos",
  "allowlistedChannels"
];

function normalizeAllowlistEntry(entry, fallbackName) {
  if (typeof entry === "string") {
    return { id: entry, name: fallbackName || entry };
  }

  if (!entry || typeof entry !== "object") {
    return null;
  }

  const id = entry.id || "";

  if (!id) {
    return null;
  }

  return {
    id,
    name: entry.name || fallbackName || id
  };
}

function normalizeAllowlistList(entries, fallbackName) {
  return (entries || [])
    .map((entry) => normalizeAllowlistEntry(entry, fallbackName))
    .filter(Boolean);
}

function upsertAllowlistEntry(list, entry) {
  const index = list.findIndex((item) => item.id === entry.id);

  if (index === -1) {
    list.push(entry);
  } else {
    list[index] = {
      id: list[index].id,
      name: entry.name || list[index].name || list[index].id
    };
  }
}

function normalizeCountsMap(counts) {
  const normalized = {};

  if (!counts || typeof counts !== "object") {
    return normalized;
  }

  for (const [key, value] of Object.entries(counts)) {
    const count = Number(value);

    if (key && Number.isFinite(count) && count > 0) {
      normalized[key] = Math.trunc(count);
    }
  }

  return normalized;
}

function normalizeThreshold(value) {
  const thresholdValue = Number(value);

  if (!Number.isFinite(thresholdValue)) {
    return 5;
  }

  return Math.min(20, Math.max(1, Math.trunc(thresholdValue)));
}

function buildExportPayload(storageResult) {
  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      videoCounts: normalizeCountsMap(storageResult.videoCounts),
      threshold: normalizeThreshold(storageResult.threshold),
      pauseAll: !!storageResult.pauseAll,
      allowlistedVideos: normalizeAllowlistList(storageResult.allowlistedVideos, "Video"),
      allowlistedChannels: normalizeAllowlistList(storageResult.allowlistedChannels, "Channel")
    }
  };
}

function parseImportPayload(payload) {
  const source = payload && typeof payload === "object" && payload.data && typeof payload.data === "object"
    ? payload.data
    : payload;

  const pauseAll = !!source?.pauseAll;

  return {
    videoCounts: normalizeCountsMap(source?.videoCounts),
    threshold: normalizeThreshold(source?.threshold),
    pauseAll,
    allowlistedVideos: normalizeAllowlistList(source?.allowlistedVideos, "Video"),
    allowlistedChannels: normalizeAllowlistList(source?.allowlistedChannels, "Channel")
  };
}

function sendMessageToTab(tabId, message) {
  try {
    const result = chrome.tabs.sendMessage(tabId, message);

    if (result && typeof result.catch === "function") {
      result.catch(() => {});
    }
  } catch (error) {}
}

function broadcastToYouTubeTabs(message) {
  chrome.tabs.query({ url: "https://www.youtube.com/*" }, (tabs) => {
    for (const tab of tabs) {
      sendMessageToTab(tab.id, message);
    }
  });
}

async function getThreshold() {
  if (threshold === null) {
    const result = await chrome.storage.local.get(["threshold"]);
    threshold = result.threshold || 5;
  }
  return threshold;
}

async function setThreshold(newThreshold) {
  threshold = newThreshold;
  await chrome.storage.local.set({ threshold: newThreshold });
}

async function getPauseStates() {
  if (pauseAll === null) {
    const result = await chrome.storage.local.get(["pauseAll"]);
    pauseAll = result.pauseAll || false;
  }
  return { pauseAll };
}

async function setPauseStates(states) {
  if (states.pauseAll !== undefined) pauseAll = states.pauseAll;

  await chrome.storage.local.set({ pauseAll: pauseAll });
}

async function getAllowlists() {
  if (allowlistedVideos === null || allowlistedChannels === null) {
    const result = await chrome.storage.local.get(["allowlistedVideos", "allowlistedChannels"]);
    allowlistedVideos = normalizeAllowlistList(result.allowlistedVideos, "Video");
    allowlistedChannels = normalizeAllowlistList(result.allowlistedChannels, "Channel");
    await chrome.storage.local.set({
      allowlistedVideos,
      allowlistedChannels
    });
  }
  return { videos: allowlistedVideos, channels: allowlistedChannels };
}

async function addAllowlistVideo(videoId, videoName) {
  if (allowlistedVideos === null) {
    const result = await chrome.storage.local.get(["allowlistedVideos"]);
    allowlistedVideos = normalizeAllowlistList(result.allowlistedVideos, "Video");
  }
  const entry = normalizeAllowlistEntry({ id: videoId, name: videoName }, "Video");

  if (!entry) {
    return;
  }

  upsertAllowlistEntry(allowlistedVideos, entry);
  await chrome.storage.local.set({ allowlistedVideos });
  broadcastAllowlistUpdate();
}

async function addAllowlistChannel(channelId, channelName) {
  if (allowlistedChannels === null) {
    const result = await chrome.storage.local.get(["allowlistedChannels"]);
    allowlistedChannels = normalizeAllowlistList(result.allowlistedChannels, "Channel");
  }
  const entry = normalizeAllowlistEntry({ id: channelId, name: channelName }, "Channel");

  if (!entry) {
    return;
  }

  upsertAllowlistEntry(allowlistedChannels, entry);
  await chrome.storage.local.set({ allowlistedChannels });
  broadcastAllowlistUpdate();
}

async function removeAllowlist(type, id) {
  if (type === "video") {
    if (allowlistedVideos === null) {
      const result = await chrome.storage.local.get(["allowlistedVideos"]);
      allowlistedVideos = normalizeAllowlistList(result.allowlistedVideos, "Video");
    }
    allowlistedVideos = allowlistedVideos.filter((v) => v.id !== id);
    await chrome.storage.local.set({ allowlistedVideos });
    broadcastAllowlistUpdate();
  } else if (type === "channel") {
    if (allowlistedChannels === null) {
      const result = await chrome.storage.local.get(["allowlistedChannels"]);
      allowlistedChannels = normalizeAllowlistList(result.allowlistedChannels, "Channel");
    }
    allowlistedChannels = allowlistedChannels.filter((c) => c.id !== id);
    await chrome.storage.local.set({ allowlistedChannels });
    broadcastAllowlistUpdate();
  }
}

function broadcastAllowlistUpdate() {
  broadcastToYouTubeTabs({
    action: "allowlistUpdated",
    videos: allowlistedVideos || [],
    channels: allowlistedChannels || []
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "exportData") {
    chrome.storage.local.get(BACKUP_KEYS, (result) => {
      sendResponse({ backup: buildExportPayload(result) });
    });
    return true;
  } else if (message.action === "importData") {
    try {
      const imported = parseImportPayload(message.backup);

      videoCounts = imported.videoCounts;
      threshold = imported.threshold;
      pauseAll = imported.pauseAll;
      allowlistedVideos = imported.allowlistedVideos;
      allowlistedChannels = imported.allowlistedChannels;

      chrome.storage.local.set(
        {
          videoCounts,
          threshold,
          pauseAll,
          allowlistedVideos,
          allowlistedChannels
        },
        () => {
          broadcastToYouTubeTabs({ action: "thresholdChanged", threshold });
          broadcastToYouTubeTabs({
            action: "pauseStatesChanged",
            states: { pauseAll }
          });
          broadcastToYouTubeTabs({ action: "countsCleared" });
          broadcastAllowlistUpdate();
          sendResponse({ success: true });
        }
      );
    } catch (error) {
      sendResponse({ success: false, error: error?.message || "Import failed" });
    }
    return true;
  } else if (message.action === "getCounts") {
    if (videoCounts === null) {
      chrome.storage.local.get(["videoCounts"], (result) => {
        videoCounts = result.videoCounts || {};
        sendResponse({ counts: videoCounts });
      });
      return true;
    }
    sendResponse({ counts: videoCounts });
  } else if (message.action === "updateCounts") {
    videoCounts = message.counts;
    chrome.storage.local.set({ videoCounts });
    sendResponse({ success: true });
  } else if (message.action === "getThreshold") {
    getThreshold().then((t) => {
      sendResponse({ threshold: t });
    });
    return true;
  } else if (message.action === "setThreshold") {
    setThreshold(message.threshold).then(() => {
      broadcastToYouTubeTabs({
        action: "thresholdChanged",
        threshold: message.threshold
      });
      sendResponse({ success: true });
    });
    return true;
  } else if (message.action === "getPauseStates") {
    getPauseStates().then((s) => {
      sendResponse(s);
    });
    return true;
  } else if (message.action === "setPauseStates") {
    setPauseStates(message.states).then(() => {
      broadcastToYouTubeTabs({
        action: "pauseStatesChanged",
        states: { pauseAll: pauseAll }
      });
      sendResponse({ success: true });
    });
    return true;
  } else if (message.action === "clearCounts") {
    videoCounts = {};
    chrome.storage.local.set({ videoCounts: {} });
    broadcastToYouTubeTabs({ action: "countsCleared" });
    sendResponse({ success: true });
  } else if (message.action === "getAllowlists") {
    getAllowlists().then((lists) => {
      sendResponse(lists);
    });
    return true;
  } else if (message.action === "addAllowlistVideo") {
    addAllowlistVideo(message.videoId).then(() => {
      sendResponse({ success: true });
    });
    return true;
  } else if (message.action === "addAllowlistChannel") {
    addAllowlistChannel(message.channelId).then(() => {
      sendResponse({ success: true });
    });
    return true;
  } else if (message.action === "removeAllowlist") {
    removeAllowlist(message.type, message.id).then(() => {
      sendResponse({ success: true });
    });
    return true;
  }
});

