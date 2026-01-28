
const MAIN_URL = "http://new.circleftp.net";
const MAIN_API_URL = "http://new.circleftp.net:5000";
const FALLBACK_API_URL = "http://15.1.1.50:5000";


function getManifest() {
    return {
        id: "com.niloy.circleftp",
        name: "CircleFTP",
        internalName: "CircleFTP",
        version: 1,
        description: "CircleFTP Provider - Movies, TV Series, Anime (BDIX Network)",
        language: "bn",
        tvTypes: ["Movie", "TvSeries", "Anime", "AnimeMovie", "Cartoon", "AsianDrama", "Documentary", "OVA", "Others"],
        baseUrl: MAIN_URL,
        iconUrl: "http://new.circleftp.net/static/media/logo.fce2c9029060a10687b8.png"
    };
}

const FTP_IP_MAPPINGS = {
    "index.circleftp.net": "15.1.4.2",
    "index2.circleftp.net": "15.1.4.5",
    "index1.circleftp.net": "15.1.4.9",
    "ftp3.circleftp.net": "15.1.4.7",
    "ftp4.circleftp.net": "15.1.1.5",
    "ftp5.circleftp.net": "15.1.1.15",
    "ftp6.circleftp.net": "15.1.2.3",
    "ftp7.circleftp.net": "15.1.4.8",
    "ftp8.circleftp.net": "15.1.2.2",
    "ftp9.circleftp.net": "15.1.2.12",
    "ftp10.circleftp.net": "15.1.4.3",
    "ftp11.circleftp.net": "15.1.2.6",
    "ftp12.circleftp.net": "15.1.2.1",
    "ftp13.circleftp.net": "15.1.1.18",
    "ftp15.circleftp.net": "15.1.4.12",
    "ftp17.circleftp.net": "15.1.3.8"
};

// Main page categories 
const MAIN_PAGE_CATEGORIES = [
    { id: "80", name: "Featured" },
    { id: "6", name: "English Movies" },
    { id: "9", name: "English & Foreign TV Series" },
    { id: "22", name: "Dubbed TV Series" },
    { id: "2", name: "Hindi Movies" },
    { id: "5", name: "Hindi TV Series" },
    { id: "238", name: "Indian TV Show" },
    { id: "7", name: "English & Foreign Hindi Dubbed Movies" },
    { id: "8", name: "Foreign Language Movies" },
    { id: "3", name: "South Indian Dubbed Movies" },
    { id: "4", name: "South Indian Movies" },
    { id: "1", name: "Animation Movies" },
    { id: "21", name: "Anime Series" },
    { id: "85", name: "Documentary" },
    { id: "15", name: "WWE" }
];

const commonHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "application/json, text/plain, */*",
    "Referer": MAIN_URL + "/"
};


async function fetchApiJson(endpoint, useMainApiFirst = true) {
    const urls = useMainApiFirst 
        ? [MAIN_API_URL + endpoint, FALLBACK_API_URL + endpoint]
        : [FALLBACK_API_URL + endpoint, MAIN_API_URL + endpoint];
    
    for (const url of urls) {
        try {
            const response = await fetch(url, { headers: commonHeaders });
            if (response.ok) {
                const data = await response.json();
                // Return both data and which URL succeeded
                return { data, apiUrl: url.replace(endpoint, "") };
            }
        } catch (e) {
            // Try next URL
            continue;
        }
    }
    
    throw new Error("Failed to fetch from all API endpoints");
}

function linkToIp(url) {
    if (!url) return "";
    
    for (const [hostname, ip] of Object.entries(FTP_IP_MAPPINGS)) {
        if (url.includes(hostname)) {
            return url.replace(hostname, ip);
        }
    }
    
    return url;
}


function selectUntilNonInt(str) {
    if (!str) return null;
    const match = str.match(/^(\d+)/);
    return match ? parseInt(match[1]) : null;
}


