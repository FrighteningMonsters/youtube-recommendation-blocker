const backBtn = document.getElementById("backBtn");
const videoInput = document.getElementById("videoInput");
const channelInput = document.getElementById("channelInput");
const addVideoBtn = document.getElementById("addVideoBtn");
const addChannelBtn = document.getElementById("addChannelBtn");
const videoList = document.getElementById("videoList");
const channelList = document.getElementById("channelList");

let allowlistedVideos = [];
let allowlistedChannels = [];

function normalizeItem(item, fallbackName) {
  if (typeof item === "string") {
    return { id: item, name: fallbackName || item };
  }

  if (!item || typeof item !== "object") {
    return null;
  }

  const id = item.id || "";

  if (!id) {
    return null;
  }

  return {
    id,
    name: item.name || fallbackName || id
  };
}

function formatLabel(item) {
  return `${item.name} · ${item.id}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

backBtn.addEventListener("click", () => {
  window.close();
});

addVideoBtn.addEventListener("click", () => {
  const videoId = videoInput.value.trim();
  if (videoId) {
    chrome.runtime.sendMessage(
      { action: "addAllowlistVideo", videoId, videoName: videoId },
      () => {
        videoInput.value = "";
        loadAllowlists();
      }
    );
  }
});

addChannelBtn.addEventListener("click", () => {
  const channelId = channelInput.value.trim();
  if (channelId) {
    chrome.runtime.sendMessage(
      { action: "addAllowlistChannel", channelId, channelName: channelId },
      () => {
        channelInput.value = "";
        loadAllowlists();
      }
    );
  }
});

function renderVideos() {
  if (allowlistedVideos.length === 0) {
    videoList.innerHTML = `<div class="empty-state">No allowlisted videos</div>`;
    return;
  }

  videoList.innerHTML = allowlistedVideos
    .map(
      (video) =>
        `
      <div class="item">
        <div class="item-text">
          <div class="item-name">${escapeHtml(video.name)}</div>
          <div class="item-id">${escapeHtml(video.id)}</div>
        </div>
        <button class="item-remove" data-type="video" data-id="${video.id}">Remove</button>
      </div>
    `
    )
    .join("");

  videoList.querySelectorAll(".item-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const type = e.target.dataset.type;
      const id = e.target.dataset.id;
      chrome.runtime.sendMessage(
        { action: "removeAllowlist", type, id },
        () => {
          loadAllowlists();
        }
      );
    });
  });
}

function renderChannels() {
  if (allowlistedChannels.length === 0) {
    channelList.innerHTML = `<div class="empty-state">No allowlisted channels</div>`;
    return;
  }

  channelList.innerHTML = allowlistedChannels
    .map(
      (channel) =>
        `
      <div class="item">
        <div class="item-text">
          <div class="item-name">${escapeHtml(channel.name)}</div>
          <div class="item-id">${escapeHtml(channel.id)}</div>
        </div>
        <button class="item-remove" data-type="channel" data-id="${channel.id}">Remove</button>
      </div>
    `
    )
    .join("");

  channelList.querySelectorAll(".item-remove").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const type = e.target.dataset.type;
      const id = e.target.dataset.id;
      chrome.runtime.sendMessage(
        { action: "removeAllowlist", type, id },
        () => {
          loadAllowlists();
        }
      );
    });
  });
}

function loadAllowlists() {
  chrome.runtime.sendMessage({ action: "getAllowlists" }, (response) => {
    allowlistedVideos = (response.videos || [])
      .map((item) => normalizeItem(item, "Video"))
      .filter(Boolean);
    allowlistedChannels = (response.channels || [])
      .map((item) => normalizeItem(item, "Channel"))
      .filter(Boolean);
    renderVideos();
    renderChannels();
  });
}

// Load on page open
loadAllowlists();
