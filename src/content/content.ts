// Enhanced content script with YouTube API integration and pagination
import { YoutubeApiService } from "../api/YoutubeApiService";

console.log("🚀 CONTENT SCRIPT LOADED - YouTube Playlist Extension");
console.log("📍 Current URL:", window.location.href);
console.log("⏰ Load time:", new Date().toISOString());

// Test message listener
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  console.log("📨 CONTENT SCRIPT: Message received!", message);

  if (message.type === "PLAYLISTS_UPDATED") {
    console.log("🔄 PLAYLISTS_UPDATED received");
    sendResponse({ success: true });
  }
});

console.log("✅ Content script setup complete");

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

// Multi-playlist pagination state management
interface PlaylistPaginationState {
  currentPage: number;
  videosPerPage: number;
  totalVideos: number;
  allVideos: Video[];
}

interface MultiPlaylistData {
  id: string;
  title: string;
  videos: Video[];
  paginationState: PlaylistPaginationState;
}

// Global state for all playlists
let playlistsData: MultiPlaylistData[] = [];

/**
 * Helper function to format YouTube's duration string.
 */
function formatDuration(duration: string): string {
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
 * Helper function to format view count like YouTube (with better error handling)
 */
function formatViewCount(viewCount: number): string {
  if (!viewCount || isNaN(viewCount) || viewCount < 0) {
    return "0 views";
  }

  if (viewCount >= 1000000) {
    const millions = viewCount / 1000000;
    return `${
      millions >= 10 ? millions.toFixed(0) : millions.toFixed(1)
    }M views`;
  } else if (viewCount >= 1000) {
    const thousands = viewCount / 1000;
    return `${
      thousands >= 10 ? thousands.toFixed(0) : thousands.toFixed(1)
    }K views`;
  } else {
    return `${viewCount} views`;
  }
}

/**
 * Helper function to format publish date like YouTube (with error handling)
 */
function formatPublishDate(publishedAt: string): string {
  try {
    const now = new Date();
    const published = new Date(publishedAt);

    if (isNaN(published.getTime())) {
      return "Recently";
    }

    const diffInMs = now.getTime() - published.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays < 1) {
      const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
      if (diffInHours < 1) {
        const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
        return `${Math.max(1, diffInMinutes)} minutes ago`;
      }
      return `${diffInHours} hours ago`;
    } else if (diffInDays < 7) {
      return `${diffInDays} days ago`;
    } else if (diffInDays < 30) {
      const weeks = Math.floor(diffInDays / 7);
      return `${weeks} ${weeks === 1 ? "week" : "weeks"} ago`;
    } else if (diffInDays < 365) {
      const months = Math.floor(diffInDays / 30);
      return `${months} ${months === 1 ? "month" : "months"} ago`;
    } else {
      const years = Math.floor(diffInDays / 365);
      return `${years} ${years === 1 ? "year" : "years"} ago`;
    }
  } catch (error) {
    console.warn("Error formatting publish date:", error);
    return "Recently";
  }
}

/**
 * Helper function to truncate title with ellipsis
 */
function truncateTitle(title: string, maxLength: number = 60): string {
  if (title.length <= maxLength) {
    return title;
  }
  return title.substring(0, maxLength).trim() + "...";
}

/**
 * Creates the HTML for a single video item (with better error handling).
 */
