const thresholdSlider = document.getElementById("thresholdSlider");
const thresholdValue = document.getElementById("thresholdValue");
const thresholdDisplay = document.getElementById("thresholdDisplay");
const thresholdUnit = document.getElementById("thresholdUnit");
const pauseAllToggle = document.getElementById("pauseAllToggle");
const viewBlockedBtn = document.getElementById("viewBlockedBtn");
const viewAllowlistBtn = document.getElementById("viewAllowlistBtn");
const clearBtn = document.getElementById("clearBtn");
const clearStatus = document.getElementById("clearStatus");

function setUIEnabled(enabled) {
  thresholdSlider.disabled = !enabled;
  clearBtn.disabled = !enabled;
  thresholdValue.style.opacity = enabled ? "1" : "0.5";
}

function updatePauseUI(states) {
  if (!states) return;
  if (pauseAllToggle) pauseAllToggle.checked = !!states.pauseAll;
}

chrome.runtime.sendMessage({ action: "getThreshold" }, (response) => {
  const threshold = response.threshold || 5;
  thresholdSlider.value = threshold;
  thresholdValue.textContent = threshold;
  thresholdDisplay.textContent = threshold;
  if (thresholdUnit) thresholdUnit.textContent = threshold === 1 ? "time" : "times";
});

chrome.runtime.sendMessage({ action: "getPauseStates" }, (states) => {
  updatePauseUI(states);
  setUIEnabled(!(states && states.pauseAll));
});

thresholdSlider.addEventListener("input", (e) => {
  const value = parseInt(e.target.value);
  thresholdValue.textContent = value;
  thresholdDisplay.textContent = value;
  if (thresholdUnit) thresholdUnit.textContent = value === 1 ? "time" : "times";

  chrome.runtime.sendMessage(
    { action: "setThreshold", threshold: value },
    () => {
      console.log("Threshold updated to", value);
    }
  );
});

clearBtn.addEventListener("click", () => {
  chrome.runtime.sendMessage({ action: "clearCounts" }, () => {
    clearStatus.textContent = "✓ Blocked videos cleared";
    clearStatus.style.background = "#dcfce7";
    clearStatus.style.color = "#166534";

    setTimeout(() => {
      clearStatus.textContent = "";
      clearStatus.style.background = "";
      clearStatus.style.color = "";
    }, 2000);
  });
});

function setPauseStates(states, cb) {
  chrome.runtime.sendMessage({ action: "setPauseStates", states }, () => {
    if (typeof cb === "function") cb();
    chrome.runtime.sendMessage({ action: "getPauseStates" }, (newStates) => {
      updatePauseUI(newStates);
      setUIEnabled(!(newStates && newStates.pauseAll));
    });
  });
}

if (pauseAllToggle) {
  pauseAllToggle.addEventListener("change", (e) => {
    const checked = !!e.target.checked;
    // if pauseAll is toggled on, set both tracking and blocking to true
    if (checked) {
      setPauseStates({ pauseAll: true, pauseTracking: true, pauseBlocking: true });
    } else {
      // turning off pauseAll clears both
      setPauseStates({ pauseAll: false, pauseTracking: false, pauseBlocking: false });
    }
  });
}

if (viewBlockedBtn) {
  viewBlockedBtn.addEventListener("click", () => {
    const url = chrome.runtime.getURL("blocked-videos.html");
    chrome.windows.create({ url, width: 700, height: 800, type: "popup" });
  });
}

if (viewAllowlistBtn) {
  viewAllowlistBtn.addEventListener("click", () => {
    const url = chrome.runtime.getURL("allowlist-manager.html");
    chrome.windows.create({ url, width: 700, height: 800, type: "popup" });
  });
}
