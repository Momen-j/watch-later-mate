import { useState, useEffect } from "react";

const YOUTUBE_CATEGORIES = [
  "Film & Animation",
  "Autos & Vehicles",
  "Music",
  "Pets & Animals",
  "Sports",
  "Travel & Events",
  "Gaming",
  "People & Blogs",
  "Comedy",
  "Entertainment",
  "News & Politics",
  "Howto & Style",
  "Education",
  "Science & Technology",
  "Nonprofits & Activism",
];

interface PlaylistInfo {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  videoCount: number;
  privacy: "public" | "private" | "unlisted";
}

interface PlaylistFilterSortSettings {
  filters: {
    viewCount: { min: number | null; max: number | null };
    likeCount: { min: number | null; max: number | null }; // NEW
    commentCount: { min: number | null; max: number | null }; // NEW
    uploadDate: "all" | "week" | "month" | "year";
    duration: { min: number | null; max: number | null };
    channels: string[];
    categories: string[]; // NEW
    keywords: string;
  };
  sort: {
    by:
      | "default"
      | "views"
      | "likes"
      | "comments"
      | "date"
      | "duration"
      | "title"
      | "channel"
      | "random";
    direction: "asc" | "desc";
  };
}

interface SelectedPlaylistSettings {
  playlistIds: string[];
  maxPlaylists: number;
  playlistSettings: Record<string, PlaylistFilterSortSettings>; // Per-playlist settings
}

const CategoryDropdown = ({
  selectedCategories,
  onCategoryChange,
}: {
  selectedCategories: string[];
  onCategoryChange: (categories: string[]) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const toggleCategory = (category: string) => {
    if (selectedCategories.includes(category)) {
      onCategoryChange(selectedCategories.filter((c) => c !== category));
    } else {
      onCategoryChange([...selectedCategories, category]);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: "4px",
          border: "1px solid #ccc",
          borderRadius: "3px",
          fontSize: "11px",
          cursor: "pointer",
          backgroundColor: "#3B3B3B",
          color: "white",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>
          {selectedCategories.length === 0
            ? "All categories"
            : `${selectedCategories.length} selected`}
        </span>
        <span>{isOpen ? "▲" : "▼"}</span>
      </div>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            backgroundColor: "#3B3B3B",
            color: "white",
            border: "1px solid #ccc",
            borderRadius: "3px",
            maxHeight: "150px",
            overflowY: "auto",
            zIndex: 1000,
            fontSize: "10px",
          }}
        >
          {YOUTUBE_CATEGORIES.map((category) => (
            <label
              key={category}
              style={{
                display: "block",
                padding: "4px 6px",
                cursor: "pointer",
                borderBottom: "1px solid #eee",
              }}
            >
              <input
                type="checkbox"
                checked={selectedCategories.includes(category)}
                onChange={() => toggleCategory(category)}
                style={{ marginRight: "6px", fontSize: "10px" }}
              />
              {category}
            </label>
          ))}
        </div>
      )}
    </div>
  );
};