function getSearchQuality(check) {
    if (!check) return null;
    
    const lowerCheck = check.toLowerCase();
    
    if (lowerCheck.includes("webrip") || lowerCheck.includes("web-dl")) return "WebRip";
    if (lowerCheck.includes("bluray")) return "BlueRay";
    if (lowerCheck.includes("hdts") || lowerCheck.includes("hdcam") || lowerCheck.includes("hdtc")) return "HdCam";
    if (lowerCheck.includes("dvd")) return "DVD";
    if (lowerCheck.includes("cam") && !lowerCheck.includes("camrip")) return "Cam";
    if (lowerCheck.includes("camrip") || lowerCheck.includes("rip")) return "CamRip";
    if (lowerCheck.includes("hdrip") || lowerCheck.includes("hd") || lowerCheck.includes("hdtv")) return "HD";
    if (lowerCheck.includes("telesync")) return "Telesync";
    if (lowerCheck.includes("telecine")) return "Telecine";
    
    return null;
}


function isDubbed(title) {
    if (!title) return false;
    const lowerTitle = title.toLowerCase();
    return lowerTitle.includes("dubbed") || 
           lowerTitle.includes("dual audio") || 
           lowerTitle.includes("multi audio");
}


function toSearchResult(post, apiUrl) {
    // Only include singleVideo and series types
    if (post.type !== "singleVideo" && post.type !== "series") {
        return null;
    }
    
    const title = post.title || post.name || "Untitled";
    const posterUrl = post.imageSm ? apiUrl + "/uploads/" + post.imageSm : "";
    const quality = getSearchQuality(title);
    const dubbed = isDubbed(title);
    
    // Determine type
    let type = "movie";
    if (post.type === "series") {
        const lowerTitle = title.toLowerCase();
        if (lowerTitle.includes("anime")) {
            type = "anime";
        } else {
            type = "tvseries";
        }
    }
    
    return {
        url: MAIN_URL + "/content/" + post.id,
        title: title,
        posterUrl: posterUrl,
        year: 0,
        type: type,
        quality: quality,
        dubbed: dubbed
    };
}

/**
 * Parse duration string to minutes
 */
function getDurationFromString(durationStr) {
    if (!durationStr) return null;
    
    let totalMinutes = 0;
    
    // Match hours
    const hoursMatch = durationStr.match(/(\d+)\s*h/i);
    if (hoursMatch) {
        totalMinutes += parseInt(hoursMatch[1]) * 60;
    }
    
    // Match minutes
    const minutesMatch = durationStr.match(/(\d+)\s*m/i);
    if (minutesMatch) {
        totalMinutes += parseInt(minutesMatch[1]);
    }
    
    return totalMinutes > 0 ? totalMinutes : null;
}

// ============================================================================
// Main API Functions
// ============================================================================

async function getHome() {
    const home = {};
    
    // Fetch first few categories for home page
    const categoriesToFetch = MAIN_PAGE_CATEGORIES.slice(0, 6);
    
    for (const category of categoriesToFetch) {
        try {
            const endpoint = "/api/posts?categoryExact=" + category.id + "&page=1&order=desc&limit=10";
            const { data, apiUrl } = await fetchApiJson(endpoint);
            
            if (data && data.posts && Array.isArray(data.posts)) {
                const items = data.posts
                    .map(post => toSearchResult(post, apiUrl))
                    .filter(item => item !== null);
                
                if (items.length > 0) {
                    home[category.name] = items;
                }
            }
        } catch (e) {
            // Skip category on error, continue with others
            console.log("Error fetching category " + category.name + ": " + e);
        }
    }
    
    // Fallback if no categories loaded
    if (Object.keys(home).length === 0) {
        home["📁 Browse Categories"] = MAIN_PAGE_CATEGORIES.slice(0, 8).map(cat => ({
            url: MAIN_URL + "/category/" + cat.id,
            title: cat.name,
            posterUrl: "",
            year: 0,
            type: "movie"
        }));
    }
    
    return home;
}