function createVideoItemHTML(videoData: Video): string {
  try {
    const { videoId } = videoData.contentDetails;
    const { title, videoOwnerChannelTitle, thumbnails } = videoData.snippet;

    if (!videoId || !title || !videoOwnerChannelTitle) {
      console.warn("Missing required video data, skipping video");
      return "";
    }

    const videoDuration = formatDuration(videoData.duration);
    const truncatedTitle = truncateTitle(title);
    const formattedViews = formatViewCount(videoData.viewCount);
    const publishedTime = formatPublishDate(videoData.snippet.publishedAt);
    const thumbnailUrl = thumbnails?.high?.url || "";

    if (!thumbnailUrl) {
      console.warn("No thumbnail available for video:", videoId);
    }

    return `
      <div class="playlist-video-item">
        <a class="thumbnail-link" href="/watch?v=${videoId}">
          <img src="${thumbnailUrl}" alt="${title.replace(/"/g, "&quot;")}" />
          <span class="video-duration-overlay">${videoDuration}</span>
        </a>
        <div class="video-details">
          <h3 class="video-title">
            <a href="/watch?v=${videoId}" title="${title.replace(
      /"/g,
      "&quot;"
    )}">${truncatedTitle}</a>
          </h3>
          <div class="video-meta">
            <div class="channel-name">${videoOwnerChannelTitle}</div>
            <div class="video-stats">${formattedViews} • ${publishedTime}</div>
          </div>
        </div>
      </div>
    `;
  } catch (error) {
    console.error("Error creating video HTML:", error, videoData);
    return "";
  }
}

/**
 * Gets the current page videos for a specific playlist
 */
function getCurrentPageVideos(playlistData: MultiPlaylistData): Video[] {
  const { currentPage, videosPerPage } = playlistData.paginationState;
  const startIndex = currentPage * videosPerPage;
  const endIndex = startIndex + videosPerPage;
  return playlistData.videos.slice(startIndex, endIndex);
}

/**
 * Gets total number of pages for a playlist
 */
function getTotalPages(playlistData: MultiPlaylistData): number {
  const { totalVideos, videosPerPage } = playlistData.paginationState;
  return Math.ceil(totalVideos / videosPerPage);
}

/**
 * Updates the video grid for a specific playlist
 */
function updateVideoGrid(playlistId: string): void {
  const videoGrid = document.querySelector(
    `.playlist-video-grid[data-playlist-id="${playlistId}"]`
  ) as HTMLElement;
  if (!videoGrid) return;

  const playlistData = playlistsData.find((p) => p.id === playlistId);
  if (!playlistData) return;

  const currentVideos = getCurrentPageVideos(playlistData);

  // Add fade-out class for animation
  videoGrid.classList.add("page-transition");

  // Update content after a short delay for smooth transition
  setTimeout(() => {
    videoGrid.innerHTML = currentVideos.map(createVideoItemHTML).join("");

    // Remove transition class after content is updated
    setTimeout(() => {
      videoGrid.classList.remove("page-transition");
    }, 10);
  }, 150);

  // Update arrow visibility
  updateArrowVisibility(playlistId);
}

/**
 * Updates arrow visibility for a specific playlist
 */
function updateArrowVisibility(playlistId: string): void {
  const playlistData = playlistsData.find((p) => p.id === playlistId);
  if (!playlistData) return;

  const leftArrow = document.querySelector(
    `.pagination-arrow-left[data-playlist-id="${playlistId}"]`
  ) as HTMLElement;
  const rightArrow = document.querySelector(
    `.pagination-arrow-right[data-playlist-id="${playlistId}"]`
  ) as HTMLElement;

  const shouldShowLeft = playlistData.paginationState.currentPage > 0;
  const shouldShowRight =
    playlistData.paginationState.currentPage < getTotalPages(playlistData) - 1;

  if (leftArrow) {
    leftArrow.style.visibility = shouldShowLeft ? "visible" : "hidden";
  }

  if (rightArrow) {
    rightArrow.style.visibility = shouldShowRight ? "visible" : "hidden";
  }

  // Hide entire arrows container if only one page
  const arrowsContainer = document.querySelector(
    `.header-arrows-container[data-playlist-id="${playlistId}"]`
  ) as HTMLElement;
  if (arrowsContainer) {
    arrowsContainer.style.display =
      getTotalPages(playlistData) > 1 ? "flex" : "none";
  }
}

/**
 * Navigation functions for specific playlists
 */
