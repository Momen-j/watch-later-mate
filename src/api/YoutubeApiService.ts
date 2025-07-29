// Interface for basic playlist information (what is retrieve from the playlists endpoint)
interface PlaylistInfo {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  videoCount: number;
  privacy: "public" | "private" | "unlisted";
}

// Interface for raw playlist item from YouTube API
interface YoutubePlaylistItem {
  snippet: {
    resourceId: {
      videoId: string;
    };
    title: string;
    description: string;
    thumbnails: {
      high: {
        url: string;
      };
    };
    channelTitle: string;
    publishedAt: string;
  };
}

// Interface for video details from YouTube API
interface YoutubeVideoDetails {
  id: string;
  snippet: {
    title: string;
    channelTitle: string;
    publishedAt: string;
    categoryId: string;
    thumbnails: {
      high: {
        url: string;
      };
    };
  };
  contentDetails: {
    duration: string;
  };
  statistics: {
    viewCount: string;
  };
}

// vidoe interface with some extra metadata to help with filtering
interface Video {
  contentDetails: {
    videoId: string;
  };
  snippet: {
    title: string;
    videoOwnerChannelTitle: string;
    publishedAt: string;
    categoryId: string;
    categoryName: string; // Human-readable category name
    thumbnails: {
      high: {
        url: string;
      };
    };
  };
  duration: string;
  viewCount: number;
}

class YoutubeApiService {
  private readonly baseUrl = "https://www.googleapis.com/youtube/v3";
  private authToken: string;
  private categoryCache: Map<string, string> = new Map(); // cache for category ID -> name mapping

  constructor(authToken: string) {
    this.authToken = authToken;
  }

  /**
   * Updates the auth token (useful when token refreshes)
   */
  updateAuthToken(newToken: string) {
    this.authToken = newToken;
  }

