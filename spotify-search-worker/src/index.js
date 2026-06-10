const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400"
};

const MAX_TRACKS_PER_REQUEST = 5;
const SPOTIFY_SEARCH_LIMIT = 5;
const MAX_RETRY_AFTER_SECONDS = 90;

export default {
    async fetch(request, env) {
        if (request.method === "OPTIONS") {
            return new Response(null, {
                status: 204,
                headers: CORS_HEADERS
            });
        }

        const url = new URL(request.url);

        if (request.method === "GET" && url.pathname === "/health") {
            return jsonResponse({
                ok: true,
                service: "spotify-search-worker",
                spotifyCredentialsConfigured: Boolean(
                    env &&
                    env.SPOTIFY_CLIENT_ID &&
                    env.SPOTIFY_CLIENT_SECRET
                )
            });
        }

        if (request.method === "POST" && url.pathname === "/resolve") {
            return resolveTracks(request, env);
        }

        return jsonResponse({
            ok: false,
            error: "Ruta no encontrada"
        }, 404);
    }
};

async function resolveTracks(request, env) {
    const authorization =
        request.headers.get("Authorization") || "";

    if (!authorization.startsWith("Bearer ")) {
        return jsonResponse({
            ok: false,
            error: "Falta Authorization: Bearer TOKEN"
        }, 401);
    }

    let body;

    try {
        body = await request.json();
    } catch (error) {
        return jsonResponse({
            ok: false,
            error: "JSON inválido"
        }, 400);
    }

    const lines =
        Array.isArray(body.tracks)
            ? body.tracks
            : [];

    const market =
        sanitizeMarket(body.market || "US");

    const tracksToResolve =
        lines
            .map(cleanTrackLine)
            .filter(Boolean)
            .slice(0, MAX_TRACKS_PER_REQUEST);

    const resolved = [];
    const unresolved = [];

    for (const line of tracksToResolve) {
        const result =
            await resolveSingleTrack(
                line,
                authorization,
                market,
                env
            );

        if (result.rateLimited) {
            return jsonResponse({
                ok: true,
                rateLimited: true,
                retryAfter: result.retryAfter,
                resolved,
                unresolved,
                remaining: lines.slice(resolved.length + unresolved.length)
            });
        }

        if (result.track) {
            resolved.push({
                input: line,
                uri: result.track.uri,
                name: result.track.name,
                artists: result.track.artists.map(artist => artist.name)
            });
        } else {
            unresolved.push({
                input: line
            });
        }

        await sleep(1200);
    }

    return jsonResponse({
        ok: true,
        rateLimited: false,
        resolved,
        unresolved,
        remaining: lines.slice(tracksToResolve.length)
    });
}

async function resolveSingleTrack(line, authorization, market, env) {
    const parsed =
        parseTrackLine(line);

    const query =
        parsed.artist
            ? `${parsed.artist} ${parsed.title}`
            : parsed.title;

    const cacheKey =
        new Request(
            `https://spotify-search-worker.cache/search/${encodeURIComponent(normalizeText(query))}?market=${market}`
        );

    const cached =
        await caches.default.match(cacheKey);

    if (cached) {
        const data =
            await cached.json();

        return {
            track: pickBestTrack(data.tracks, parsed)
        };
    }

    const searchUrl =
        new URL("https://api.spotify.com/v1/search");

    searchUrl.searchParams.set("q", sanitizeSpotifyQuery(query));
    searchUrl.searchParams.set("type", "track");
    searchUrl.searchParams.set("limit", String(SPOTIFY_SEARCH_LIMIT));
    searchUrl.searchParams.set("market", market);

    const response =
        await fetch(searchUrl.toString(), {
            headers: {
                Authorization:
                    await getSearchAuthorization(
                        env,
                        authorization
                    )
            }
        });

    if (response.status === 429) {
        const retryAfter =
            parseInt(
                response.headers.get("Retry-After") || "60",
                10
            );

        return {
            rateLimited: true,
            retryAfter: Math.min(
                Math.max(retryAfter, 60),
                MAX_RETRY_AFTER_SECONDS
            )
        };
    }

    if (!response.ok) {
        return {
            track: null
        };
    }

    const data =
        await response.json();

    const tracks =
        data.tracks?.items || [];

    await caches.default.put(
        cacheKey,
        new Response(
            JSON.stringify({ tracks }),
            {
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "public, max-age=86400"
                }
            }
        )
    );

    return {
        track: pickBestTrack(tracks, parsed)
    };
}

