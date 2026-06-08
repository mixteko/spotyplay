/* =========================================
   SPOTIFY AI v1.15 CLOUD SECURE
========================================= */

const CLIENT_ID =
"6f2af5f678674eff85c3b3cb45a06080";

const REDIRECT_URI =
"https://mixteko.github.io/spotyplay/";

const WORKER_URL =
"https://spotify-ai-gemini.mixteko.workers.dev";

const SCOPES = [

"user-read-private",
"user-read-email",

"playlist-read-private",
"playlist-read-collaborative",

"playlist-modify-private",
"playlist-modify-public"

].join(" ");

let accessToken =
localStorage.getItem(
"spotify_token"
) || "";

/* =========================================
   ELEMENTOS DOM
========================================= */

const spotifyStatus =
document.getElementById(
"spotifyStatus"
);

const geminiStatus =
document.getElementById(
"geminiStatus"
);

const playlistStatus =
document.getElementById(
"playlistStatus"
);

const promptAI =
document.getElementById(
"promptAI"
);

const songCount =
document.getElementById(
"songCount"
);

const playlistName =
document.getElementById(
"playlistName"
);

const songs =
document.getElementById(
"songs"
);

const log =
document.getElementById(
"log"
);

/* =========================================
   LOG
========================================= */

function msg(text){

if(!log) return;

log.innerHTML +=
"\n" + text;

log.scrollTop =
log.scrollHeight;

}

/* =========================================
   STATUS
========================================= */

function setConnected(
element,
text
){

if(!element) return;

element.className =
"status connected";

element.innerHTML =
text;

}

function setDisconnected(
element,
text
){

if(!element) return;

element.className =
"status disconnected";

element.innerHTML =
text;

}

function updateStatus(){

if(accessToken){

setConnected(
spotifyStatus,
"Spotify 🟢"
);

}else{

setDisconnected(
spotifyStatus,
"Spotify 🔴"
);

}

setConnected(
geminiStatus,
"Gemini Cloud 🟢"
);

}

/* =========================================
   REFRESH
========================================= */

function refreshApp(){

promptAI.value="";

playlistName.value="";

songs.value="";

document.getElementById(
"songCounter"
).innerText=
"0 / 0 canciones";

document.getElementById(
"progressBar"
).style.width=
"0%";

playlistStatus.className =
"status disconnected";

playlistStatus.innerHTML =
"Playlist 🔴";

log.innerHTML =
"Refrescado";

}

/* =========================================
   PKCE
========================================= */

function randomString(
length
){

return [...Array(length)]
.map(
()=>Math.random()
.toString(36)[2]
)
.join("");

}