  /**
   * Generic method to make authenticated requests to YouTube Api
   */
  private async makeApiRequest<T>(
    endpoint: string,
    params: Record<string, string> = {}
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}/${endpoint}`);

    // add params to url
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.append(key, value);
    });

    // make request to endpoint using inserted search params
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.authToken}`,
        Accept: "application/json",
      },
    });

    // if response isn't okay
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(
        `YouTube API Error: ${response.status} - ${
          errorData.error?.message || "Unknown error"
        }`
      );
    }

    return response.json();
  }

  /**
   * Fetches all user playlists (their own playlists, not subscriptions)
   */
  async getUserPlaylists(maxResults: number = 25): Promise<PlaylistInfo[]> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response: any = await this.makeApiRequest("playlists", {
        part: "snippet,contentDetails,status",
        mine: "true",
        maxResults: maxResults.toString(),
      });

      if (!response.items) {
        return [];
      }

      // transform into PlaylistInfo format
      return response.items.map(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (item: any): PlaylistInfo => ({
          id: item.id,
          title: item.snippet.title,
          description: item.description,
          thumbnailUrl:
            item.snippet.thumbnails?.high?.url ||
            item.snippet.thumbnails?.default?.url ||
            "",
          videoCount: item.contentDetails?.itemCount || 0,
          privacy: item.status?.privacyStatus || "private",
        })
      );
    } catch (error) {
      console.error("Failed to fetch user playlists", error);
      throw error;
    }
  }

  // DO I NEED THIS FUNCTION???
  /** Fetches YouTube video categories and caches them
   * Categories are region-specific, so default is US
   */
  async getVideoCategories(
    regionCode: string = "US"
  ): Promise<Map<string, string>> {
    try {
      // make call to videoCategories endpoint with US regionCde
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response = await this.makeApiRequest<any>("videoCategories", {
        part: "snippet",
        regionCode: regionCode,
      });

      const categoryMap = new Map<string, string>();

      // if we receive a response, assign each item within the response to the map
      // id as the key and category title as the value
      if (response.items) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        response.items.forEach((item: any) => {
          categoryMap.set(item.id, item.snippet.title);
        });
      }

      // cache the results with the categoryCache var
      this.categoryCache = categoryMap;
      return categoryMap;
    } catch (error) {
      console.error("Failed to fetch video categories", error);

      // in case API call fails
      return this.getDefaultCategories();
    }
  }

  /**
   * Returns default YouTube categories as fallback
   */
  private getDefaultCategories(): Map<string, string> {
    return new Map([
      ["1", "Film & Animation"],
      ["2", "Autos & Vehicles"],
      ["10", "Music"],
      ["15", "Pets & Animals"],
      ["17", "Sports"],
      ["19", "Travel & Events"],
      ["20", "Gaming"],
      ["22", "People & Blogs"],
      ["23", "Comedy"],
      ["24", "Entertainment"],
      ["25", "News & Politics"],
      ["26", "Howto & Style"],
      ["27", "Education"],
      ["28", "Science & Technology"],
      ["29", "Nonprofits & Activism"],
    ]);
  }

  // PROBABLY DONT NEED/WILL NEED TO MODIFY FUNCTION
  // WHY CALL API FOR CATEGORIES EVERYTIME IF I CAN JUST HAVE IT AS A STATIC VAR
  /**
   * Gets category name from ID, with caching
   */
  private async getCategoryName(categoryId: string): Promise<string> {
    // Check cache first
    if (this.categoryCache.has(categoryId)) {
      return this.categoryCache.get(categoryId)!;
    }

    // If cache is empty, populate it
    if (this.categoryCache.size === 0) {
      await this.getVideoCategories();
    }

    // Return from cache or fallback
    return this.categoryCache.get(categoryId) || "Unknown Category";
  }

  // Retrieve videos from a specific playlist
  async getPlaylistVideos(
    playlistId: string,
    maxResults: number = 50
  ): Promise<YoutubePlaylistItem[]> {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const response: { items: any } = await this.makeApiRequest(
        "playlistItems",
        {
          part: "snippet",
          playlistId: playlistId,
          maxResults: maxResults.toString(),
        }
      );

      return response.items || [];
    } catch (error) {
      console.error(
        `Failed to retrieve playlist videos for ${playlistId}`,
        error
      );
      throw error;
    }
  }

  /**
   * Fetches detailed information for multiple videos
   */
  async getVideoDetails(videoIds: string[]): Promise<YoutubeVideoDetails[]> {
    if (videoIds.length === 0) return [];

    try {
      // YouTube API allows up to 50 video IDs per req
      const chunks = this.chunkArray(videoIds, 50);
      const allVideoDetails: YoutubeVideoDetails[] = [];

      for (const chunk of chunks) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const response = await this.makeApiRequest<any>("videos", {
          part: "snippet,contentDetails,statistics",
          id: chunk.join(","),
        });

        if (response.items) {
          allVideoDetails.push(...response.items);
        }
      }

      return allVideoDetails;
    } catch (error) {
      console.error("Failed to fetch video details", error);
      throw error;
    }
  }

  /**
   * Main method: Gets a complete playlist with full video details
   * Combines playlist items + video details + categories into Videos interface
   */
  async getCompletePlaylistData(
    playlistId: string,
    maxResults: number = 50
  ): Promise<Video[]> {
    try {
      // Step 1: Get playlist items
      const playlistItems = await this.getPlaylistVideos(
        playlistId,
        maxResults
      );

      if (playlistItems.length === 0) {
        return [];
      }

      // Step 2: Extract video IDs
      const videoIds = playlistItems.map(
        (item) => item.snippet.resourceId.videoId
      );

      // Step 3: Get detailed video info
      const videoDetails = await this.getVideoDetails(videoIds);

      // REMOVE ANY CODE INVOLVING THIS STEP AFTER DBL CHECK
      // Step 4: Ensure category data is cached
      if (this.categoryCache.size === 0) {
        await this.getVideoCategories();
      }

      // Step 5: combine data to match Video interface
      return await this.transformToVideoInterface(playlistItems, videoDetails);
    } catch (error) {
      console.error(
        `Failed to get complete playlist data for ${playlistId}`,
        error
      );
      throw error;
    }
  }

  /**
   * Transforms YouTube API data into video interface
   */
  private async transformToVideoInterface(
    playlistItems: YoutubePlaylistItem[],
    videoDetails: YoutubeVideoDetails[]
  ): Promise<Video[]> {
    // map for quick video detail lookups
    const videoDetailsMap = new Map(
      videoDetails.map((video) => [video.id, video])
    );

    const transformedVideos: (Video | null)[] = await Promise.all(
      playlistItems.map(async (item) => {
        const videoId = item.snippet.resourceId.videoId;
        const details = videoDetailsMap.get(videoId);

        // skip video where details couldn't be retrieved (might be privated/deleted)
        if (!details) {
          console.warn(`No details found for video ${videoId}, skipping`);
          return null;
        }

        // get category name
        const categoryName = await this.getCategoryName(
          details.snippet.categoryId
        );

        return {
          contentDetails: {
            videoId: videoId,
          },
          snippet: {
            title: details.snippet.title,
            videoOwnerChannelTitle: details.snippet.channelTitle,
            publishedAt: details.snippet.publishedAt,
            categoryId: details.snippet.categoryId,
            categoryName: categoryName,
            thumbnails: {
              high: {
                url:
                  details.snippet.thumbnails?.high
                    ?.url /*|| details.snippet.thumbnails?.default?.url*/ || "",
              },
            },
          },
          duration: details.contentDetails.duration,
          viewCount: parseInt(details.statistics.viewCount) || 0,
        };
      })
    );

    // look into what this code is doing with the "video is Video => video" part
    // remove null entries
    return transformedVideos.filter((video): video is Video => video !== null);
  }

  // REVIEW METHOD
  /**
   * Utility method to chunk array (for API request batching)
   */
  private chunkArray<T>(array: T[], chunkSize: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += chunkSize) {
      chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
  }

  /**
   * Get the "Watch Later" playlist
   * Has a special playlist ID that's the same across all users
   */
  async getLikedVideosPlaylist(maxResults: number = 50): Promise<Video[]> {
    console.log("Fetching Liked Videos playlist...");

    try {
      return await this.getCompletePlaylistData("LL", maxResults);
    } catch (error) {
      console.error("Liked Videos fetch failed:", error);
      return [];
    }
  }
}

export { YoutubeApiService };
export type { PlaylistInfo, Video };
