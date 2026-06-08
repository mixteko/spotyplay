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
   LOGS Y ESTADOS
========================================= */
function msg(text) {
    if (!log) return;
    log.innerHTML += "\n" + text;
    log.scrollTop = log.scrollHeight;
}

function setConnected(element, text) {
    if (!element) return;
    element.innerText = text;
    element.style.color = "#00ffcc";
}

function setDisconnected(element, text) {
    if (!element) return;
    element.innerText = text;
    element.style.color = "#ff3366";
}

function updateStatus() {
    if (accessToken) {
        setConnected(spotifyStatus, "Spotify 🟢");
    } else {
        setDisconnected(spotifyStatus, "Spotify 🔴");
    }
    setDisconnected(geminiStatus, "Gemini ⚪");
    setDisconnected(playlistStatus, "Playlist ⚪");
}

/* =========================================
   AUTENTICACIÓN OFICIAL DE SPOTIFY
========================================= */
async function loginSpotify() {
    // CORREGIDO: URL real de autenticación oficial en producción
    const authUrl = `https://accounts.spotify.com/authorize?client_id=${CLIENT_ID}&response_type=token&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&scope=${encodeURIComponent(SCOPES)}`;
    window.location.href = authUrl;
}

async function getToken() {
    const hash = window.location.hash.substring(1);
    const params = new URLSearchParams(hash);
    const token = params.get("access_token");

    if (token) {
        accessToken = token;
        localStorage.setItem("spotify_token", token);
        window.location.hash = "";
        updateStatus();
        msg("Token de Spotify cargado correctamente de la URL");
    } else if (accessToken) {
        msg("Usando token de Spotify existente en caché");
    } else {
        msg("No se encontró token de Spotify. Por favor, inicia sesión.");
    }
}

function changeUser() {
    localStorage.removeItem("spotify_token");
    accessToken = "";
    updateStatus();
    msg("Sesión cerrada de Spotify. Cambiando de cuenta...");
    loginSpotify();
}

/* =========================================
   CONEXIÓN CON GEMINI WORKER AI
========================================= */
async function generateGemini(moreTracks = false) {
    if (!promptAI || !promptAI.value.trim()) {
        msg("Escribe una descripción o género para la Playlist");
        return;
    }

    try {
        setConnected(geminiStatus, "Procesando con Gemini AI... ⏳");
        msg("Conectando con Gemini Cloud para generar sugerencias musicales...");

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

        if (!response.ok) throw new Error("Error en la respuesta de Gemini Worker");
        
        const data = await response.json();
        
        if (!data.tracks || data.tracks.length === 0) {
            throw new Error("No se devolvieron pistas válidas");
        }

        setConnected(geminiStatus, "Gemini AI 🟢");
        msg(`Gemini sugirió ${data.tracks.length} canciones con éxito.`);

        if (!moreTracks && songs) songs.innerHTML = "";

        for (const trackStr of data.tracks) {
            msg(`Buscando en Spotify: "${trackStr}"`);
            const spotifyTrack = await spotifySearch(trackStr);
            if (spotifyTrack) {
                appendSongToList(spotifyTrack);
            } else {
                msg(`⚠️ No encontrada en Spotify: ${trackStr}`);
            }
        }

    } catch (error) {
        console.error(error);
        setDisconnected(geminiStatus, "Gemini Error 🔴");
        msg("Error procesando la solicitud de IA: " + error.message);
    }
}

