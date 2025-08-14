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
    // Always inject content script - let the content script handle duplicate prevention
    console.log(`Injecting content script into tab ${tabId}`);

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

// Function to get token with automatic refresh
const getValidToken = async () => {
  return new Promise((resolve) => {
    // First check if user manually signed out
    chrome.storage.local.get(['manualSignOut'], (result) => {
      if (result.manualSignOut) {
        console.log("User manually signed out, requiring interactive auth");
        resolve(null);
        return;
      }

      // Chrome handles token refresh automatically with interactive: false
      chrome.identity.getAuthToken({ interactive: false }, (token) => {
        if (chrome.runtime.lastError) {
          console.log("No auth token available (user signed out or not authenticated)");
          resolve(null);
        } else if (token) {
          console.log("Got valid token (refreshed if needed)");
          resolve(token);
        } else {
          console.log("No token returned");
          resolve(null);
        }
      });
    });
  });
};

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
 * Listen for storage changes and notify content scripts
 */
chrome.storage.onChanged.addListener(async (changes, namespace) => {
  console.log("📦 BACKGROUND: Storage change detected");
  console.log("📦 Namespace:", namespace);
  console.log("📦 Changes:", changes);
  
  if (namespace === 'local' && changes.selectedPlaylists) {
    console.log("📦 Selected playlists changed!");
    console.log("📦 Old value:", changes.selectedPlaylists.oldValue);
    console.log("📦 New value:", changes.selectedPlaylists.newValue);
    
    console.log("🔍 Getting all YouTube tabs...");
    
    try {
      // Get all YouTube tabs
      const tabs = await chrome.tabs.query({ url: '*://*.youtube.com/*' });
      console.log(`🔍 Found ${tabs.length} YouTube tabs`);
      
      for (const tab of tabs) {
        if (tab.id && tab.url && tab.url.includes('youtube.com')) {
          console.log(`📤 Sending message to tab ${tab.id} (${tab.url})`);
          
          try {
            chrome.tabs.sendMessage(tab.id, { type: 'PLAYLISTS_UPDATED' }, (response) => {
              if (chrome.runtime.lastError) {
                console.log(`❌ Tab ${tab.id}: Could not notify (${chrome.runtime.lastError.message})`);
              } else {
                console.log(`✅ Tab ${tab.id}: Notified successfully`, response);
              }
            });
          } catch (error) {
            console.log(`💥 Tab ${tab.id}: Notification failed`, error);
          }
        } else {
          console.log(`⏭️ Skipping tab ${tab.id}: no ID or not YouTube`);
        }
      }
    } catch (error) {
      console.error("💥 Error getting tabs:", error);
    }
  } else {
    console.log("📦 Not a selectedPlaylists change, ignoring");
  }
});

console.log("✅ Background script storage listener registered");

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

        case 'GET_AUTH_TOKEN':
        { const token = await getValidToken();
        return { token: token }; }

        case 'CLEAR_AUTH_TOKEN':
          return new Promise((resolve) => {
            chrome.identity.clearAllCachedAuthTokens(() => {
              console.log("All cached tokens cleared");
              // Add a small delay to ensure clearing is complete
              setTimeout(() => {
                resolve({ success: true });
              }, 100);
            });
          });

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