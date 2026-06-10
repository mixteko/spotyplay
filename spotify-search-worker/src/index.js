const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400"
};

const WORKER_VERSION = "resolver-v4-cache-bust";
const MAX_TRACKS_PER_REQUEST = 10;
const SPOTIFY_SEARCH_LIMIT = 10;

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
                version: WORKER_VERSION,
                maxTracksPerRequest: MAX_TRACKS_PER_REQUEST,
                spotifyCredentialsConfigured: Boolean(
                    env?.SPOTIFY_CLIENT_ID &&
                    env?.SPOTIFY_CLIENT_SECRET
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
    const fallbackAuthorization =
        request.headers.get("Authorization") || "";

    if (
        !hasWorkerCredentials(env) &&
        !fallbackAuthorization.startsWith("Bearer ")
    ) {
        return jsonResponse({
            ok: false,
            error: "Falta Authorization o variables SPOTIFY_CLIENT_ID/SPOTIFY_CLIENT_SECRET"
        }, 401);
    }

    let body;

    try {
        body = await request.json();
    } catch (error) {
        return jsonResponse({
            ok: false,
            error: "JSON invalido"
        }, 400);
    }

    const rawLines =
        Array.isArray(body.tracks)
            ? body.tracks
            : [];

    const market =
        sanitizeMarket(body.market || "US");

    const lines =
        rawLines
            .map(cleanTrackLine)
            .filter(Boolean);

    const tracksToResolve =
        lines.slice(0, MAX_TRACKS_PER_REQUEST);

    const resolved = [];
    const unresolved = [];

    for (const line of tracksToResolve) {
        const result =
            await resolveSingleTrack(
                line,
                fallbackAuthorization,
                market,
                env
            );

        if (result.track) {
            resolved.push({
                input: line,
                uri: result.track.uri,
                name: result.track.name,
                artists: result.track.artists.map(artist => artist.name),
                source: result.source || "spotify"
            });
        } else {
            unresolved.push({
                input: line,
                reason: result.reason || "not_found"
            });
        }

        await sleep(350);
    }

    return jsonResponse({
        ok: true,
        rateLimited: false,
        version: WORKER_VERSION,
        resolved,
        unresolved,
        remaining: lines.slice(tracksToResolve.length)
    });
}

async function resolveSingleTrack(line, fallbackAuthorization, market, env) {
    const directUri =
        getSpotifyTrackUriFromLine(line);

    if (directUri) {
        return {
            source: "direct",
            track: {
                uri: directUri,
                name: line,
                artists: [
                    {
                        name: "Spotify"
                    }
                ],
                popularity: 100
            }
        };
    }

    const parsed =
        parseTrackLine(line);

    const cacheKey =
        new Request(
            `https://spotify-search-worker.cache/${WORKER_VERSION}/${encodeURIComponent(normalizeText(parsed.raw))}?market=${market}`
        );

    const cached =
        await caches.default.match(cacheKey);

    if (cached) {
        const data =
            await cached.json();

        if (data.track?.uri) {
            return {
                source: "cache",
                track: data.track
            };
        }
    }

    const authorization =
        await getSearchAuthorization(
            env,
            fallbackAuthorization
        );

    const apiResult =
        await searchWithSpotifyApi(
            parsed,
            authorization,
            market
        );

    if (apiResult.track) {
        await cacheTrack(cacheKey, apiResult.track);

        return {
            source: "spotify-api",
            track: apiResult.track
        };
    }

    const publicTrack =
        await resolveTrackFromPublicSearch(parsed);

    if (publicTrack) {
        await cacheTrack(cacheKey, publicTrack);

        return {
            source: "public-search",
            track: publicTrack
        };
    }

    return {
        track: null,
        reason: apiResult.reason || "not_found"
    };
}

async function searchWithSpotifyApi(parsed, authorization, market) {
    if (!authorization.startsWith("Bearer ")) {
        return {
            track: null,
            reason: "missing_authorization"
        };
    }

    const queries =
        buildSearchQueries(parsed);

    let lastReason = "not_found";

    for (const query of queries) {
        const tracks =
            await fetchSpotifyTracks(
                query,
                authorization,
                market
            );

        if (tracks.rateLimited) {
            lastReason = "rate_limited";
            continue;
        }

        if (tracks.error) {
            lastReason = tracks.error;
            continue;
        }

        const bestTrack =
            pickBestTrack(
                tracks.items,
                parsed
            );

        if (bestTrack) {
            return {
                track: bestTrack
            };
        }
    }

    return {
        track: null,
        reason: lastReason
    };
}

async function fetchSpotifyTracks(query, authorization, market) {
    const searchUrl =
        new URL("https://api.spotify.com/v1/search");

    searchUrl.searchParams.set("q", query);
    searchUrl.searchParams.set("type", "track");
    searchUrl.searchParams.set("limit", String(SPOTIFY_SEARCH_LIMIT));

    if (market) {
        searchUrl.searchParams.set("market", market);
    }

    const response =
        await fetch(searchUrl.toString(), {
            headers: {
                Authorization: authorization
            }
        });

    if (response.status === 429) {
        return {
            items: [],
            rateLimited: true
        };
    }

    if (response.status === 401) {
        return {
            items: [],
            error: "unauthorized"
        };
    }

    if (!response.ok) {
        return {
            items: [],
            error: `spotify_${response.status}`
        };
    }

    const data =
        await response.json();

    return {
        items: data.tracks?.items || []
    };
}

