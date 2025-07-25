// 1. Define the shape of our video data with a TypeScript interface.
interface Video {
  contentDetails: {
    videoId: string;
  };
  snippet: {
    title: string;
    videoOwnerChannelTitle: string;
    publishedAt: string;
    thumbnails: {
      high: {
        url: string;
      };
    };
  };
  duration: string;
  viewCount: number;
}

// 2. The mock data array is now typed as an array of 'Video' objects.
const MOCK_WATCH_LATER_DATA: Video[] = [
  {
    contentDetails: { videoId: "dQw4w9WgXcQ" },
    snippet: {
      title: "Rick Astley - Never Gonna Give You Up (Official Video)",
      videoOwnerChannelTitle: "Rick Astley",
      publishedAt: "2023-12-01T10:30:00Z",
      thumbnails: {
        high: { url: "https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg" },
      },
    },
    duration: "PT3M33S",
    viewCount: 1500000000,
  },
  {
    contentDetails: { videoId: "9bZkp7q19f0" },
    snippet: {
      title: "PSY - GANGNAM STYLE(강남스타일) M/V",
      videoOwnerChannelTitle: "officialpsy",
      publishedAt: "2023-11-28T15:45:00Z",
      thumbnails: {
        high: { url: "https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg" },
      },
    },
    duration: "PT4M12S",
    viewCount: 4800000000,
  },
  {
    contentDetails: { videoId: "fJ9rUzIMcZQ" },
    snippet: {
      title: "Queen – Bohemian Rhapsody (Official Video Remastered)",
      videoOwnerChannelTitle: "Queen Official",
      publishedAt: "2023-11-25T08:20:00Z",
      thumbnails: {
        high: { url: "https://i.ytimg.com/vi/fJ9rUzIMcZQ/hqdefault.jpg" },
      },
    },
    duration: "PT5M55S",
    viewCount: 1800000000,
  },
  {
    contentDetails: { videoId: "JGwWNGJdvx8" },
    snippet: {
      title: "Ed Sheeran - Shape of You (Official Music Video)",
      videoOwnerChannelTitle: "Ed Sheeran",
      publishedAt: "2023-11-08T13:25:00Z",
      thumbnails: {
        high: { url: "https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg" },
      },
    },
    duration: "PT3M53S",
    viewCount: 5900000000,
  },
  {
    contentDetails: { videoId: "JGwWNGJdvx8" },
    snippet: {
      title: "Ed Sheeran - Shape of You (Official Music Video)",
      videoOwnerChannelTitle: "Ed Sheeran",
      publishedAt: "2023-11-08T13:25:00Z",
      thumbnails: {
        high: { url: "https://i.ytimg.com/vi/JGwWNGJdvx8/hqdefault.jpg" },
      },
    },
    duration: "PT3M53S",
    viewCount: 5900000000,
  },
];

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
  const { title, videoOwnerChannelTitle, thumbnails } = videoData.snippet;
  const videoDuration = formatDuration(videoData.duration);

  // This template literal remains the same, but our function signature guarantees
  // that 'videoData' has the properties we need.
  return `
    <div class="playlist-video-item">
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
        </div>
      </div>
    </div>
  `;
}

/**
 * Helper function to find the top-level parent within the content container
 */
function findTopLevelParent(element: HTMLElement, container: HTMLElement): HTMLElement | null {
  let current = element;
  while (current.parentElement && current.parentElement !== container) {
    current = current.parentElement as HTMLElement;
  }
  return current.parentElement === container ? current : null;
}

/**
 * Fallback insertion method
 */
function insertWithFallback(contentContainer: HTMLElement, playlistWrapper: HTMLElement): void {
  const sections = contentContainer.children;
  const insertAfterIndex = Math.min(2, sections.length - 1);
  
  if (sections.length > insertAfterIndex) {
    contentContainer.insertBefore(playlistWrapper, sections[insertAfterIndex + 1]);
  } else {
    contentContainer.appendChild(playlistWrapper);
  }
  console.log("Custom playlist injected in content flow (fallback)! 🎉");
}

