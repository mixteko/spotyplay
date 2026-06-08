/* =========================================
   SPOTIFY AI v1.15 CLOUD SECURE
========================================= */

const CLIENT_ID = "6f2af5f678674eff85c3b3cb45a06080";
const REDIRECT_URI = "https://mixteko.github.io/spotyplay/";
const WORKER_URL = "https://spotify-ai-gemini.mixteko.workers.dev";
const SCOPES = [
    "user-read-private",
    "user-read-email",
    "playlist-read-private",
    "playlist-read-collaborative",
    "playlist-modify-private",
    "playlist-modify-public"
].join(" ");

let accessToken = localStorage.getItem("spotify_token") || "";

/* =========================================
   ELEMENTOS DOM
========================================= */
const spotifyStatus = document.getElementById("spotifyStatus");
const geminiStatus = document.getElementById("geminiStatus");
const playlistStatus = document.getElementById("playlistStatus");
const promptAI = document.getElementById("promptAI");
const songCount = document.getElementById("songCount");
const playlistName = document.getElementById("playlistName");
const songs = document.getElementById("songs");
const log = document.getElementById("log");

/* =========================================
   LOG
========================================= */
function msg(text){
    if(!log) return;
    log.innerHTML += "\n" + text;
    log.scrollTop = log.scrollHeight;
}

function setConnected(element, text){
    if(!element) return;
    element.innerText = text;
    element.style.color = "#00ffcc";
}

function setDisconnected(element, text){
    if(!element) return;
    element.innerText = text;
    element.style.color = "#ff3366";
}

function updateStatus(){
    if(accessToken){
        setConnected(spotifyStatus, "Spotify 🟢");
    }else{
        setDisconnected(spotifyStatus, "Spotify 🔴");
    }
    setDisconnected(geminiStatus, "Gemini ⚪");
    setDisconnected(playlistStatus, "Playlist ⚪");
}

/* =========================================
   AUTENTICACIÓN (URLS OFICIALES DE SPOTIFY)
========================================= */
async function loginSpotify(){
    // URL REAL Y OFICIAL DE AUTENTICACIÓN DE SPOTIFY
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPES)}`;
    window.location.href = authUrl;
}

async function getToken(){
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const token = params.get("access_token");

    if(token){
        accessToken = token;
        localStorage.setItem("spotify_token", token);
        window.location.hash = "";
        updateStatus();
        msg("Conectado a Spotify correctamente.");
    }else if(accessToken){
        msg("Usando sesión existente de Spotify.");
    }else{
        msg("Falta conectar cuenta de Spotify.");
    }
}

function changeUser(){
    localStorage.removeItem("spotify_token");
    accessToken = "";
    updateStatus();
    msg("Cerrando sesión para cambiar de cuenta...");
    loginSpotify();
}

/* =========================================
   GEMINI AI
========================================= */
async function generateGemini(moreTracks = false){
    if(!promptAI || !promptAI.value.trim()){
        msg("Escribe una descripción para la Playlist");
        return;
    }

    try {
        setConnected(geminiStatus, "Procesando con Gemini AI... ⏳");
        msg("Conectando con Gemini Cloud...");

        const count = songCount ? songCount.value : "20";

        const response = await fetch(WORKER_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                prompt: promptAI.value,
                count: count,
                more: moreTracks
            })
        });

        if(!response.ok) throw new Error("Error en la respuesta del Worker");
        
        const data = await response.json();
        if(!data.tracks || data.tracks.length === 0) throw new Error("No se devolvieron canciones.");

        setConnected(geminiStatus, "Gemini AI 🟢");
        msg(`Gemini sugirió ${data.tracks.length} canciones.`);

        if(!moreTracks && songs) songs.innerHTML = "";

        for(const trackStr of data.tracks){
            msg(`Buscando: "${trackStr}"`);
            const spotifyTrack = await spotifySearch(trackStr);
            if(spotifyTrack){
                appendSongToList(spotifyTrack);
            }else{
                msg(`⚠️ No encontrada: ${trackStr}`);
            }
        }
    } catch(error) {
        console.error(error);
        setDisconnected(geminiStatus, "Gemini Error 🔴");
        msg("Error: " + error.message);
    }
}

/* =========================================
   BUSCAR CANCIONES (URL OFICIAL DE LA API)
========================================= */
async function spotifySearch(query){
    if(!accessToken) return null;
    const cleanQuery = query.replace(/"/g, "");

    // URL REAL DE BÚSQUEDA DE LA API DE SPOTIFY
    const response = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(cleanQuery)}&type=track&limit=1`,
        {
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            }
        }
    );

    if(response.status === 401){
        localStorage.removeItem("spotify_token");
        accessToken = "";
        updateStatus();
        return null;
    }

    if(!response.ok) return null;
    const data = await response.json();
    return data.tracks?.items?.[0] || null;
}