function goToPreviousPage(playlistId: string): void {
  const playlistData = playlistsData.find((p) => p.id === playlistId);
  if (!playlistData || playlistData.paginationState.currentPage <= 0) return;

  playlistData.paginationState.currentPage--;
  updateVideoGrid(playlistId);
}

function goToNextPage(playlistId: string): void {
  const playlistData = playlistsData.find((p) => p.id === playlistId);
  if (
    !playlistData ||
    playlistData.paginationState.currentPage >= getTotalPages(playlistData) - 1
  )
    return;

  playlistData.paginationState.currentPage++;
  updateVideoGrid(playlistId);
}

/**
 * Creates pagination arrows for a specific playlist
 */
function createPaginationArrows(playlistId: string): string {
  return `
    <span class="pagination-arrow pagination-arrow-left" data-playlist-id="${playlistId}" style="visibility: hidden;">&lt;</span>
    <span class="pagination-arrow pagination-arrow-right" data-playlist-id="${playlistId}">&gt;</span>
  `;
}

/**
 * Creates the header with title and pagination arrows for a specific playlist
 */
function createHeaderWithArrows(
  playlistTitle: string,
  playlistId: string
): HTMLElement {
  const headerContainer = document.createElement("div");
  headerContainer.className = "playlist-header-container";

  const shelfTitle = document.createElement("h2");
  shelfTitle.className = "shelf-title";
  shelfTitle.textContent = playlistTitle;

  const arrowsContainer = document.createElement("div");
  arrowsContainer.className = "header-arrows-container";
  arrowsContainer.setAttribute("data-playlist-id", playlistId);
  arrowsContainer.innerHTML = createPaginationArrows(playlistId);

  headerContainer.appendChild(shelfTitle);
  headerContainer.appendChild(arrowsContainer);

  return headerContainer;
}

/**
 * Sets up pagination event listeners for all playlists
 */
function setupPaginationEventListeners(): void {
  // Remove existing listeners to avoid duplicates
  document.querySelectorAll(".pagination-arrow").forEach((arrow) => {
    arrow.replaceWith(arrow.cloneNode(true));
  });

  // Add new listeners
  document.querySelectorAll(".pagination-arrow-left").forEach((arrow) => {
    arrow.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const playlistId = (arrow as HTMLElement).getAttribute(
        "data-playlist-id"
      );
      if (playlistId) goToPreviousPage(playlistId);
    });
  });

  document.querySelectorAll(".pagination-arrow-right").forEach((arrow) => {
    arrow.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      const playlistId = (arrow as HTMLElement).getAttribute(
        "data-playlist-id"
      );
      if (playlistId) goToNextPage(playlistId);
    });
  });
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
 * Gets selected playlists from storage
 */
async function getSelectedPlaylists(): Promise<string[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(["selectedPlaylists"], (result) => {
      if (result.selectedPlaylists && result.selectedPlaylists.playlistIds) {
        resolve(result.selectedPlaylists.playlistIds);
      } else {
        resolve([]);
      }
    });
  });
}

/**
 * Fetches multiple playlists data from YouTube API
 */
async function fetchMultiplePlaylistsData(): Promise<
  MultiPlaylistData[] | null
