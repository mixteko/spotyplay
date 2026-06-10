# spotify-search-worker

Worker de Cloudflare para resolver canciones a URIs de Spotify sin saturar el navegador.

## Qué hace

- Recibe canciones en texto.
- Busca máximo 5 canciones por petición para no superar límites de Cloudflare.
- Se detiene al primer `rate_limited` para no gastar llamadas.
- Acepta `Maná - Rayando el Sol` y `mana-rayando el sol`.
- Usa `SPOTIFY_CLIENT_ID` y `SPOTIFY_CLIENT_SECRET` si están configurados.
- Si la API de Spotify falla, intenta un respaldo con la búsqueda pública de Spotify.
- Usa cache versionado de Cloudflare y no guarda búsquedas vacías.

## Probar salud

```bash
curl https://spotify-search-worker.TU_USUARIO.workers.dev/health
```

Debe responder con:

```json
{
  "ok": true,
  "service": "spotify-search-worker",
  "version": "resolver-v8-accurate-batches",
  "maxTracksPerRequest": 5,
  "spotifyCredentialsConfigured": true
}
```

## Resolver canciones

```bash
curl -X POST https://spotify-search-worker.TU_USUARIO.workers.dev/resolve \
  -H "Authorization: Bearer TU_SPOTIFY_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tracks": [
      "BTS - Dynamite",
      "BLACKPINK - DDU-DU DDU-DU"
    ],
    "market": "US"
  }'
```

## Publicar

Desde esta carpeta:

```bash
npx wrangler deploy
```

Cuando Cloudflare te dé la URL, úsala en la app principal como Worker de búsqueda.
