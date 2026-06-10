# spotify-search-worker

Worker de Cloudflare para resolver canciones a URIs de Spotify sin saturar el navegador.

## Qué hace

- Recibe canciones en texto.
- Busca máximo 5 canciones por petición.
- Respeta `429 Too Many Requests`.
- Devuelve `retryAfter` cuando Spotify pide pausa.
- Usa cache de Cloudflare para repetir menos búsquedas.

## Probar salud

```bash
curl https://spotify-search-worker.TU_USUARIO.workers.dev/health
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