> {
  try {
    // Get auth token from background script
    const authToken = await getAuthToken();
    if (!authToken) {
      console.error("No auth token available for API calls");
      return null;
    }

    // Get selected playlist IDs from storage
    const selectedPlaylistIds = await getSelectedPlaylists();
    if (selectedPlaylistIds.length === 0) {
      console.warn("No playlists selected");
      return null;
    }

    // Initialize API service
    const apiService = new YoutubeApiService(authToken);

    // Get user's playlists info (only if we need non-LIKED_VIDEOS playlists)
    const regularPlaylistIds = selectedPlaylistIds.filter((id) => id !== "LL");
    const allPlaylists =
      regularPlaylistIds.length > 0
        ? await apiService.getUserPlaylists(25)
        : [];

    // Create minimal playlist info for the playlists we need to fetch
    const selectedPlaylists = selectedPlaylistIds
      .map((playlistId) => {
        if (playlistId === "LL") {
          return {
            id: "LIKED_VIDEOS",
            title: "Liked Videos",
            description: "Your saved videos",
            thumbnailUrl: "",
            videoCount: 0,
            privacy: "private" as const,
          };
        } else {
          const playlist = allPlaylists.find((p) => p.id === playlistId);
          return playlist || null;
        }
      })
      .filter((p) => p !== null);

    if (selectedPlaylists.length === 0) {
      console.warn("No valid playlists found");
      return null;
    }

    const playlistsWithVideos: MultiPlaylistData[] = [];

    for (const playlist of selectedPlaylists) {
      console.log(`Fetching videos from playlist: "${playlist.title}"`);
      console.log(`Playlist ID: ${playlist.id}`);
      console.log(`Is Liked Video? ${playlist.id === "LIKED_VIDEOS"}`);

      try {
        let videos: Video[];

        if (playlist.id === "LIKED_VIDEOS") {
          console.log("🔍 Calling getLikedVideosPlaylist...");
          videos = await apiService.getLikedVideosPlaylist(50);
          console.log(
            `🔍 getLikedVideosPlaylist returned: ${videos.length} videos`
          );
        } else {
          console.log("🔍 Calling getCompletePlaylistData...");
          videos = await apiService.getCompletePlaylistData(playlist.id, 50);
          console.log(
            `🔍 getCompletePlaylistData returned: ${videos.length} videos`
          );
        }

        if (videos.length > 0) {
          playlistsWithVideos.push({
            id: playlist.id,
            title: playlist.title,
            videos: videos,
            paginationState: {
              currentPage: 0,
              videosPerPage: calculateVideosPerPage(),
              totalVideos: videos.length,
              allVideos: videos,
            },
          });
          console.log(
            `Successfully fetched ${videos.length} videos from "${playlist.title}"`
          );
        } else {
          console.warn(`No videos found in playlist: "${playlist.title}"`);
        }
      } catch (error) {
        console.error(
          `Failed to fetch videos for playlist "${playlist.title}":`,
          error
        );
      }
    }

    return playlistsWithVideos.length > 0 ? playlistsWithVideos : null;
  } catch (error) {
    console.error("Failed to fetch playlist data:", error);
    return null;
  }
}

/**
 * Helper functions for DOM insertion (unchanged from original)
 */
/* 
OLD FALLBACK CODE
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
*/

/**
 * Dynamically calculates videos per row and injects playlist without disrupting grid
 */
function calculateVideosPerRow(contentContainer: HTMLElement): number {
  try {
    // Get container width
    const containerWidth = contentContainer.offsetWidth;
    console.log(`📏 Container width: ${containerWidth}px`);
    
    // Get first video element
    const firstVideo = contentContainer.querySelector('ytd-rich-item-renderer') as HTMLElement;
    if (!firstVideo) {
      console.warn("⚠️ No video elements found for width calculation");
      return 4; // Default fallback
    }
    
    // Get video width including margins/padding
    const videoRect = firstVideo.getBoundingClientRect();
    const videoStyles = window.getComputedStyle(firstVideo);
    const marginLeft = parseFloat(videoStyles.marginLeft) || 0;
    const marginRight = parseFloat(videoStyles.marginRight) || 0;
    const videoWidth = videoRect.width - marginRight;
    
    console.log(`📏 Video width (minus right margins): ${videoWidth}px`);
    console.log(`📏 Video margins: left=${marginLeft}px, right=${marginRight}px`);
    
    // Calculate videos per row
    const videosPerRow = Math.floor(containerWidth / videoWidth);
    console.log(`📊 Calculated videos per row: ${videosPerRow}`);
    
    // Sanity check - YouTube typically has 2-6 videos per row
    if (videosPerRow < 2 || videosPerRow > 8) {
      console.warn(`⚠️ Unusual videos per row: ${videosPerRow}, using fallback of 4`);
      return 4;
    }
    
    return videosPerRow;
    
  } catch (error) {
    console.error("❌ Error calculating videos per row:", error);
    return 4; // Fallback
  }
}

