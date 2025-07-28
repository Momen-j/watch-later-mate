import { useState, useEffect } from "react";

interface PlaylistInfo {
  id: string;
  title: string;
  description: string;
  thumbnailUrl: string;
  videoCount: number;
  privacy: 'public' | 'private' | 'unlisted';
}

function App() {
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [playlists, setPlaylists] = useState<PlaylistInfo[]>([]);
  const [isLoadingPlaylists, setIsLoadingPlaylists] = useState(false);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string>('');

  // Check for existing auth token on popup load
  useEffect(() => {
    const getTokenWithTimeout = () => {
      const timeout = setTimeout(() => {
        console.warn('Timeout getting auth token');
        setAuthToken(null);
        setIsLoading(false);
      }, 5000);

      chrome.runtime.sendMessage({ type: 'GET_AUTH_TOKEN' }, (response) => {
        clearTimeout(timeout);
        
        if (chrome.runtime.lastError) {
          console.error('Error getting auth token:', chrome.runtime.lastError.message);
          setAuthToken(null);
        } else if (response && response.token) {
          console.log('Found existing auth token');
          setAuthToken(response.token);
          // Auto-load playlists if we have a token
          loadUserPlaylists(response.token);
        } else {
          console.log('No existing auth token found');
          setAuthToken(null);
        }
        setIsLoading(false);
      });
    };

    getTokenWithTimeout();
  }, []);

  // Function to handle the sign-in process
  const handleSignIn = () => {
    setIsLoading(true);
    
    chrome.identity.getAuthToken({ interactive: true }, (authResult) => {
      // Always check for a runtime error first.
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

      // The API can return a string OR an object. This code handles both.
      if (typeof authResult === "string") {
        token = authResult;
      } else if (authResult && typeof authResult.token === "string") {
        token = authResult.token;
      }

      // Finally, check if we successfully extracted a token.
      if (token) {
        console.log("Authentication successful!");
        
        // Store token in chrome.storage.local via background script
        chrome.runtime.sendMessage(
          { type: 'STORE_AUTH_TOKEN', token: token },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error('Failed to store auth token:', chrome.runtime.lastError.message);
              setAuthToken(null);
            } else if (response && response.success) {
              setAuthToken(token);
              // Load playlists after successful token storage
              loadUserPlaylists(token);
            } else {
              console.error('Failed to store auth token:', response?.error);
              setAuthToken(null);
            }
            setIsLoading(false);
          }
        );
      } else {
        // This message now accurately reflects that no token was granted.
        // This is most likely because the user cancelled the sign-in process.
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
    const timeout = setTimeout(() => {
      console.warn('Timeout clearing auth token');
      // Still clear local state even if background script fails
      setAuthToken(null);
      setPlaylists([]);
      setSelectedPlaylistId('');
    }, 5000);

    chrome.runtime.sendMessage({ type: 'CLEAR_AUTH_TOKEN' }, (response) => {
      clearTimeout(timeout);
      
      if (chrome.runtime.lastError) {
        console.error('Error clearing auth token:', chrome.runtime.lastError.message);
      }
      
      if (response && response.success) {
        console.log('Successfully signed out');
      } else {
        console.warn('Sign out may have failed:', response?.error);
      }
      
      // Always clear local state regardless
      setAuthToken(null);
      setPlaylists([]);
      setSelectedPlaylistId('');
    });
  };

  // Function to load user's playlists
  const loadUserPlaylists = async (token: string) => {
    setIsLoadingPlaylists(true);
    
    try {
      // Fetch user's playlists
      const playlistsResponse = await fetch(
        'https://www.googleapis.com/youtube/v3/playlists?part=snippet,contentDetails,status&mine=true&maxResults=25',
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      const playlistsData = await playlistsResponse.json();

      if (playlistsData.error) {
        console.error("API Error fetching playlists:", playlistsData.error.message);
        setPlaylists([]);
        return;
      }

      if (playlistsData.items && playlistsData.items.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const formattedPlaylists: PlaylistInfo[] = playlistsData.items.map((item: any) => ({
          id: item.id,
          title: item.snippet.title,
          description: item.snippet.description || '',
          thumbnailUrl: item.snippet.thumbnails?.high?.url || item.snippet.thumbnails?.default?.url || '',
          videoCount: item.contentDetails?.itemCount || 0,
          privacy: item.status?.privacyStatus || 'private',
        }));

        setPlaylists(formattedPlaylists);
        
        // Auto-select the first playlist
        if (formattedPlaylists.length > 0) {
          setSelectedPlaylistId(formattedPlaylists[0].id);
        }
      } else {
        console.log("No playlists found for this user.");
        setPlaylists([]);
      }
    } catch (error) {
      console.error("Failed to fetch playlists:", error);
      setPlaylists([]);
    } finally {
      setIsLoadingPlaylists(false);
    }
  };

  // Function to refresh playlists
  const refreshPlaylists = () => {
    if (authToken) {
      loadUserPlaylists(authToken);
    }
  };

  // Function to test current playlist (for debugging)
  const testCurrentPlaylist = async () => {
    if (!authToken || !selectedPlaylistId) {
      console.error("No auth token or playlist selected.");
      return;
    }

    try {
      const selectedPlaylist = playlists.find(p => p.id === selectedPlaylistId);
      console.log(`Testing playlist: "${selectedPlaylist?.title}" (${selectedPlaylistId})`);
      
      // Fetch first few videos from selected playlist
      const videosResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${selectedPlaylistId}&maxResults=5`,
        {
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );
      const videosData = await videosResponse.json();

      console.log(`Videos from "${selectedPlaylist?.title}":`, videosData);
    } catch (error) {
      console.error("Failed to test playlist:", error);
    }
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
    <div className="App">
      <header className="App-header">
        <h2>Playlist Pal</h2>
        
        {!authToken ? (
          <div>
            <p>Sign in to see your playlists on YouTube's homepage</p>
            <button onClick={handleSignIn}>Sign In with Google</button>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <p>✅ Signed in successfully!</p>
              <button onClick={handleSignOut} style={{ marginRight: '8px' }}>Sign Out</button>
              <button onClick={refreshPlaylists}>Refresh Playlists</button>
            </div>

            {/* Playlist Selection Section */}
            <div style={{ marginBottom: '16px' }}>
              <h3>Select Playlist to Display</h3>
              
              {isLoadingPlaylists ? (
                <p>Loading playlists...</p>
              ) : playlists.length > 0 ? (
                <div>
                  <select 
                    value={selectedPlaylistId} 
                    onChange={(e) => setSelectedPlaylistId(e.target.value)}
                    style={{ width: '100%', padding: '8px', marginBottom: '8px' }}
                  >
                    {playlists.map((playlist) => (
                      <option key={playlist.id} value={playlist.id}>
                        {playlist.title} ({playlist.videoCount} videos)
                      </option>
                    ))}
                  </select>
                  
                  {selectedPlaylistId && (
                    <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
                      {(() => {
                        const selected = playlists.find(p => p.id === selectedPlaylistId);
                        return selected ? (
                          <div>
                            <p><strong>Selected:</strong> {selected.title}</p>
                            <p><strong>Videos:</strong> {selected.videoCount}</p>
                            <p><strong>Privacy:</strong> {selected.privacy}</p>
                          </div>
                        ) : null;
                      })()}
                    </div>
                  )}
                  
                  <button onClick={testCurrentPlaylist}>Test Selected Playlist</button>
                </div>
              ) : (
                <p>No playlists found. Create some playlists on YouTube first!</p>
              )}
            </div>

            {/* Future Features Preview */}
            <div style={{ padding: '12px', backgroundColor: '#f5f5f5', borderRadius: '4px', fontSize: '12px' }}>
              <p><strong>Coming Soon:</strong></p>
              <ul style={{ margin: '4px 0', paddingLeft: '16px' }}>
                <li>Multiple playlist selection</li>
                <li>Sort by: Date, Views, Duration</li>
                <li>Filter by: Category, Channel</li>
                <li>Custom display settings</li>
              </ul>
            </div>
          </div>
        )}
      </header>
    </div>
  );
}

export default App;