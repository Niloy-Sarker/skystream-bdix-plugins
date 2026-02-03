// Dflix Movies Provider for Skystream
// Ported from Kotlin CloudStream provider (DflixMoviesProvider.kt)

var MAIN_URL = "https://dflix.discoveryftp.net";
var loginCookie = null;

var commonHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5"
};

// Storage keys
var STORAGE_KEY_COOKIES = "dflix_movies_cookies";

async function getManifest() {
    return {
        id: "com.niloy.dflix",
        name: "Dflix",
        internalName: "dflix",
        version: 1,
        description: "Dflix Movies & Series Provider - Search for both Movies and Series",
        language: "bn",
        tvTypes: ["Movie", "Animation", "TvSeries"],
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
        { title: "English", url: MAIN_URL + "/m/category/English/1" },
        { title: "Hindi", url: MAIN_URL + "/m/category/Hindi/1" },
        { title: "Bangla", url: MAIN_URL + "/m/category/Bangla/1" },
        { title: "Tamil", url: MAIN_URL + "/m/category/Tamil/1" },
        { title: "Animation", url: MAIN_URL + "/m/category/Animation/1" },
        { title: "Others", url: MAIN_URL + "/m/category/Others/1" }
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
                items = parseMovieCards(html);
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

function parseMovieCards(html) {
    var items = [];
    
    // Movie cards structure: <div class="card"><a class="cfocus" href="/m/view/ID">
    // Inside: <span class="movie_details_span_end">quality</span>
    // <div class="poster"><img src="poster_url">
    // <div class="details"><h3>title</h3>
    // <span class="movie_details_span">year</span>
    
    var cardRegex = /<div class="card"><a class="cfocus" href="(\/m\/view\/\d+)"[^>]*>[\s\S]*?<img\s+src="([^"]+)"[^>]*>[\s\S]*?<\/div><\/a><div class="details"><h3[^>]*>([^<]+)<\/h3>[\s\S]*?<span class="movie_details_span"[^>]*>(\d{4})<\/span>/g;
    var match;
    
    while ((match = cardRegex.exec(html)) !== null) {
        var url = MAIN_URL + match[1];
        var poster = match[2];
        var title = match[3].trim();
        var year = match[4];
        
        // Skip blank_poster
        if (poster.includes('blank_poster.png')) {
            poster = "";
        }
        
        if (title) {
            items.push({
                name: title,
                link: url,
                image: poster,
                description: "",
                year: year,
                type: "Movie"
            });
        }
    }
    
    // If first regex didn't match, try alternative pattern
    if (items.length === 0) {
        // Alternative: Parse card by card
        var simpleCardRegex = /<div class="card">[\s\S]*?<a[^>]+href="(\/m\/view\/\d+)"[\s\S]*?<img[^>]+src="([^"]+)"[\s\S]*?<h3[^>]*>([^<]+)<\/h3>[\s\S]*?<span class="movie_details_span"[^>]*>(\d{4})<\/span>/g;
        
        while ((match = simpleCardRegex.exec(html)) !== null) {
            var url = MAIN_URL + match[1];
            var poster = match[2];
            var title = match[3].trim();
            var year = match[4];
            
            if (poster.includes('blank_poster.png')) {
                poster = "";
            }
            
            if (title) {
                items.push({
                    name: title,
                    link: url,
                    image: poster,
                    description: "",
                    year: year,
                    type: "Movie"
                });
            }
        }
    }
    
    // If still no items, try a more flexible approach
    if (items.length === 0) {
        var flexRegex = /href="(\/m\/view\/\d+)"[\s\S]*?<img[^>]+src="([^"]+)"[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/g;
        
        while ((match = flexRegex.exec(html)) !== null) {
            var url = MAIN_URL + match[1];
            var poster = match[2];
            var title = match[3].trim();
            
            if (poster.includes('blank_poster.png')) {
                poster = "";
            }
            
            if (title) {
                items.push({
                    name: title,
                    link: url,
                    image: poster,
                    description: "",
                    year: "",
                    type: "Movie"
                });
            }
        }
    }
    
    return items;
}