/**
 * Creates and injects multiple playlists after first row using dynamic detection - FINAL VERSION
 */
function injectMultiplePlaylistsWithData(
  playlistsWithVideos: MultiPlaylistData[]
): void {
  console.log("🎬 Starting dynamic playlist injection after first row...");
  
  // Store playlists data globally
  playlistsData = playlistsWithVideos;

  // Find the main content container
  let contentContainer: HTMLElement | null = null;
  
  const containerSelectors = [
    "ytd-rich-grid-renderer #contents",
    "ytd-two-column-browse-results-renderer #primary #contents",
    "ytd-browse #primary #contents",
    "#contents.ytd-rich-grid-renderer",
    "#primary #contents"
  ];
  
  for (const selector of containerSelectors) {
    contentContainer = document.querySelector<HTMLElement>(selector);
    if (contentContainer) {
      console.log(`✅ Found container with selector: ${selector}`);
      break;
    }
  }

  if (!contentContainer) {
    console.error("❌ Could not find any content container");
    return;
  }

  // Get all video elements
  const allVideos = contentContainer.querySelectorAll('ytd-rich-item-renderer');
  console.log(`📹 Found ${allVideos.length} total video elements`);
  
  if (allVideos.length === 0) {
    console.error("❌ No video elements found in container");
    return;
  }

  // Calculate videos per row dynamically
  const videosPerRow = calculateVideosPerRow(contentContainer);
  
  // Find insertion point (after first row)
  let insertionPoint: Element | null = null;
  
  if (allVideos.length >= videosPerRow) {
    // Insert after the last video of the first row
    insertionPoint = allVideos[videosPerRow - 1]; // -1 because array is 0-indexed
    console.log(`🎯 DYNAMIC: Will insert after video ${videosPerRow} (first row complete)`);
  } else {
    // Not enough videos for a full row, insert after last video
    insertionPoint = allVideos[allVideos.length - 1];
    console.warn(`⚠️ Only ${allVideos.length} videos found, less than calculated row size of ${videosPerRow}`);
    console.warn(`⚠️ Will insert after last video`);
  }

  if (!insertionPoint || insertionPoint.parentElement !== contentContainer) {
    console.error("❌ Invalid insertion point");
    return;
  }

  // Create and inject each playlist
  playlistsWithVideos.forEach((playlistData, index) => {
    console.log(`🎬 Creating playlist ${index + 1}/${playlistsWithVideos.length}: "${playlistData.title}"`);
    
    try {
      // Create playlist wrapper styled as ytd-rich-item-renderer but full width
      const playlistWrapper = document.createElement("ytd-rich-item-renderer");
      playlistWrapper.className = "style-scope ytd-rich-grid-renderer";
      playlistWrapper.setAttribute("data-playlist-id", playlistData.id);
      playlistWrapper.setAttribute("data-custom-playlist", "true");
      
      // Add flexbox styling to make it take full width and act as row break
      playlistWrapper.style.cssText = `
        width: 100% !important;
        flex-basis: 100% !important;
        max-width: 100% !important;
        margin: 16px 0 !important;
        box-sizing: border-box !important;
      `;

      const playlistContainer = document.createElement("div");
      playlistContainer.id = `custom-playlist-container-${playlistData.id}`;
      playlistContainer.className = "custom-playlist-shelf";

      // Create header with title and arrows
      const headerWithArrows = createHeaderWithArrows(
        playlistData.title,
        playlistData.id
      );
      playlistContainer.appendChild(headerWithArrows);

      // Create video grid
      const videoGrid = document.createElement("div");
      videoGrid.className = "playlist-video-grid";
      videoGrid.setAttribute("data-playlist-id", playlistData.id);

      playlistContainer.appendChild(videoGrid);
      playlistWrapper.appendChild(playlistContainer);

      // INJECTION LOGIC
      let insertionSuccess = false;
      
      if (index === 0) {
        // First playlist: Insert after the calculated insertion point
        try {
          contentContainer.insertBefore(playlistWrapper, insertionPoint.nextSibling);
          insertionSuccess = true;
          console.log(`✅ DYNAMIC: Playlist "${playlistData.title}" inserted after ${videosPerRow} videos (first row)`);
        } catch (error) {
          console.error(`❌ Failed dynamic insertion for "${playlistData.title}":`, error);
        }
      } else {
        // Subsequent playlists: Insert after previous playlist
        try {
          const previousPlaylist = document.querySelector(`ytd-rich-item-renderer[data-playlist-id="${playlistsWithVideos[index-1].id}"]`);
          if (previousPlaylist && previousPlaylist.parentElement === contentContainer) {
            contentContainer.insertBefore(playlistWrapper, previousPlaylist.nextSibling);
            insertionSuccess = true;
            console.log(`✅ Playlist "${playlistData.title}" inserted after previous playlist`);
          }
        } catch (error) {
          console.error(`❌ Failed to insert after previous playlist:`, error);
        }
      }
      
      // EMERGENCY FALLBACK: Simple append
      if (!insertionSuccess) {
        try {
          contentContainer.appendChild(playlistWrapper);
          console.warn(`⚠️ EMERGENCY: Playlist "${playlistData.title}" appended to end (last resort)`);
        } catch (error) {
          console.error(`❌ Even emergency fallback failed for "${playlistData.title}":`, error);
          return;
        }
      }

      // Verify the element was actually added
      const addedElement = document.querySelector(`ytd-rich-item-renderer[data-playlist-id="${playlistData.id}"]`);
      if (addedElement) {
        console.log(`🎉 Playlist "${playlistData.title}" successfully added to DOM`);
      } else {
        console.error(`❌ Playlist "${playlistData.title}" not found in DOM after insertion`);
      }

    } catch (error) {
      console.error(`💥 Failed to create playlist "${playlistData.title}":`, error);
    }
  });

  // Initialize all video grids and setup event listeners
  console.log("🎮 Setting up video grids and event listeners...");
  
  playlistsWithVideos.forEach((playlistData) => {
    try {
      updateVideoGrid(playlistData.id);
      console.log(`✅ Video grid updated for "${playlistData.title}"`);
    } catch (error) {
      console.error(`❌ Failed to update video grid for "${playlistData.title}":`, error);
    }
  });

  try {
    setupPaginationEventListeners();
    console.log("✅ Pagination event listeners set up");
  } catch (error) {
    console.error("❌ Failed to setup pagination listeners:", error);
  }
  
  console.log("🎉 Dynamic playlist injection completed!");
}

