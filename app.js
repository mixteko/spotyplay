/* =========================================
   SPOTIFY AI v1.15 CLOUD SECURE - PARTE 1
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
   SISTEMA DE LOGS Y ESTADOS
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
   FLUJO DE AUTENTICACIÓN
========================================= */
async function loginSpotify() {
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
        msg("Token de Spotify vinculado exitosamente.");
    } else if (accessToken) {
        msg("Usando token activo guardado en el navegador.");
    } else {
        msg("Falta autenticación de Spotify. Por favor conecta tu cuenta.");
    }
}

function changeUser() {
    localStorage.removeItem("spotify_token");
    accessToken = "";
    updateStatus();
    msg("Cerrando sesión actual...");
    loginSpotify();
}
/* =========================================
   SPOTIFY AI v1.15 CLOUD SECURE - PARTE 2
========================================= */

/* =========================================
   PROCESAMIENTO CON GEMINI AI Cloud
========================================= */
async function generateGemini(moreTracks = false) {
    if (!promptAI || !promptAI.value.trim()) {
        msg("Por favor escribe una descripción válida en el cuadro de texto.");
        return;
    }

    try {
        setConnected(geminiStatus, "Procesando con Gemini AI... ⏳");
        msg("Enviando peticiones de IA al Worker...");

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

        if (!response.ok) throw new Error("Fallo en la comunicación con el Worker de IA.");
        
        const data = await response.json();
        if (!data.tracks || data.tracks.length === 0) throw new Error("No se obtuvieron tracks válidos.");

        setConnected(geminiStatus, "Gemini AI 🟢");
        msg(`¡Se recibieron ${data.tracks.length} recomendaciones!`);

        if (!moreTracks && songs) songs.innerHTML = "";

        for (const trackStr of data.tracks) {
            msg(`Buscando en catálogo: "${trackStr}"`);
            const spotifyTrack = await spotifySearch(trackStr);
            if (spotifyTrack) {
                appendSongToList(spotifyTrack);
            } else {
                msg(`⚠️ No disponible en Spotify: ${trackStr}`);
            }
        }
    } catch (error) {
        console.error(error);
        setDisconnected(geminiStatus, "Gemini Error 🔴");
        msg("Error de procesamiento: " + error.message);
    }
}

/* =========================================
   ENDPOINTS CORREGIDOS DIRECTOS (SIN PROXY)
========================================= */
async function spotifySearch(query) {
    if (!accessToken) return null;
    const cleanQuery = query.replace(/"/g, "");

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
        msg("Sesión expirada. Limpiando credenciales antiguas...");
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
   CREACIÓN E INYECCIÓN DE TRACKS 
========================================= */
async function createPlaylist() {
    if (!accessToken) {
        msg("Debes iniciar sesión en Spotify primero.");
        return;
    }

    try {
        setConnected(playlistStatus, "Creando... ⏳");
        const finalName = (playlistName && playlistName.value.trim()) ? playlistName.value : "Mi Playlist AI";

        msg("Validando credenciales de usuario con la API oficial...");
        const meResponse = await fetch("https://api.spotify.com/v1/me", {
            headers: { "Authorization": `Bearer ${accessToken}` }
        });

        if (!meResponse.ok) throw new Error("Error de validación de perfil.");
        const meData = await meResponse.json();
        const userId = meData.id;

        msg(`Creando contenedor de lista: "${finalName}"...`);
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
                description: "Generada de forma segura mediante Spotify AI Cloud"
            })
        });

        if (!playlistResponse.ok) throw new Error("Fallo al reservar espacio de playlist.");
        const playlist = await playlistResponse.json();

        const uris = [...songs.querySelectorAll("li")].map(li => li.dataset.uri);
        if (uris.length === 0) {
            setConnected(playlistStatus, "Vacía 🟢");
            msg("Contenedor creado, pero no hay elementos en la lista para inyectar.");
            if (playlist.external_urls?.spotify) window.open(playlist.external_urls.spotify, "_blank");
            return;
        }

        const chunk = uris.slice(0, 100);
        msg(`Inyectando tracks en la playlist oficial...`);

        const addResponse = await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ uris: chunk })
        });

        if (!addResponse.ok) throw new Error("Error crítico de transferencia al inyectar tracks.");

        setConnected(playlistStatus, "Playlist 🟢");
        msg(`¡Operación completa! Se agregaron ${uris.length} canciones.`);

        if (playlist.external_urls?.spotify) {
            window.open(playlist.external_urls.spotify, "_blank");
        }
    } catch (error) {
        console.error(error);
        setDisconnected(playlistStatus, "Error 🔴");
        msg("Fallo de construcción: " + error.message);
    }
}

function refreshApp() {
    if (songs) songs.innerHTML = "";
    if (promptAI) promptAI.value = "";
    if (playlistName) playlistName.value = "";
    updateStatus();
    msg("Espacio de trabajo restaurado.");
}

/* =========================================
   ASIGNACIÓN Y ARRANQUE GLOBAL
========================================= */
window.addEventListener("DOMContentLoaded", async () => {
    const spotifyBtn = document.getElementById("spotifyBtn");
    const generateBtn = document.getElementById("generateBtn");
    const moreBtn = document.getElementById("moreBtn");
    const refreshBtn = document.getElementById("refreshBtn");
    const playlistBtn = document.getElementById("playlistBtn");
    const changeBtn = document.getElementById("changeBtn");

    if (!spotifyBtn) {
        console.error("Falta disparador crítico en HTML: spotifyBtn");
        return;
    }

    spotifyBtn.onclick = async () => {
        try { await loginSpotify(); } catch (error) { console.error(error); }
    };

    if (generateBtn) generateBtn.onclick = () => generateGemini(false);
    if (moreBtn) moreBtn.onclick = () => generateGemini(true);
    if (refreshBtn) refreshBtn.onclick = refreshApp;
    if (playlistBtn) playlistBtn.onclick = createPlaylist;
    if (changeBtn) changeBtn.onclick = changeUser;

    updateStatus();
    await getToken();
    msg("Módulos inicializados correctamente. Versión 1.15 Estable.");
});
