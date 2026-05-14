let videoCounts = null;

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
  }
});
