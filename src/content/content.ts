// Enhanced content script with YouTube API integration and pagination
import { YoutubeApiService } from "../api/YoutubeApiService";

// Prevent multiple script execution (TypeScript-friendly)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
if ((window as any).playlistExtensionLoaded) {
  console.log("🛑 Content script already loaded, skipping");
} else {
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).playlistExtensionLoaded = true;

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
  likeCount: number;        // NEW
  commentCount: number;     // NEW
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

interface PlaylistFilterSortSettings {
  filters: {
    viewCount: { min: number; max: number | null };
    likeCount: { min: number; max: number | null };     // NEW
    commentCount: { min: number; max: number | null };  // NEW
    uploadDate: 'all' | 'week' | 'month' | 'year';
    duration: { min: number; max: number | null };
    channels: string[];
    categories: string[];  // Will store category names
    keywords: string;
  };
  sort: {
    by: 'default' | 'views' | 'likes' | 'comments' | 'date' | 'duration' | 'title' | 'channel' | 'random';
    direction: 'asc' | 'desc';
  };
}

interface CachedPlaylistData {
  playlistId: string;
  videos: Video[];
  lastFetched: number;
  totalVideos: number;
  title: string;
}

interface PlaylistCache {
  [playlistId: string]: CachedPlaylistData;
}

// Cache settings
const CACHE_DURATION = 60 * 60 * 1000; // 30 minutes in milliseconds
const CACHE_KEY = 'youtubePlaylistCache';


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
 * Parse YouTube duration string to seconds
 */
