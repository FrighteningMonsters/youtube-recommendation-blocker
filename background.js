let videoCounts = null;
let threshold = null;
let enabled = null;
let pauseAll = null;
let pauseTracking = null;
let pauseBlocking = null;
let allowlistedVideos = null;
let allowlistedChannels = null;

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

async function getEnabled() {
  if (enabled === null) {
    const result = await chrome.storage.local.get(["enabled"]);
    enabled = result.enabled !== undefined ? result.enabled : true;
  }
  return enabled;
}

async function setEnabled(newEnabled) {
  enabled = newEnabled;
  await chrome.storage.local.set({ enabled: newEnabled });
}

async function getPauseStates() {
  if (pauseAll === null || pauseTracking === null || pauseBlocking === null) {
    const result = await chrome.storage.local.get(["pauseAll", "pauseTracking", "pauseBlocking"]);
    pauseAll = result.pauseAll || false;
    pauseTracking = result.pauseTracking || false;
    pauseBlocking = result.pauseBlocking || false;
  }
  return { pauseAll, pauseTracking, pauseBlocking };
}

async function setPauseStates(states) {
  if (states.pauseAll !== undefined) pauseAll = states.pauseAll;
  if (states.pauseTracking !== undefined) pauseTracking = states.pauseTracking;
  if (states.pauseBlocking !== undefined) pauseBlocking = states.pauseBlocking;

  await chrome.storage.local.set({
    pauseAll: pauseAll,
    pauseTracking: pauseTracking,
    pauseBlocking: pauseBlocking
  });
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
  chrome.tabs.query({ url: "https://www.youtube.com/*" }, (tabs) => {
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, {
        action: "allowlistUpdated",
        videos: allowlistedVideos || [],
        channels: allowlistedChannels || []
      }).catch(() => {});
    }
  });
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getCounts") {
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
      chrome.tabs.query({ url: "https://www.youtube.com/*" }, (tabs) => {
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, {
            action: "thresholdChanged",
            threshold: message.threshold
          }).catch(() => {});
        }
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
      chrome.tabs.query({ url: "https://www.youtube.com/*" }, (tabs) => {
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, {
            action: "pauseStatesChanged",
            states: {
              pauseAll: pauseAll,
              pauseTracking: pauseTracking,
              pauseBlocking: pauseBlocking
            }
          }).catch(() => {});
        }
      });
      sendResponse({ success: true });
    });
    return true;
  } else if (message.action === "getEnabled") {
    getEnabled().then((e) => {
      sendResponse({ enabled: e });
    });
    return true;
  } else if (message.action === "setEnabled") {
    setEnabled(message.enabled).then(() => {
      chrome.tabs.query({ url: "https://www.youtube.com/*" }, (tabs) => {
        for (const tab of tabs) {
          chrome.tabs.sendMessage(tab.id, {
            action: "enabledChanged",
            enabled: message.enabled
          }).catch(() => {});
        }
      });
      sendResponse({ success: true });
    });
    return true;
  } else if (message.action === "clearCounts") {
    videoCounts = {};
    chrome.storage.local.set({ videoCounts: {} });
    chrome.tabs.query({ url: "https://www.youtube.com/*" }, (tabs) => {
      for (const tab of tabs) {
        chrome.tabs.sendMessage(tab.id, {
          action: "countsCleared"
        }).catch(() => {});
      }
    });
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