/**
 * Main function to inject the playlist onto the page - modified to place above Shorts within the content flow.
 */
function injectPlaylist(): void {
  // Check if our element already exists.
  if (document.getElementById("custom-playlist-container")) {
    return;
  }

  // Find the main content container that holds all the sections
  const contentContainer = document.querySelector<HTMLElement>(
    'ytd-rich-grid-renderer #contents, ytd-two-column-browse-results-renderer #primary #contents'
  );

  if (!contentContainer) {
    console.error("Could not find main content container.");
    return;
  }

  // Look for the Shorts section within the content container
  let shortsSection: HTMLElement | null = null;
  
  // Try multiple selectors for the Shorts section
  const shortsSelectors = [
    'ytd-rich-section-renderer[is-shorts]',
    'ytd-reel-shelf-renderer',
    'ytd-rich-shelf-renderer:has([title*="Shorts"])',
    '[aria-label*="Shorts"]'
  ];

  for (const selector of shortsSelectors) {
    shortsSection = contentContainer.querySelector<HTMLElement>(selector);
    if (shortsSection) break;
  }

  // If we can't find Shorts by selector, look for text content
  if (!shortsSection) {
    const allSections = contentContainer.querySelectorAll('ytd-rich-section-renderer, ytd-rich-shelf-renderer, ytd-reel-shelf-renderer');
    for (const section of allSections) {
      if (section.textContent?.toLowerCase().includes('shorts')) {
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
  shelfHeader.textContent = "Watch Later";
  playlistContainer.appendChild(shelfHeader);

  const videoGrid = document.createElement("div");
  videoGrid.className = "playlist-video-grid";

  // Populate the grid by mapping our typed data to HTML strings
  videoGrid.innerHTML = MOCK_WATCH_LATER_DATA.map(createVideoItemHTML).join("");

  playlistContainer.appendChild(videoGrid);
  playlistWrapper.appendChild(playlistContainer);

  if (shortsSection) {
    // Find the correct parent and insertion point
    const shortsParent = shortsSection.parentElement;
    
    if (shortsParent && shortsParent === contentContainer) {
      // Shorts section is a direct child - we can insert directly
      contentContainer.insertBefore(playlistWrapper, shortsSection);
      console.log("Custom playlist injected above Shorts section! 🎉");
    } else if (shortsParent) {
      // Shorts section is nested - insert before its parent container
      const topLevelParent = findTopLevelParent(shortsSection, contentContainer);
      if (topLevelParent && topLevelParent.parentElement === contentContainer) {
        contentContainer.insertBefore(playlistWrapper, topLevelParent);
        console.log("Custom playlist injected above Shorts parent section! 🎉");
      } else {
        // Fallback to appending
        contentContainer.appendChild(playlistWrapper);
        console.log("Custom playlist injected at end (complex Shorts structure)! 🎉");
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
 * Enhanced injection with better timing and fallback strategies
 */
function injectPlaylistWithObserver(): void {
  if (document.getElementById("custom-playlist-container")) {
    return;
  }

  // Try immediate injection first
  injectPlaylist();

  // If that fails, set up an observer to watch for content loading
  if (!document.getElementById("custom-playlist-container")) {
    const observer = new MutationObserver((mutations) => {
      // Check if we've already injected
      if (document.getElementById("custom-playlist-container")) {
        observer.disconnect();
        return;
      }

      // Look for new content being added
      for (const mutation of mutations) {
        if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
          // Try to inject again when new content is added
          setTimeout(() => {
            if (!document.getElementById("custom-playlist-container")) {
              injectPlaylist();
            }
          }, 100);
          break;
        }
      }
    });

    // Observe the main content area
    const mainContent = document.querySelector('ytd-browse[page-subtype="home"]') || document.body;
    observer.observe(mainContent, {
      childList: true,
      subtree: true
    });

    // Stop observing after 15 seconds
    setTimeout(() => observer.disconnect(), 15000);
  }
}

// Wait a bit longer for YouTube's SPA to load, then try injection
setTimeout(injectPlaylistWithObserver, 1000);