function parseDurationToSeconds(duration: string): number {
  try {
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return 0;
    
    const hours = match[1] ? parseInt(match[1].replace('H', '')) : 0;
    const minutes = match[2] ? parseInt(match[2].replace('M', '')) : 0;
    const seconds = match[3] ? parseInt(match[3].replace('S', '')) : 0;
    
    return hours * 3600 + minutes * 60 + seconds;
  } catch (error) {
    console.warn("Error parsing duration:", duration, error);
    return 0;
  }
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
 * Updates the video grid for a specific playlist (with empty results handling)
 */
function updateVideoGrid(playlistId: string): void {
  const videoGrid = document.querySelector(
    `.playlist-video-grid[data-playlist-id="${playlistId}"]`
  ) as HTMLElement;
  if (!videoGrid) return;

  const playlistData = playlistsData.find((p) => p.id === playlistId);
  if (!playlistData) return;

  // Handle empty results (no videos after filtering)
  if (playlistData.videos.length === 0) {
    videoGrid.classList.add('empty-state'); // Add the CSS class
  videoGrid.innerHTML = `
    <div style="
      padding: 0px 8px;
      text-align: center;
      color: #666;
      font-size: 24px;
      line-height: 1.4;
      width: 100%;
    ">
      <p style="margin: 0 0 6px 0; font-size: 20px;">No videos match your current filters</p>
      <p style="margin: 0; font-size: 16px; color: #888;">Try adjusting your filter settings in the extension popup</p>
    </div>
  `;
    
    // Hide pagination arrows for empty results
    updateArrowVisibility(playlistId);
    return;
  }

  const currentVideos = getCurrentPageVideos(playlistData);

  // Remove empty state class when showing videos
  videoGrid.classList.remove('empty-state');

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
     if (!chrome.runtime?.id) {
      console.warn("⚠️ Extension context invalidated");
      resolve(null);
      return;
    }

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
        console.log("No auth token available");
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
 * Fetches multiple playlists data from YouTube API and applies filters/sorting
 */
async function fetchMultiplePlaylistsData(): Promise<MultiPlaylistData[] | null> {
  console.log("🧪 CACHE TEST: fetchMultiplePlaylistsData function called!");
  try {
    // Get selected playlist IDs from storage
    const selectedPlaylistIds = await getSelectedPlaylists();
    if (selectedPlaylistIds.length === 0) {
      return null;
    }

    console.log(`🎬 Content: Processing ${selectedPlaylistIds.length} playlists with caching`);

    // Check cache first
    const { cachedPlaylists, expiredPlaylists, freshPlaylists } = await checkPlaylistCache(selectedPlaylistIds);

    console.log(`📊 Cache status: ${freshPlaylists.length} fresh, ${expiredPlaylists.length} expired, ${cachedPlaylists.length} total cached`);

    // eslint-disable-next-line prefer-const
    let allPlaylistData: CachedPlaylistData[] = [...freshPlaylists];

    // Fetch expired/missing playlists
    if (expiredPlaylists.length > 0) {
      console.log(`🔄 Fetching ${expiredPlaylists.length} expired/missing playlists from API`);
      
      const freshlyFetched = await fetchPlaylistsFromAPI(expiredPlaylists);
      
      if (freshlyFetched.length > 0) {
        // Add to our data
        allPlaylistData.push(...freshlyFetched);
        
        // Update cache
        await updatePlaylistCache(freshlyFetched);
        console.log(`✅ Updated cache with ${freshlyFetched.length} playlists`);
      }
    } else {
      console.log(`⚡ All playlists served from cache - instant loading!`);
    }

    if (allPlaylistData.length === 0) {
      console.warn("No playlist data available");
      return null;
    }

    // Process the data (apply filters/sorting like before)
    const playlistsWithVideos: MultiPlaylistData[] = [];

    for (const playlistData of allPlaylistData) {
      if (playlistData.videos.length > 0) {
        // Get filter/sort settings for this playlist
        const settingsKey = playlistData.playlistId === "LIKED_VIDEOS" ? "LL" : playlistData.playlistId;
        const playlistSettings = await getPlaylistSettings(settingsKey);
        
        let processedVideos = playlistData.videos;
        
        if (playlistSettings) {
          console.log(`📊 Applying custom filters/sorting to "${playlistData.title}"`);
          
          // Apply filters first
          processedVideos = applyFilters(playlistData.videos, playlistSettings.filters);
          console.log(`🔍 Filtered ${playlistData.videos.length} → ${processedVideos.length} videos`);
          
          // Apply sorting
          processedVideos = applySorting(processedVideos, playlistSettings.sort);
          console.log(`🔄 Sorted by: ${playlistSettings.sort.by} (${playlistSettings.sort.direction})`);
        }

        if (processedVideos.length > 0) {
          playlistsWithVideos.push({
            id: playlistData.playlistId,
            title: playlistData.title,
            videos: processedVideos,
            paginationState: {
              currentPage: 0,
              videosPerPage: calculateVideosPerPage(),
              totalVideos: processedVideos.length,
              allVideos: processedVideos,
            },
          });
          console.log(`✅ Successfully processed ${processedVideos.length} videos from "${playlistData.title}"`);
        } else {
          // Create placeholder for empty filtered results
          playlistsWithVideos.push({
            id: playlistData.playlistId,
            title: playlistData.title,
            videos: [],
            paginationState: {
              currentPage: 0,
              videosPerPage: calculateVideosPerPage(),
              totalVideos: 0,
              allVideos: [],
            },
          });
          console.log(`⚠️ No videos match filters for "${playlistData.title}"`);
        }
      } else {
        console.warn(`No videos found in playlist: "${playlistData.title}"`);
      }
    }

    return playlistsWithVideos.length > 0 ? playlistsWithVideos : null;

  } catch (error) {
    console.error("❌ Failed to fetch playlist data:", error);
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
 * Detects if YouTube Shorts section is right after the first row of videos
 */
function detectShortsAfterFirstRow(contentContainer: HTMLElement, videosPerRow: number): HTMLElement | null {
  const allVideos = contentContainer.querySelectorAll('ytd-rich-item-renderer');
  
  if (allVideos.length < videosPerRow) {
    return null; // Not enough videos for a full row
  }
  
  // Get the element right after the last video in the first row
  const lastVideoInFirstRow = allVideos[videosPerRow - 1];
  const nextElement = lastVideoInFirstRow.nextElementSibling;
  
  if (!nextElement) {
    console.log("🔍 No element after first row");
    return null;
  }
  
  console.log("🔍 Element after first row:", nextElement.tagName, nextElement.className);
  
  // Check if it's a Shorts section using the old selectors
  const shortsSelectors = [
    "ytd-rich-section-renderer[is-shorts]",
    "ytd-reel-shelf-renderer",
    'ytd-rich-shelf-renderer:has([title*="Shorts"])',
    '[aria-label*="Shorts"]'
  ];
  
  for (const selector of shortsSelectors) {
    if (nextElement.matches && nextElement.matches(selector)) {
      console.log("🎯 SHORTS DETECTED: Found Shorts section right after first row using selector:", selector);
      return nextElement as HTMLElement;
    }
  }
  
  // Also check text content for "Shorts"
  if (nextElement.textContent?.toLowerCase().includes("shorts")) {
    console.log("🎯 SHORTS DETECTED: Found Shorts section by text content");
    return nextElement as HTMLElement;
  }
  
  console.log("🔍 No Shorts section detected after first row");
  return null;
}

/**
 * Apply filters to video array
 */
function applyFilters(videos: Video[], filters: PlaylistFilterSortSettings['filters']): Video[] {
  return videos.filter(video => {
    try {
      // Keywords filter (title + channel)
      if (filters.keywords.trim()) {
        const searchText = `${video.snippet.title} ${video.snippet.videoOwnerChannelTitle}`.toLowerCase();
        const keywords = filters.keywords.toLowerCase();
        if (!searchText.includes(keywords)) {
          return false;
        }
      }
      
      // View count filter
      const viewCount = video.viewCount || 0;
      if (viewCount < filters.viewCount.min) {
        return false;
      }
      if (filters.viewCount.max !== null && viewCount > filters.viewCount.max) {
        return false;
      }
      
      // Like count filter (NEW)
      const likeCount = video.likeCount || 0;
      if (likeCount < filters.likeCount.min) {
        return false;
      }
      if (filters.likeCount.max !== null && likeCount > filters.likeCount.max) {
        return false;
      }
      
      // Comment count filter (NEW)
      const commentCount = video.commentCount || 0;
      if (commentCount < filters.commentCount.min) {
        return false;
      }
      if (filters.commentCount.max !== null && commentCount > filters.commentCount.max) {
        return false;
      }
      
      // Duration filter
      const durationSeconds = parseDurationToSeconds(video.duration);
      if (durationSeconds < filters.duration.min) {
        return false;
      }
      if (filters.duration.max !== null && durationSeconds > filters.duration.max) {
        return false;
      }
      
      // Category filter (NEW)
      if (filters.categories.length > 0) {
        if (!filters.categories.includes(video.snippet.categoryName)) {
          return false;
        }
      }
      
      // Upload date filter
      if (filters.uploadDate !== 'all') {
        const uploadDate = new Date(video.snippet.publishedAt);
        const now = new Date();
        const daysDiff = Math.floor((now.getTime() - uploadDate.getTime()) / (1000 * 60 * 60 * 24));
        
        switch (filters.uploadDate) {
          case 'week':
            if (daysDiff > 7) return false;
            break;
          case 'month':
            if (daysDiff > 30) return false;
            break;
          case 'year':
            if (daysDiff > 365) return false;
            break;
        }
      }
      
      // Channel filter (if implemented later)
      if (filters.channels.length > 0) {
        if (!filters.channels.includes(video.snippet.videoOwnerChannelTitle)) {
          return false;
        }
      }
      
      return true;
    } catch (error) {
      console.warn("Error filtering video:", video, error);
      return true; // Include video if filtering fails
    }
  });
}

/**
 * Apply sorting to video array
 */
function applySorting(videos: Video[], sort: PlaylistFilterSortSettings['sort']): Video[] {
  if (sort.by === 'default') {
    return videos; // Keep original order
  }
  
  if (sort.by === 'random') {
    // Generate new random order each time
    const shuffled = [...videos];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
  
  const sortedVideos = [...videos].sort((a, b) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let aValue: any, bValue: any;
    
    switch (sort.by) {
      case 'views':
        aValue = a.viewCount || 0;
        bValue = b.viewCount || 0;
        break;
        
      case 'likes':  // NEW
        aValue = a.likeCount || 0;
        bValue = b.likeCount || 0;
        break;
        
      case 'comments':  // NEW
        aValue = a.commentCount || 0;
        bValue = b.commentCount || 0;
        break;
        
      case 'date':
        aValue = new Date(a.snippet.publishedAt).getTime();
        bValue = new Date(b.snippet.publishedAt).getTime();
        break;
        
      case 'duration':
        aValue = parseDurationToSeconds(a.duration);
        bValue = parseDurationToSeconds(b.duration);
        break;
        
      case 'title':
        aValue = a.snippet.title.toLowerCase();
        bValue = b.snippet.title.toLowerCase();
        break;
        
      case 'channel':
        aValue = a.snippet.videoOwnerChannelTitle.toLowerCase();
        bValue = b.snippet.videoOwnerChannelTitle.toLowerCase();
        break;
        
      default:
        return 0;
    }
    
    // Handle string vs number comparison
    let comparison = 0;
    if (typeof aValue === 'string') {
      comparison = aValue.localeCompare(bValue);
    } else {
      comparison = aValue - bValue;
    }
    
    // Apply sort direction
    return sort.direction === 'asc' ? comparison : -comparison;
  });
  
  return sortedVideos;
}

/**
 * Get filter/sort settings for a specific playlist
 */
async function getPlaylistSettings(playlistId: string): Promise<PlaylistFilterSortSettings | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get(["selectedPlaylists"], (result) => {
      if (result.selectedPlaylists?.playlistSettings?.[playlistId]) {
        resolve(result.selectedPlaylists.playlistSettings[playlistId]);
      } else {
        resolve(null); // No custom settings, use defaults
      }
    });
  });
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
  
 // Check if Shorts section is right after first row
const shortsSection = detectShortsAfterFirstRow(contentContainer, videosPerRow);
let insertionPoint: Element | null = null;
let usesShortsLogic = false;

if (shortsSection) {
  // Use old Shorts injection logic - insert ABOVE the Shorts section
  insertionPoint = shortsSection;
  usesShortsLogic = true;
  console.log("🎯 SHORTS LOGIC: Will insert above Shorts section");
} else {
  // Use current Y-position detection logic
  if (allVideos.length >= videosPerRow) {
    insertionPoint = allVideos[videosPerRow - 1];
    console.log(`🎯 DYNAMIC: Will insert after video ${videosPerRow} (first row complete)`);
  } else {
    insertionPoint = allVideos[allVideos.length - 1];
    console.warn(`⚠️ Only ${allVideos.length} videos found, less than calculated row size of ${videosPerRow}`);
    console.warn(`⚠️ Will insert after last video`);
  }
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
      margin: 0 !important;
      margin-top: 2px !important;      // ← Space above playlist
      padding-bottom: 24px !important;   // ← Space below playlist
      box-sizing: border-box !important;
    `;

      const playlistContainer = document.createElement("div");
      playlistContainer.id = `custom-playlist-container-${playlistData.id}`;
      playlistContainer.className = "custom-playlist-shelf";

      // Add position-based classes
      if (index === 0) {
        playlistContainer.classList.add("first-playlist");
      }
      if (index === playlistsWithVideos.length - 1) {
        playlistContainer.classList.add("last-playlist");
      }

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
      // First playlist: Insert using appropriate logic
      try {
        if (usesShortsLogic) {
          // Insert ABOVE the Shorts section (like old code)
          contentContainer.insertBefore(playlistWrapper, insertionPoint);
          insertionSuccess = true;
          console.log(`✅ SHORTS: Playlist "${playlistData.title}" inserted above Shorts section`);
        } else {
          // Insert after the calculated insertion point (current logic)
          contentContainer.insertBefore(playlistWrapper, insertionPoint.nextSibling);
          insertionSuccess = true;
          console.log(`✅ DYNAMIC: Playlist "${playlistData.title}" inserted after ${videosPerRow} videos (first row)`);
        }
      } catch (error) {
        console.error(`❌ Failed insertion for "${playlistData.title}":`, error);
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

  // Add debounce function
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
function debounce(func: Function, wait: number) {
  let timeout: NodeJS.Timeout;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return function executedFunction(...args: any[]) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
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

  // Set up observer with navigation detection built-in
  let lastUrl = location.href;
  
  const observer = new MutationObserver(async (mutations) => {
    // Check for URL changes (navigation detection)
    if (location.href !== lastUrl) {
      lastUrl = location.href;
      
      // Clean up existing playlists on navigation
      const existingPlaylists = document.querySelectorAll('[data-custom-playlist="true"]');
      existingPlaylists.forEach(playlist => playlist.remove());
      playlistsData = [];
      
      // Only re-inject on homepage after delay
      if (location.href === 'https://www.youtube.com/') {
        setTimeout(async () => {
          if (!document.querySelector('[data-custom-playlist="true"]')) {
            await injectPlaylists();
          }
        }, 2000);
      }
      return;
    }

    // Original content detection logic
    if (document.querySelector('[id^="custom-playlist-container-"]')) {
      console.log("✅ Playlists found, disconnecting observer to prevent duplicates");
      observer.disconnect();
      return;
    }

    // Look for new content being added
    for (const mutation of mutations) {
      if (mutation.type === "childList" && mutation.addedNodes.length > 0) {
        setTimeout(async () => {
          if (!document.querySelector('[id^="custom-playlist-container-"]')) {
            await injectPlaylists();
            if (document.querySelector('[id^="custom-playlist-container-"]')) {
              console.log("✅ Injection successful, disconnecting observer");
              observer.disconnect();
            }
          }
        }, 100);
        break;
      }
    }
  });

  // Observe the main content area persistently
  const mainContent = document.querySelector('ytd-browse[page-subtype="home"]') || document.body;
  observer.observe(mainContent, {
    childList: true,
    subtree: true,
  });
}

// Scoped resize handler that only affects OUR playlists
window.addEventListener("resize", debounce(() => {
  // Only update OUR playlist videos, not YouTube's native content
  if (playlistsData.length > 0) {
    console.log("🔄 Resize detected, updating playlist layouts...");
    playlistsData.forEach((playlist) => {
      const newVideosPerPage = calculateVideosPerPage();
      if (playlist.paginationState.videosPerPage !== newVideosPerPage) {
        playlist.paginationState.videosPerPage = newVideosPerPage;
        updateVideoGrid(playlist.id);
      }
    });
  }
}, 250));

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

/**
 * Dynamically calculates videos per page based on screen width
 */
function calculateVideosPerPage(): number {
  const screenWidth = window.innerWidth;

  // YouTube's responsive breakpoints
  //if (screenWidth >= 1728) return 6; // Extra large screens
  if (screenWidth >= 1312) return 5; // Large screens
  if (screenWidth >= 1015) return 4; // Medium screens
  if (screenWidth >= 768) return 3; // Small screens
  return 2; // Mobile
}

/**
 * Check cache for playlist data
 */
async function checkPlaylistCache(selectedPlaylistIds: string[]): Promise<{
  cachedPlaylists: CachedPlaylistData[];
  expiredPlaylists: string[];
  freshPlaylists: CachedPlaylistData[];
}> {
  return new Promise((resolve) => {
    chrome.storage.local.get([CACHE_KEY], (result) => {
      const cache: PlaylistCache = result[CACHE_KEY] || {};
      const now = Date.now();
      
      const cachedPlaylists: CachedPlaylistData[] = [];
      const expiredPlaylists: string[] = [];
      const freshPlaylists: CachedPlaylistData[] = [];

      selectedPlaylistIds.forEach(playlistId => {
      // Normalize the playlist ID for cache lookup
      const cacheKey = playlistId === "LL" ? "LIKED_VIDEOS" : playlistId;
      const cachedData = cache[cacheKey];  // Use normalized key
      
      if (cachedData) {
        cachedPlaylists.push(cachedData);
        
        // Check if cache is still fresh
        if (now - cachedData.lastFetched < CACHE_DURATION) {
          freshPlaylists.push(cachedData);
          console.log(`⚡ Using cached data for "${cachedData.title}" (${cachedData.totalVideos} videos)`);
        } else {
          expiredPlaylists.push(playlistId);  // Keep original ID for fetching
          console.log(`⏰ Cache expired for "${cachedData.title}", will refetch`);
        }
      } else {
        expiredPlaylists.push(playlistId);  // Keep original ID for fetching
        console.log(`📥 No cache found for playlist ${playlistId}, will fetch`);
      }
    });

      resolve({ cachedPlaylists, expiredPlaylists, freshPlaylists });
    });
  });
}

/**
 * Fetch playlists from API (extracted from your existing logic)
 */
async function fetchPlaylistsFromAPI(playlistIds: string[]): Promise<CachedPlaylistData[]> {
  try {
    // Get auth token from background script
    const authToken = await getAuthToken();
    if (!authToken) {
      console.log("No auth token available for API calls");
      return [];
    }

    // Initialize API service
    const apiService = new YoutubeApiService(authToken);

    // Get user's playlists info (only if we need non-LIKED_VIDEOS playlists)
    const regularPlaylistIds = playlistIds.filter((id) => id !== "LL");
    const allPlaylists = regularPlaylistIds.length > 0 ? await apiService.getUserPlaylists(25) : [];

    // Create minimal playlist info for the playlists we need to fetch
    const selectedPlaylists = playlistIds
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
      return [];
    }

    const playlistsData: CachedPlaylistData[] = [];

    // Get user preference for video count
    const videoFetchCount = await getVideoFetchCount();

    for (const playlist of selectedPlaylists) {
      console.log(`Fetching videos from playlist: "${playlist.title}" (fetchAll: ${videoFetchCount})`);

      try {
        let videos: Video[];

        if (playlist.id === "LIKED_VIDEOS") {
          console.log("🔍 Calling getLikedVideosPlaylist...");
          videos = await apiService.getLikedVideosPlaylist(videoFetchCount);
        } else {
          console.log("🔍 Calling getCompletePlaylistData...");
          videos = await apiService.getCompletePlaylistData(playlist.id, videoFetchCount);
        }

        if (videos.length > 0) {
          playlistsData.push({
            playlistId: playlist.id,
            videos: videos,
            lastFetched: Date.now(),
            totalVideos: videos.length,
            title: playlist.title
          });
          console.log(`✅ Successfully fetched ${videos.length} videos from "${playlist.title}"`);
        } else {
          console.warn(`No videos found in playlist: "${playlist.title}"`);
        }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (error: any) {
        console.error(`Failed to fetch videos for playlist "${playlist.title}":`, error);
        
        // Handle quota exceeded gracefully
        if (error.message?.includes('quotaExceeded') || error.message?.includes('quota')) {
          console.warn("⚠️ Quota exceeded, stopping further fetches");
          break;
        }
      }
    }

    return playlistsData;
  } catch (error) {
    console.error("Failed to fetch playlists from API:", error);
    return [];
  }
}

/**
 * Update cache with fresh playlist data
 */
async function updatePlaylistCache(newPlaylistData: CachedPlaylistData[]): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get([CACHE_KEY], (result) => {
      const cache: PlaylistCache = result[CACHE_KEY] || {};
      
      // Update cache with new data
      newPlaylistData.forEach(playlistData => {
        cache[playlistData.playlistId] = playlistData;
      });
      
      chrome.storage.local.set({ [CACHE_KEY]: cache }, () => {
        console.log(`💾 Cache updated with ${newPlaylistData.length} playlists`);
        resolve();
      });
    });
  });
}

/**
 * Get user preference for fetching all videos
 */
async function getVideoFetchCount(): Promise<50 | 200 | 'all'> {
  return new Promise((resolve) => {
    chrome.storage.local.get(['videoFetchCount'], (result) => {
      resolve(result.videoFetchCount || 50); // Default to 50
    });
  });
}

/**
 * Clear cache (useful for debugging/user control)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// async function clearPlaylistCache(): Promise<void> {
//   return new Promise((resolve) => {
//     chrome.storage.local.remove([CACHE_KEY], () => {
//       console.log("🗑️ Playlist cache cleared");
//       resolve();
//     });
//   });
// }

/**
 * Get cache stats (useful for debugging)
 */
async function getCacheStats(): Promise<void> {
  return new Promise((resolve) => {
    chrome.storage.local.get([CACHE_KEY], (result) => {
      const cache: PlaylistCache = result[CACHE_KEY] || {};
      const now = Date.now();
      
      console.log("📊 Cache Statistics:");
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      Object.entries(cache).forEach(([_playlistId, data]) => {
        const age = Math.round((now - data.lastFetched) / 1000 / 60); // minutes
        const isExpired = age > 30;
        console.log(`  ${data.title}: ${data.totalVideos} videos, ${age}min old ${isExpired ? '(EXPIRED)' : '(FRESH)'}`);
      });
      
      resolve();
    });
  });
}

// Attach the function to the window object for console access
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(window as any).getCacheStats = getCacheStats;

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
}