async function search(query) {
    if (!query) return [];
    
    await login();
    
    var headers = Object.assign({}, commonHeaders);
    if (loginCookie) {
        headers["Cookie"] = loginCookie;
    }
    
    var searchUrl = MAIN_URL + "/search";
    var postHeaders = Object.assign({}, headers);
    postHeaders["Content-Type"] = "application/x-www-form-urlencoded";
    
    var results = [];
    
    // Search for both movies and series in parallel
    var movieFormData = "term=" + encodeURIComponent(query) + "&types=m";
    var seriesFormData = "term=" + encodeURIComponent(query) + "&types=s";
    
    try {
        var [movieRes, seriesRes] = await Promise.all([
            http_post(searchUrl, postHeaders, movieFormData),
            http_post(searchUrl, postHeaders, seriesFormData)
        ]);
        
        // Parse movie results
        if (movieRes && movieRes.body && typeof movieRes.body === 'string') {
            var movieItems = parseSearchResults(movieRes.body, "movie");
            results = results.concat(movieItems);
        }
        
        // Parse series results
        if (seriesRes && seriesRes.body && typeof seriesRes.body === 'string') {
            var seriesItems = parseSearchResults(seriesRes.body, "series");
            results = results.concat(seriesItems);
        }
        
        return results;
    } catch (e) {
        return [];
    }
}