async function challenge(
verifier
){

const data =
new TextEncoder()
.encode(verifier);

const digest =
await crypto.subtle.digest(
"SHA-256",
data
);

return btoa(
String.fromCharCode(
...new Uint8Array(
digest
)
)
)
.replace(/\+/g,"-")
.replace(/\//g,"_")
.replace(/=/g,"");

}

/* =========================================
   LOGIN SPOTIFY
========================================= */

async function loginSpotify(){

localStorage.removeItem(
"spotify_token"
);

localStorage.removeItem(
"spotify_verifier"
);

const verifier =
randomString(64);

localStorage.setItem(
"spotify_verifier",
verifier
);

const challengeCode =
await challenge(
verifier
);

const authUrl =
"https://accounts.spotify.com/authorize?"
+
new URLSearchParams({

client_id:
CLIENT_ID,

response_type:
"code",

redirect_uri:
REDIRECT_URI,

scope:
SCOPES,

show_dialog:"true",

code_challenge_method:
"S256",

code_challenge:
challengeCode

});

window.location.href =
authUrl;

}
/* =========================================
   TOKEN SPOTIFY
========================================= */

async function getToken(){

const code =
new URLSearchParams(
location.search
).get("code");

if(!code){

accessToken =
localStorage.getItem(
"spotify_token"
) || "";

updateStatus();

return;

}

try{

const verifier =
localStorage.getItem(
"spotify_verifier"
);

if(!verifier){

msg(
"No existe spotify_verifier"
);

return;

}

const body =
new URLSearchParams({

client_id:
CLIENT_ID,

grant_type:
"authorization_code",

code,

redirect_uri:
REDIRECT_URI,

code_verifier:
verifier

});

const response =
await fetch(

"https://accounts.spotify.com/api/token",

{
method:"POST",

headers:{
"Content-Type":
"application/x-www-form-urlencoded"
},

body

}

);

const data =
await response.json();

console.log(
"TOKEN RESPONSE:",
data
);

if(data.access_token){

accessToken =
data.access_token;

localStorage.setItem(
"spotify_token",
accessToken
);

console.log(
"SCOPES:",
data.scope
);

window.history.replaceState(
{},
document.title,
window.location.pathname
);

updateStatus();

const meResponse =
await fetch(

"https://api.spotify.com/v1/me",

{
headers:{
Authorization:
`Bearer ${accessToken}`
}
}

);

const me =
await meResponse.json();

console.log(
"SPOTIFY USER:",
me.id
);

msg(
"Spotify conectado"
);

}else{

msg(
JSON.stringify(
data,
null,
2
)
);

}

}catch(error){

console.error(
error
);

msg(
"Error Spotify"
);

}

}
/* =========================================
   CAMBIAR CUENTA
========================================= */

function changeUser(){

localStorage.removeItem(
"spotify_token"
);

localStorage.removeItem(
"spotify_verifier"
);

window.location.href =
window.location.origin +
window.location.pathname;

}

/* =========================================
   GEMINI CLOUD
========================================= */

async function generateGemini(
more=false
){

const target =
parseInt(
songCount.value
);

document.getElementById(
"songCounter"
).innerText =
`0 / ${target} canciones`;

document.getElementById(
"progressBar"
).style.width =
"0%";

try{

msg(
"Conectando Gemini Cloud..."
);

const response =
await fetch(

WORKER_URL,

{
method:"POST",

headers:{
"Content-Type":
"application/json"
},

body:JSON.stringify({

contents:[
{
parts:[
{
text:`

Genera EXACTAMENTE ${target} canciones.

REGLAS:

- Una canción por línea
- No numerar
- No explicar
- No comentar
- No repetir canciones
- Respetar exactamente el artista solicitado

Formato:

ARTISTA - CANCION

Tema:

${promptAI.value}

${more
? "No repetir canciones anteriores"
: ""}

`
}
]
}
],

generationConfig:{

temperature:0.7,

topP:0.9,

topK:40,

maxOutputTokens:8192

}

})

}

);

const data =
await response.json();

if(data.error){

msg(
JSON.stringify(
data.error,
null,
2
)
);

return;

}

const text =

data?.candidates?.[0]
?.content?.parts?.[0]
?.text || "";

if(!text){

msg(
"Gemini no devolvió canciones"
);

return;

}

let lines =

text
.split("\n")
.map(
x=>x.trim()
)
.filter(
x=>x.includes("-")
);

lines =
[
...new Set(lines)
];

if(
lines.length >
target
){

lines =
lines.slice(
0,
target
);

}

songs.value =
lines.join("\n");

document.getElementById(
"songCounter"
).innerText =
`${lines.length} / ${target} canciones`;

document.getElementById(
"progressBar"
).style.width =
`${Math.min(
100,
(lines.length/target)*100
)}%`;

msg(
`Lista generada: ${lines.length} canciones`
);

}catch(error){

console.error(
error
);

msg(
"Error Gemini Cloud"
);

}

}
/* =========================================
   LIMPIEZA CANCIONES
========================================= */

function cleanSong(song){

song =
song

.normalize("NFKC")

.replace(
/[\u2018\u2019]/g,
"'"
)

.replace(
/[\u201C\u201D]/g,
'"'
)

.replace(
/[\u2013\u2014\u2212]/g,
"-"
)

.replace(
/^\d+\./,
""
)

.replace(
/\*\*/g,
""
)

.replace(
/\*/g,
""
)

.replace(
/•/g,
""
)

.replace(
/\(.*?\)/g,
""
)

.trim();

const low =
song.toLowerCase();

if(low.includes("aquí tienes"))
return "";

if(low.includes("exactamente"))
return "";

if(low.includes("canciones"))
return "";

return song;

}

/* =========================================
   PROGRESO
========================================= */

function updateProgress(
current,
total
){

document.getElementById(
"songCounter"
).innerText =
`${current} / ${total} canciones`;

document.getElementById(
"progressBar"
).style.width =
`${Math.min(
100,
(current/total)*100
)}%`;

}

/* =========================================
   SPOTIFY SEARCH
========================================= */

async function spotifySearch(query){

try{

const cleanQuery =
query
.replace(/'/g,"")
.replace(/"/g,"")
.trim();

msg(
`TOKEN: ${accessToken ? "OK" : "NO"}`
);

// CORREGIDO: Se añadió el signo '$' antes de la llave
const response =
await fetch(

`https://api.spotify.com/v1/search?q=${encodeURIComponent(cleanQuery)}&type=track&limit=1`,

{
headers:{
Authorization:
`Bearer ${accessToken}`
}
}

);

msg(
`STATUS: ${response.status}`
);

msg(
`RETRY: ${response.headers.get("Retry-After") || "NULL"}`
);

if(response.status === 429){

msg(
`Spotify limit: ${cleanQuery}`
);

return [];

}

if(!response.ok){

const txt =
await response.text();

msg(
`ERROR: ${response.status}`
);

console.error(txt);

return [];

}

const data =
await response.json();

msg(
`TRACKS: ${data?.tracks?.items?.length || 0}`
);

return data?.tracks?.items || [];

}catch(error){

console.error(error);

msg(
`ERROR JS: ${error.message}`
);

return [];

}

}

/* =========================================
   BUSQUEDA PRECISA
========================================= */

async function searchSong(
song
){

song =
cleanSong(song);

if(!song){

return null;

}

try{

await new Promise(
resolve =>
setTimeout(
resolve,
1500
)
);

const results =
await spotifySearch(
song
);

if(
!results ||
!results.length
){

msg(
`No encontrada: ${song}`
);

return null;

}

const bestTrack =
results[0];

console.log(
"TRACK:",
bestTrack
);

console.log(
"TRACK URI:",
bestTrack.uri
);

console.log(
"TRACK ID:",
bestTrack.id
);

msg(
`Encontrada: ${song}`
);

return bestTrack.uri;

}catch(error){

console.error(
error
);

msg(
`Error: ${song}`
);

return null;

}

}

/* ==========================
   CREAR PLAYLIST SPOTIFY
========================== */

// SE REQUIERE EL ID DEL USUARIO OBLIGATORIAMENTE EN LA URL
const playlistResponse =
await fetch(

`https://api.spotify.com/v1/me/playlists`,

{
method:"POST",

headers:{
Authorization:
`Bearer ${accessToken}`,

"Content-Type":
"application/json"
},

body:JSON.stringify({

name:finalName,

public:false,

collaborative:false,

description:
"Generada con Spotify AI Cloud"

})

}

);

/* ==========================
   CREAR PLAYLIST SPOTIFY
========================== */

const playlistResponse =
await fetch(

"https://api.spotify.com/v1/me/playlists",

{
method:"POST",

headers:{
Authorization:
`Bearer ${accessToken}`,

"Content-Type":
"application/json"
},

body:JSON.stringify({

name:finalName,

public:false,

collaborative:false,

description:
"Generada con Spotify AI Cloud"

})

}

);

console.log(
"CREATE STATUS:",
playlistResponse.status
);

console.log(
"CREATE HEADERS:",
Object.fromEntries(
playlistResponse.headers.entries()
)
);

const playlist =
await playlistResponse.json();

console.log(
"PLAYLIST RESPONSE:",
playlist
);

console.log(
"PLAYLIST OWNER:",
playlist.owner
);

console.log(
"PLAYLIST OWNER ID:",
playlist.owner?.id
);

if(
playlist.error
){

msg(
JSON.stringify(
playlist.error,
null,
2
)
);

return;

}

msg(
`Playlist creada: ${playlist.name}`
);

console.log(
"PLAYLIST ID:",
playlist.id
);

console.log(
"PLAYLIST URL:",
playlist.external_urls?.spotify
);
/* ==========================
   LEER CANCIONES
========================== */

const lines =

songs.value

.split("\n")

.map(
cleanSong
)

.filter(Boolean);

if(
!lines.length
){

msg(
"No hay canciones"
);

return;

}

msg(
`Buscando ${lines.length} canciones...`
);

/* ==========================
   BUSCAR CANCIONES
========================== */
async function spotifySearch(query) {
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

    if (!response.ok) throw new Error("Error buscando canción");
    const data = await response.json();
    return data.tracks.items[0];
}
/* ==========================
   CREAR PLAYLIST
========================== */
async function createPlaylist() {
    try {
        const finalName = playlistName.value || "Mi Playlist AI";
        
        // 1. Crear playlist
        const playlistResponse = await fetch(`https://api.spotify.com/v1/users/${me.id}/playlists`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                name: finalName,
                public: false,
                collaborative: false,
                description: "Generada con Spotify AI Cloud"
            })
        });

        if (!playlistResponse.ok) throw new Error("Error creando la playlist");
        const playlist = await playlistResponse.json();

        // 2. Agregar canciones
        const uris = [...songs.querySelectorAll("li")].map(li => li.dataset.uri);
        const chunk = uris.slice(0, 100);

        const addResponse = await fetch(`https://api.spotify.com/v1/playlists/${playlist.id}/tracks`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${accessToken}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ uris: chunk })
        });

        if (!addResponse.ok) throw new Error("Error agregando canciones");

/* ==========================
   FINALIZAR
========================== */

setConnected(
playlistStatus,
"Playlist 🟢"
);

msg(
`Playlist completada con ${uris.length} canciones`
);

if(
playlist.external_urls?.spotify
){

window.open(
playlist.external_urls.spotify,
"_blank"
);

}

}catch(error){

console.error(
error
);

msg(
"Error creando playlist"
);

}

}
/* =========================================
   INICIALIZACION
========================================= */

window.addEventListener(

"DOMContentLoaded",

async ()=>{

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

if(!spotifyBtn){

console.error(
"No existe spotifyBtn"
);

return;

}

spotifyBtn.onclick =
async ()=>{

try{

await loginSpotify();

}catch(error){

console.error(error);

}

};

generateBtn.onclick =
()=>generateGemini(false);

moreBtn.onclick =
()=>generateGemini(true);

refreshBtn.onclick =
refreshApp;

playlistBtn.onclick =
createPlaylist;

changeBtn.onclick =
changeUser;

updateStatus();

await getToken();

msg(
"Spotify AI v1.15 Cloud Secure iniciado"
);

}

);

/* =========================================
   FIN APP.JS
========================================= */
