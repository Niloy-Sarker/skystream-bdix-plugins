
const MAIN_URL = "https://dflix.discoveryftp.net";
let loginCookie = null;

const commonHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5"
};

function getManifest() {
    return {
        id: "com.niloy.dflix.movies",
        name: "Dflix Movies",
        internalName: "dflixmovies",
        version: 1,
        description: "Dflix Movies Provider - Bangla, English, Hindi, Tamil, Animation Movies",
        language: "bn",
        tvTypes: ["Movie", "AnimeMovie"],
        baseUrl: MAIN_URL,
        iconUrl: ""
    };
}

function login(callback) {
    if (loginCookie) {
        callback(true);
        return;
    }
    
    try {
        http_get(MAIN_URL + "/login/demo", commonHeaders, (status, data, cookies) => {
            if (status && status >= 200 && status < 400) {
                if (cookies) {
                    loginCookie = cookies;
                }
                callback(true);
            } else {
                // Login failed but continue anyway
                callback(false);
            }
        });
    } catch (e) {
        callback(false);
    }
}

function getHome(callback) {
    login((success) => {
        const categories = [
            { title: "Bangla", url: MAIN_URL + "/m/category/Bangla/1" },
            { title: "English", url: MAIN_URL + "/m/category/English/1" },
            { title: "Hindi", url: MAIN_URL + "/m/category/Hindi/1" },
            { title: "Tamil", url: MAIN_URL + "/m/category/Tamil/1" },
            { title: "Animation", url: MAIN_URL + "/m/category/Animation/1" },
            { title: "Others", url: MAIN_URL + "/m/category/Others/1" }
        ];
        
        let finalResult = [];
        let pending = categories.length;
        
        categories.forEach((category, index) => {
            const headers = Object.assign({}, commonHeaders);
            if (loginCookie) {
                headers["Cookie"] = loginCookie;
            }
            
            try {
                http_get(category.url, headers, (status, html) => {
                    let items = [];
                    try {
                        if (html && typeof html === 'string') {
                            items = parseMovieCards(html);
                        }
                    } catch (e) {
                        items = [];
                    }
                    
                    finalResult.push({
                        title: category.title,
                        Data: items || []
                    });
                    
                    pending--;
                    if (pending === 0) {
                        // Return valid JSON even if empty
                        callback(JSON.stringify(finalResult.length > 0 ? finalResult : []));
                    }
                });
            } catch (e) {
                finalResult.push({
                    title: category.title,
                    Data: []
                });
                pending--;
                if (pending === 0) {
                    callback(JSON.stringify(finalResult.length > 0 ? finalResult : []));
                }
            }
        });
    });
}

