// Dflix Series Provider for Skystream
// Ported from Kotlin CloudStream provider (DflixSeriesProvider.kt)

var MAIN_URL = "https://dflix.discoveryftp.net";
var loginCookie = null;

var commonHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5"
};

// Storage keys
var STORAGE_KEY_COOKIES = "dflix_series_cookies";

async function getManifest() {
    return {
        id: "com.niloy.dflix.series",
        name: "Dflix Series",
        internalName: "dflixseries",
        version: 2,
        description: "Dflix Series Provider - TV Series, Asian Drama, Anime, Documentary, Cartoon",
        language: "bn",
        tvTypes: ["TvSeries", "AsianDrama", "Anime", "Documentary", "Cartoon"],
        baseUrl: MAIN_URL,
        iconUrl: "",
        hasSearch: true
    };
}

async function login() {
    // Check if cookie is already set
    if (loginCookie) {
        return true;
    }
    
    // Try to restore from storage
    var saved = await getPreference(STORAGE_KEY_COOKIES);
    if (saved) {
        try {
            var json = JSON.parse(saved);
            if (Date.now() - json.timestamp < 86400000) { // 24 hours
                loginCookie = json.cookie;
                return true;
            }
        } catch (e) { }
    }
    
    // Perform login
    try {
        var res = await http_get(MAIN_URL + "/login/demo", commonHeaders);
        
        if (res && res.statusCode >= 200 && res.statusCode < 400) {
            // Extract cookies from headers
            if (res.headers) {
                var setCookie = res.headers['set-cookie'] || res.headers['Set-Cookie'];
                if (setCookie) {
                    // Parse cookie string
                    loginCookie = setCookie;
                    
                    // Save to storage
                    await setPreference(STORAGE_KEY_COOKIES, JSON.stringify({
                        cookie: loginCookie,
                        timestamp: Date.now()
                    }));
                    
                    return true;
                }
            }
        }
        
        // Login succeeded but no cookie (proceed anyway)
        return true;
    } catch (e) {
        // Login failed but continue anyway
        return false;
    }
}

async function getHome() {
    await login();
    
    var categories = [
        { title: "English", url: MAIN_URL + "/s/category/Foreign/1" },
        { title: "Bangla", url: MAIN_URL + "/s/category/Bangla/1" },
        { title: "Hindi", url: MAIN_URL + "/s/category/Hindi/1" },
        { title: "South", url: MAIN_URL + "/s/category/South/1" },
        { title: "Animation", url: MAIN_URL + "/s/category/Animation/1" },
        { title: "Dubbed", url: MAIN_URL + "/s/category/Dubbed/1" }
    ];
    
    var sections = {};
    
    // Fetch all categories in parallel
    var promises = categories.map(async function(category) {
        var headers = Object.assign({}, commonHeaders);
        if (loginCookie) {
            headers["Cookie"] = loginCookie;
        }
        
        try {
            var html = await _fetch(category.url, headers);
            var items = [];
            
            if (html && typeof html === 'string') {
                items = parseSeriesCards(html);
            }
            
            return {
                title: category.title,
                items: items
            };
        } catch (e) {
            return {
                title: category.title,
                items: []
            };
        }
    });
    
    var results = await Promise.all(promises);
    
    // Convert to sections map
    for (var i = 0; i < results.length; i++) {
        var result = results[i];
        if (result.items.length > 0) {
            sections[result.title] = result.items.map(function(item) {
                return {
                    title: item.name,
                    url: item.link,
                    posterUrl: item.image,
                    isFolder: false
                };
            });
        }
    }
    
    return sections;
}

