/* =========================================
   SPOTIFY AI v2.1 - CON OAUTH COMPLETO
========================================= */

// 🔒 URLs de los Workers
const AUTH_WORKER = "https://spotify-auth-worker.mixteko.workers.dev";
const GEMINI_WORKER = "https://spotify-ai-gemini.mixteko.workers.dev";
const REDIRECT_URI = "https://mixteko.github.io/spotyplay/";

// Variables globales
let accessToken = localStorage.getItem("spotify_token") || "";

/* =========================================
   ELEMENTOS DOM
========================================= */

let spotifyStatus;
let geminiStatus;
let playlistStatus;

let promptAI;
let songCount;
let playlistName;
let songs;
let log;

/* =========================================
   FUNCIONES DE LOG Y STATUS
========================================= */
function msg(text) {
    if (!log) return;
    const timestamp = new Date().toLocaleTimeString();
    log.innerHTML += `\n[${timestamp}] ${text}`;
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
   AUTENTICACIÓN CON OAUTH
========================================= */
async function loginSpotify() {

    try {

        msg(
            "🔐 Pidiendo URL de autenticación..."
        );

        const response =
            await fetch(
                AUTH_WORKER +
                "/spotify-login-url"
            );

        const data =
            await response.json();

        if (
            !data.authUrl
        ) {

            throw new Error(
                "No se recibió authUrl"
            );

        }

        window.location.href =
            data.authUrl;

    } catch (error) {

        console.error(
            error
        );

        msg(
            `❌ ${error.message}`
        );

    }

}

async function getToken() {

    const urlParams =
        new URLSearchParams(
            window.location.search
        );

    const code =
        urlParams.get("code");

    if (code) {

        msg(
            "🔐 Intercambiando código por token..."
        );

        try {

            const response =
                await fetch(
                    AUTH_WORKER +
                    "/spotify-callback",
                    {
                        method: "POST",
                        headers: {
                            "Content-Type":
                                "application/json"
                        },
                        body: JSON.stringify({
                            code
                        })
                    }
                );

            const responseData =
                await response.json();

            console.log(
                "WORKER RESPONSE:",
                responseData
            );

            if (
                !response.ok
            ) {

                throw new Error(
                    JSON.stringify(
                        responseData,
                        null,
                        2
                    )
                );

            }

            let tokenData =
                responseData;

            if (
                responseData.spotify_response
            ) {

                tokenData =
                    JSON.parse(
                        responseData.spotify_response
                    );

            }

            accessToken =
                tokenData.access_token;

            localStorage.setItem(
                "spotify_token",
                accessToken
            );

            window.history.replaceState(
                {},
                document.title,
                REDIRECT_URI
            );

            updateStatus();

            msg(
                "✅ Spotify conectado"
            );

            return;

        } catch (error) {

            console.error(
                error
            );

            msg(
                `❌ ${error.message}`
            );

            return;

        }

    }

    const savedToken =
        localStorage.getItem(
            "spotify_token"
        );

    if (
        savedToken
    ) {

        accessToken =
            savedToken;

        updateStatus();

        msg(
            "✅ Usando sesión existente"
        );

        return;

    }

    msg(
        "⚠️ Spotify no conectado"
    );

}

function changeUser() {

    localStorage.removeItem(
        "spotify_token"
    );

    accessToken = "";

    updateStatus();

    msg(
        "🔄 Eliminando sesión Spotify..."
    );

    window.location.href =
        REDIRECT_URI;

}

/* =========================================
   GENERADOR DE CANCIONES CON GEMINI
========================================= */
async function generateGemini(moreTracks = false) {

    accessToken =
        localStorage.getItem(
            "spotify_token"
        ) || "";

    if (
        !promptAI ||
        !promptAI.value.trim()
    ) {

        msg(
            "❌ Escribe una descripción para la Playlist"
        );

        return;

    }

    if (!accessToken) {

        msg(
            "❌ Primero conecta tu cuenta de Spotify"
        );

        return;

    }

    try {

        setConnected(
            geminiStatus,
            "Procesando con Gemini AI... ⏳"
        );

        msg(
            "📡 Conectando con Gemini Cloud..."
        );

        const count =
            songCount
                ? parseInt(
                    songCount.value
                )
                : 20;

        const response =
            await fetch(
                GEMINI_WORKER,
                {
                    method: "POST",

                    headers: {
                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({
                        prompt:
                            promptAI.value,

                        count:
                            Math.min(
                                count,
                                100
                            ),

                        more:
                            moreTracks
                    })
                }
            );

        if (!response.ok) {

            const errorData =
                await response
                    .json()
                    .catch(
                        () => ({})
                    );

            throw new Error(
                `Worker error: ${response.status} - ${errorData.error || "desconocido"}`
            );

        }

        const data =
            await response.json();

        console.log(
            "GEMINI RESPONSE:",
            data
        );

        if (
            !data.tracks ||
            data.tracks.length === 0
        ) {

            throw new Error(
                "Gemini no devolvió canciones. Intenta otra descripción."
            );

        }

        setConnected(
            geminiStatus,
            "Gemini AI 🟢"
        );

        msg(
            `✅ Gemini sugirió ${data.tracks.length} canciones.`
        );

        if (
            !moreTracks &&
            songs
        ) {

            songs.innerHTML = "";

        }

        let found = 0;

        for (
            const trackStr of data.tracks
        ) {

            msg(
                `🔍 Buscando: ${trackStr}`
            );

            const spotifyTrack =
                await spotifySearch(
                    trackStr
                );

            if (
                spotifyTrack
            ) {

                appendSongToList(
                    spotifyTrack
                );

                found++;

            } else {

                msg(
                    `⚠️ No encontrada: ${trackStr}`
                );

            }

        }

        msg(
            `✨ Encontradas ${found}/${data.tracks.length} canciones.`
        );

    } catch (error) {

        console.error(
            "Error en generateGemini:",
            error
        );

        setDisconnected(
            geminiStatus,
            "Gemini Error 🔴"
        );

        msg(
            `❌ Error: ${error.message}`
        );

    }

}
/* =========================================
   BUSCAR CANCIONES EN SPOTIFY
========================================= */
async function spotifySearch(query) {
    if (!accessToken) {
        return null;
    }

    const cleanQuery = query
        .replace(/"/g, "")
        .replace(/[\(\)]/g, "")
        .trim();

    if (!cleanQuery) return null;

    try {
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
            localStorage.removeItem("spotify_token");
            accessToken = "";
            updateStatus();
            msg("🔴 Token expirado. Conecta nuevamente.");
            return null;
        }

        if (!response.ok) return null;

        const data = await response.json();
        return data.tracks?.items?.[0] || null;

    } catch (err) {
        console.error("Error en spotifySearch:", err);
        return null;
    }
}

function appendSongToList(track) {
    if (!songs) return;
    
    const li = document.createElement("li");
    li.dataset.uri = track.uri;
    
    const artistNames = track.artists.map(a => a.name).join(", ");
    
    li.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; width: 100%;">
            <div>
                <strong>${track.name}</strong><br>
                <small>${artistNames}</small>
            </div>
            <button class="remove-btn" onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: #ff3366; cursor: pointer; font-size: 18px;">✕</button>
        </div>
    `;
    
    songs.appendChild(li);
}

/* =========================================
   CREAR PLAYLIST EN SPOTIFY
========================================= */
async function createPlaylist() {

    if (!accessToken) {

        msg(
            "❌ Primero debes conectar Spotify."
        );

        return;

    }

    try {

        setConnected(
            playlistStatus,
            "Creando... ⏳"
        );

        const finalName =
            (
                playlistName &&
                playlistName.value.trim()
            )
                ? playlistName.value.trim()
                : "Mi Playlist AI";

        msg(
            `📝 Nombre de la playlist: "${finalName}"`
        );

        const meResponse =
            await fetch(
                "https://api.spotify.com/v1/me",
                {
                    headers: {
                        Authorization:
                            `Bearer ${accessToken}`
                    }
                }
            );

        const meText =
            await meResponse.text();

        console.log(
            "ME STATUS:",
            meResponse.status
        );

        console.log(
            "ME RESPONSE:",
            meText
        );

        if (!meResponse.ok) {

            throw new Error(
                "No se pudo obtener tu perfil Spotify."
            );

        }

        const meData =
            JSON.parse(
                meText
            );

        msg(
            `👤 Usuario: ${meData.display_name || meData.id}`
        );

        const playlistResponse =
            await fetch(
                "https://api.spotify.com/v1/me/playlists",
                {
                    method: "POST",

                    headers: {
                        Authorization:
                            `Bearer ${accessToken}`,

                        "Content-Type":
                            "application/json"
                    },

                    body: JSON.stringify({

                        name:
                            finalName,

                        public:
                            false,

                        description:
                            "Generada con Spotify AI"

                    })

                }
            );

        const playlistText =
            await playlistResponse.text();

        console.log(
            "PLAYLIST STATUS:",
            playlistResponse.status
        );

        console.log(
            "PLAYLIST RESPONSE:",
            playlistText
        );

        if (!playlistResponse.ok) {

            throw new Error(
                `Spotify respondió ${playlistResponse.status}: ${playlistText}`
            );

        }

        const playlist =
            JSON.parse(
                playlistText
            );

        msg(
            `✅ Playlist creada: ${playlist.name}`
        );

        const uris =
            [
                ...songs.querySelectorAll(
                    "li"
                )
            ].map(
                li => li.dataset.uri
            );

        if (!uris.length) {

            setConnected(
                playlistStatus,
                "Vacía 🟢"
            );

            msg(
                "⚠️ Playlist creada sin canciones."
            );

            if (
                playlist.external_urls?.spotify
            ) {

                window.open(
                    playlist.external_urls.spotify,
                    "_blank"
                );

            }

            return;

        }

        for (
            let i = 0;
            i < uris.length;
            i += 100
        ) {

            const chunk =
                uris.slice(
                    i,
                    i + 100
                );

            const addResponse =
                await fetch(
                    `https://api.spotify.com/v1/playlists/${playlist.id}/tracks`,
                    {
                        method: "POST",

                        headers: {
                            Authorization:
                                `Bearer ${accessToken}`,

                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({
                            uris: chunk
                        })
                    }
                );

            const addText =
                await addResponse.text();

            console.log(
                "ADD STATUS:",
                addResponse.status
            );

            console.log(
                "ADD RESPONSE:",
                addText
            );

            if (!addResponse.ok) {

                throw new Error(
                    `Error agregando canciones: ${addText}`
                );

            }

        }

        setConnected(
            playlistStatus,
            "Playlist 🟢"
        );

        msg(
            `✨ Playlist creada con ${uris.length} canciones`
        );

        if (
            playlist.external_urls?.spotify
        ) {

            window.open(
                playlist.external_urls.spotify,
                "_blank"
            );

        }

    } catch (error) {

        console.error(
            "Error en createPlaylist:",
            error
        );

        setDisconnected(
            playlistStatus,
            "Error 🔴"
        );

        msg(
            `❌ ${error.message}`
        );

    }

}
/* =========================================
   REFRESH APP
========================================= */
function refreshApp() {

    if (songs) {
        songs.innerHTML = "";
    }

    if (promptAI) {
        promptAI.value = "";
    }

    if (playlistName) {
        playlistName.value = "";
    }

    if (songCount) {
        songCount.value = "10";
    }

    updateStatus();

    msg(
        "🔄 Aplicación reiniciada."
    );

}
