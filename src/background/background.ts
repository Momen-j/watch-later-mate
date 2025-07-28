// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-nocheck

// Enhanced background script for YouTube playlist extension
// Handles SPA navigation detection and token management

// Track navigation state to detect SPA changes
let lastUrl = {};

/**
 * Checks if the URL is the YouTube homepage
 */
function isYouTubeHomepage(url) {
  if (!url || !url.startsWith('https://www.youtube.com/')) {
    return false;
  }
  
  try {
    const urlObj = new URL(url);
    return urlObj.pathname === '/';
  } catch (error) {
    console.error('Error parsing URL:', error);
    return false;
  }
}

/**
 * Injects content script and CSS into the specified tab
 */
async function injectPlaylistContent(tabId) {
  try {
    // Inject the content script
    await chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ['content.js']
    });
    
    // Inject the CSS
    await chrome.scripting.insertCSS({
      target: { tabId: tabId },
      files: ['styles.css']
    });
    
    console.log(`Playlist content injected into tab ${tabId}`);
  } catch (error) {
    console.error('Failed to inject playlist content:', error);
  }
}

/**
 * Retrieves stored auth token
 */
async function getStoredAuthToken() {
  try {
    if (!chrome.storage || !chrome.storage.local) {
      throw new Error('chrome.storage.local is not available');
    }
    const result = await chrome.storage.local.get(['authToken']);
    return result.authToken || null;
  } catch (error) {
    console.error('Failed to retrieve auth token:', error);
    return null;
  }
}

/**
 * Stores auth token
 */
async function storeAuthToken(token) {
  try {
    if (!chrome.storage || !chrome.storage.local) {
      throw new Error('chrome.storage.local is not available');
    }
    await chrome.storage.local.set({ authToken: token });
    console.log('Auth token stored successfully');
  } catch (error) {
    console.error('Failed to store auth token:', error);
    throw error;
  }
}

/**
 * Handles tab updates (page loads)
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Only process when page is fully loaded
  if (changeInfo.status !== 'complete' || !tab.url) {
    return;
  }

  // Check if it's YouTube homepage
  if (isYouTubeHomepage(tab.url)) {
    console.log('YouTube homepage detected via tab update');
    await injectPlaylistContent(tabId);
    
    // Update our URL tracking
    lastUrl[tabId] = tab.url;
  }
});

/**
 * Handles SPA navigation within YouTube
 * This catches navigation that doesn't trigger a full page reload
 */
chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  // Only process main frame (not iframes)
  if (details.frameId !== 0) {
    return;
  }

  const { tabId, url } = details;
  
  // Check if we're navigating TO the homepage
  if (isYouTubeHomepage(url)) {
    // Only inject if we're coming from a different page
    const previousUrl = lastUrl[tabId];
    if (!previousUrl || !isYouTubeHomepage(previousUrl)) {
      console.log('YouTube homepage detected via SPA navigation');
      await injectPlaylistContent(tabId);
    }
  }
  
  // Update URL tracking
  lastUrl[tabId] = url;
}, {
  url: [{ hostContains: 'youtube.com' }]
});

/**
 * Clean up URL tracking when tabs are closed
 */
chrome.tabs.onRemoved.addListener((tabId) => {
  delete lastUrl[tabId];
});

/**
 * Message handler for communication with popup and content scripts
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Always respond to keep the message port open
  const handleMessage = async () => {
    try {
      switch (message.type) {
        case 'STORE_AUTH_TOKEN':
          await storeAuthToken(message.token);
          return { success: true };

        case 'GET_AUTH_TOKEN':
          { const token = await getStoredAuthToken();
          return { token: token }; }

        case 'CLEAR_AUTH_TOKEN':
          if (!chrome.storage || !chrome.storage.local) {
            throw new Error('chrome.storage.local is not available');
          }
          await chrome.storage.local.remove(['authToken']);
          return { success: true };

        default:
          console.warn('Unknown message type:', message.type);
          return { error: 'Unknown message type' };
      }
    } catch (error) {
      console.error('Error handling message:', error);
      return { success: false, error: error.message };
    }
  };

  // Handle async operations properly
  handleMessage()
    .then(response => sendResponse(response))
    .catch(error => sendResponse({ success: false, error: error.message }));

  // Return true to indicate we'll respond asynchronously
  return true;
});

/**
 * Handle extension startup
 */
chrome.runtime.onStartup.addListener(() => {
  console.log('YouTube Playlist Extension started');
  // Clear URL tracking on startup
  lastUrl = {};
});

/**
 * Handle extension installation
 */
chrome.runtime.onInstalled.addListener(() => {
  console.log('YouTube Playlist Extension installed/updated');
  // Clear URL tracking on install/update
  lastUrl = {};
});