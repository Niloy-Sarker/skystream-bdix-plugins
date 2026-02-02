
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
        id: "com.niloy.dflix.movies",
        name: "Dflix Movies",
        internalName: "dflixmovies",
        version: 2,
        description: "Dflix Movies Provider - Bangla, English, Hindi, Tamil, Animation Movies",
        language: "bn",
        tvTypes: ["Movie", "AnimeMovie"],
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
        { title: "Bangla", url: MAIN_URL + "/m/category/Bangla/1" },
        { title: "English", url: MAIN_URL + "/m/category/English/1" },
        { title: "Hindi", url: MAIN_URL + "/m/category/Hindi/1" },
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
    
    // Pattern to match movie cards: div.card > a (with href) > poster + info
    var cardRegex = /<div class=["']card["']>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
    var match;
    
    while ((match = cardRegex.exec(html)) !== null) {
        var cardHtml = match[1];
        
        // Skip disabled cards
        if (cardHtml.includes('disable')) continue;
        
        // Extract URL
        var urlMatch = /<a\s+href=["']([^"']+)["']/.exec(cardHtml);
        if (!urlMatch) continue;
        var url = MAIN_URL + urlMatch[1];
        
        // Extract title from h3 - handle whitespace
        var titleMatch = /<h3[^>]*>([\s\S]*?)<\/h3>/.exec(cardHtml);
        var title = titleMatch ? titleMatch[1].replace(/\s+/g, ' ').trim() : "";
        
        // Extract year from span (if present)
        var yearMatch = /<span[^>]*class=["'][^"']*feedback[^"']*["'][^>]*>[\s\S]*?<span[^>]*>(\d{4})<\/span>/.exec(cardHtml);
        var year = yearMatch ? yearMatch[1] : "";
        
        // Extract poster - handle both with and without space before src
        var posterMatch = /<img[^>]*src=['"]([^'"]+)['"]/.exec(cardHtml);
        var poster = "";
        if (posterMatch) {
            poster = posterMatch[1];
            // If it's a relative URL, make it absolute
            if (poster.startsWith('/')) {
                poster = MAIN_URL + poster;
            }
            // Skip blank posters
            if (poster.includes('blank_poster.png')) {
                poster = "";
            }
        }
        
        // Extract quality tag
        var qualityMatch = /<span[^>]*>([A-Z0-9\-]+(?:\s*\|\s*[A-Z]+)?)<\/span>/.exec(cardHtml);
        var qualityText = qualityMatch ? qualityMatch[1].trim() : "";
        
        // Determine quality
        var quality = getSearchQuality(qualityText);
        
        // Check for DUAL audio
        var isDual = qualityText.toUpperCase().includes("DUAL");
        
        if (title) {
            items.push({
                name: title + (year ? " " + year : ""),
                link: url,
                image: poster,
                description: qualityText,
                quality: quality,
                dubStatus: isDual ? "Dubbed" : null
            });
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
    var formData = "term=" + encodeURIComponent(query) + "&types=m";
    
    var postHeaders = Object.assign({}, headers);
    postHeaders["Content-Type"] = "application/x-www-form-urlencoded";
    
    try {
        var res = await http_post(searchUrl, postHeaders, formData);
        var html = res.body;
        var movies = [];
        
        if (html && typeof html === 'string') {
            // Parse search results - <div class='moviesearchiteam ps-1 mb-1'>
            // Inside: <a href="/m/view/ID"> with <div class="searchtitle">
            var searchItemRegex = /<div class=['"]moviesearchiteam[^'"]*['"][^>]*>([\s\S]*?)<\/a>/g;
            var match;
            
            while ((match = searchItemRegex.exec(html)) !== null) {
                var itemHtml = match[1];
                
                // Extract URL - look for /m/view/ID
                var urlMatch = /<a\s+href=['"](\/m\/view\/\d+)['"]/.exec(itemHtml);
                if (!urlMatch) continue;
                var url = MAIN_URL + urlMatch[1];
                
                // Extract title from searchtitle class
                var titleMatch = /<div class=['"]searchtitle['"][^>]*>([^<]+)<\/div>/.exec(itemHtml);
                var title = titleMatch ? titleMatch[1].trim() : "";
                
                // Extract poster from img src - handle both with and without space before src
                var posterMatch = /<img[^>]*src=['"]([^'"]+)['"]/.exec(itemHtml);
                var poster = "";
                if (posterMatch) {
                    poster = posterMatch[1];
                    // Skip blank_poster
                    if (poster.includes('blank_poster.png')) {
                        poster = "";
                    }
                }
                
                if (title) {
                    movies.push({
                        title: title,
                        url: url,
                        posterUrl: poster,
                        isFolder: false
                    });
                }
            }
        }
        
        return movies;
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
        var titleMatch = /<div class=["']movie-detail-content["'][^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/.exec(html);
        var title = titleMatch ? titleMatch[1].trim() : "";
        
        // Alternative title extraction
        var altTitleMatch = /<h3[^>]*>([^<]+)<\/h3>/.exec(html);
        var finalTitle = title || (altTitleMatch ? altTitleMatch[1].trim() : "Unknown");
        
        // Extract poster - handle both with and without space before src
        var imgMatch = /<div class=['"]movie-detail-banner['"][^>]*>[\s\S]*?<img[^>]*src=['"]([^'"]+)['"]/.exec(html);
        var poster = "";
        if (imgMatch) {
            poster = imgMatch[1];
            // Handle relative poster URLs
            if (poster.startsWith('/')) {
                poster = MAIN_URL + poster;
            }
            if (poster.includes('blank_poster.png')) {
                poster = "";
            }
        }
        
        // Extract plot/storyline from <p class="storyline">
        var plotMatch = /<p class=["']storyline["'][^>]*>([\s\S]*?)<\/p>/.exec(html);
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
        
        // Extract file size
        var sizeMatch = /<span class=["']badge badge-fill["']>([^<]+)<\/span>/.exec(html);
        var size = sizeMatch ? sizeMatch[1].trim() : "";
        
        // Extract direct video URL - support mkv, mp4, avi
        var dataUrlMatch = /<a[^>]+href=["'](http[^"']+\.(?:mkv|mp4|avi)[^"']*)["']/.exec(html);
        var dataUrl = dataUrlMatch ? dataUrlMatch[1] : "";
        
        // Extract browse URL for quality options
        var browseMatch = /<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?Browse[\s\S]*?<\/a>/i.exec(html);
        var browseUrl = browseMatch ? browseMatch[1] : "";
        
        // Use plot as description (don't append genres)
        var description = plot;
        
        return {
            title: finalTitle,
            url: url,
            description: description,
            posterUrl: poster,
            year: 0,
            episodes: [
                {
                    name: finalTitle + (size ? " [" + size + "]" : ""),
                    url: dataUrl || url,
                    season: 1,
                    episode: 1,
                    posterUrl: poster,
                    description: description,
                    isPlaying: true
                }
            ]
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
    const genreWrapperMatch = /<div class=["']ganre-wrapper[^"']*["']>([\s\S]*?)<\/div>/.exec(html);
    
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
    const actorRegex = /<div class=["']col-lg-2["'][^>]*>([\s\S]*?)<\/div>/g;
    let match;
    
    while ((match = actorRegex.exec(html)) !== null) {
        const actorHtml = match[1];
        
        const imgMatch = /<img[^>]+src=["']([^"']+)["'][^>]+alt=["']([^"']*)["']/.exec(actorHtml);
        if (imgMatch) {
            const actorImg = imgMatch[1];
            const actorName = imgMatch[2];
            
            const roleMatch = /<p class=["']text-center text-white["']>([^<]*)<\/p>/.exec(actorHtml);
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

function extractQualityRecommendations(html, title, poster) {
    const recommendations = [];
    const badgeRegex = /<div class=["']badge-outline["'][^>]*>([\s\S]*?)<\/div>/.exec(html);
    
    if (badgeRegex) {
        const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([^<]+)<\/a>/g;
        let match;
        
        while ((match = linkRegex.exec(badgeRegex[1])) !== null) {
            const qualityUrl = MAIN_URL + match[1];
            const qualityText = match[2].trim();
            
            recommendations.push({
                name: title + " " + qualityText,
                link: qualityUrl,
                image: poster
            });
        }
    }
    
    return recommendations;
}

async function loadStreams(url) {
    await login();
    
    var headers = Object.assign({}, commonHeaders);
    if (loginCookie) {
        headers["Cookie"] = loginCookie;
    }
    
    try {
        var html = await _fetch(url, headers);
        var streams = [];
        
        if (!html || typeof html !== 'string') {
            return [];
        }
        
        // Extract direct video URL - support mkv, mp4, avi
        var dataUrlMatch = /<a[^>]+href=["'](http[^"']+\.(?:mkv|mp4|avi)[^"']*)["']/.exec(html);
        var dataUrl = dataUrlMatch ? dataUrlMatch[1] : "";
        
        if (dataUrl) {
            streams.push({
                url: dataUrl,
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

// Helper function to determine search quality
function getSearchQuality(check) {
    if (!check) return null;
    
    var lower = check.toLowerCase();
    
    if (lower.includes("4k")) return "FourK";
    if (lower.includes("web-r") || lower.includes("web-dl") || lower.includes("webrip")) return "WebRip";
    if (lower.includes("br") || lower.includes("bluray") || lower.includes("blu-ray")) return "BlueRay";
    if (lower.includes("hdts") || lower.includes("hdcam") || lower.includes("hdtc")) return "HdCam";
    if (lower.includes("cam")) return "Cam";
    if (lower.includes("hd") || lower.includes("1080p")) return "HD";
    
    return null;
}

// Helper function to get quality label from filename
function getQualityLabel(fileName) {
    var lower = fileName.toLowerCase();
    
    if (lower.includes("4k") && lower.includes("2160p")) return "4K UHD";
    if (lower.includes("4k")) return "4K";
    if (lower.includes("2160p")) return "4K UHD";
    if (lower.includes("1080p") && lower.includes("ds4k")) return "1080p DS4K";
    if (lower.includes("1080p")) return "1080p HD";
    if (lower.includes("720p")) return "720p HD";
    if (lower.includes("480p")) return "480p SD";
    if (lower.includes("ds4k")) return "1080p DS4K";
    
    return "HD";
}

// Export public functions for plugin loader
globalThis.getManifest = getManifest;
globalThis.getHome = getHome;
globalThis.search = search;
globalThis.load = load;
globalThis.loadStreams = loadStreams;