async function getSearchAuthorization(env, fallbackAuthorization) {
    if (
        !env ||
        !env.SPOTIFY_CLIENT_ID ||
        !env.SPOTIFY_CLIENT_SECRET
    ) {
        return fallbackAuthorization;
    }

    const cacheKey =
        new Request(
            "https://spotify-search-worker.cache/client-token"
        );

    const cached =
        await caches.default.match(cacheKey);

    if (cached) {
        const data =
            await cached.json();

        if (data.access_token) {
            return `Bearer ${data.access_token}`;
        }
    }

    const credentials =
        btoa(
            `${env.SPOTIFY_CLIENT_ID}:${env.SPOTIFY_CLIENT_SECRET}`
        );

    const response =
        await fetch(
            "https://accounts.spotify.com/api/token",
            {
                method: "POST",
                headers: {
                    "Authorization": `Basic ${credentials}`,
                    "Content-Type": "application/x-www-form-urlencoded"
                },
                body: "grant_type=client_credentials"
            }
        );

    if (!response.ok) {
        return fallbackAuthorization;
    }

    const data =
        await response.json();

    if (!data.access_token) {
        return fallbackAuthorization;
    }

    const cacheSeconds =
        Math.max(
            (data.expires_in || 3600) - 90,
            60
        );

    await caches.default.put(
        cacheKey,
        new Response(
            JSON.stringify({
                access_token: data.access_token
            }),
            {
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": `public, max-age=${cacheSeconds}`
                }
            }
        )
    );

    return `Bearer ${data.access_token}`;
}

function pickBestTrack(tracks, parsed) {
    if (!tracks.length) {
        return null;
    }

    const options =
        getQueryOptions(parsed);

    const scored =
        tracks
            .map(track => {
                const scores =
                    options.map(option =>
                        scoreTrack(track, option)
                    );

                return scores.sort((a, b) => b.score - a.score)[0];
            })
            .sort((a, b) => b.score - a.score);

    const best =
        scored[0];

    if (!best) {
        return null;
    }

    if (
        best.score < 42 ||
        best.titleOverlap < 0.45
    ) {
        return null;
    }

    return best.track;
}

function parseTrackLine(line) {
    const cleanLine =
        cleanTrackLine(line);

    const parts =
        cleanLine
            .split(/\s[-–—]\s/)
            .map(part => part.trim())
            .filter(Boolean);

    if (parts.length >= 2) {
        return {
            raw: cleanLine,
            artist: parts[0],
            title: parts.slice(1).join(" - ")
        };
    }

    return {
        raw: cleanLine,
        artist: "",
        title: cleanLine
    };
}

function getQueryOptions(parsed) {
    const options = [parsed];

    if (parsed.artist && parsed.title) {
        options.push({
            raw: `${parsed.title} - ${parsed.artist}`,
            artist: parsed.title,
            title: parsed.artist
        });
    }

    return options;
}

function scoreTrack(track, parsed) {
    const artistNames =
        track.artists
            .map(artist => artist.name)
            .join(" ");

    const artistOverlap =
        tokenOverlap(parsed.artist, artistNames);

    const titleOverlap =
        Math.max(
            tokenOverlap(parsed.title, track.name),
            tokenOverlap(baseTitle(parsed.title), baseTitle(track.name))
        );

    const normalizedArtists =
        normalizeText(artistNames);

    const expectedArtist =
        normalizeText(parsed.artist);

    const artistMatches =
        !expectedArtist ||
        normalizedArtists.includes(expectedArtist) ||
        artistOverlap >= 0.35;

    let score = 0;

    if (artistMatches) {
        score += 45;
    }

    score += Math.round(titleOverlap * 45);
    score += Math.round(artistOverlap * 20);
    score += Math.min(track.popularity || 0, 100) / 10;

    return {
        track,
        score,
        titleOverlap
    };
}

function cleanTrackLine(value) {
    return String(value || "")
        .replace(/^\s*\d+[\.\)]\s*/, "")
        .replace(/["“”]/g, "")
        .replace(/\s+/g, " ")
        .trim();
}

function sanitizeSpotifyQuery(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[–—]/g, " ")
        .replace(/["“”'’‘]/g, "")
        .replace(/[(){}\[\]]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function sanitizeMarket(value) {
    const market =
        String(value || "US")
            .trim()
            .toUpperCase();

    return /^[A-Z]{2}$/.test(market)
        ? market
        : "US";
}

function normalizeText(value) {
    return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function baseTitle(value) {
    return normalizeText(value)
        .replace(/\b(remasterizado|remastered|version|versión|edit|live|en vivo|remix|mix)\b/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function tokenOverlap(expected, received) {
    const expectedTokens =
        new Set(
            normalizeText(expected)
                .split(" ")
                .filter(token => token.length > 1)
        );

    const receivedTokens =
        new Set(
            normalizeText(received)
                .split(" ")
                .filter(token => token.length > 1)
        );

    if (!expectedTokens.size || !receivedTokens.size) {
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

function sleep(ms) {
    return new Promise(resolve => {
        setTimeout(resolve, ms);
    });
}

function jsonResponse(data, status = 200) {
    return new Response(
        JSON.stringify(data),
        {
            status,
            headers: {
                ...CORS_HEADERS,
                "Content-Type": "application/json"
            }
        }
    );
}