/**
 * Search for content
 */
async function search(query) {
    try {
        const endpoint = "/api/posts?searchTerm=" + encodeURIComponent(query) + "&order=desc";
        const { data, apiUrl } = await fetchApiJson(endpoint);
        
        if (data && data.posts && Array.isArray(data.posts)) {
            return data.posts
                .map(post => toSearchResult(post, apiUrl))
                .filter(item => item !== null);
        }
        
        return [];
    } catch (e) {
        console.log("Search error: " + e);
        return [];
    }
}


async function load(url, cb) {
    try {
        // Extract content ID from URL
        const idMatch = url.match(/\/content\/(\d+)/);
        if (!idMatch) {
            const errorResult = { title: "Invalid URL", url: url };
            if (cb) cb(errorResult);
            else return errorResult;
            return;
        }
        
        const contentId = idMatch[1];
        const endpoint = "/api/posts/" + contentId;
        
        const { data, apiUrl } = await fetchApiJson(endpoint);
        const urlCheck = apiUrl === MAIN_API_URL;
        
        const title = data.title || data.name || "Untitled";
        const poster = data.image ? apiUrl + "/uploads/" + data.image : "";
        const description = data.metaData || "";
        const year = selectUntilNonInt(data.year);
        const quality = data.quality || "";
        const duration = getDurationFromString(data.watchTime);
        
        if (data.type === "singleVideo") {
            // Movie
            let movieUrl = data.content || "";
            
            // Convert to IP if needed (when using fallback API)
            if (!urlCheck && movieUrl) {
                movieUrl = linkToIp(movieUrl);
            }
            
            const result = {
                url: url,
                title: title,
                posterUrl: poster,
                year: year || 0,
                plot: description,
                description: quality,
                rating: 0.0,
                duration: duration,
                type: "movie",
                isFolder: false,
                episodes: [
                    {
                        name: title + (quality ? " [" + quality + "]" : ""),
                        url: movieUrl || url,
                        season: 1,
                        episode: 1,
                        posterUrl: poster,
                        description: description
                    }
                ]
            };
            
            if (cb) cb(result);
            else return result;
            
        } else {
            // TV Series
            const episodes = [];
            
            if (data.content && Array.isArray(data.content)) {
                let seasonNum = 0;
                
                for (const season of data.content) {
                    seasonNum++;
                    let episodeNum = 0;
                    
                    if (season.episodes && Array.isArray(season.episodes)) {
                        for (const ep of season.episodes) {
                            episodeNum++;
                            
                            let episodeUrl = ep.link || "";
                            
                            // Convert to IP if needed (when using fallback API)
                            if (!urlCheck && episodeUrl) {
                                episodeUrl = linkToIp(episodeUrl);
                            }
                            
                            episodes.push({
                                name: ep.title || ("Episode " + episodeNum),
                                url: episodeUrl || url,
                                season: seasonNum,
                                episode: episodeNum,
                                posterUrl: poster,
                                description: season.seasonName || ("Season " + seasonNum)
                            });
                        }
                    }
                }
            }
            
            // Fallback if no episodes parsed
            if (episodes.length === 0) {
                episodes.push({
                    name: title,
                    url: url,
                    season: 1,
                    episode: 1,
                    posterUrl: poster,
                    description: "No episodes found"
                });
            }
            
            // Determine type (anime or tvseries)
            const lowerTitle = title.toLowerCase();
            const type = lowerTitle.includes("anime") ? "anime" : "tvseries";
            
            const result = {
                url: url,
                title: title,
                posterUrl: poster,
                year: year || 0,
                plot: description,
                description: quality,
                rating: 0.0,
                type: type,
                isFolder: true,
                episodes: episodes
            };
            
            if (cb) cb(result);
            else return result;
        }
        
    } catch (e) {
        console.log("Load error: " + e);
        const errorResult = { title: "Error loading content", url: url };
        if (cb) cb(errorResult);
        else return errorResult;
    }
}