const UploadDateDropdown = ({
  selectedDate,
  onDateChange,
}: {
  selectedDate: string;
  onDateChange: (date: string) => void;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const dateOptions = [
    { value: "all", label: "All time" },
    { value: "week", label: "Last week" },
    { value: "month", label: "Last month" },
    { value: "year", label: "Last year" },
  ];

  const selectedLabel =
    dateOptions.find((opt) => opt.value === selectedDate)?.label || "All time";

  return (
    <div style={{ position: "relative" }}>
      <div
        onClick={() => setIsOpen(!isOpen)}
        style={{
          padding: "4px",
          border: "1px solid #ccc",
          borderRadius: "3px",
          fontSize: "11px",
          cursor: "pointer",
          backgroundColor: "#3B3B3B",
          color: "white",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span>{selectedLabel}</span>
        <span style={{ color: "white" }}>{isOpen ? "▲" : "▼"}</span>
      </div>

      {isOpen && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            backgroundColor: "#3B3B3B",
            color: "white",
            border: "1px solid #ccc",
            borderRadius: "3px",
            zIndex: 1000,
            fontSize: "11px",
          }}
        >
          {dateOptions.map((option) => (
            <div
              key={option.value}
              onClick={() => {
                onDateChange(option.value);
                setIsOpen(false);
              }}
              style={{
                padding: "4px 6px",
                cursor: "pointer",
                borderBottom: "1px solid #eee",
                color: "white",
              }}
            >
              {option.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

function App() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [playlists, setPlaylists] = useState<PlaylistInfo[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([]);
  const [savedSettings, setSavedSettings] =
    useState<SelectedPlaylistSettings | null>(null);
  const [playlistSettings, setPlaylistSettings] = useState<
    Record<string, PlaylistFilterSortSettings>
  >({});
  const [expandedPlaylistId, setExpandedPlaylistId] = useState<string | null>(
    null
  );
  const [playlistSearchTerm, setPlaylistSearchTerm] = useState<string>("");
  const [saveTimeout, setSaveTimeout] = useState<NodeJS.Timeout | null>(null);

  // Check for existing auth token and settings on popup load
  useEffect(() => {
    const loadInitialData = async () => {
      try {
        // Get auth token
        chrome.runtime.sendMessage(
          { type: "GET_AUTH_TOKEN" },
          async (response) => {
            if (chrome.runtime.lastError) {
              console.error(
                "Error getting auth token:",
                chrome.runtime.lastError.message
              );
              setAuthToken(null);
            } else if (response && response.token) {
              console.log("Found existing auth token");
              setAuthToken(response.token);
              // Auto-load playlists if we have a token
              await loadUserPlaylists(response.token);
            } else {
              console.log("No existing auth token found");
              setAuthToken(null);
            }
            setIsLoading(false);
          }
        );

        // Get saved playlist selection and per-playlist settings
        chrome.storage.local.get(["selectedPlaylists"], (result) => {
          if (result.selectedPlaylists) {
            setSavedSettings(result.selectedPlaylists);
            setSelectedPlaylistIds(result.selectedPlaylists.playlistIds || []);

            // Load per-playlist settings if they exist
            if (result.selectedPlaylists.playlistSettings) {
              setPlaylistSettings(result.selectedPlaylists.playlistSettings);
            }
          }
        });
      } catch (error) {
        console.error("Error loading initial data:", error);
        setIsLoading(false);
      }
    };

    loadInitialData();
  }, []);

  // Function to handle the sign-in process
  const handleSignIn = () => {
    setIsLoading(true);

    // Clear the manual sign-out flag
  chrome.storage.local.remove(['manualSignOut']);

    chrome.identity.getAuthToken({ interactive: true }, (authResult) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Authentication failed:",
          chrome.runtime.lastError.message
        );
        setAuthToken(null);
        setIsLoading(false);
        return;
      }

      let token: string | undefined;
      if (typeof authResult === "string") {
        token = authResult;
      } else if (authResult && typeof authResult.token === "string") {
        token = authResult.token;
      }

      if (token) {
        console.log("Authentication successful!");
        // Don't store token manually - Chrome handles it
        setAuthToken(token);
        loadUserPlaylists(token);
      } else {
        console.error(
          "Authentication failed: No token was granted by the user."
        );
        setAuthToken(null);
      }
      setIsLoading(false);
    });
};

  // Function to sign out
  const handleSignOut = () => {
  // Clear local state immediately
  setAuthToken(null);
  setPlaylists([]);
  setSelectedPlaylistIds([]);
  setSavedSettings(null);
  setPlaylistSettings({});

  // Set a flag that user manually signed out
  chrome.storage.local.set({ manualSignOut: true });

  // Clear tokens in background and wait for completion
  chrome.runtime.sendMessage({ type: "CLEAR_AUTH_TOKEN" }, () => {
    if (chrome.runtime.lastError) {
      console.error("Error clearing auth token:", chrome.runtime.lastError.message);
    } else {
      console.log("Successfully signed out");
    }
    
  });

  // Clear saved playlist settings
  chrome.storage.local.remove(["selectedPlaylists"]);
};

  // Function to load user's playlists
  const loadUserPlaylists = async (token: string) => {
    setIsLoadingPlaylists(true);

    try {
      const playlistsResponse = await fetch(
        "https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails,status&mine=true&maxResults=25",
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const playlistsData = await playlistsResponse.json();

      if (playlistsData.error) {
        console.error(
          "API Error fetching playlists:",
          playlistsData.error.message
        );
        setPlaylists([]);
        return;
      }

      let likedVideosCount = 0;
      try {
        const likedVideosResponse = await fetch(
          "https://www.googleapis.com/youtube/v3/playlistItems?part=id&playlistId=LL&maxResults=1",
          {
            headers: { Authorization: `Bearer ${token}` },
          }
        );
        const likedVideosData = await likedVideosResponse.json();
        likedVideosCount = likedVideosData.pageInfo?.totalResults || 0;
      } catch (error) {
        console.warn("Could not fetch Liked Videos count:", error);
      }

      // Create Liked Videos playlist entry with real count
      const likedVideosPlaylist: PlaylistInfo = {
        id: "LL",
        title: "Liked Videos",
        description: "Videos you've liked",
        thumbnailUrl: "",
        videoCount: likedVideosCount,
        privacy: "private",
      };

      if (playlistsData.items && playlistsData.items.length > 0) {
        const formattedPlaylists: PlaylistInfo[] = playlistsData.items.map(
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (item: any) => ({
            id: item.id,
            title: item.snippet.title,
            description: item.snippet.description || "",
            thumbnailUrl:
              item.snippet.thumbnails?.high?.url ||
              item.snippet.thumbnails?.default?.url ||
              "",
            videoCount: item.contentDetails?.itemCount || 0,
            privacy: item.status?.privacyStatus || "private",
          })
        );

        // Add Watch Later as the first option
        setPlaylists([likedVideosPlaylist, ...formattedPlaylists]);
      } else {
        // Even if no regular playlists, still show Watch Later
        setPlaylists([likedVideosPlaylist]);
      }
    } catch (error) {
      console.error("Failed to fetch playlists:", error);
      setPlaylists([]);
    } finally {
      setIsLoadingPlaylists(false);
    }
  };

  // Handle playlist selection
  const handlePlaylistToggle = (playlistId: string) => {
    setSelectedPlaylistIds((prev) => {
      if (prev.includes(playlistId)) {
        return prev.filter((id) => id !== playlistId);
      } else {
        // Limit to 3 playlists for free tier (can be made configurable)
        if (prev.length >= 3) {
          alert(
            "Maximum 3 playlists allowed. Upgrade for unlimited playlists!"
          );
          return prev;
        }
        return [...prev, playlistId];
      }
    });
  };

  // Save playlist selection
  const savePlaylistSelection = () => {
    const settings: SelectedPlaylistSettings = {
      playlistIds: selectedPlaylistIds,
      maxPlaylists: 3,
      playlistSettings: playlistSettings,
    };

    chrome.storage.local.set({ selectedPlaylists: settings }, () => {
      if (chrome.runtime.lastError) {
        console.error(
          "Failed to save playlist selection:",
          chrome.runtime.lastError
        );
        alert("Failed to save settings. Please try again.");
      } else {
        setSavedSettings(settings);
        alert("Playlist selection saved! Refresh YouTube to see changes.");
      }
    });
  };

  // Clear all selections
  const clearAllSelections = () => {
    setSelectedPlaylistIds([]);
    setPlaylistSettings({});
    setExpandedPlaylistId(null);
    chrome.storage.local.remove(["selectedPlaylists"], () => {
      setSavedSettings(null);
    });
  };

  if (isLoading) {
    return (
      <div className="App">
        <header className="App-header">
          <h2>Playlist Pal</h2>
          <p>Loading...</p>
        </header>
      </div>
    );
  }

  // Get default filter/sort settings
  const getDefaultSettings = (): PlaylistFilterSortSettings => ({
    filters: {
      viewCount: { min: null, max: null },
      likeCount: { min: null, max: null },
      commentCount: { min: null, max: null },
      uploadDate: "all",
      duration: { min: null, max: null },
      channels: [],
      categories: [], // NEW
      keywords: "",
    },
    sort: {
      by: "default",
      direction: "desc",
    },
  });

  // Filter playlists based on search term
  const filteredPlaylists = playlists.filter((playlist) =>
    playlist.title.toLowerCase().includes(playlistSearchTerm.toLowerCase())
  );

  // Replace updatePlaylistSetting function with debounced version
  const updatePlaylistSetting = (
    playlistId: string,
    settingPath: string[],
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    value: any
  ) => {
    // Update local state immediately (for UI responsiveness)
    setPlaylistSettings((prev) => {
      const currentSettings = prev[playlistId] || getDefaultSettings();
      const newSettings = { ...currentSettings };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let target: any = newSettings;
      for (let i = 0; i < settingPath.length - 1; i++) {
        target = target[settingPath[i]];
      }
      target[settingPath[settingPath.length - 1]] = value;

      const updatedSettings = { ...prev, [playlistId]: newSettings };

      // Clear existing timeout
      if (saveTimeout) {
        clearTimeout(saveTimeout);
      }

      // Set new timeout to save after 1 second of no changes
      const newTimeout = setTimeout(() => {
        const storageSettings: SelectedPlaylistSettings = {
          playlistIds: selectedPlaylistIds,
          maxPlaylists: 3,
          playlistSettings: updatedSettings,
        };

        chrome.storage.local.set({ selectedPlaylists: storageSettings }, () => {
          if (!chrome.runtime.lastError) {
            setSavedSettings(storageSettings);
            console.log(`Debounced save for playlist: ${playlistId}`);
          }
        });
      }, 1000);

      setSaveTimeout(newTimeout);
      return updatedSettings;
    });
  };

  // Reset settings for a specific playlist
  const resetPlaylistSettings = (playlistId: string) => {
    setPlaylistSettings((prev) => {
      const updatedSettings = { ...prev };
      delete updatedSettings[playlistId];

      // Save to storage immediately
      const storageSettings: SelectedPlaylistSettings = {
        playlistIds: selectedPlaylistIds,
        maxPlaylists: 3,
        playlistSettings: updatedSettings,
      };

      chrome.storage.local.set({ selectedPlaylists: storageSettings }, () => {
        if (!chrome.runtime.lastError) {
          setSavedSettings(storageSettings);
          console.log(`Reset settings for playlist: ${playlistId}`);
        }
      });

      return updatedSettings;
    });
  };

  // Get settings for a specific playlist (or defaults) - with proper merging
  const getPlaylistSettings = (
    playlistId: string
  ): PlaylistFilterSortSettings => {
    const storedSettings = playlistSettings[playlistId];
    const defaults = getDefaultSettings();

    if (!storedSettings) {
      return defaults;
    }

    // Deep merge stored settings with defaults to handle missing properties
    return {
      filters: {
        viewCount:
          storedSettings.filters?.viewCount || defaults.filters.viewCount,
        likeCount:
          storedSettings.filters?.likeCount || defaults.filters.likeCount,
        commentCount:
          storedSettings.filters?.commentCount || defaults.filters.commentCount,
        uploadDate:
          storedSettings.filters?.uploadDate || defaults.filters.uploadDate,
        duration: storedSettings.filters?.duration || defaults.filters.duration,
        channels: storedSettings.filters?.channels || defaults.filters.channels,
        categories:
          storedSettings.filters?.categories || defaults.filters.categories,
        keywords: storedSettings.filters?.keywords || defaults.filters.keywords,
      },
      sort: {
        by: storedSettings.sort?.by || defaults.sort.by,
        direction: storedSettings.sort?.direction || defaults.sort.direction,
      },
    };
  };

  // Check if playlist has custom settings that are actually active
const hasCustomSettings = (playlistId: string): boolean => {
  const storedSettings = playlistSettings[playlistId];
  if (!storedSettings) return false;
  
  const defaults = getDefaultSettings();
  
  // Check if any filters are different from defaults
  const filters = storedSettings.filters;
  
  // Keywords filter
  if (filters.keywords && filters.keywords.trim() !== '') return true;
  
  // View count filter
  if (filters.viewCount.min !== defaults.filters.viewCount.min || 
      filters.viewCount.max !== defaults.filters.viewCount.max) return true;
  
  // Like count filter
  if (filters.likeCount.min !== defaults.filters.likeCount.min || 
      filters.likeCount.max !== defaults.filters.likeCount.max) return true;
  
  // Comment count filter
  if (filters.commentCount.min !== defaults.filters.commentCount.min || 
      filters.commentCount.max !== defaults.filters.commentCount.max) return true;
  
  // Duration filter
  if (filters.duration.min !== defaults.filters.duration.min || 
      filters.duration.max !== defaults.filters.duration.max) return true;
  
  // Upload date filter
  if (filters.uploadDate !== defaults.filters.uploadDate) return true;
  
  // Categories filter
  if (filters.categories.length > 0) return true;
  
  // Channels filter
  if (filters.channels.length > 0) return true;
  
  // Sort settings
  if (storedSettings.sort.by !== defaults.sort.by || 
      storedSettings.sort.direction !== defaults.sort.direction) return true;
  
  return false;
};

  return (
    <div className="App" style={{ 
      width: "400px", 
      padding: "16px", 
      overflow: "hidden", 
      height: !authToken || playlists.length === 0 ? "120px" : "550px"
    }}>
      <header className="App-header">
        <h2>Playlist Pal</h2>

        {!authToken ? (
          <div>
            <p>Sign in to choose playlists for your YouTube homepage</p>
            <button onClick={handleSignIn}>Sign In with Google</button>
          </div>
        ) : (
          <div>
            <div
              style={{
                marginBottom: "16px",
                borderBottom: "1px solid #eee",
                paddingBottom: "16px",
              }}
            >
              <button onClick={handleSignOut} style={{ marginRight: "8px" }}>
                Sign Out
              </button>
              <button onClick={() => authToken && loadUserPlaylists(authToken)}>
                Refresh Playlists
              </button>
            </div>

            {/* Loading state */}
            {isLoadingPlaylists && <p>Loading playlists...</p>}

            {/* Empty state */}
            {!isLoadingPlaylists && playlists.length === 0 && (
              <p>No playlists found. Create some playlists on YouTube first!</p>
            )}

            {/* Playlist Selection Section - Only show when playlists are loaded */}
            {!isLoadingPlaylists && playlists.length > 0 && (
              <div style={{ marginBottom: "16px" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "12px",
                  }}
                >
                  <h3 style={{ margin: 0 }}>Choose Playlists to Display</h3>

                  <div style={{ display: "flex", gap: "8px" }}>
                    <button
                      onClick={
                        selectedPlaylistIds.length > 0
                          ? savePlaylistSelection
                          : clearAllSelections
                      }
                      disabled={false}
                      style={{
                        padding: "6px 12px",
                        backgroundColor:
                          selectedPlaylistIds.length > 0
                            ? "#1976d2"
                            : "#f44336",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                        fontSize: "11px",
                      }}
                    >
                      {selectedPlaylistIds.length > 0
                        ? `Save (${selectedPlaylistIds.length})`
                        : "Clear All"}
                    </button>

                    {selectedPlaylistIds.length > 0 && (
                      <button
                        onClick={clearAllSelections}
                        style={{
                          padding: "6px 12px",
                          backgroundColor: "#f44336",
                          color: "white",
                          border: "none",
                          borderRadius: "4px",
                          cursor: "pointer",
                          fontSize: "11px",
                        }}
                      >
                        Clear All
                      </button>
                    )}
                  </div>
                </div>

                {/* Live Search Bar */}
                <div style={{ marginBottom: "12px" }}>
                  <input
                    type="text"
                    value={playlistSearchTerm}
                    onChange={(e) => setPlaylistSearchTerm(e.target.value)}
                    placeholder="Search playlists..."
                    style={{
                      width: "100%",
                      padding: "8px",
                      border: "1px solid #ccc",
                      borderRadius: "4px",
                      boxSizing: "border-box",
                      fontSize: "14px",
                    }}
                  />
                </div>

                <div>
  <div
    style={{
      maxHeight: "330px",
      overflowY: "auto",
      border: "1px solid #ddd",
      borderRadius: "4px",
      padding: "8px",
    }}
  >
    {filteredPlaylists.length > 0 ? (
      filteredPlaylists.map((playlist) => {
        const isSelected = selectedPlaylistIds.includes(
          playlist.id
        );
        const isExpanded = expandedPlaylistId === playlist.id;
        const settings = getPlaylistSettings(playlist.id);
        const hasCustom = hasCustomSettings(playlist.id);

        return (
          <div key={playlist.id} style={{ marginBottom: "8px" }}>
            {/* Playlist Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                padding: "8px",
                backgroundColor: isSelected
                  ? "#0f1010ff"
                  : "#090707ff",
                border: `1px solid ${
                  isSelected ? "#1976d2" : "#eee"
                }`,
                borderRadius: "4px",
              }}
            >
              <input
                type="checkbox"
                checked={isSelected}
                onChange={() => handlePlaylistToggle(playlist.id)}
                style={{ marginRight: "8px" }}
              />

              <div style={{ flex: 1 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  <strong>{playlist.title}</strong>
                  {hasCustom && (
                    <span
                      style={{
                        fontSize: "10px",
                        backgroundColor: "#1976d2",
                        color: "white",
                        padding: "2px 6px",
                        borderRadius: "3px",
                      }}
                    >
                      FILTERED
                    </span>
                  )}
                </div>
                <div style={{ fontSize: "12px", color: "#666" }}>
                  {playlist.videoCount} videos •{" "}
                  {playlist.privacy}
                </div>
              </div>

              {isSelected && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setExpandedPlaylistId(
                      isExpanded ? null : playlist.id
                    );
                  }}
                  style={{
                    padding: "4px 8px",
                    backgroundColor: "transparent",
                    border: "1px solid #ccc",
                    borderRadius: "3px",
                    cursor: "pointer",
                    fontSize: "12px",
                  }}
                >
                  ⚙️ {isExpanded ? "Hide" : "Filter/Sort"}
                </button>
              )}
            </div>

            {/* Expanded Filter/Sort Controls */}
            {isSelected && isExpanded && (
              <div
                style={{
                  marginTop: "8px",
                  padding: "12px",
                  backgroundColor: "#171515ff",
                  border: "1px solid #ddd",
                  borderRadius: "4px",
                }}
              >
                {/* Filters */}
                <div style={{ marginBottom: "12px" }}>
                  <h5
                    style={{
                      margin: "0 0 6px 0",
                      fontSize: "12px",
                    }}
                  >
                    Filters
                  </h5>

                  {/* Keywords */}
                  <div style={{ display: "flex", gap: "6px", marginBottom: "8px" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "11px",
                          marginBottom: "2px",
                        }}
                      >
                        Keywords:
                      </label>
                      <input
                        type="text"
                        value={settings.filters.keywords}
                        onChange={(e) =>
                          updatePlaylistSetting(
                            playlist.id,
                            ["filters", "keywords"],
                            e.target.value
                          )
                        }
                        placeholder="Search in titles..."
                        style={{
                          width: "100%",
                          padding: "4px",
                          border: "1px solid #ccc",
                          borderRadius: "3px",
                          fontSize: "11px",
                          boxSizing: "border-box"
                        }}
                      />
                    </div>
                  </div>

                  {/* Upload Date & Category Row */}
                  <div
                    style={{
                      display: "flex",
                      gap: "4px",
                      marginBottom: "8px",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "11px",
                          marginBottom: "2px",
                        }}
                      >
                        Upload date:
                      </label>
                      <UploadDateDropdown
                        selectedDate={settings.filters.uploadDate}
                        onDateChange={(date) =>
                          updatePlaylistSetting(
                            playlist.id,
                            ["filters", "uploadDate"],
                            date
                          )
                        }
                      />
                    </div>

                    <div style={{ flex: 1 }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "11px",
                          marginBottom: "2px",
                        }}
                      >
                        Category:
                      </label>
                      <CategoryDropdown
                        selectedCategories={
                          settings.filters.categories
                        }
                        onCategoryChange={(categories) =>
                          updatePlaylistSetting(
                            playlist.id,
                            ["filters", "categories"],
                            categories
                          )
                        }
                      />
                    </div>
                  </div>

                  {/* View Count & Like Count Row */}
                  <div
                    style={{
                      display: "flex",
                      gap: "6px",
                      marginBottom: "8px",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "11px",
                          marginBottom: "2px",
                        }}
                      >
                        View count:
                      </label>
                      <div
                        style={{
                          display: "flex",
                          gap: "2px",
                          alignItems: "center",
                        }}
                      >
                        <input
                          type="number"
                          value={
                            settings.filters.viewCount.min || ""
                          }
                          onChange={(e) =>
                            updatePlaylistSetting(
                              playlist.id,
                              ["filters", "viewCount", "min"],
                              e.target.value === ""
                                ? null
                                : parseInt(e.target.value) || null
                            )
                          }
                          placeholder="Min"
                          style={{
                            width: "100%",
                            minWidth: "0",
                            padding: "3px",
                            border: "1px solid #ccc",
                            borderRadius: "3px",
                            fontSize: "10px",
                            boxSizing: "border-box",
                          }}
                        />
                        <span
                          style={{
                            fontSize: "9px",
                            flexShrink: 0,
                          }}
                        >
                          to
                        </span>
                        <input
                          type="number"
                          value={
                            settings.filters.viewCount.max || ""
                          }
                          onChange={(e) =>
                            updatePlaylistSetting(
                              playlist.id,
                              ["filters", "viewCount", "max"],
                              e.target.value
                                ? parseInt(e.target.value)
                                : null
                            )
                          }
                          placeholder="Max"
                          style={{
                            width: "100%",
                            minWidth: "0",
                            padding: "3px",
                            border: "1px solid #ccc",
                            borderRadius: "3px",
                            fontSize: "10px",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "11px",
                          marginBottom: "2px",
                        }}
                      >
                        Like count:
                      </label>
                      <div
                        style={{
                          display: "flex",
                          gap: "2px",
                          alignItems: "center",
                        }}
                      >
                        <input
                          type="number"
                          value={
                            settings.filters.likeCount.min || ""
                          }
                          onChange={(e) =>
                            updatePlaylistSetting(
                              playlist.id,
                              ["filters", "likeCount", "min"],
                              parseInt(e.target.value) || 0
                            )
                          }
                          placeholder="Min"
                          style={{
                            width: "100%",
                            minWidth: "0",
                            padding: "3px",
                            border: "1px solid #ccc",
                            borderRadius: "3px",
                            fontSize: "10px",
                            boxSizing: "border-box",
                          }}
                        />
                        <span
                          style={{
                            fontSize: "9px",
                            flexShrink: 0,
                          }}
                        >
                          to
                        </span>
                        <input
                          type="number"
                          value={
                            settings.filters.likeCount.max || ""
                          }
                          onChange={(e) =>
                            updatePlaylistSetting(
                              playlist.id,
                              ["filters", "likeCount", "max"],
                              e.target.value
                                ? parseInt(e.target.value)
                                : null
                            )
                          }
                          placeholder="Max"
                          style={{
                            width: "100%",
                            minWidth: "0",
                            padding: "3px",
                            border: "1px solid #ccc",
                            borderRadius: "3px",
                            fontSize: "10px",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Duration & Comment Count Row */}
                  <div
                    style={{
                      display: "flex",
                      gap: "6px",
                      marginBottom: "8px",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "11px",
                          marginBottom: "2px",
                        }}
                      >
                        Duration (min):
                      </label>
                      <div
                        style={{
                          display: "flex",
                          gap: "2px",
                          alignItems: "center",
                        }}
                      >
                        <input
                          type="number"
                          value={
                            settings.filters.duration.min
                              ? Math.floor(
                                  settings.filters.duration.min /
                                    60
                                )
                              : ""
                          }
                          onChange={(e) =>
                            updatePlaylistSetting(
                              playlist.id,
                              ["filters", "duration", "min"],
                              (parseInt(e.target.value) || 0) * 60
                            )
                          }
                          placeholder="Min"
                          style={{
                            width: "100%",
                            minWidth: "0",
                            padding: "3px",
                            border: "1px solid #ccc",
                            borderRadius: "3px",
                            fontSize: "10px",
                            boxSizing: "border-box",
                          }}
                        />
                        <span
                          style={{
                            fontSize: "9px",
                            flexShrink: 0,
                          }}
                        >
                          to
                        </span>
                        <input
                          type="number"
                          value={
                            settings.filters.duration.max
                              ? Math.floor(
                                  settings.filters.duration.max /
                                    60
                                )
                              : ""
                          }
                          onChange={(e) =>
                            updatePlaylistSetting(
                              playlist.id,
                              ["filters", "duration", "max"],
                              e.target.value
                                ? parseInt(e.target.value) * 60
                                : null
                            )
                          }
                          placeholder="Max"
                          style={{
                            width: "100%",
                            minWidth: "0",
                            padding: "3px",
                            border: "1px solid #ccc",
                            borderRadius: "3px",
                            fontSize: "10px",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                    </div>

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <label
                        style={{
                          display: "block",
                          fontSize: "11px",
                          marginBottom: "2px",
                        }}
                      >
                        Comments:
                      </label>
                      <div
                        style={{
                          display: "flex",
                          gap: "2px",
                          alignItems: "center",
                        }}
                      >
                        <input
                          type="number"
                          value={
                            settings.filters.commentCount.min ||
                            ""
                          }
                          onChange={(e) =>
                            updatePlaylistSetting(
                              playlist.id,
                              ["filters", "commentCount", "min"],
                              parseInt(e.target.value) || 0
                            )
                          }
                          placeholder="Min"
                          style={{
                            width: "100%",
                            minWidth: "0",
                            padding: "3px",
                            border: "1px solid #ccc",
                            borderRadius: "3px",
                            fontSize: "10px",
                            boxSizing: "border-box",
                          }}
                        />
                        <span
                          style={{
                            fontSize: "9px",
                            flexShrink: 0,
                          }}
                        >
                          to
                        </span>
                        <input
                          type="number"
                          value={
                            settings.filters.commentCount.max ||
                            ""
                          }
                          onChange={(e) =>
                            updatePlaylistSetting(
                              playlist.id,
                              ["filters", "commentCount", "max"],
                              e.target.value
                                ? parseInt(e.target.value)
                                : null
                            )
                          }
                          placeholder="Max"
                          style={{
                            width: "100%",
                            minWidth: "0",
                            padding: "3px",
                            border: "1px solid #ccc",
                            borderRadius: "3px",
                            fontSize: "10px",
                            boxSizing: "border-box",
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Sort */}
                <div style={{ marginBottom: "12px" }}>
                  <h5
                    style={{
                      margin: "0 0 6px 0",
                      fontSize: "12px",
                    }}
                  >
                    Sort
                  </h5>

                  <div style={{ display: "flex", gap: "4px" }}>
                    <div style={{ flex: 2 }}>
                      <select
                        value={settings.sort.by}
                        onChange={(e) =>
                          updatePlaylistSetting(
                            playlist.id,
                            ["sort", "by"],
                            e.target.value
                          )
                        }
                        style={{
                          width: "100%",
                          padding: "4px",
                          border: "1px solid #ccc",
                          borderRadius: "3px",
                          fontSize: "11px",
                        }}
                      >
                        <option value="default">
                          Original order
                        </option>
                        <option value="views">View count</option>
                        <option value="likes">Like count</option>
                        <option value="comments">
                          Comment count
                        </option>
                        <option value="date">Upload date</option>
                        <option value="duration">Duration</option>
                        <option value="title">Title (A-Z)</option>
                        <option value="channel">
                          Channel name
                        </option>
                        <option value="random">Random</option>
                      </select>
                    </div>

                    {settings.sort.by !== "default" &&
                      settings.sort.by !== "random" && (
                        <div style={{ flex: 1 }}>
                          <select
                            value={settings.sort.direction}
                            onChange={(e) =>
                              updatePlaylistSetting(
                                playlist.id,
                                ["sort", "direction"],
                                e.target.value
                              )
                            }
                            style={{
                              width: "100%",
                              padding: "4px",
                              border: "1px solid #ccc",
                              borderRadius: "3px",
                              fontSize: "11px",
                            }}
                          >
                            <option value="desc">
                              ↓ High-Low
                            </option>
                            <option value="asc">
                              ↑ Low-High
                            </option>
                          </select>
                        </div>
                      )}
                  </div>
                </div>

                {/* Reset Button */}
                <button
                  onClick={() => {
                    resetPlaylistSettings(playlist.id);
                    setExpandedPlaylistId(null);
                  }}
                  style={{
                    padding: "4px 8px",
                    backgroundColor: "#757575",
                    color: "white",
                    border: "none",
                    borderRadius: "3px",
                    cursor: "pointer",
                    fontSize: "11px",
                  }}
                >
                  Reset to Default
                </button>
              </div>
            )}
          </div>
        );
      })
    ) : (
      <div style={{ 
        textAlign: "center", 
        padding: "20px", 
        color: "#666",
        fontSize: "14px" 
      }}>
        {playlistSearchTerm ? 
          `No playlists found matching "${playlistSearchTerm}"` : 
          "No playlists to display"
        }
      </div>
    )}
  </div>

  {/* Saved Settings Indicator */}
  {savedSettings && <></>}
</div>
              </div>
            )}
          </div>
        )}
      </header>
    </div>
  );
}

export default App;