/**
 * Main injection function that handles API calls and smart re-injection logic
 */
async function injectPlaylists(): Promise<void> {
  // Check if any playlist elements already exist
  if (document.querySelector('[id^="custom-playlist-container-"]')) {
    console.log("Playlists already exist, skipping injection");
    return;
  }

  try {
    // Fetch multiple playlists data from API
    const playlistsData = await fetchMultiplePlaylistsData();

    if (!playlistsData || playlistsData.length === 0) {
      console.log("No playlist data available, skipping injection");
      return;
    }

    // Inject multiple playlists with real data and pagination
    injectMultiplePlaylistsWithData(playlistsData);
  } catch (error) {
    console.error("Failed to inject playlists:", error);
  }
}

/**
 * Enhanced injection with persistent observer and dynamic video count
 */
async function injectPlaylistsWithObserver(): Promise<void> {
  // Check if already exists
  if (document.querySelector('[id^="custom-playlist-container-"]')) {
    console.log("Playlists already exist, skipping injection");
    return;
  }

  // Try immediate injection first
  await injectPlaylists();

  // Set up persistent observer (no timeout)
  const observer = new MutationObserver(async (mutations) => {
    // Check if we've already injected
    if (document.querySelector('[id^="custom-playlist-container-"]')) {
      return; // Don't disconnect - keep watching for layout changes
    }

    // Look for new content being added
    for (const mutation of mutations) {
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        // Try to inject again when new content is added
        setTimeout(async () => {
          if (!document.querySelector('[id^="custom-playlist-container-"]')) {
            await injectPlaylists();
          }
        }, 100);
        break;
      }
    }
  });

  // Observe the main content area persistently
  const mainContent =
    document.querySelector('ytd-browse[page-subtype="home"]') || document.body;
  observer.observe(mainContent, {
    childList: true,
    subtree: true,
  });

  // Add window resize handler for layout changes
  window.addEventListener("resize", async () => {
    // Update video counts when window resizes
    playlistsData.forEach((playlist) => {
      const newVideosPerPage = calculateVideosPerPage();
      playlist.paginationState.videosPerPage = newVideosPerPage;
      playlist.paginationState.currentPage = 0; // Reset to first page
      updateVideoGrid(playlist.id);
    });
  });

  // Add visibility change handler for minimize/restore
  document.addEventListener("visibilitychange", async () => {
    if (!document.hidden) {
      // Re-inject if needed when tab becomes visible
      setTimeout(async () => {
        if (!document.querySelector('[id^="custom-playlist-container-"]')) {
          await injectPlaylists();
        }
      }, 500);
    }
  });
}