function appendSongToList(track){
    if(!songs) return;
    const li = document.createElement("li");
    li.dataset.uri = track.uri;
    li.innerHTML = `
        <strong>${track.name}</strong> - ${track.artists.map(a => a.name).join(", ")}
        <button class="remove-btn" onclick="this.parentElement.remove()">✕</button>
    `;
    songs.appendChild(li);
}

/* =========================================
   CREAR PLAYLIST (URLS OFICIALES DE LA API)
========================================= */
async function createPlaylist(){
    if(!accessToken){
        msg("Primero debes conectar Spotify.");
        return;
    }

    try {
        setConnected(playlistStatus, "Creando... ⏳");
        const finalName = (playlistName && playlistName.value.trim()) ? playlistName.value : "Mi Playlist AI";

        // 1. URL REAL para obtener tu perfil
        const meResponse = await fetch("https://api.spotify.com/v1/me", {
            headers: { "Authorization": `Bearer ${accessToken}` }
        });

        if(!meResponse.ok) throw new Error("No se pudo obtener tu perfil.");
        const meData = await meResponse.json();
        const userId = meData.id;

        // 2. URL REAL para crear la playlist usando tu userId real
        const playlistResponse = await fetch(`https://api.spotify.com/v1/users/${userId}/playlists`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: finalName,
                public: false,
                collaborative: false,
                description: "Generada con Spotify AI"
            })
        });

        if(!playlistResponse.ok) throw new Error("Error al crear la playlist.");
        const playlist = await playlistResponse.json();

        // 3. Obtener los elementos de la interfaz usando selectores válidos
        const uris = [...songs.querySelectorAll("li")].map(li => li.dataset.uri);
        if(uris.length === 0){
            setConnected(playlistStatus, "Vacía 🟢");
            msg("Playlist creada vacía.");
            if(playlist.external_urls?.spotify) window.open(playlist.external_urls.spotify, "_blank");
            return;
        }

        const chunk = uris.slice(0, 100);

        // 4. URL REAL para añadir las canciones a la playlist
        const addResponse = await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ uris: chunk })
        });

        if(!addResponse.ok) throw new Error("No se pudieron agregar las canciones.");

        setConnected(playlistStatus, "Playlist 🟢");
        msg(`¡Éxito! Playlist creada con ${uris.length} canciones.`);

        if(playlist.external_urls?.spotify){
            window.open(playlist.external_urls.spotify, "_blank");
        }

    } catch(error) {
        console.error(error);
        setDisconnected(playlistStatus, "Error 🔴");
        msg("Error: " + error.message);
    }
}

function refreshApp(){
    if(songs) songs.innerHTML = "";
    if(promptAI) promptAI.value = "";
    if(playlistName) playlistName.value = "";
    updateStatus();
    msg("App reseteada correctamente.");
}

/* =========================================
   INICIALIZACIÓN
========================================= */
window.addEventListener("DOMContentLoaded", async () => {
    const spotifyBtn = document.getElementById("spotifyBtn");
    const generateBtn = document.getElementById("generateBtn");
    const moreBtn = document.getElementById("moreBtn");
    const refreshBtn = document.getElementById("refreshBtn");
    const playlistBtn = document.getElementById("playlistBtn");
    const changeBtn = document.getElementById("changeBtn");

    if(spotifyBtn){
        spotifyBtn.onclick = async () => {
            try { await loginSpotify(); } catch(e) { console.error(e); }
        };
    }

    if(generateBtn) generateBtn.onclick = () => generateGemini(false);
    if(moreBtn) moreBtn.onclick = () => generateGemini(true);
    if(refreshBtn) refreshBtn.onclick = refreshApp;
    if(playlistBtn) playlistBtn.onclick = createPlaylist;
    if(changeBtn) changeBtn.onclick = changeUser;

    updateStatus();
    await getToken();
});
