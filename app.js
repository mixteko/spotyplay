/* =========================================
   SPOTIFY AI v2.1 - CON OAUTH COMPLETO
========================================= */

// 🔒 URLs de los Workers
const AUTH_WORKER = "https://spotify-auth-worker.mixteko.workers.dev";
const GEMINI_WORKER = "https://spotify-ai-gemini.mixteko.workers.dev";
const REDIRECT_URI = "https://mixteko.github.io/spotyplay/";
const APP_VERSION = "v2.2-cache-check-2026-06-10";

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
    element.style.color = "#1ed760";
}

function setDisconnected(element, text) {
    if (!element) return;
    element.innerText = text;
    element.style.color = "#ff4f64";
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

            const tokenData =
                await response.json();

            console.log(
                "TOKEN RESPONSE:",
                tokenData
            );

            console.log(
                "SCOPES RECIBIDOS:",
                tokenData.scope
            );

            if (
                !response.ok
            ) {

                throw new Error(
                    JSON.stringify(
                        tokenData,
                        null,
                        2
                    )
                );

            }
accessToken =
    tokenData.access_token;

const testMe =
    await fetch(
        "https://api.spotify.com/v1/me",
        {
            headers: {
                Authorization:
                    `Bearer ${accessToken}`
            }
        }
    );

console.log(
    "TOKEN TEST:",
    await testMe.json()
);
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
                            `${promptAI.value.trim()}

Devuelve canciones reales disponibles en Spotify.
Usa siempre el formato exacto: Artista - Canción.
Respeta estrictamente los artistas, canciones, géneros e idioma solicitados.
No inventes canciones ni cambies el artista pedido.`,

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
function normalizeText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/[’‘]/g, "'")
        .replace(/[“”]/g, "\"")
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9áéíóúüñ\s]/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function getBaseTitle(value) {
    return normalizeText(value)
        .replace(/\b(remasterizado|remastered|remaster|version|versión|edit|radio edit|single|deluxe|explicit)\b/g, " ")
        .replace(/\b(live|en vivo|ao vivo|acustico|acústico|remix|mix)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function getTokens(value) {
    return normalizeText(value)
        .split(" ")
        .filter(token => token.length > 1);
}

function tokenOverlap(expected, received) {
    const expectedTokens =
        new Set(
            getTokens(expected)
        );

    const receivedTokens =
        new Set(
            getTokens(received)
        );

    if (
        expectedTokens.size === 0 ||
        receivedTokens.size === 0
    ) {
        return 0;
    }

    let matches = 0;

    expectedTokens.forEach(token => {
        if (receivedTokens.has(token)) {
            matches++;
        }
    });

    return matches / expectedTokens.size;
}

function parseTrackQuery(query) {
    const cleanQuery =
        String(query || "")
            .replace(/^\s*\d+[\.\)]\s*/, "")
            .replace(/["“”]/g, "")
            .replace(/\s+/g, " ")
            .trim();

    const parts =
        cleanQuery
            .split(/\s[-–—]\s/)
            .map(part => part.trim())
            .filter(Boolean);

    if (parts.length >= 2) {
        return {
            raw: cleanQuery,
            artist: parts[0],
            title: parts.slice(1).join(" - ")
        };
    }

    const byMatch =
        cleanQuery.match(/^(.+?)\s+by\s+(.+)$/i);

    if (byMatch) {
        return {
            raw: cleanQuery,
            artist: byMatch[2].trim(),
            title: byMatch[1].trim()
        };
    }

    return {
        raw: cleanQuery,
        artist: "",
        title: cleanQuery
    };
}

function scoreSpotifyTrack(track, parsedQuery) {
    const expectedArtist =
        normalizeText(parsedQuery.artist);

    const expectedTitle =
        normalizeText(parsedQuery.title);

    const expectedBaseTitle =
        getBaseTitle(parsedQuery.title);

    const trackTitle =
        normalizeText(track.name);

    const trackBaseTitle =
        getBaseTitle(track.name);

    const artistNames =
        track.artists
            .map(artist => artist.name)
            .join(" ");

    const normalizedArtists =
        normalizeText(artistNames);

    const artistOverlap =
        tokenOverlap(
            parsedQuery.artist,
            artistNames
        );

    const titleOverlap =
        Math.max(
            tokenOverlap(
                parsedQuery.title,
                track.name
            ),
            tokenOverlap(
                expectedBaseTitle,
                trackBaseTitle
            )
        );

    const artistMatches =
        !expectedArtist ||
        normalizedArtists.includes(expectedArtist) ||
        expectedArtist.includes(normalizedArtists) ||
        artistOverlap >= 0.8;

    const titleMatches =
        !expectedTitle ||
        trackTitle === expectedTitle ||
        trackBaseTitle === expectedBaseTitle ||
        trackTitle.includes(expectedTitle) ||
        expectedTitle.includes(trackTitle) ||
        titleOverlap >= 0.75;

    let score = 0;

    if (artistMatches) {
        score += 55;
    } else if (expectedArtist) {
        score -= 80;
    }

    if (trackTitle === expectedTitle) {
        score += 55;
    } else if (trackBaseTitle === expectedBaseTitle) {
        score += 45;
    } else if (titleMatches) {
        score += 35;
    } else if (expectedTitle) {
        score -= 45;
    }

    score += Math.round(titleOverlap * 20);
    score += Math.round(artistOverlap * 15);
    score += Math.min(track.popularity || 0, 100) / 20;

    return {
        track,
        score,
        artistMatches,
        titleMatches,
        artistNames,
        title: track.name
    };
}

async function fetchSpotifySearch(query) {
    const response =
        await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=10`,
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
        return [];
    }

    if (!response.ok) {
        return [];
    }

    const data =
        await response.json();

    return data.tracks?.items || [];
}

async function spotifySearch(query) {
    if (!accessToken) {
        return null;
    }

    const parsedQuery =
        parseTrackQuery(query);

    if (!parsedQuery.raw) return null;

    try {
        const searchQueries =
            parsedQuery.artist
                ? [
                    `track:${parsedQuery.title} artist:${parsedQuery.artist}`,
                    `${parsedQuery.artist} ${parsedQuery.title}`,
                    parsedQuery.raw
                ]
                : [
                    parsedQuery.title,
                    parsedQuery.raw
                ];

        const resultsByUri =
            new Map();

        for (const searchQuery of searchQueries) {
            const results =
                await fetchSpotifySearch(
                    searchQuery
                );

            results.forEach(track => {
                if (!resultsByUri.has(track.uri)) {
                    resultsByUri.set(
                        track.uri,
                        track
                    );
                }
            });
        }

        const scoredTracks =
            [...resultsByUri.values()]
                .map(track =>
                    scoreSpotifyTrack(
                        track,
                        parsedQuery
                    )
                )
                .sort((a, b) => b.score - a.score);

        const bestMatch =
            scoredTracks[0];

        if (!bestMatch) {
            return null;
        }

        const minimumScore =
            parsedQuery.artist
                ? 85
                : 55;

        if (
            bestMatch.score < minimumScore ||
            !bestMatch.titleMatches ||
            (
                parsedQuery.artist &&
                !bestMatch.artistMatches
            )
        ) {

            msg(
                `⚠️ Coincidencia rechazada: ${bestMatch.artistNames} - ${bestMatch.title}`
            );

            return null;

        }

        msg(
            `✅ Match: ${bestMatch.artistNames} - ${bestMatch.title}`
        );

        return bestMatch.track;

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
            <button class="remove-btn" onclick="this.parentElement.parentElement.remove()" style="background: none; border: none; color: #ff4f64; cursor: pointer; font-size: 18px;">✕</button>
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

        console.log(
            "ME STATUS:",
            meResponse.status
        );

        const meData =
            await meResponse.json();

        console.log(
            "USUARIO:",
            meData
        );

        if (!meResponse.ok) {

            throw new Error(
                "No se pudo obtener el usuario Spotify"
            );

        }

        msg(
            `👤 Usuario: ${meData.display_name}`
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

        console.log(
            "PLAYLIST STATUS:",
            playlistResponse.status
        );

        const playlistData =
            await playlistResponse.json();

        console.log(
            "PLAYLIST RESPONSE:",
            playlistData
        );

        if (!playlistResponse.ok) {

            throw new Error(
                JSON.stringify(
                    playlistData
                )
            );

        }

        msg(
            `✅ Playlist creada: ${playlistData.name}`
        );

        const uris =
            [
                ...songs.querySelectorAll("li")
            ]
            .map(
                li => li.dataset.uri
            )
            .filter(
                uri =>
                    typeof uri === "string" &&
                    uri.startsWith(
                        "spotify:track:"
                    )
            );

        console.log(
            "URIS COMPLETAS JSON:",
            JSON.stringify(
                uris,
                null,
                2
            )
        );

        msg(
            `🎵 URIS encontradas: ${uris.length}`
        );

        if (
            uris.length === 0
        ) {

            msg(
                "⚠️ Playlist creada sin canciones."
            );

            return;

        }

        console.log(
            "PLAYLIST ID:",
            playlistData.id
        );

        console.log(
            "PLAYLIST OWNER:",
            playlistData.owner
        );

        for (let index = 0; index < uris.length; index += 100) {

            const chunk =
                uris.slice(
                    index,
                    index + 100
                );

            const addResponse =
                await fetch(
                    `https://api.spotify.com/v1/playlists/${playlistData.id}/items`,
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

            console.log(
                "ADD STATUS:",
                addResponse.status
            );

            const addText =
                await addResponse.text();

            console.log(
                "ADD RESPONSE COMPLETA:",
                addText
            );

            if (!addResponse.ok) {

                throw new Error(
                    addText
                );

            }

            msg(
                `✅ Agregadas ${Math.min(index + chunk.length, uris.length)}/${uris.length} canciones.`
            );

        }

        setConnected(
            playlistStatus,
            "Playlist 🟢"
        );

        msg(
            `🎉 Playlist creada correctamente con ${uris.length} canciones`
        );

        if (
            playlistData.external_urls &&
            playlistData.external_urls.spotify
        ) {

            window.open(
                playlistData.external_urls.spotify,
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
/* =========================================
   INICIALIZACIÓN
========================================= */

window.addEventListener(
"DOMContentLoaded",
async ()=>{

    spotifyStatus =
    document.getElementById(
    "spotifyStatus"
    );

    geminiStatus =
    document.getElementById(
    "geminiStatus"
    );

    playlistStatus =
    document.getElementById(
    "playlistStatus"
    );

    promptAI =
    document.getElementById(
    "promptAI"
    );

    songCount =
    document.getElementById(
    "songCount"
    );

    playlistName =
    document.getElementById(
    "playlistName"
    );

    songs =
    document.getElementById(
    "songs"
    );

    log =
    document.getElementById(
    "log"
    );

    msg(
    "🚀 Iniciando Spotify Playlist Creator..."
    );

    msg(
    `🧪 Versión cargada: ${APP_VERSION}`
    );

    const spotifyBtn =
    document.getElementById(
    "spotifyBtn"
    );

    const generateBtn =
    document.getElementById(
    "generateBtn"
    );

    const moreBtn =
    document.getElementById(
    "moreBtn"
    );

    const refreshBtn =
    document.getElementById(
    "refreshBtn"
    );

    const playlistBtn =
    document.getElementById(
    "playlistBtn"
    );

    const changeBtn =
    document.getElementById(
    "changeBtn"
    );

    if(
    spotifyBtn
    ){

        spotifyBtn.onclick =
        async ()=>{

            try{

                await loginSpotify();

            }catch(e){

                console.error(e);

                msg(
                `❌ Error: ${e.message}`
                );

            }

        };

    }

    if(generateBtn)
    generateBtn.onclick =
    ()=>generateGemini(false);

    if(moreBtn)
    moreBtn.onclick =
    ()=>generateGemini(true);

    if(refreshBtn)
    refreshBtn.onclick =
    refreshApp;

    if(playlistBtn)
    playlistBtn.onclick =
    createPlaylist;

    if(changeBtn)
    changeBtn.onclick =
    changeUser;

    updateStatus();

    await getToken();

    msg(
    "✅ Listo para usar!"
    );

});