function parseMovieCards(html) {
    const items = [];
    
    // Pattern to match movie cards: div.card > a (with href) > poster + info
    const cardRegex = /<div class=["']card["']>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
    let match;
    
    while ((match = cardRegex.exec(html)) !== null) {
        const cardHtml = match[1];
        
        // Skip disabled cards
        if (cardHtml.includes('disable')) continue;
        
        // Extract URL
        const urlMatch = /<a\s+href=["']([^"']+)["']/.exec(cardHtml);
        if (!urlMatch) continue;
        const url = MAIN_URL + urlMatch[1];
        
        // Extract title from h3
        const titleMatch = /<h3[^>]*>([^<]+)<\/h3>/.exec(cardHtml);
        const title = titleMatch ? titleMatch[1].trim() : "";
        
        // Extract year from span (if present)
        const yearMatch = /<span[^>]*class=["'][^"']*feedback[^"']*["'][^>]*>[\s\S]*?<span[^>]*>(\d{4})<\/span>/.exec(cardHtml);
        const year = yearMatch ? yearMatch[1] : "";
        
        // Extract poster
        const posterMatch = /<img[^>]+src=["']([^"']+)["']/.exec(cardHtml);
        let poster = posterMatch ? posterMatch[1] : "";
        
        // If it's a relative URL, make it absolute
        if (poster && poster.startsWith('/')) {
            poster = MAIN_URL + poster;
        }
        // Skip blank posters
        if (poster.includes('blank_poster.png')) {
            poster = "";
        }
        
        // Extract quality tag
        const qualityMatch = /<span[^>]*>([A-Z0-9\-]+(?:\s*\|\s*[A-Z]+)?)<\/span>/.exec(cardHtml);
        const qualityText = qualityMatch ? qualityMatch[1].trim() : "";
        
        // Determine quality
        const quality = getSearchQuality(qualityText);
        
        // Check for DUAL audio
        const isDual = qualityText.toUpperCase().includes("DUAL");
        
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

function search(query, callback) {
    login((success) => {
        const headers = Object.assign({}, commonHeaders);
        if (loginCookie) {
            headers["Cookie"] = loginCookie;
        }
        
        const searchUrl = MAIN_URL + "/m/find/" + encodeURIComponent(query);
        
        try {
            http_get(searchUrl, headers, (status, html) => {
                try {
                    let movies = [];
                    if (html && typeof html === 'string') {
                        movies = parseMovieCards(html);
                    }
                    
                    const result = [];
                    if (movies && movies.length > 0) {
                        result.push({
                            title: "Search Results",
                            Data: movies
                        });
                    }
                    
                    callback(JSON.stringify(result));
                } catch (e) {
                    callback(JSON.stringify([]));
                }
            });
        } catch (e) {
            callback(JSON.stringify([]));
        }
    });
}

function load(url, callback) {
    login((success) => {
        const headers = Object.assign({}, commonHeaders);
        if (loginCookie) {
            headers["Cookie"] = loginCookie;
        }
        
        try {
            http_get(url, headers, (status, html) => {
                try {
                    if (!html || typeof html !== 'string') {
                        // Return a valid empty response
                        callback(JSON.stringify({
                            url: url,
                            data: JSON.stringify({ type: "movie", dataUrl: "", browseUrl: "" }),
                            title: "Error loading content",
                            description: "Could not load content from server",
                            year: 0,
                            subtitle: "",
                            image: "",
                            actors: [],
                            recommendations: []
                        }));
                        return;
                    }
                    
                    // Extract title
                    const titleMatch = /<div class="movie-detail-content"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/.exec(html);
                    const title = titleMatch ? titleMatch[1].trim() : "";
                    
                    // Alternative title extraction
                    const altTitleMatch = /<h3[^>]*>([^<]+)<\/h3>/.exec(html);
                    const finalTitle = title || (altTitleMatch ? altTitleMatch[1].trim() : "Unknown");
                    
                    // Extract poster
                    const imgMatch = /<div class=["']movie-detail-banner["'][^>]*>[\s\S]*?<img[^>]+src=["']([^"']+)["']/.exec(html);
                    let poster = imgMatch ? imgMatch[1] : "";
                    
                    // Handle relative poster URLs
                    if (poster && poster.startsWith('/')) {
                        poster = MAIN_URL + poster;
                    }
                    if (poster.includes('blank_poster.png')) {
                        poster = "";
                    }
            
            // Extract plot/storyline with improved pattern
            const plotMatch = /<div class=["']storyline["'][^>]*>([\s\S]*?)<\/div>/.exec(html);
            let plot = "";
            if (plotMatch) {
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
            const sizeMatch = /<span class=["']badge badge-fill["']>([^<]+)<\/span>/.exec(html);
            const size = sizeMatch ? sizeMatch[1].trim() : "";
            
            // Extract direct video URL - support mkv, mp4, avi
            const dataUrlMatch = /<a[^>]+href=["'](http[^"']+\.(?:mkv|mp4|avi)[^"']*)["']/.exec(html);
            const dataUrl = dataUrlMatch ? dataUrlMatch[1] : "";
            
            // Extract browse URL for quality options
            const browseMatch = /<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?Browse[\s\S]*?<\/a>/i.exec(html);
            const browseUrl = browseMatch ? browseMatch[1] : "";
            
            // Extract genres
            const genres = extractGenres(html);
            
            // Extract actors
            const actors = extractActors(html);
            
            // Extract quality recommendations (different quality versions)
            const recommendations = extractQualityRecommendations(html, finalTitle, poster);
            
            // Build description
            let description = "";
            if (size) {
                description += "<b>Size: " + size + "</b><br><br>";
            }
            description += plot;
            if (genres.length > 0) {
                description += "<br><br><b>Genres:</b> " + genres.join(", ");
            }
            
            const loadData = {
                type: "movie",
                dataUrl: dataUrl,
                browseUrl: browseUrl
            };
            
            callback(JSON.stringify({
                url: url,
                data: JSON.stringify(loadData),
                title: finalTitle,
                description: description,
                year: 0,
                subtitle: size,
                image: poster,
                actors: actors,
                recommendations: recommendations
            }));
                } catch (e) {
                    // Return a valid error response
                    callback(JSON.stringify({
                        url: url,
                        data: JSON.stringify({ type: "movie", dataUrl: "", browseUrl: "" }),
                        title: "Error",
                        description: "Error parsing content",
                        year: 0,
                        subtitle: "",
                        image: "",
                        actors: [],
                        recommendations: []
                    }));
                }
            });
        } catch (e) {
            callback(JSON.stringify({
                url: url,
                data: JSON.stringify({ type: "movie", dataUrl: "", browseUrl: "" }),
                title: "Error",
                description: "Could not connect to server",
                year: 0,
                subtitle: "",
                image: "",
                actors: [],
                recommendations: []
            }));
        }
    });
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

function loadStreams(url, callback) {
    login((success) => {
        const headers = Object.assign({}, commonHeaders);
        if (loginCookie) {
            headers["Cookie"] = loginCookie;
        }
        
        try {
        http_get(url, headers, (status, html) => {
            try {
            const streams = [];
            
            if (!html || typeof html !== 'string') {
                callback(JSON.stringify([]));
                return;
            }
            
            // Extract direct video URL - support mkv, mp4, avi
            const dataUrlMatch = /<a[^>]+href=["'](http[^"']+\.(?:mkv|mp4|avi)[^"']*)["']/.exec(html);
            const dataUrl = dataUrlMatch ? dataUrlMatch[1] : "";
            
            // Extract browse URL for mirror links
            const browseMatch = /<a[^>]+href=["']([^"']+)["'][^>]*>[\s\S]*?Browse[\s\S]*?<\/a>/i.exec(html);
            const browseUrl = browseMatch ? browseMatch[1] : "";
            
            if (dataUrl) {
                streams.push({
                    name: "(BDIX) Dflix Movies",
                    url: dataUrl,
                    headers: headers
                });
            }
            
            // If we have a browse URL, fetch mirror links
            if (browseUrl) {
                http_get(browseUrl, headers, (browseStatus, browseHtml) => {
                    // Parse directory listing for .mkv files
                    const filePattern = /\|\s*\|\s*([^|]*\.(?:mkv|mp4|avi))\s*\|\s*[^|]*\s*\|\s*([^|]*?(?:KB|MB|GB|TB))\s*\|/gi;
                    let match;
                    const processedFiles = new Set();
                    
                    while ((match = filePattern.exec(browseHtml)) !== null) {
                        const fileName = match[1].trim();
                        const fileSize = match[2].trim();
                        
                        if (!processedFiles.has(fileName)) {
                            processedFiles.add(fileName);
                            const fileUrl = browseUrl.replace(/\/$/, '') + "/" + encodeURIComponent(fileName);
                            const qualityLabel = getQualityLabel(fileName);
                            
                            streams.push({
                                name: "[Mirror] " + qualityLabel + " - " + fileSize,
                                url: fileUrl,
                                headers: headers
                            });
                        }
                    }
                    
                    // Fallback: try to find any video files
                    if (processedFiles.size === 0) {
                        const generalPattern = /href="([^"]*\.(?:mkv|mp4|avi))"/gi;
                        while ((match = generalPattern.exec(browseHtml)) !== null) {
                            const fileName = match[1].trim();
                            
                            if (!processedFiles.has(fileName)) {
                                processedFiles.add(fileName);
                                const fileUrl = browseUrl.replace(/\/$/, '') + "/" + encodeURIComponent(fileName);
                                const qualityLabel = getQualityLabel(fileName);
                                
                                streams.push({
                                    name: "[Mirror] " + qualityLabel,
                                    url: fileUrl,
                                    headers: headers
                                });
                            }
                        }
                    }
                    
                    callback(JSON.stringify(streams));
                });
            } else {
                callback(JSON.stringify(streams));
            }
            } catch (e) {
                callback(JSON.stringify([]));
            }
        });
        } catch (e) {
            callback(JSON.stringify([]));
        }
    });
}

// Helper function to determine search quality
function getSearchQuality(check) {
    if (!check) return null;
    
    const lower = check.toLowerCase();
    
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
    const lower = fileName.toLowerCase();
    
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
globalThis.loadLinks = loadStreams;
globalThis.loadUrl = loadStreams;