function parseSearchResults(html, type) {
    var items = [];
    var urlPattern = type === "movie" ? /\/m\/view\/\d+/ : /\/s\/view\/\d+/;
    
    // Parse search results - <div class='moviesearchiteam ps-1 mb-1'>
    // Inside: <a href="/m/view/ID"> or <a href="/s/view/ID"> with <div class="searchtitle">
    var searchItemRegex = /<div class=['"]moviesearchiteam[^'"]*['"][^>]*>([\s\S]*?)<\/a>/g;
    var match;
    
    while ((match = searchItemRegex.exec(html)) !== null) {
        var itemHtml = match[1];
        
        // Extract URL - look for /m/view/ID or /s/view/ID
        var urlMatch = /<a\s+href=['"]((\/m\/view\/\d+)|(\/s\/view\/\d+))['"]/.exec(itemHtml);
        if (!urlMatch) continue;
        
        var urlPath = urlMatch[1];
        // Verify it matches the expected type
        if (!urlPattern.test(urlPath)) continue;
        
        var url = MAIN_URL + urlPath;
        
        // Extract title from searchtitle class
        var titleMatch = /<div class=['"]searchtitle['"][^>]*>([^<]+)<\/div>/.exec(itemHtml);
        var title = titleMatch ? titleMatch[1].trim() : "";
        
        // Extract poster from img src - require space before src to avoid matching inside onerror
        var posterMatch = /<img[^>]*\ssrc=['"]([^'"]+)['"]/.exec(itemHtml);
        var poster = "";
        if (posterMatch) {
            poster = posterMatch[1];
            // Skip blank_poster
            if (poster.includes('blank_poster.png')) {
                poster = "";
            }
        }
        
        // Extract year from searchdetails
        var yearMatch = /Year\s*:\s*(\d{4})/.exec(itemHtml);
        var year = yearMatch ? yearMatch[1] : "";
        
        // Extract quality from searchdetails (mainly for movies)
        var qualityMatch = /Quality:\s*([^<]+)/.exec(itemHtml);
        var quality = qualityMatch ? qualityMatch[1].trim() : "";
        
        if (title) {
            items.push({
                title: title,
                url: url,
                posterUrl: poster,
                year: year,
                quality: quality,
                type: type === "movie" ? "Movie" : "Series",
                isFolder: type === "series"
            });
        }
    }
    
    return items;
}

async function load(url) {
    await login();
    
    var headers = Object.assign({}, commonHeaders);
    if (loginCookie) {
        headers["Cookie"] = loginCookie;
    }
    
    // Check if this is a series URL
    var isSeries = url.includes("/s/view/");
    
    try {
        var html = await _fetch(url, headers);
        
        if (!html || typeof html !== 'string') {
            return {
                title: "Error loading content",
                url: url,
                description: "Could not load content from server",
                posterUrl: "",
                year: 0,
                streamUrl: ""
            };
        }
        
        if (isSeries) {
            return loadSeriesContent(html, url, headers);
        } else {
            return loadMovieContent(html, url);
        }
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

function loadMovieContent(html, url) {
    // Extract title from <h3> inside movie-detail-content
    var titleMatch = /<div class="movie-detail-content[^"]*"[^>]*>[\s\S]*?<h3[^>]*>\s*([^<]+?)\s*<\/h3>/.exec(html);
    var title = titleMatch ? titleMatch[1].trim() : "";
    
    // Alternative title extraction
    if (!title) {
        var altTitleMatch = /<h3[^>]*>\s*([^<]+?)\s*<\/h3>/.exec(html);
        title = altTitleMatch ? altTitleMatch[1].trim() : "Unknown";
    }
    
    // Extract poster from movie-detail-banner
    var imgMatch = /<figure class="movie-detail-banner">[\s\S]*?<img[^>]+src=['"]([^'"]+)['"]/.exec(html);
    var poster = "";
    if (imgMatch) {
        poster = imgMatch[1];
        // Skip blank_poster
        if (poster.includes('blank_poster.png')) {
            poster = "";
        }
    }
    
    // Extract plot/storyline from <p class="storyline">
    var plotMatch = /<p class=['"]storyline['"][^>]*>([\s\S]*?)<\/p>/.exec(html);
    var plot = "";
    if (plotMatch) {
        // Clean the text - remove HTML tags and extra whitespace
        plot = plotMatch[1]
            .replace(/<[^>]+>/g, '') // Remove HTML tags
            .replace(/\s+/g, ' ')     // Normalize whitespace
            .replace(/\.{3,}/g, '...') // Normalize ellipsis
            .trim();
    }
    
    // Extract genres from ganre-wrapper
    var genres = extractGenres(html);
    
    // Extract year from badge
    var yearMatch = /Year\s*:\s*(\d{4})|<div class="badge[^"]*"[^>]*>(\d{4})<\/div>/.exec(html);
    var year = 0;
    if (yearMatch) {
        year = parseInt(yearMatch[1] || yearMatch[2]) || 0;
    }
    
    // Extract quality info
    var qualityMatch = /<div class="badge badge-fill">([^<]+)<\/div>/.exec(html);
    var quality = qualityMatch ? qualityMatch[1].trim() : "";
    
    // Extract download URL
    var downloadMatch = /href="(https?:\/\/content\d*\.discoveryftp\.net[^"]+\.(?:mkv|mp4|avi)[^"]*)"/.exec(html);
    var downloadUrl = downloadMatch ? downloadMatch[1] : "";
    
    // Extract browse URL for CDN
    var browseMatch = /href="(http:\/\/cds\d*\.discoveryftp\.net\/Movies[^"]+)"/.exec(html);
    var browseUrl = browseMatch ? browseMatch[1] : "";
    
    // Extract playlist URL
    var playlistMatch = /href="(\/m\/playlist\/\d+)"/.exec(html);
    var playlistUrl = playlistMatch ? MAIN_URL + playlistMatch[1] : "";
    
    // Extract actors
    var actors = extractActors(html);
    
    // Use plot as description
    var description = plot;
    if (quality && !description.includes(quality)) {
        description = description ? description + "\n\nQuality: " + quality : "Quality: " + quality;
    }
    
    return {
        title: title,
        url: url,
        description: description,
        posterUrl: poster,
        year: year,
        quality: quality,
        downloadUrl: downloadUrl,
        browseUrl: browseUrl,
        playlistUrl: playlistUrl,
        genres: genres,
        actors: actors,
        type: "Movie",
        // For movies, we return a single "episode" which is the movie itself
        episodes: [{
            name: title,
            season: 1,
            episode: 1,
            url: downloadUrl || url,
            isPlaying: true,
            description: quality
        }]
    };
}

async function loadSeriesContent(html, url, headers) {
    // Extract title
    var titleMatch = /<div class="movie-detail-content-test"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/.exec(html);
    var title = titleMatch ? titleMatch[1].trim() : "";
    
    // Alternative title extraction
    if (!title) {
        var altTitleMatch = /<h3[^>]*>([^<]+)<\/h3>/.exec(html);
        title = altTitleMatch ? altTitleMatch[1].trim() : "Unknown";
    }
    
    // Extract poster - require space before src to avoid matching inside onerror
    var imgMatch = /<div class=['"]movie-detail-banner['"][^>]*>[\s\S]*?<img[^>]*\ssrc=['"]([^'"]+)['"]/.exec(html);
    var poster = "";
    if (imgMatch) {
        poster = imgMatch[1];
        // Skip blank_poster
        if (poster.includes('blank_poster.png')) {
            poster = "";
        }
    }
    
    // Extract plot/storyline from <p class="storyline">
    var plotMatch = /<p class=['"]storyline['"][^>]*>([\s\S]*?)<\/p>/.exec(html);
    var plot = "";
    if (plotMatch) {
        // Clean the text - remove HTML tags and extra whitespace
        plot = plotMatch[1]
            .replace(/<[^>]+>/g, '') // Remove HTML tags
            .replace(/\s+/g, ' ')     // Normalize whitespace
            .trim();
        
        // Remove "Click Here" style text if present
        if (plot.includes('Click Here For More Information')) {
            plot = plot.split('Click Here')[0].trim();
        }
    }
    
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
    
    return {
        title: title,
        url: url,
        description: plot,
        posterUrl: poster,
        year: 0,
        genres: genres,
        actors: actors,
        type: "Series",
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

function extractGenres(html) {
    var genres = [];
    var genreWrapperMatch = /<div class="ganre-wrapper[^"]*">([\s\S]*?)<\/div>/.exec(html);
    
    if (genreWrapperMatch) {
        var genreRegex = /<a[^>]*>([^<]+)<\/a>/g;
        var match;
        while ((match = genreRegex.exec(genreWrapperMatch[1])) !== null) {
            var genre = match[1].replace(',', '').trim();
            if (genre) {
                genres.push(genre);
            }
        }
    }
    
    return genres;
}

function extractActors(html) {
    var actors = [];
    var actorRegex = /<div class="col-lg-2[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
    var match;
    
    while ((match = actorRegex.exec(html)) !== null) {
        var actorHtml = match[1];
        
        var imgMatch = /<img[^>]+src="([^"]+)"[^>]*class="img-fluid"[^>]*alt="([^"]*)"/.exec(actorHtml);
        if (!imgMatch) {
            imgMatch = /<img[^>]+src="([^"]+)"[^>]+alt="([^"]*)"/.exec(actorHtml);
        }
        
        if (imgMatch) {
            var actorImg = imgMatch[1];
            var actorName = imgMatch[2];
            
            var roleMatch = /<p class="text-center[^"]*text-white[^"]*">([^<]*)<\/p>/.exec(actorHtml);
            var role = roleMatch ? roleMatch[1].trim() : "";
            
            if (actorName) {
                actors.push({
                    name: actorName,
                    image: actorImg,
                    role: role
                });
            }
        }
    }
    
    return actors;
}

async function loadStreams(url) {
    await login();
    
    var headers = Object.assign({}, commonHeaders);
    if (loginCookie) {
        headers["Cookie"] = loginCookie;
    }
    
    // Check if URL is already a direct stream link
    if (url.match(/\.(mkv|mp4|avi)($|\?)/i)) {
        return [{
            url: url,
            quality: "Default",
            isM3u8: false,
            headers: headers
        }];
    }
    
    // If it's a movie view URL, extract the stream from the page
    if (url.includes("/m/view/")) {
        try {
            var html = await _fetch(url, headers);
            var streams = [];
            
            if (!html || typeof html !== 'string') {
                return [];
            }
            
            // Try to find download link (main stream)
            var downloadMatch = /href="(https?:\/\/content\d*\.discoveryftp\.net[^"]+\.(?:mkv|mp4|avi)[^"]*)"/.exec(html);
            if (downloadMatch) {
                // Extract quality from the badge
                var qualityMatch = /<div class="badge badge-fill">([^<]+\|[^<]+)<\/div>/.exec(html);
                var quality = "Default";
                if (qualityMatch) {
                    quality = qualityMatch[1].trim().split('|')[0].trim();
                }
                
                streams.push({
                    url: downloadMatch[1],
                    quality: quality,
                    isM3u8: false,
                    headers: headers
                });
            }
            
            // Also check for alternative quality links
            var altLinkMatch = /<a[^>]+href="(\/m\/view\/\d+)"[^>]+title="([^"]+)"[^>]*>([^<]*(?:4K|1080P|720P)[^<]*)<\/a>/gi;
            var altMatch;
            while ((altMatch = altLinkMatch.exec(html)) !== null) {
                var altUrl = MAIN_URL + altMatch[1];
                var altTitle = altMatch[2] || altMatch[3];
                
                // Fetch the alternative quality page to get its stream
                try {
                    var altHtml = await _fetch(altUrl, headers);
                    var altDownloadMatch = /href="(https?:\/\/content\d*\.discoveryftp\.net[^"]+\.(?:mkv|mp4|avi)[^"]*)"/.exec(altHtml);
                    if (altDownloadMatch && !streams.some(s => s.url === altDownloadMatch[1])) {
                        streams.push({
                            url: altDownloadMatch[1],
                            quality: altTitle,
                            isM3u8: false,
                            headers: headers
                        });
                    }
                } catch (e) {
                    // Skip if we can't fetch alternative
                }
            }
            
            return streams;
        } catch (e) {
            return [];
        }
    }
    
    // Otherwise, try to fetch the page and extract stream
    try {
        var html = await _fetch(url, headers);
        var streams = [];
        
        if (!html || typeof html !== 'string') {
            return [];
        }
        
        // Try to find video link
        var streamMatch = /<a[^>]+href="(https?[^"]+\.(?:mkv|mp4|avi)[^"]*)"/.exec(html);
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
            var videoMatch = /(?:src|href)=["'](https?[^"']+\.(?:mkv|mp4|avi)[^"']*)["']/i.exec(html);
            if (videoMatch) {
                streams.push({
                    url: videoMatch[1],
                    quality: "Default",
                    isM3u8: false,
                    headers: headers
                });
            }
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