function parseSeriesCards(html) {
    const items = [];
    
    // Pattern to match series cards: div.col-xl-4
    const cardRegex = /<div class="col-xl-4"[^>]*>([\s\S]*?)<div class="col-xl-4"|<div class="col-xl-4"[^>]*>([\s\S]*?)$/g;
    
    // Alternative simpler pattern
    const simpleCardRegex = /<div class="fcard"[^>]*>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
    let match;
    
    while ((match = simpleCardRegex.exec(html)) !== null) {
        const cardHtml = match[1];
        
        // Extract URL from parent anchor
        const fullCardMatch = new RegExp('<a\\s+href="([^"]+)"[^>]*>[\\s\\S]*?' + escapeRegex(cardHtml.substring(0, 50))).exec(html);
        
        // Try to find URL differently
        const urlSearch = html.substring(Math.max(0, match.index - 200), match.index + match[0].length);
        const urlMatch = /<a\s+href="([^"]+)"/.exec(urlSearch);
        if (!urlMatch) continue;
        const url = MAIN_URL + urlMatch[1];
        
        // Extract title
        const titleMatch = /<div[^>]*>([^<]+)<\/div>/.exec(cardHtml);
        const title = titleMatch ? titleMatch[1].trim() : "";
        
        // Extract poster
        const posterMatch = /<img[^>]+src="([^"]+)"/.exec(urlSearch);
        const poster = posterMatch ? posterMatch[1] : "";
        
        // Extract genres to determine type
        const genreMatch = /<div class="ganre-wrapper[^"]*">([\s\S]*?)<\/div>/.exec(urlSearch);
        let type = "TvSeries";
        if (genreMatch) {
            const genreText = genreMatch[1].toLowerCase();
            if (genreText.includes("animation") || genreText.includes("anime")) {
                type = "Anime";
            }
        }
        
        if (title) {
            items.push({
                name: title,
                link: url,
                image: poster,
                description: "",
                type: type
            });
        }
    }
    
    // Fallback: Try another pattern if no results
    if (items.length === 0) {
        const altRegex = /<div class="col-xl-4">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
        
        while ((match = altRegex.exec(html)) !== null) {
            const cardHtml = match[1];
            
            const urlMatch = /<a\s+href="([^"]+)"/.exec(cardHtml);
            if (!urlMatch) continue;
            const url = MAIN_URL + urlMatch[1];
            
            // Title is usually in a specific div structure
            const titleMatch = /<div class="fcard[^"]*"[^>]*>[\s\S]*?<div[^>]*>[\s\S]*?<div[^>]*>([^<]+)<\/div>/.exec(cardHtml);
            const title = titleMatch ? titleMatch[1].trim() : "";
            
            const posterMatch = /<img[^>]+src="([^"]+)"/.exec(cardHtml);
            const poster = posterMatch ? posterMatch[1] : "";
            
            if (title || url) {
                items.push({
                    name: title || "Unknown",
                    link: url,
                    image: poster,
                    description: ""
                });
            }
        }
    }
    
    return items;
}

function escapeRegex(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function search(query) {
    if (!query) return [];
    
    await login();
    
    var headers = Object.assign({}, commonHeaders);
    if (loginCookie) {
        headers["Cookie"] = loginCookie;
    }
    
    var searchUrl = MAIN_URL + "/search";
    var formData = "term=" + encodeURIComponent(query) + "&types=s";
    
    var postHeaders = Object.assign({}, headers);
    postHeaders["Content-Type"] = "application/x-www-form-urlencoded";
    
    try {
        var res = await http_post(searchUrl, postHeaders, formData);
        var html = res.body;
        var series = [];
        
        if (html && typeof html === 'string') {
            // Parse search results
            var searchItemRegex = /<div class="moviesearchiteam"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
            var match;
            
            while ((match = searchItemRegex.exec(html)) !== null) {
                var itemHtml = match[1];
                
                var urlMatch = /<a\s+href="([^"]+)"/.exec(itemHtml);
                if (!urlMatch) continue;
                var url = MAIN_URL + urlMatch[1];
                
                var titleMatch = /<div class="searchtitle">([^<]+)<\/div>/.exec(itemHtml);
                var title = titleMatch ? titleMatch[1].trim() : "";
                
                var posterMatch = /<img[^>]+src="([^"]+)"/.exec(itemHtml);
                var poster = posterMatch ? posterMatch[1] : "";
                
                series.push({
                    title: title,
                    url: url,
                    posterUrl: poster,
                    isFolder: false
                });
            }
        }
        
        return series;
    } catch (e) {
        return [];
    }
}

