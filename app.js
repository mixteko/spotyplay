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

        if (!data.authUrl) {

            throw new Error(
                "No se recibió authUrl"
            );

        }

        window.location.href =
            data.authUrl;

    } catch (error) {

        console.error(error);

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

            if (!response.ok) {

                throw new Error(
                    JSON.stringify(
                        responseData,
                        null,
                        2
                    )
                );

            }

            accessToken =
                responseData.access_token;

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

            console.error(error);

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

    if (savedToken) {

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

    loginSpotify();

}

/* =========================================
   GENERADOR DE CANCIONES CON GEMINI
========================================= */
async function generateGemini(moreTracks = false) {
    if (!promptAI || !promptAI.value.trim()) {
        msg("❌ Escribe una descripción para la Playlist");
        return;
    }

    if (!accessToken) {
        msg("❌ Primero conecta tu cuenta de Spotify");
        return;
    }

    try {
        setConnected(geminiStatus, "Procesando con Gemini AI... ⏳");
        msg("📡 Conectando con Gemini Cloud...");

        const count = songCount ? parseInt(songCount.value) : 20;

        const response = await fetch(GEMINI_WORKER, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                prompt: promptAI.value,
                count: Math.min(count, 100),
                more: moreTracks
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`Worker error: ${response.status} - ${errorData.error || "desconocido"}`);
        }

        const data = await response.json();

        if (!data.tracks || data.tracks.length === 0) {
            throw new Error("Gemini no devolvió canciones. Intenta otra descripción.");
        }

        setConnected(geminiStatus, "Gemini AI 🟢");
        msg(`✅ Gemini sugirió ${data.tracks.length} canciones.`);

        if (!moreTracks && songs) songs.innerHTML = "";

        let found = 0;

        for (const trackStr of data.tracks) {

            msg(`🔍 Buscando: "${trackStr}"`);

            const spotifyTrack =
                await spotifySearch(trackStr);

            if (spotifyTrack) {

                appendSongToList(spotifyTrack);

                found++;

            } else {

                msg(`⚠️ No encontrada: ${trackStr}`);

            }

        }

        msg(`✨ Encontradas ${found}/${data.tracks.length} canciones.`);

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
        msg("❌ Primero debes conectar Spotify.");
        return;
    }

    try {
        setConnected(playlistStatus, "Creando... ⏳");
        
        const finalName = (playlistName && playlistName.value.trim()) 
            ? playlistName.value 
            : "Mi Playlist AI";

        msg(`📝 Nombre de la playlist: "${finalName}"`);

        const meResponse = await fetch("https://api.spotify.com/v1/me", {
            headers: { "Authorization": `Bearer ${accessToken}` }
        });

        if (!meResponse.ok) throw new Error("No se pudo obtener tu perfil.");
        
        const meData = await meResponse.json();
        const userId = meData.id;
        msg(`👤 Usuario: ${meData.display_name}`);

        const playlistResponse = await fetch(
            `https://api.spotify.com/v1/users/${userId}/playlists`,
            {
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
            }
        );

        if (!playlistResponse.ok) throw new Error("Error al crear la playlist.");
        
        const playlist = await playlistResponse.json();
        msg(`✅ Playlist creada: ${playlist.id}`);

        const uris = [...songs.querySelectorAll("li")].map(li => li.dataset.uri);
        
        if (uris.length === 0) {
            setConnected(playlistStatus, "Vacía 🟢");
            msg("⚠️ Playlist creada sin canciones.");
            if (playlist.external_urls?.spotify) {
                window.open(playlist.external_urls.spotify, "_blank");
            }
            return;
        }

        const chunks = [];
        for (let i = 0; i < uris.length; i += 100) {
            chunks.push(uris.slice(i, i + 100));
        }

        let addedCount = 0;
        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            msg(`🎵 Agregando canciones (${i + 1}/${chunks.length})...`);

            const addResponse = await fetch(
                `https://api.spotify.com/v1/playlists/${playlist.id}/tracks`,
                {
                    method: "POST",
                    headers: {
                        "Authorization": `Bearer ${accessToken}`,
                        "Content-Type": "application/json"
                    },
                    body: JSON.stringify({ uris: chunk })
                }
            );

            if (!addResponse.ok) {
                throw new Error(`Error al agregar canciones (lote ${i + 1})`);
            }

            addedCount += chunk.length;
        }

        setConnected(playlistStatus, "Playlist 🟢");
        msg(`✨ ¡Éxito! Playlist creada con ${addedCount} canciones.`);

        if (playlist.external_urls?.spotify) {
            window.open(playlist.external_urls.spotify, "_blank");
        }

    } catch (error) {
        console.error("Error en createPlaylist:", error);
        setDisconnected(playlistStatus, "Error 🔴");
        msg(`❌ Error: ${error.message}`);
    }
}

function refreshApp() {
    if (songs) songs.innerHTML = "";
    if (promptAI) promptAI.value = "";
    if (playlistName) playlistName.value = "";
    if (songCount) songCount.value = "20";
    updateStatus();
    msg("🔄 App reseteada correctamente.");
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