/**
 * Dynamically calculates videos per page based on screen width
 */
function calculateVideosPerPage(): number {
  const screenWidth = window.innerWidth;

  // YouTube's responsive breakpoints
  if (screenWidth >= 1728) return 6; // Extra large screens
  if (screenWidth >= 1312) return 5; // Large screens
  if (screenWidth >= 1015) return 4; // Medium screens
  if (screenWidth >= 768) return 3; // Small screens
  return 2; // Mobile
}
/**
 * Listen for messages from popup/background when playlists are selected
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("📨 CONTENT SCRIPT: Message received!");
  console.log("📨 Message type:", message.type);
  console.log("📨 Full message:", message);
  console.log("📨 Sender:", sender);

  try {
    if (message.type === "PLAYLISTS_UPDATED") {
      console.log("🔄 PLAYLISTS_UPDATED received, processing...");

      // Remove existing playlists first
      const existingPlaylists = document.querySelectorAll(
        '[data-custom-playlist="true"]'
      );
      console.log(
        `🗑️ Found ${existingPlaylists.length} existing playlists to remove`
      );

      existingPlaylists.forEach((playlist, index) => {
        const playlistId = playlist.getAttribute("data-playlist-id");
        console.log(
          `🗑️ Removing existing playlist ${index + 1}: ${playlistId}`
        );
        playlist.remove();
      });

      // Clear global state
      playlistsData = [];
      console.log("🧹 Cleared global playlist data");

      // Wait a moment then inject new playlists
      setTimeout(async () => {
        try {
          console.log("🚀 Starting playlist re-injection...");
          await injectPlaylists();
          console.log("✅ Re-injection completed successfully");
          sendResponse({ success: true });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (error: any) {
          console.error("❌ Failed to re-inject playlists:", error);
          sendResponse({ success: false, error: error.message });
        }
      }, 300);

      // Return true to indicate we'll respond asynchronously
      return true;
    }

    if (message.type === "PING") {
      console.log("🏓 PING received, responding...");
      sendResponse({ success: true, message: "Content script is active" });
      return;
    }

    console.log("❓ Unknown message type:", message.type);
    sendResponse({ success: false, error: "Unknown message type" });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } catch (error: any) {
    console.error("💥 Error in message listener:", error);
    sendResponse({ success: false, error: error.message });
  }
});

console.log("✅ Content script message listener registered");

// Wait a bit longer for YouTube's SPA to load, then try injection
setTimeout(injectPlaylistsWithObserver, 1000);