/* =========================================
   BUSCADOR DE CANCIONES (API REAL)
========================================= */
async function spotifySearch(query) {
    if (!accessToken) return null;
    const cleanQuery = query.replace(/"/g, "");

    // CORREGIDO: Endpoint oficial de búsqueda de Spotify con template literals correctos
    const response = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(cleanQuery)}&type=track&limit=1`,
        {
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            }
        }
    );

    if (response.status === 401) {
        msg("🚨 El Token expiró. Limpiando caché, inicia sesión de nuevo.");
        localStorage.removeItem("spotify_token");
        accessToken = "";
        updateStatus();
        return null;
    }

    if (!response.ok) return null;

    const data = await response.json();
    return data.tracks?.items?.[0] || null;
}

function appendSongToList(track) {
    if (!songs) return;
    const li = document.createElement("li");
    li.dataset.uri = track.uri;
    li.innerHTML = `
        <strong>${track.name}</strong> - ${track.artists.map(a => a.name).join(", ")}
        <button class="remove-btn" onclick="this.parentElement.remove()">✕</button>
    `;
    songs.appendChild(li);
}

/* =========================================
   CREACIÓN DE PLAYLISTS (API REAL)
========================================= */
async function createPlaylist() {
    if (!accessToken) {
        msg("Primero debes conectarte a Spotify");
        return;
    }

    try {
        setConnected(playlistStatus, "Creando... ⏳");
        const finalName = (playlistName && playlistName.value.trim()) ? playlistName.value : "Mi Playlist AI";

        msg("Consultando datos de tu perfil de Spotify...");
        // CORREGIDO: Endpoint oficial para obtener los datos del perfil actual
        const meResponse = await fetch("https://api.spotify.com/v1/me", {
            headers: { "Authorization": `Bearer ${accessToken}` }
        });

        if (!meResponse.ok) throw new Error("No se pudo obtener el ID del usuario actual de Spotify.");
        const meData = await meResponse.json();
        const userId = meData.id;

        msg(`Creando playlist vacía: "${finalName}"...`);
        // CORREGIDO: Endpoint oficial de creación usando el userId real de producción
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
                description: "Generada con Spotify AI Cloud v1.15"
            })
        });

        if (!playlistResponse.ok) throw new Error("Error creando la estructura de la playlist.");
        const playlist = await playlistResponse.json();

        const uris = [...songs.querySelectorAll("li")].map(li => li.dataset.uri);
        if (uris.length === 0) {
            setConnected(playlistStatus, "Vacía 🟢");
            msg("Playlist creada, pero no tenías canciones en la lista para agregar.");
            if (playlist.external_urls?.spotify) window.open(playlist.external_urls.spotify, "_blank");
            return;
        }

        const chunk = uris.slice(0, 100);
        msg(`Inyectando ${chunk.length} canciones en la Playlist...`);

        // CORREGIDO: Endpoint oficial para volcar tracks en la lista usando su id dinámico
        const addResponse = await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ uris: chunk })
        });

        if (!addResponse.ok) throw new Error("Error volcando los tracks en la lista de reproducción.");

        setConnected(playlistStatus, "Playlist 🟢");
        msg(`¡Éxito! Playlist completada con ${uris.length} canciones.`);

        if (playlist.external_urls?.spotify) {
            window.open(playlist.external_urls.spotify, "_blank");
        }

    } catch (error) {
        console.error(error);
        setDisconnected(playlistStatus, "Error 🔴");
        msg("Error creando playlist: " + error.message);
    }
}

// CORREGIDO: Añadida la función que faltaba para evitar el Uncaught ReferenceError
function refreshApp() {
    if (songs) songs.innerHTML = "";
    if (promptAI) promptAI.value = "";
    if (playlistName) playlistName.value = "";
    updateStatus();
    msg("Aplicación reseteada. Lista limpia.");
}

/* =========================================
   INICIALIZACIÓN DE LA APLICACIÓN
========================================= */
window.addEventListener("DOMContentLoaded", async () => {
    const spotifyBtn = document.getElementById("spotifyBtn");
    const generateBtn = document.getElementById("generateBtn");
    const moreBtn = document.getElementById("moreBtn");
    const refreshBtn = document.getElementById("refreshBtn");
    const playlistBtn = document.getElementById("playlistBtn");
    const changeBtn = document.getElementById("changeBtn");

    if (!spotifyBtn) {
        console.error("No existe un botón con ID: spotifyBtn en el HTML");
        return;
    }

    spotifyBtn.onclick = async () => {
        try {
            await loginSpotify();
        } catch (error) {
            console.error(error);
        }
    };

    if (generateBtn) generateBtn.onclick = () => generateGemini(false);
    if (moreBtn) moreBtn.onclick = () => generateGemini(true);
    if (refreshBtn) refreshBtn.onclick = refreshApp;
    if (playlistBtn) playlistBtn.onclick = createPlaylist;
    if (changeBtn) changeBtn.onclick = changeUser;

    updateStatus();
    await getToken();
    msg("Spotify AI v1.15 Cloud Secure cargado e iniciado correctamente.");
});
