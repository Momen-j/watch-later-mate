import { useState, useEffect } from "react";

interface PlaylistInfo {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  videoCount: number;
  privacy: "public" | "private" | "unlisted";
}

interface SelectedPlaylistSettings {
  playlistIds: string[];
  maxPlaylists: number;
}

function App() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [playlists, setPlaylists] = useState<PlaylistInfo[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [selectedPlaylistIds, setSelectedPlaylistIds] = useState<string[]>([]);
  const [savedSettings, setSavedSettings] =
    useState<SelectedPlaylistSettings | null>(null);

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

        // Get saved playlist selection
        chrome.storage.local.get(["selectedPlaylists"], (result) => {
          if (result.selectedPlaylists) {
            setSavedSettings(result.selectedPlaylists);
            setSelectedPlaylistIds(result.selectedPlaylists.playlistIds || []);
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

        chrome.runtime.sendMessage(
          { type: "STORE_AUTH_TOKEN", token: token },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error(
                "Failed to store auth token:",
                chrome.runtime.lastError.message
              );
              setAuthToken(null);
            } else if (response && response.success) {
              setAuthToken(token);
              loadUserPlaylists(token);
            } else {
              console.error("Failed to store auth token:", response?.error);
              setAuthToken(null);
            }
            setIsLoading(false);
          }
        );
      } else {
        console.error(
          "Authentication failed: No token was granted by the user."
        );
        setAuthToken(null);
        setIsLoading(false);
      }
    });
  };

  // Function to sign out
  const handleSignOut = () => {
    chrome.runtime.sendMessage({ type: "CLEAR_AUTH_TOKEN" }, () => {
      if (chrome.runtime.lastError) {
        console.error(
          "Error clearing auth token:",
          chrome.runtime.lastError.message
        );
      }

      // Always clear local state regardless
      setAuthToken(null);
      setPlaylists([]);
      setSelectedPlaylistIds([]);
      setSavedSettings(null);

      // Clear saved playlist settings
      chrome.storage.local.remove(["selectedPlaylists"]);
    });
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
      maxPlaylists: 3, // Can be made configurable based on user tier
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

  return (
    <div className="App" style={{ width: "400px", padding: "16px" }}>
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
              <p>✅ Signed in successfully!</p>
              <button onClick={handleSignOut} style={{ marginRight: "8px" }}>
                Sign Out
              </button>
              <button onClick={() => authToken && loadUserPlaylists(authToken)}>
                Refresh Playlists
              </button>
            </div>

            {/* Playlist Selection Section */}
            <div style={{ marginBottom: "16px" }}>
              <h3>Choose Playlists to Display (Max 3)</h3>

              {isLoadingPlaylists ? (
                <p>Loading playlists...</p>
              ) : playlists.length > 0 ? (
                <div>
                  <div
                    style={{
                      maxHeight: "200px",
                      overflowY: "auto",
                      border: "1px solid #ddd",
                      borderRadius: "4px",
                      padding: "8px",
                    }}
                  >
                    {playlists.map((playlist) => (
                      <label
                        key={playlist.id}
                        style={{
                          display: "block",
                          padding: "8px",
                          cursor: "pointer",
                          borderBottom: "1px solid #f0f0f0",
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={selectedPlaylistIds.includes(playlist.id)}
                          onChange={() => handlePlaylistToggle(playlist.id)}
                          style={{ marginRight: "8px" }}
                        />
                        <strong>{playlist.title}</strong>
                        <div
                          style={{
                            fontSize: "12px",
                            color: "#666",
                            marginLeft: "20px",
                          }}
                        >
                          {playlist.videoCount} videos • {playlist.privacy}
                        </div>
                      </label>
                    ))}
                  </div>

                  <div
                    style={{ marginTop: "12px", display: "flex", gap: "8px" }}
                  >
                    <button
                      onClick={savePlaylistSelection}
                      disabled={selectedPlaylistIds.length === 0}
                      style={{
                        padding: "8px 16px",
                        backgroundColor:
                          selectedPlaylistIds.length > 0 ? "#1976d2" : "#ccc",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor:
                          selectedPlaylistIds.length > 0
                            ? "pointer"
                            : "not-allowed",
                      }}
                    >
                      Save Selection ({selectedPlaylistIds.length})
                    </button>

                    <button
                      onClick={clearAllSelections}
                      style={{
                        padding: "8px 16px",
                        backgroundColor: "#f44336",
                        color: "white",
                        border: "none",
                        borderRadius: "4px",
                        cursor: "pointer",
                      }}
                    >
                      Clear All
                    </button>
                  </div>

                  {/* Current Selection Summary */}
                  {selectedPlaylistIds.length > 0 && (
                    <div
                      style={{
                        marginTop: "12px",
                        padding: "8px",
                        backgroundColor: "#f5f5f5",
                        borderRadius: "4px",
                      }}
                    >
                      <strong>
                        Selected ({selectedPlaylistIds.length}/3):
                      </strong>
                      <ul style={{ margin: "4px 0", paddingLeft: "16px" }}>
                        {selectedPlaylistIds.map((id) => {
                          const playlist = playlists.find((p) => p.id === id);
                          return playlist ? (
                            <li key={id} style={{ fontSize: "12px" }}>
                              {playlist.title}
                            </li>
                          ) : null;
                        })}
                      </ul>
                    </div>
                  )}

                  {/* Saved Settings Indicator */}
                  {savedSettings && (
                    <div
                      style={{
                        marginTop: "12px",
                        padding: "8px",
                        backgroundColor: "#e8f5e8",
                        borderRadius: "4px",
                        fontSize: "12px",
                      }}
                    >
                      ✅ Settings saved! {savedSettings.playlistIds.length}{" "}
                      playlist(s) will appear on YouTube homepage.
                    </div>
                  )}
                </div>
              ) : (
                <p>
                  No playlists found. Create some playlists on YouTube first!
                </p>
              )}
            </div>

            {/* Future Features Preview */}
            <div
              style={{
                padding: "12px",
                backgroundColor: "#f5f5f5",
                borderRadius: "4px",
                fontSize: "12px",
              }}
            >
              <p>
                <strong>Coming Soon:</strong>
              </p>
              <ul style={{ margin: "4px 0", paddingLeft: "16px" }}>
                <li>Sort by: Date, Views, Duration</li>
                <li>Filter by: Category, Channel</li>
                <li>AI video summaries</li>
                <li>Unlimited playlists (Premium)</li>
              </ul>
            </div>
          </div>
        )}
      </header>
    </div>
  );
}

export default App;
