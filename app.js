/* =========================================
   SPOTIFY AI v1.15 CLOUD SECURE
========================================= */

const CLIENT_ID =
"6c398ae66eae4f84959cfce08bd0c74c";

const REDIRECT_URI =
"https://mixteko.github.io/spotyplay/";

const WORKER_URL =
"https://spotify-ai-gemini.mixteko.workers.dev";

const SCOPES = [

"user-read-private",
"user-read-email",

"playlist-read-private",

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

window.location =
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

show_dialog:
true,

code_challenge_method:
"S256",

code_challenge:
challengeCode

});

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

if(data.access_token){

accessToken =
data.access_token;

localStorage.setItem(
"spotify_token",
accessToken
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

localStorage.clear();

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

const response =
await fetch(

`https://api.spotify.com/v1/search?q=${encodeURIComponent(cleanQuery)}&type=track&limit=3`,

{
headers:{
Authorization:
`Bearer ${accessToken}`
}
}

);

if(response.status === 429){

msg(
`Spotify limit: ${cleanQuery}`
);

await new Promise(
resolve =>
setTimeout(
resolve,
2000
)
);

return [];

}

if(!response.ok){

const txt =
await response.text();

console.error(
"Spotify Error:",
response.status,
cleanQuery,
txt
);

return [];

}

const data =
await response.json();

return data?.tracks?.items || [];

}catch(error){

console.error(
error
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

await new Promise(
resolve =>
setTimeout(
resolve,
1200
)
);

try{

const results =
await spotifySearch(
song
);

if(!results.length){

msg(
`No encontrada: ${song}`
);

return null;

}

const track =
results[0];

msg(
`Exacta: ${song}`
);

return track.uri;

}catch(error){

console.error(
error
);

return null;

}

}
/* =========================================
   CREAR PLAYLIST
========================================= */

async function createPlaylist(){

try{

if(!accessToken){

msg(
"Spotify no conectado"
);

return;

}

msg(
"Creando playlist..."
);

const finalName =

playlistName.value.trim()

||

`${promptAI.value || "Playlist"} Mix`;

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

description:
"Generada con Spotify AI Cloud"

})

}

);

const playlist =
await playlistResponse.json();

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

const uris =

(
await Promise.all(
lines.map(
searchSong
)
)
)

.filter(Boolean);

const uniqueUris =
[
...new Set(
uris
)
];

msg(
`Encontradas: ${uniqueUris.length}`
);

if(
!uniqueUris.length
){

msg(
"No agregué canciones"
);

return;

}

/* ==========================
   AGREGAR CANCIONES
========================== */

msg(
"Agregando canciones..."
);

for(
let i=0;
i<uniqueUris.length;
i+=100
){

const chunk =
uniqueUris.slice(
i,
i+100
);

const addResponse =
await fetch(

`https://api.spotify.com/v1/playlists/${playlist.id}/tracks?position=0`,

{
method:"POST",

headers:{
Authorization:
`Bearer ${accessToken}`,

"Content-Type":
"application/json"
},

body:JSON.stringify({

uris:chunk

})

}

);

const result =
await addResponse.json();

console.log(
"ADD STATUS:",
addResponse.status
);

console.log(
"ADD RESPONSE:",
result
);

if(
result.error
){

msg(
JSON.stringify(
result.error,
null,
2
)
);

return;

}

updateProgress(

Math.min(
i+100,
uniqueUris.length
),

uniqueUris.length

);

}

/* ==========================
   FINALIZAR
========================== */

setConnected(
playlistStatus,
"Playlist 🟢"
);

msg(
`Playlist completada con ${uniqueUris.length} canciones`
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

/* =========================
   VALIDAR ELEMENTOS
========================= */

if(
!spotifyBtn ||
!generateBtn ||
!moreBtn ||
!refreshBtn ||
!playlistBtn ||
!changeBtn
){

console.error(
"Faltan elementos HTML"
);

return;

}

/* =========================
   EVENTOS
========================= */

spotifyBtn.onclick =
async ()=>{

try{

await loginSpotify();

}catch(error){

console.error(
error
);

msg(
"Error Spotify Login"
);

}

};

generateBtn.onclick =
()=>generateGemini(false);

moreBtn.onclick =
()=>generateGemini(true);

refreshBtn.onclick =
refreshApp;

playlistBtn.onclick =
async ()=>{

try{

await createPlaylist();

}catch(error){

console.error(
error
);

msg(
"Error Playlist"
);

}

};

changeBtn.onclick =
changeUser;

/* =========================
   INICIO
========================= */

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
