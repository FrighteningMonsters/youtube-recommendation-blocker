const backBtn = document.getElementById("backBtn");
const videoInput = document.getElementById("videoInput");
const channelInput = document.getElementById("channelInput");
const addVideoBtn = document.getElementById("addVideoBtn");
const addChannelBtn = document.getElementById("addChannelBtn");
const exportDataBtn = document.getElementById("exportDataBtn");
const importDataBtn = document.getElementById("importDataBtn");
const dataImportInput = document.getElementById("dataImportInput");
const dataStatus = document.getElementById("dataStatus");
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function setDataStatus(message, isError = false) {
  if (!dataStatus) return;
  dataStatus.textContent = message;
  dataStatus.style.color = isError ? "#991b1b" : "#166534";
  dataStatus.style.background = isError ? "#fee2e2" : "#f0fdf4";
}

function clearDataStatus() {
  if (!dataStatus) return;
  dataStatus.textContent = "Export or import all extension data here.";
  dataStatus.style.color = "#666";
  dataStatus.style.background = "";
}

function sendMessagePromise(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }

      resolve(response);
    });
  });
}

function getLocalStorage(keys) {
  return new Promise((resolve) => {
    chrome.storage.local.get(keys, (result) => resolve(result || {}));
  });
}

function downloadJson(filename, payload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportData() {
  const storageResult = await getLocalStorage([
    "videoCounts",
    "threshold",
    "pauseAll",
    "allowlistedVideos",
    "allowlistedChannels"
  ]);

  const backup = {
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    data: {
      videoCounts: storageResult.videoCounts || {},
      threshold: storageResult.threshold || 5,
      pauseAll: !!storageResult.pauseAll,
      allowlistedVideos: storageResult.allowlistedVideos || [],
      allowlistedChannels: storageResult.allowlistedChannels || []
    }
  };

  const filename = `youtube-recommendation-blocker-backup-${new Date().toISOString().replaceAll(":", "-")}.json`;
  downloadJson(filename, backup);
  setDataStatus("Backup downloaded.");
}

async function importDataFromFile(file) {
  const text = await file.text();
  const backup = JSON.parse(text);
  const response = await sendMessagePromise({ action: "importData", backup });

  if (!response?.success) {
    throw new Error(response?.error || "Import failed.");
  }

  setDataStatus("Data imported.");
  loadAllowlists();
}

backBtn.addEventListener("click", () => {
  window.close();
});

if (exportDataBtn) {
  exportDataBtn.addEventListener("click", () => {
    clearDataStatus();
    exportData().catch((error) => {
      setDataStatus(error.message || "Export failed.", true);
    });
  });
}

if (importDataBtn && dataImportInput) {
  importDataBtn.addEventListener("click", () => {
    clearDataStatus();
    dataImportInput.click();
  });

  dataImportInput.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];

    if (!file) {
      return;
    }

    try {
      await importDataFromFile(file);
    } catch (error) {
      setDataStatus(error.message || "Import failed.", true);
    } finally {
      e.target.value = "";
    }
  });
}

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
