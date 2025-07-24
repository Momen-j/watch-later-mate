// Script that listens for navigations event, specifically when the history state is updated (SPA navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Check if the tab's URL is the YouTube homepage and the tab is done loading
  if (tab.url && tab.url.startsWith('https://www.youtube.com/') && changeInfo.status === 'complete') {
    // Check if the path is the homepage ('/')
    const url = new URL(tab.url);
    if (url.pathname === '/') {
    // inject the content script containing the template of the watch later videos
    // into current tab
      chrome.scripting.executeScript({
        target: { tabId: tabId },
        files: ['content.js']
      });
      chrome.scripting.insertCSS({
        target: { tabId: tabId },
        files: ['styles.css']
      });
    }
  }
});