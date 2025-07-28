// Enhanced content script with YouTube API integration
import { YoutubeApiService } from "../api/YoutubeApiService";

// Updated Video interface to match API service (with categories)
interface Video {
  contentDetails: {
    videoId: string;
  };
  snippet: {
    title: string;
    videoOwnerChannelTitle: string;
    publishedAt: string;
    categoryId: string;
    categoryName: string;
    thumbnails: {
      high: {
        url: string;
      };
    };
  };
  duration: string;
  viewCount: number;
}

/**
 * Helper function to format YouTube's duration string.
 * @param duration The duration string (e.g., "PT3M33S").
 * @returns The formatted duration (e.g., "3:33").
 */
function formatDuration(duration: string): string {
  // Use a non-null assertion (!) because we expect a match.
  const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/)!;
  match.shift();
  const [hours, minutes, seconds] = match.map((part) =>
    part ? part.replace(/\D/, "") : "0"
  );

  const h = parseInt(hours, 10);
  const m = parseInt(minutes, 10);
  const s = parseInt(seconds, 10);

  if (h > 0) {
    return `${h}:${m.toString().padStart(2, "0")}:${s
      .toString()
      .padStart(2, "0")}`;
  }
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Creates the HTML for a single video item.
 * @param videoData A single video object, conforming to our 'Video' interface.
 * @returns The HTML string for the video item.
 */
function createVideoItemHTML(videoData: Video): string {
  const { videoId } = videoData.contentDetails;
  const { title, videoOwnerChannelTitle, thumbnails, categoryName } =
    videoData.snippet;
  const videoDuration = formatDuration(videoData.duration);

  return `
    <div class="playlist-video-item" data-category="${categoryName}">
      <a class="thumbnail-link" href="/watch?v=${videoId}">
        <img src="${thumbnails.high.url}" alt="${title}" />
        <span class="video-duration-overlay">${videoDuration}</span>
      </a>
      <div class="video-details">
        <h3 class="video-title">
          <a href="/watch?v=${videoId}">${title}</a>
        </h3>
        <div class="video-meta">
          <span>${videoOwnerChannelTitle}</span>
          <span class="video-category">${categoryName}</span>
        </div>
      </div>
    </div>
  `;
}

/**
 * Gets auth token from background script
 */
async function getAuthToken(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage({ type: "GET_AUTH_TOKEN" }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Failed to get auth token:",
          chrome.runtime.lastError.message
        );
        resolve(null);
        return;
      }

      if (response && response.token) {
        resolve(response.token);
      } else {
        console.warn("No auth token available");
        resolve(null);
      }
    });
  });
}

/**
 * Fetches playlist data from YouTube API
 */
async function fetchPlaylistData(): Promise<{
  videos: Video[];
  playlistTitle: string;
} | null> {
  try {
    // Get auth token from background script
    const authToken = await getAuthToken();
    if (!authToken) {
      console.error("No auth token available for API calls");
      return null;
    }

    // Initialize API service
    const apiService = new YoutubeApiService(authToken);

    // Get user's playlists
    const playlists = await apiService.getUserPlaylists(1);
    if (playlists.length === 0) {
      console.warn("No playlists found for user");
      return null;
    }

    // Use the first playlist
    const firstPlaylist = playlists[0];
    console.log(`Fetching videos from playlist: "${firstPlaylist.title}"`);

    // Get complete playlist data
    const videos = await apiService.getCompletePlaylistData(
      firstPlaylist.id,
      50
    );

    if (videos.length === 0) {
      console.warn(`No videos found in playlist: "${firstPlaylist.title}"`);
      return null;
    }

    console.log(
      `Successfully fetched ${videos.length} videos from "${firstPlaylist.title}"`
    );
    return {
      videos: videos,
      playlistTitle: firstPlaylist.title,
    };
  } catch (error) {
    console.error("Failed to fetch playlist data:", error);
    return null;
  }
}

/**
 * Helper function to find the top-level parent within the content container
 */
function findTopLevelParent(
  element: HTMLElement,
  container: HTMLElement
): HTMLElement | null {
  let current = element;
  while (current.parentElement && current.parentElement !== container) {
    current = current.parentElement as HTMLElement;
  }
  return current.parentElement === container ? current : null;
}

/**
 * Fallback insertion method
 */
function insertWithFallback(
  contentContainer: HTMLElement,
  playlistWrapper: HTMLElement
): void {
  const sections = contentContainer.children;
  const insertAfterIndex = Math.min(2, sections.length - 1);

  if (sections.length > insertAfterIndex) {
    contentContainer.insertBefore(
      playlistWrapper,
      sections[insertAfterIndex + 1]
    );
  } else {
    contentContainer.appendChild(playlistWrapper);
  }
  console.log("Custom playlist injected in content flow (fallback)! 🎉");
}

/**
 * Creates and injects the playlist HTML with real data
 */