async function resolveTrackFromPublicSearch(parsed) {
    const query =
        parsed.artist
            ? `${parsed.artist} ${parsed.title}`
            : parsed.raw;

    const searchUrl =
        `https://open.spotify.com/search/${encodeURIComponent(sanitizeSpotifyQuery(query))}/tracks`;

    const response =
        await fetch(searchUrl, {
            headers: {
                "Accept": "text/html",
                "User-Agent": "Mozilla/5.0"
            }
        });

    if (!response.ok) {
        return null;
    }

    const html =
        await response.text();

    const trackIds =
        [
            ...html.matchAll(/(?:spotify:track:|spotify%3Atrack%3A|\/track\/)([A-Za-z0-9]{22})/g)
        ]
            .map(match => match[1]);

    const uniqueTrackIds =
        [...new Set(trackIds)];

    if (!uniqueTrackIds.length) {
        return null;
    }

    return {
        uri: `spotify:track:${uniqueTrackIds[0]}`,
        name: parsed.title || parsed.raw,
        artists: [
            {
                name: parsed.artist || "Spotify"
            }
        ],
        popularity: 0
    };
}

async function getSearchAuthorization(env, fallbackAuthorization) {
    if (!hasWorkerCredentials(env)) {
        return fallbackAuthorization;
    }

    const cacheKey =
        new Request(
            `https://spotify-search-worker.cache/${WORKER_VERSION}/client-token`
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

    await caches.default.put(
        cacheKey,
        new Response(
            JSON.stringify({
                access_token: data.access_token
            }),
            {
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": `public, max-age=${Math.max((data.expires_in || 3600) - 90, 60)}`
                }
            }
        )
    );

    return `Bearer ${data.access_token}`;
}

async function cacheTrack(cacheKey, track) {
    if (!track?.uri) {
        return;
    }

    await caches.default.put(
        cacheKey,
        new Response(
            JSON.stringify({ track }),
            {
                headers: {
                    "Content-Type": "application/json",
                    "Cache-Control": "public, max-age=604800"
                }
            }
        )
    );
}

function buildSearchQueries(parsed) {
    const queries = [];
    const artist =
        sanitizeSpotifyQuery(parsed.artist);
    const title =
        sanitizeSpotifyQuery(parsed.title);
    const raw =
        sanitizeSpotifyQuery(parsed.raw);

    if (artist && title) {
        queries.push(`track:"${title}" artist:"${artist}"`);
        queries.push(`${artist} ${title}`);
        queries.push(`${title} ${artist}`);
        queries.push(title);
    }

    if (raw) {
        queries.push(raw);
    }

    return [...new Set(queries)];
}

function pickBestTrack(tracks, parsed) {
    if (!tracks.length) {
        return null;
    }

    const scored =
        tracks
            .map(track =>
                scoreTrack(
                    track,
                    parsed
                )
            )
            .sort((a, b) => b.score - a.score);

    const best =
        scored[0];

    if (!best) {
        return null;
    }

    const needsArtist =
        Boolean(normalizeText(parsed.artist));

    const minimumScore =
        needsArtist
            ? 52
            : 30;

    if (best.score < minimumScore) {
        return null;
    }

    return best.track;
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
        expectedArtist.includes(normalizedArtists) ||
        artistOverlap >= 0.35;

    let score = 0;

    if (artistMatches) {
        score += 45;
    } else if (expectedArtist) {
        score -= 35;
    }

    score += Math.round(titleOverlap * 55);
    score += Math.round(artistOverlap * 25);
    score += Math.min(track.popularity || 0, 100) / 10;

    return {
        track,
        score
    };
}

function parseTrackLine(line) {
    const cleanLine =
        cleanTrackLine(line);

    const parts =
        cleanLine
            .split(/\s*[-–—]\s*/)
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

function getSpotifyTrackUriFromLine(line) {
    const spotifyUriMatch =
        String(line).match(
            /spotify:track:([A-Za-z0-9]{22})/
        );

    if (spotifyUriMatch) {
        return `spotify:track:${spotifyUriMatch[1]}`;
    }

    const spotifyUrlMatch =
        String(line).match(
            /open\.spotify\.com\/(?:intl-[a-z]{2}\/)?track\/([A-Za-z0-9]{22})/
        );

    if (spotifyUrlMatch) {
        return `spotify:track:${spotifyUrlMatch[1]}`;
    }

    return "";
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
        .replace(/\b(remasterizado|remastered|version|versión|edit|live|en vivo|remix|mix|radio edit)\b/g, " ")
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

function hasWorkerCredentials(env) {
    return Boolean(
        env?.SPOTIFY_CLIENT_ID &&
        env?.SPOTIFY_CLIENT_SECRET
    );
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