async function load(url) {
    await login();
    
    var headers = Object.assign({}, commonHeaders);
    if (loginCookie) {
        headers["Cookie"] = loginCookie;
    }
    
    try {
        var html = await _fetch(url, headers);
        
        if (!html || typeof html !== 'string') {
            return {
                title: "Error loading content",
                url: url,
                description: "Could not load content from server",
                posterUrl: "",
                year: 0,
                episodes: []
            };
        }
        
        // Extract title
        var titleMatch = /<div class="movie-detail-content-test"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/.exec(html);
        var title = titleMatch ? titleMatch[1].trim() : "";
        
        // Alternative title extraction
        var altTitleMatch = /<h3[^>]*>([^<]+)<\/h3>/.exec(html);
        var finalTitle = title || (altTitleMatch ? altTitleMatch[1].trim() : "Unknown");
        
        // Extract poster
        var imgMatch = /<div class="movie-detail-banner"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/.exec(html);
        var poster = imgMatch ? imgMatch[1] : "";
        
        // Extract plot/storyline
        var plotMatch = /<div class="storyline"[^>]*>([^<]+)<\/div>/.exec(html);
        var plot = plotMatch ? plotMatch[1].trim() : "";
        
        // Extract genres
        var genres = extractGenres(html);
        
        // Extract actors
        var actors = extractActors(html);
        
        // Extract seasons
        var seasons = extractSeasons(html);
        
        // Fetch all episodes
        var episodes = [];
        if (seasons.length > 0) {
            episodes = await fetchAllEpisodes(seasons, headers);
        }
        
        // Build description
        var description = plot;
        if (genres.length > 0) {
            description += "<br><br><b>Genres:</b> " + genres.join(", ");
        }
        
        return {
            title: finalTitle,
            url: url,
            description: description,
            posterUrl: poster,
            year: 0,
            episodes: episodes.map(function(ep) {
                return {
                    name: ep.name,
                    season: ep.season,
                    episode: ep.episode,
                    url: ep.link,
                    isPlaying: true,
                    description: ep.description
                };
            })
        };
    } catch (e) {
        return {
            title: "Error",
            url: url,
            description: "Could not connect to server",
            posterUrl: "",
            year: 0,
            episodes: []
        };
    }
}

function extractGenres(html) {
    const genres = [];
    const genreWrapperMatch = /<div class="ganre-wrapper[^"]*">([\s\S]*?)<\/div>/.exec(html);
    
    if (genreWrapperMatch) {
        const genreRegex = /<a[^>]*>([^<]+)<\/a>/g;
        let match;
        while ((match = genreRegex.exec(genreWrapperMatch[1])) !== null) {
            const genre = match[1].replace(',', '').trim();
            if (genre) {
                genres.push(genre);
            }
        }
    }
    
    return genres;
}

function extractActors(html) {
    const actors = [];
    const actorRegex = /<div class="col-lg-2"[^>]*>([\s\S]*?)<\/div>/g;
    let match;
    
    while ((match = actorRegex.exec(html)) !== null) {
        const actorHtml = match[1];
        
        const imgMatch = /<img[^>]+src="([^"]+)"[^>]+alt="([^"]*)"/.exec(actorHtml);
        if (imgMatch) {
            const actorImg = imgMatch[1];
            const actorName = imgMatch[2];
            
            const roleMatch = /<p class="text-center text-white">([^<]*)<\/p>/.exec(actorHtml);
            const role = roleMatch ? roleMatch[1].trim() : "";
            
            actors.push({
                name: actorName,
                image: actorImg,
                role: role
            });
        }
    }
    
    return actors;
}

function extractSeasons(html) {
    var seasons = [];
    
    // Look for season table
    var seasonTableMatch = /<table class="table mb-0"[^>]*>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/.exec(html);
    
    if (seasonTableMatch) {
        var seasonRegex = /<a\s+href="([^"]+)"[^>]*>/g;
        var match;
        
        while ((match = seasonRegex.exec(seasonTableMatch[1])) !== null) {
            seasons.push(match[1]);
        }
        
        // Reverse to get proper order (oldest first)
        seasons.reverse();
    }
    
    return seasons;
}

async function fetchAllEpisodes(seasonUrls, headers) {
    var allEpisodes = [];
    
    // Fetch all seasons in parallel
    var promises = seasonUrls.map(async function(seasonUrl, index) {
        var fullUrl = MAIN_URL + seasonUrl;
        var currentSeasonNum = index + 1;
        
        try {
            var html = await _fetch(fullUrl, headers);
            return parseSeasonEpisodes(html, currentSeasonNum);
        } catch (e) {
            return [];
        }
    });
    
    var results = await Promise.all(promises);
    
    // Flatten all episodes
    for (var i = 0; i < results.length; i++) {
        var seasonEpisodes = results[i];
        for (var j = 0; j < seasonEpisodes.length; j++) {
            allEpisodes.push(seasonEpisodes[j]);
        }
    }
    
    // Sort episodes by season and episode number
    allEpisodes.sort(function(a, b) {
        if (a.season !== b.season) return a.season - b.season;
        return a.episode - b.episode;
    });
    
    return allEpisodes;
}