async function loadStreams(url, cb) {
    try {
        const links = [];
        
        // If URL is already a direct media link (CDN/FTP link)
        if (url.includes("circleftp.net") && !url.includes("/content/")) {
            // Convert hostname to IP for BDIX network compatibility
            const directUrl = linkToIp(url);
            
            let quality = "Direct Download";
            if (url.includes("1080p")) quality = "1080p";
            else if (url.includes("720p")) quality = "720p";
            else if (url.includes("480p")) quality = "480p";
            else if (url.includes("2160p") || url.includes("4K")) quality = "4K";
            
            links.push({
                url: directUrl,
                quality: quality,
                name: "(BDIX) Circle FTP",
                headers: commonHeaders
            });
        }
        
        // If it's a content page URL, try to extract from API
        if (url.includes("/content/")) {
            const idMatch = url.match(/\/content\/(\d+)/);
            if (idMatch) {
                try {
                    const endpoint = "/api/posts/" + idMatch[1];
                    const { data, apiUrl } = await fetchApiJson(endpoint);
                    const urlCheck = apiUrl === MAIN_API_URL;
                    
                    if (data.type === "singleVideo" && data.content) {
                        let movieUrl = data.content;
                        if (!urlCheck) {
                            movieUrl = linkToIp(movieUrl);
                        }
                        
                        let quality = "Direct Download";
                        if (movieUrl.includes("1080p")) quality = "1080p";
                        else if (movieUrl.includes("720p")) quality = "720p";
                        else if (movieUrl.includes("480p")) quality = "480p";
                        else if (movieUrl.includes("2160p") || movieUrl.includes("4K")) quality = "4K";
                        
                        links.push({
                            url: movieUrl,
                            quality: quality,
                            name: "(BDIX) Circle FTP",
                            headers: commonHeaders
                        });
                    }
                } catch (e) {
                    // API fetch failed, continue
                }
            }
        }
        
        // Fallback: return the URL as-is
        if (links.length === 0) {
            links.push({
                url: linkToIp(url),
                quality: "Direct",
                name: "(BDIX) Circle FTP",
                headers: commonHeaders
            });
        }
        
        if (cb) cb(links);
        else return links;
        
    } catch (e) {
        console.log("loadStreams error: " + e);
        const fallback = [{
            url: linkToIp(url),
            quality: "Fallback",
            name: "(BDIX) Circle FTP",
            headers: {}
        }];
        
        if (cb) cb(fallback);
        else return fallback;
    }
}

/**
 * Get content from a specific category with pagination
 */
async function getCategory(categoryId, page = 1) {
    try {
        const endpoint = "/api/posts?categoryExact=" + categoryId + "&page=" + page + "&order=desc&limit=20";
        const { data, apiUrl } = await fetchApiJson(endpoint);
        
        if (data && data.posts && Array.isArray(data.posts)) {
            return data.posts
                .map(post => toSearchResult(post, apiUrl))
                .filter(item => item !== null);
        }
        
        return [];
    } catch (e) {
        console.log("getCategory error: " + e);
        return [];
    }
}

function getCategories() {
    return MAIN_PAGE_CATEGORIES.map(cat => ({
        id: cat.id,
        name: cat.name,
        url: MAIN_URL + "/category/" + cat.id
    }));
}

const loadLinks = loadStreams;
const loadUrl = loadStreams;


globalThis.getManifest = getManifest;
globalThis.getHome = getHome;
globalThis.search = search;
globalThis.load = load;
globalThis.loadStreams = loadStreams;
globalThis.loadLinks = loadLinks;
globalThis.loadUrl = loadUrl;
globalThis.getCategory = getCategory;
globalThis.getCategories = getCategories;
globalThis.linkToIp = linkToIp;
globalThis.MAIN_PAGE_CATEGORIES = MAIN_PAGE_CATEGORIES;
