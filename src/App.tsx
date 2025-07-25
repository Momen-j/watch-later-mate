// src/popup/App.tsx
import { useState } from "react";

function App() {
  const [authToken, setAuthToken] = useState<string | undefined>(undefined);

  // Function to handle the sign-in process
  const handleSignIn = () => {
    chrome.identity.getAuthToken({ interactive: true }, (authResult) => {
      // Always check for a runtime error first.
      if (chrome.runtime.lastError) {
        console.error(
          "Authentication failed:",
          chrome.runtime.lastError.message
        );
        setAuthToken(undefined);
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
        setAuthToken(token);
      } else {
        // This message now accurately reflects that no token was granted.
        // This is most likely because the user cancelled the sign-in process.
        console.error(
          "Authentication failed: No token was granted by the user."
        );
        setAuthToken(undefined);
      }
    });
  };

  // Function to fetch playlists using the token
  const fetchFirstPlaylistVideos = async () => {
  if (!authToken) {
    console.error("Not authenticated.");
    return;
  }

  try {
    // Step 1: Fetch the user's playlists (we only need the first one)
    console.log("Fetching user's playlists...");
    const playlistsResponse = await fetch(
      'https://www.googleapis.com/youtube/v3/playlists?part=snippet&mine=true&maxResults=1',
      {
        headers: { Authorization: `Bearer ${authToken}` },
      }
    );
    const playlistsData = await playlistsResponse.json();

    if (playlistsData.error) {
      console.error("API Error fetching playlists:", playlistsData.error.message);
      return;
    }

    // Step 2: Check if playlists were found and get the ID of the first one
    if (playlistsData.items && playlistsData.items.length > 0) {
      const firstPlaylist = playlistsData.items[0];
      const playlistId = firstPlaylist.id;
      const playlistTitle = firstPlaylist.snippet.title;

      console.log(`Found playlist "${playlistTitle}". Fetching its videos...`);

      // Step 3: Use the ID to fetch the videos in that playlist
      const videosResponse = await fetch(
        `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50`,
        {
          headers: { Authorization: `Bearer ${authToken}` },
        }
      );
      const videosData = await videosResponse.json();

      // This is the final output you are looking for
      console.log(`Videos from "${playlistTitle}":`, videosData);
      
    } else {
      console.log("No playlists found for this user.");
    }
  } catch (error) {
    console.error("Failed to fetch data:", error);
  }
};

  return (
    <div className="App">
      <header className="App-header">
        <h2>Playlist Pal</h2>
        {!authToken ? (
          <button onClick={handleSignIn}>Sign In with Google</button>
        ) : (
          <div>
            <p>You are signed in!</p>
            <button onClick={fetchFirstPlaylistVideos}>Fetch My Playlists</button>
          </div>
        )}
      </header>
    </div>
  );
}

export default App;