function parseSeasonEpisodes(html, seasonNum) {
    var episodes = [];
    var episodeNum = 0;
    
    // Parse episode cards: div.card.p-4
    var episodeRegex = /<div class="card p-4"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
    var match;
    
    while ((match = episodeRegex.exec(html)) !== null) {
        var episodeHtml = match[1];
        episodeNum++;
        
        // Extract episode name from h4
        var nameMatch = /<h4[^>]*>([^<]+)/.exec(episodeHtml);
        var episodeName = nameMatch ? nameMatch[1].trim() : "Episode " + episodeNum;
        
        // Extract episode link from h5 > a
        var linkMatch = /<h5[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"/.exec(episodeHtml);
        var episodeLink = linkMatch ? linkMatch[1] : "";
        
        // Extract episode description
        var descMatch = /<div class="season_overview"[^>]*>[\s\S]*?<p[^>]*>([^<]*)<\/p>/.exec(episodeHtml);
        var description = descMatch ? descMatch[1].trim() : "";
        
        // Extract episode image from parent's background style
        var parentSearch = html.substring(Math.max(0, match.index - 500), match.index);
        var bgMatch = /url\(['"]?([^'")\s]+)['"]?\)/.exec(parentSearch);
        var episodeImage = bgMatch ? bgMatch[1] : "";
        
        if (episodeLink) {
            episodes.push({
                name: episodeName,
                link: episodeLink,
                season: seasonNum,
                episode: episodeNum,
                description: description,
                image: episodeImage
            });
        }
    }
    
    return episodes;
}

async function loadStreams(url) {
    await login();
    
    var headers = Object.assign({}, commonHeaders);
    if (loginCookie) {
        headers["Cookie"] = loginCookie;
    }
    
    // The URL for series episodes is the direct stream link
    // Check if it's already a direct link
    if (url.match(/\.(mkv|mp4|avi)($|\?)/i)) {
        return [{
            url: url,
            quality: "Default",
            isM3u8: false,
            headers: headers
        }];
    }
    
    // Otherwise, try to fetch the page and extract stream
    try {
        var html = await _fetch(url, headers);
        var streams = [];
        
        if (!html || typeof html !== 'string') {
            return [];
        }
        
        // Try to find video link
        var streamMatch = /<a[^>]+href="(http[^"]+\.(?:mkv|mp4|avi)[^"]*)"/.exec(html);
        if (streamMatch) {
            streams.push({
                url: streamMatch[1],
                quality: "Default",
                isM3u8: false,
                headers: headers
            });
        }
        
        // Try alternative: look for any video source
        if (streams.length === 0) {
            var videoMatch = /(?:src|href)=["'](http[^"']+\.(?:mkv|mp4|avi)[^"']*)["']/i.exec(html);
            if (videoMatch) {
                streams.push({
                    url: videoMatch[1],
                    quality: "Default",
                    isM3u8: false,
                    headers: headers
                });
            }
        }
        
        // If URL itself looks like an episode page, use it directly
        if (streams.length === 0 && url.includes("/s/")) {
            // The episode link might be the stream itself
            streams.push({
                url: url,
                quality: "Default",
                isM3u8: false,
                headers: headers
            });
        }
        
        return streams;
    } catch (e) {
        return [];
    }
}

async function _fetch(url, extraHeaders) {
    var headers = Object.assign({}, commonHeaders);
    var cookieStr = "";
    if (loginCookie) {
        cookieStr = loginCookie;
    }
    if (cookieStr) {
        headers["Cookie"] = cookieStr;
    }

    if (extraHeaders) {
        for (var k in extraHeaders) {
            headers[k] = extraHeaders[k];
        }
    }

    var res = await http_get(url, headers);
    if (res.statusCode >= 200 && res.statusCode < 300) {
        return res.body;
    } else {
        throw "HTTP Error " + res.statusCode + " fetching " + url;
    }
}

// Export public functions for plugin loader
globalThis.getManifest = getManifest;
globalThis.getHome = getHome;
globalThis.search = search;
globalThis.load = load;
globalThis.loadStreams = loadStreams;