function injectPlaylistWithData(videos: Video[], playlistTitle: string): void {
  // Find the main content container that holds all the sections
  const contentContainer = document.querySelector<HTMLElement>(
    "ytd-rich-grid-renderer #contents, ytd-two-column-browse-results-renderer #primary #contents"
  );

  if (!contentContainer) {
    console.error("Could not find main content container.");
    return;
  }

  // Look for the Shorts section within the content container
  let shortsSection: HTMLElement | null = null;

  // Try multiple selectors for the Shorts section
  const shortsSelectors = [
    "ytd-rich-section-renderer[is-shorts]",
    "ytd-reel-shelf-renderer",
    'ytd-rich-shelf-renderer:has([title*="Shorts"])',
    '[aria-label*="Shorts"]',
  ];

  for (const selector of shortsSelectors) {
    shortsSection = contentContainer.querySelector<HTMLElement>(selector);
    if (shortsSection) break;
  }

  // If we can't find Shorts by selector, look for text content
  if (!shortsSection) {
    const allSections = contentContainer.querySelectorAll(
      "ytd-rich-section-renderer, ytd-rich-shelf-renderer, ytd-reel-shelf-renderer"
    );
    for (const section of allSections) {
      if (section.textContent?.toLowerCase().includes("shorts")) {
        shortsSection = section as HTMLElement;
        break;
      }
    }
  }

  // Create our playlist container wrapped in YouTube's section structure
  const playlistWrapper = document.createElement("ytd-rich-section-renderer");
  playlistWrapper.className = "style-scope ytd-rich-grid-renderer";

  const playlistContainer = document.createElement("div");
  playlistContainer.id = "custom-playlist-container";
  playlistContainer.className = "custom-playlist-shelf";

  const shelfHeader = document.createElement("h2");
  shelfHeader.className = "shelf-title";
  shelfHeader.textContent = playlistTitle; // Use dynamic playlist title
  playlistContainer.appendChild(shelfHeader);

  const videoGrid = document.createElement("div");
  videoGrid.className = "playlist-video-grid";

  // Populate the grid with real API data
  videoGrid.innerHTML = videos.map(createVideoItemHTML).join("");

  playlistContainer.appendChild(videoGrid);
  playlistWrapper.appendChild(playlistContainer);

  // Insert the playlist using the same logic as before
  if (shortsSection) {
    // Find the correct parent and insertion point
    const shortsParent = shortsSection.parentElement;

    if (shortsParent && shortsParent === contentContainer) {
      // Shorts section is a direct child - we can insert directly
      contentContainer.insertBefore(playlistWrapper, shortsSection);
      console.log(
        `Custom playlist "${playlistTitle}" injected above Shorts section! 🎉`
      );
    } else if (shortsParent) {
      // Shorts section is nested - insert before its parent container
      const topLevelParent = findTopLevelParent(
        shortsSection,
        contentContainer
      );
      if (topLevelParent && topLevelParent.parentElement === contentContainer) {
        contentContainer.insertBefore(playlistWrapper, topLevelParent);
        console.log(
          `Custom playlist "${playlistTitle}" injected above Shorts parent section! 🎉`
        );
      } else {
        // Fallback to appending
        contentContainer.appendChild(playlistWrapper);
        console.log(
          `Custom playlist "${playlistTitle}" injected at end (complex Shorts structure)! 🎉`
        );
      }
    } else {
      // No parent found, use fallback
      insertWithFallback(contentContainer, playlistWrapper);
    }
  } else {
    // Fallback: insert after the first few sections
    insertWithFallback(contentContainer, playlistWrapper);
  }
}

/**
 * Main injection function that handles API calls and smart re-injection logic
 */
async function injectPlaylist(): Promise<void> {
  // Check if our element already exists (smart re-injection check)
  if (document.getElementById("custom-playlist-container")) {
    console.log("Playlist already exists, skipping injection");
    return;
  }

  try {
    // Fetch fresh playlist data from API
    const playlistData = await fetchPlaylistData();

    if (!playlistData) {
      console.log("No playlist data available, skipping injection");
      return;
    }

    // Inject playlist with real data
    injectPlaylistWithData(playlistData.videos, playlistData.playlistTitle);
  } catch (error) {
    console.error("Failed to inject playlist:", error);
    // Skip injection on error as requested
  }
}

/**
 * Enhanced injection with better timing and fallback strategies
 */
async function injectPlaylistWithObserver(): Promise<void> {
  // Check if already exists
  if (document.getElementById("custom-playlist-container")) {
    console.log("Playlist already exists, skipping injection");
    return;
  }

  // Try immediate injection first
  await injectPlaylist();

  // If that fails, set up an observer to watch for content loading
  if (!document.getElementById("custom-playlist-container")) {
    const observer = new MutationObserver(async (mutations) => {
      // Check if we've already injected
      if (document.getElementById("custom-playlist-container")) {
        observer.disconnect();
        return;
      }

      // Look for new content being added
      for (const mutation of mutations) {
        if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
          // Try to inject again when new content is added
          setTimeout(async () => {
            if (!document.getElementById("custom-playlist-container")) {
              await injectPlaylist();
            }
          }, 100);
          break;
        }
      }
    });

    // Observe the main content area
    const mainContent =
      document.querySelector('ytd-browse[page-subtype="home"]') ||
      document.body;
    observer.observe(mainContent, {
      childList: true,
      subtree: true,
    });

    // Stop observing after 15 seconds
    setTimeout(() => observer.disconnect(), 15000);
  }
}

// Wait a bit longer for YouTube's SPA to load, then try injection
setTimeout(injectPlaylistWithObserver, 1000);
