/* =========================================
   SPOTIFY AI v2.1 - CON OAUTH COMPLETO
========================================= */

// 🔒 URLs de los Workers
const AUTH_WORKER = "https://spotify-auth-worker.mixteko.workers.dev";
const GEMINI_WORKER = "https://spotify-ai-gemini.mixteko.workers.dev";
const REDIRECT_URI = "https://mixteko.github.io/spotyplay/";
const APP_VERSION = "v2.8-match-fix-2026-06-10";

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
let spotifySearchCache = new Map();
let selectedTrackCache = new Map();
let activeJobId = 0;
let spotifyRateLimitedUntil = 0;

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
    element.innerText =
        text.replace(/[🟢🔴⚪⏳]/g, "").trim();
    element.className = "status connected";
    element.style.color = "";
}

function setDisconnected(element, text) {
    if (!element) return;
    element.innerText =
        text.replace(/[🟢🔴⚪⏳]/g, "").trim();
    element.className = "status disconnected";
    element.style.color = "";
}

function updateStatus() {
    if (accessToken) {
        setConnected(spotifyStatus, "Spotify");
    } else {
        setDisconnected(spotifyStatus, "Spotify");
    }
    setDisconnected(geminiStatus, "Gemini AI");
    setDisconnected(playlistStatus, "Playlist");
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
        const jobId =
            ++activeJobId;

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

        const targetCount =
            Math.min(
                count,
                100
            );

        const aiCount =
            Math.min(
                moreTracks
                    ? targetCount * 2
                    : targetCount * 3,
                100
            );

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

Devuelve canciones reales y populares que existan en Spotify.
Usa siempre el formato exacto: Artista - Canción.
Respeta los artistas, canciones, géneros, idioma y región solicitados.
Si el usuario menciona artistas, prioriza canciones de esos artistas.
No inventes canciones. No expliques nada. Solo devuelve la lista.`,

                        count:
                            aiCount,

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

            songs.value = "";
            selectedTrackCache.clear();

        }

        let found = 0;

        for (
            const trackStr of data.tracks
        ) {
            if (jobId !== activeJobId) {
                msg(
                    "⏹️ Generación cancelada."
                );

                return;
            }

            appendSongLine(
                trackStr
            );

            found++;

            if (
                found >= targetCount
            ) {

                break;

            }

        }

        msg(
            `✨ Agregadas ${found} canciones al builder.`
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

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

async function sleepForJob(ms, jobId) {
    const step = 250;
    let elapsed = 0;

    while (elapsed < ms) {
        if (jobId !== activeJobId) {
            return false;
        }

        await sleep(
            Math.min(step, ms - elapsed)
        );

        elapsed += step;
    }

    return jobId === activeJobId;
}

function sanitizeSpotifyQuery(query) {
    return String(query || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[–—]/g, " ")
        .replace(/["“”'’‘]/g, "")
        .replace(/[(){}\[\]]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
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

function getQueryOptions(parsedQuery) {
    const options = [
        parsedQuery
    ];

    if (
        parsedQuery.artist &&
        parsedQuery.title
    ) {
        options.push({
            raw: `${parsedQuery.title} - ${parsedQuery.artist}`,
            artist: parsedQuery.title,
            title: parsedQuery.artist
        });
    }

    return options;
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
        titleOverlap,
        artistOverlap,
        artistNames,
        title: track.name
    };
}

async function fetchSpotifySearch(query, jobId) {
    const cleanQuery =
        sanitizeSpotifyQuery(query);

    if (!cleanQuery) {
        return [];
    }

    const cacheKey =
        normalizeText(cleanQuery);

    if (spotifySearchCache.has(cacheKey)) {
        return spotifySearchCache.get(cacheKey);
    }

    if (
        Date.now() < spotifyRateLimitedUntil
    ) {
        return [];
    }

    for (let attempt = 1; attempt <= 2; attempt++) {

        const canContinue =
            await sleepForJob(
                2400 * attempt,
                jobId
            );

        if (!canContinue) {
            return [];
        }

        const response =
            await fetch(
                `https://api.spotify.com/v1/search?q=${encodeURIComponent(cleanQuery)}&type=track&limit=5`,
                {
                    headers: {
                        "Authorization": `Bearer ${accessToken}`
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

        if (response.status === 429) {
            const retryAfter =
                parseInt(
                    response.headers.get("Retry-After") || "8",
                    10
                );

            spotifyRateLimitedUntil =
                Date.now() + Math.max(retryAfter, 8) * 1000;

            msg(
                `⏳ Spotify limitó las búsquedas. Espera ${Math.max(retryAfter, 8)}s antes de volver a crear.`
            );

            return [];
        }

        if (!response.ok) {
            console.warn(
                "Spotify search error:",
                response.status,
                cleanQuery
            );

            return [];
        }

        const data =
            await response.json();

        const tracks =
            data.tracks?.items || [];

        spotifySearchCache.set(
            cacheKey,
            tracks
        );

        return tracks;

    }

    return [];
}

async function spotifySearch(query, jobId = activeJobId) {
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
                    `${parsedQuery.artist} ${parsedQuery.title}`
                ]
                : [
                    parsedQuery.title
                ];

        const resultsByUri =
            new Map();

        for (const searchQuery of searchQueries) {
            if (jobId !== activeJobId) {
                return null;
            }

            const results =
                await fetchSpotifySearch(
                    searchQuery,
                    jobId
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

        const queryOptions =
            getQueryOptions(
                parsedQuery
            );

        const scoredTracks =
            [...resultsByUri.values()]
                .map(track => {
                    const scores =
                        queryOptions.map(option =>
                            scoreSpotifyTrack(
                                track,
                                option
                            )
                        );

                    return scores.sort((a, b) => b.score - a.score)[0];
                })
                .sort((a, b) => b.score - a.score);

        const bestMatch =
            scoredTracks[0];

        if (!bestMatch) {
            if (
                Date.now() < spotifyRateLimitedUntil
            ) {
                msg(
                    `⏳ Búsqueda pausada por límite de Spotify: ${parsedQuery.raw}`
                );
            }

            return null;
        }

        const minimumScore =
            parsedQuery.artist
                ? 58
                : 45;

        const acceptableArtistMatch =
            !parsedQuery.artist ||
            bestMatch.artistMatches ||
            bestMatch.artistOverlap >= 0.3;

        const strongTitleMatch =
            bestMatch.titleMatches &&
            bestMatch.titleOverlap >= 0.82;

        if (
            bestMatch.score < minimumScore ||
            !bestMatch.titleMatches ||
            !acceptableArtistMatch
        ) {

            msg(
                `⚠️ Coincidencia rechazada: ${bestMatch.artistNames} - ${bestMatch.title}`
            );

            return null;

        }

        if (
            parsedQuery.artist &&
            !bestMatch.artistMatches &&
            strongTitleMatch
        ) {

            msg(
                `ℹ️ Artista aproximado: ${bestMatch.artistNames} - ${bestMatch.title}`
            );

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

function getSongLines() {
    if (!songs) return [];

    return songs.value
        .split("\n")
        .map(line =>
            line
                .replace(/^\s*\d+[\.\)]\s*/, "")
                .trim()
        )
        .filter(Boolean);
}

async function getCurrentSongUris(jobId = activeJobId) {
    const lines =
        getSongLines();

    const uris = [];
    const usedUris = new Set();

    for (const line of lines) {
        if (jobId !== activeJobId) {
            return uris;
        }

        if (
            Date.now() < spotifyRateLimitedUntil
        ) {
            msg(
                "⏳ Spotify sigue limitando búsquedas. Espera unos segundos antes de intentar otra vez."
            );

            return uris;
        }

        const cacheKey =
            normalizeText(line);

        let uri =
            selectedTrackCache.get(cacheKey);

        if (!uri) {
            const track =
                await spotifySearch(
                    line,
                    jobId
                );

            uri =
                track?.uri || "";

            if (uri) {
                selectedTrackCache.set(
                    cacheKey,
                    uri
                );
            }
        }

        if (
            uri &&
            !usedUris.has(uri)
        ) {
            uris.push(uri);
            usedUris.add(uri);
        }
    }

    return uris;
}

function refreshSongNumbers() {
    return;
}

function appendSongLine(line, uri = "") {
    if (!songs || !line) return;

    const cleanLine =
        line.trim();

    const existingLines =
        getSongLines()
            .map(item =>
                normalizeText(item)
            )
    ;

    if (
        existingLines.includes(
            normalizeText(cleanLine)
        )
    ) {
        return;
    }

    songs.value =
        songs.value.trim()
            ? `${songs.value.trim()}\n${cleanLine}`
            : cleanLine;

    if (uri) {
        selectedTrackCache.set(
            normalizeText(cleanLine),
            uri
        );
    }
}

function getManualSongLines() {
    return getSongLines();
}

async function addManualSongsToList() {
    return;
}

function appendSongToList(track) {
    if (!songs) return;

    const artistNames =
        track.artists
            .map(a => a.name)
            .join(", ");

    appendSongLine(
        `${artistNames} - ${track.name}`,
        track.uri
    );
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
        const jobId =
            ++activeJobId;

        setConnected(
            playlistStatus,
            "Creando"
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

        await addManualSongsToList();

        const uris =
            await getCurrentSongUris(jobId);

        if (jobId !== activeJobId) {
            msg(
                "⏹️ Búsqueda cancelada."
            );

            return;
        }

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
                "⚠️ No hay canciones para crear la playlist."
            );

            setDisconnected(
                playlistStatus,
                "Playlist"
            );

            return;

        }

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
    activeJobId++;

    if (songs) {
        songs.value = "";
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

    selectedTrackCache.clear();
    spotifySearchCache.clear();

    updateStatus();

    msg(
        "🔄 Aplicación reiniciada. Búsquedas canceladas."
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
