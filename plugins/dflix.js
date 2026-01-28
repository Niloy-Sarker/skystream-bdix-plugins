// Dflix Combined Provider for Skystream (Movies + Series)
// Ported from Kotlin CloudStream provider

const mainUrl = "https://dflix.discoveryftp.net";
let loginCookie = null;

const commonHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5"
};

function getManifest() {
    return {
        name: "(BDIX) Dflix",
        id: "com.niloy.dflix",
        version: 1,
        baseUrl: mainUrl,
        type: "Movie", // Primary type
        language: "bn"
    };
}

function login(callback) {
    if (loginCookie) {
        callback();
        return;
    }
    
    http_get(mainUrl + "/login/demo", commonHeaders, (status, data, cookies) => {
        if (cookies) {
            loginCookie = cookies;
        }
        callback();
    });
}

function getHome(callback) {
    login(() => {
        const categories = [
            // Movies
            { title: "Bangla Movies", url: mainUrl + "/m/category/Bangla/1", type: "movie" },
            { title: "English Movies", url: mainUrl + "/m/category/English/1", type: "movie" },
            { title: "Hindi Movies", url: mainUrl + "/m/category/Hindi/1", type: "movie" },
            { title: "Tamil Movies", url: mainUrl + "/m/category/Tamil/1", type: "movie" },
            { title: "Animation Movies", url: mainUrl + "/m/category/Animation/1", type: "movie" },
            { title: "Other Movies", url: mainUrl + "/m/category/Others/1", type: "movie" },
            // Series
            { title: "English Series", url: mainUrl + "/s/category/Foreign/1", type: "series" },
            { title: "Bangla Series", url: mainUrl + "/s/category/Bangla/1", type: "series" },
            { title: "Hindi Series", url: mainUrl + "/s/category/Hindi/1", type: "series" },
            { title: "South Series", url: mainUrl + "/s/category/South/1", type: "series" },
            { title: "Animation Series", url: mainUrl + "/s/category/Animation/1", type: "series" },
            { title: "Dubbed Series", url: mainUrl + "/s/category/Dubbed/1", type: "series" }
        ];
        
        let finalResult = [];
        let pending = categories.length;
        
        categories.forEach(category => {
            const headers = Object.assign({}, commonHeaders);
            if (loginCookie) {
                headers["Cookie"] = loginCookie;
            }
            
            http_get(category.url, headers, (status, html) => {
                const items = [];
                
                if (category.type === "movie") {
                    // Extract movie cards
                    const cardRegex = /<div class="card">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
                    let match;
                    
                    while ((match = cardRegex.exec(html)) !== null) {
                        const cardHtml = match[1];
                        
                        const urlMatch = /<a\s+href="([^"]+)"/.exec(cardHtml);
                        if (!urlMatch) continue;
                        const url = mainUrl + urlMatch[1];
                        
                        const titleMatch = /<h3[^>]*>([^<]+)<\/h3>/.exec(cardHtml);
                        const title = titleMatch ? titleMatch[1].trim() : "";
                        
                        const posterMatch = /<img[^>]+src="([^"]+)"/.exec(cardHtml);
                        const poster = posterMatch ? posterMatch[1] : "";
                        
                        const qualityMatch = /<span[^>]*>([^<]+)<\/span>/.exec(cardHtml);
                        const qualityText = qualityMatch ? qualityMatch[1] : "";
                        
                        items.push({
                            name: title,
                            link: url,
                            image: poster,
                            description: qualityText
                        });
                    }
                } else {
                    // Extract series cards
                    const cardRegex = /<div class="col-xl-4">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
                    let match;
                    
                    while ((match = cardRegex.exec(html)) !== null) {
                        const cardHtml = match[1];
                        
                        const urlMatch = /<a\s+href="([^"]+)"/.exec(cardHtml);
                        if (!urlMatch) continue;
                        const url = mainUrl + urlMatch[1];
                        
                        const titleMatch = /<div class="fcard"[^>]*>[\s\S]*?<div[^>]*>([^<]+)<\/div>/.exec(cardHtml);
                        const title = titleMatch ? titleMatch[1].trim() : "";
                        
                        const posterMatch = /<img[^>]+src="([^"]+)"/.exec(cardHtml);
                        const poster = posterMatch ? posterMatch[1] : "";
                        
                        items.push({
                            name: title,
                            link: url,
                            image: poster,
                            description: ""
                        });
                    }
                }
                
                finalResult.push({
                    title: category.title,
                    Data: items
                });
                
                pending--;
                if (pending === 0) {
                    callback(JSON.stringify(finalResult));
                }
            });
        });
    });
}

function search(query, callback) {
    login(() => {
        const headers = Object.assign({}, commonHeaders);
        if (loginCookie) {
            headers["Cookie"] = loginCookie;
        }
        
        // Search both movies and series
        const movieSearchUrl = mainUrl + "/m/find/" + encodeURIComponent(query);
        const seriesSearchUrl = mainUrl + "/search";
        
        let allResults = [];
        let pending = 2;
        
        // Search movies
        http_get(movieSearchUrl, headers, (status, html) => {
            const movies = [];
            
            // Try new search structure
            const searchItemRegex = /<div class="moviesearchiteam">([\s\S]*?)<\/div>\s*<\/div>/g;
            let match;
            let foundResults = false;
            
            while ((match = searchItemRegex.exec(html)) !== null) {
                foundResults = true;
                const itemHtml = match[1];
                
                const urlMatch = /<a\s+href="([^"]+)"/.exec(itemHtml);
                if (!urlMatch) continue;
                const url = mainUrl + urlMatch[1];
                
                const titleMatch = /<div class="searchtitle">([^<]+)<\/div>/.exec(itemHtml);
                const title = titleMatch ? titleMatch[1].trim() : "";
                
                const detailsMatch = /<div class="searchdetails">([^<]+)<\/div>/.exec(itemHtml);
                const details = detailsMatch ? detailsMatch[1].trim() : "";
                
                movies.push({
                    name: title,
                    link: url,
                    image: "",
                    description: details
                });
            }
            
            // Fallback to old structure
            if (!foundResults) {
                const cardRegex = /<div class="card"(?![^>]*class="[^"]*disable[^"]*")>([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>/g;
                
                while ((match = cardRegex.exec(html)) !== null) {
                    const cardHtml = match[1];
                    
                    if (cardHtml.includes('disable')) continue;
                    
                    const urlMatch = /<a\s+href="([^"]+)"/.exec(cardHtml);
                    if (!urlMatch) continue;
                    const url = mainUrl + urlMatch[1];
                    
                    const titleMatch = /<h3[^>]*>([^<]+)<\/h3>/.exec(cardHtml);
                    const title = titleMatch ? titleMatch[1].trim() : "";
                    
                    const posterMatch = /<img[^>]+src="([^"]+)"/.exec(cardHtml);
                    const poster = posterMatch ? posterMatch[1] : "";
                    
                    const qualityMatch = /<span[^>]*>([^<]+)<\/span>/.exec(cardHtml);
                    const quality = qualityMatch ? qualityMatch[1] : "";
                    
                    movies.push({
                        name: title,
                        link: url,
                        image: poster,
                        description: quality
                    });
                }
            }
            
            if (movies.length > 0) {
                allResults.push({
                    title: "Movies",
                    Data: movies
                });
            }
            
            pending--;
            if (pending === 0) {
                callback(JSON.stringify(allResults));
            }
        });
        
        // Search series (using POST)
        const formData = "term=" + encodeURIComponent(query) + "&types=s";
        const postHeaders = Object.assign({}, headers);
        postHeaders["Content-Type"] = "application/x-www-form-urlencoded";
        
        http_post(seriesSearchUrl, formData, postHeaders, (status, html) => {
            const series = [];
            
            const searchItemRegex = /<div class="moviesearchiteam">[\s\S]*?<a\s+href="([^"]+)"([\s\S]*?)<\/a>[\s\S]*?<\/div>/g;
            let match;
            
            while ((match = searchItemRegex.exec(html)) !== null) {
                const url = mainUrl + match[1];
                const itemHtml = match[2];
                
                const titleMatch = /<div class="searchtitle">([^<]+)<\/div>/.exec(itemHtml);
                const title = titleMatch ? titleMatch[1].trim() : "";
                
                const posterMatch = /<img[^>]+src="([^"]+)"/.exec(itemHtml);
                const poster = posterMatch ? posterMatch[1] : "";
                
                series.push({
                    name: title,
                    link: url,
                    image: poster,
                    description: ""
                });
            }
            
            if (series.length > 0) {
                allResults.push({
                    title: "Series",
                    Data: series
                });
            }
            
            pending--;
            if (pending === 0) {
                callback(JSON.stringify(allResults));
            }
        });
    });
}

function load(url, callback) {
    login(() => {
        const headers = Object.assign({}, commonHeaders);
        if (loginCookie) {
            headers["Cookie"] = loginCookie;
        }
        
        http_get(url, headers, (status, html) => {
            // Determine if it's a movie or series by checking URL pattern
            const isMovie = url.includes("/m/");
            
            // Extract common metadata
            const titleMatch = /<h3[^>]*class="[^"]*movie-detail-content[^"]*"[^>]*>([^<]+)<\/h3>/.exec(html);
            const title = titleMatch ? titleMatch[1].trim() : "";
            
            const imgMatch = /<img[^>]+class="[^"]*movie-detail-banner[^"]*"[^>]+src="([^"]+)"/.exec(html);
            const poster = imgMatch ? imgMatch[1] : "";
            
            const plotMatch = /<div class="storyline">([^<]+)<\/div>/.exec(html);
            const plot = plotMatch ? plotMatch[1].trim() : "";
            
            // Extract genres
            const genreMatches = html.match(/<div class="ganre-wrapper[^"]*">[\s\S]*?<\/div>/);
            let genres = "";
            if (genreMatches) {
                const genreLinks = genreMatches[0].match(/<a[^>]*>([^<]+)<\/a>/g);
                if (genreLinks) {
                    genres = genreLinks.map(link => {
                        const match = />([^<]+)</.exec(link);
                        return match ? match[1].replace(',', '').trim() : '';
                    }).filter(g => g).join(", ");
                }
            }
            
            if (isMovie) {
                // Movie loading logic
                const dataUrlMatch = /<a[^>]+href="(http[^"]+\.mkv[^"]*)"/.exec(html);
                const dataUrl = dataUrlMatch ? dataUrlMatch[1] : "";
                
                const browseMatch = /<a[^>]+href="([^"]+)"[^>]*>Browse<\/a>/i.exec(html);
                const browseUrl = browseMatch ? browseMatch[1] : "";
                
                const sizeMatch = /<span class="badge badge-fill">([^<]+)<\/span>/.exec(html);
                const size = sizeMatch ? sizeMatch[1].trim() : "";
                
                const loadData = {
                    type: "movie",
                    dataUrl: dataUrl,
                    browseUrl: browseUrl
                };
                
                const description = (size ? "<b>" + size + "</b><br><br>" : "") + plot +
                                   (genres ? "<br><br><b>Genres:</b> " + genres : "");
                
                callback(JSON.stringify({
                    url: url,
                    data: JSON.stringify(loadData),
                    title: title,
                    description: description,
                    year: 0,
                    subtitle: size,
                    image: poster
                }));
            } else {
                // Series loading logic
                const seasonRegex = /<table class="table mb-0">[\s\S]*?<tbody>([\s\S]*?)<\/tbody>[\s\S]*?<\/table>/;
                const seasonTableMatch = seasonRegex.exec(html);
                
                const seasonData = {
                    type: "series",
                    url: url,
                    title: title,
                    poster: poster,
                    plot: plot,
                    genres: genres,
                    seasons: []
                };
                
                if (seasonTableMatch) {
                    const seasonLinks = seasonTableMatch[1].match(/<a\s+href="([^"]+)"[^>]*>/g);
                    if (seasonLinks) {
                        seasonLinks.reverse().forEach(link => {
                            const urlMatch = /href="([^"]+)"/.exec(link);
                            if (urlMatch) {
                                seasonData.seasons.push(urlMatch[1]);
                            }
                        });
                    }
                }
                
                const description = plot + (genres ? "<br><br><b>Genres:</b> " + genres : "");
                
                callback(JSON.stringify({
                    url: url,
                    data: JSON.stringify(seasonData),
                    title: title,
                    description: description,
                    year: 0,
                    subtitle: "",
                    image: poster
                }));
            }
        });
    });
}

function loadStreams(url, callback) {
    login(() => {
        const headers = Object.assign({}, commonHeaders);
        if (loginCookie) {
            headers["Cookie"] = loginCookie;
        }
        
        http_get(url, headers, (status, html) => {
            const streams = [];
            
            // Determine type by URL pattern
            const isMovie = url.includes("/m/");
            
            if (isMovie) {
                // Movie stream extraction with mirrors
                const dataUrlMatch = /<a[^>]+href="(http[^"]+\.mkv[^"]*)"/.exec(html);
                const dataUrl = dataUrlMatch ? dataUrlMatch[1] : "";
                
                const browseMatch = /<a[^>]+href="([^"]+)"[^>]*>Browse<\/a>/i.exec(html);
                const browseUrl = browseMatch ? browseMatch[1] : "";
                
                if (dataUrl) {
                    streams.push({
                        name: "Main Stream",
                        url: dataUrl,
                        headers: headers
                    });
                }
                
                // Fetch mirror links
                if (browseUrl) {
                    http_get(browseUrl, headers, (browseStatus, browseHtml) => {
                        const filePattern = /\|\s*\|\s*([^|]*\.mkv)\s*\|\s*[^|]*\s*\|\s*([^|]*?(?:KB|MB|GB|TB))\s*\|/g;
                        let match;
                        const processedFiles = new Set();
                        
                        while ((match = filePattern.exec(browseHtml)) !== null) {
                            const fileName = match[1].trim();
                            const fileSize = match[2].trim();
                            
                            if (!processedFiles.has(fileName)) {
                                processedFiles.add(fileName);
                                const fileUrl = browseUrl.replace(/\/$/, '') + "/" + fileName;
                                const qualityLabel = getQualityLabel(fileName);
                                
                                streams.push({
                                    name: "[Mirror] " + qualityLabel + " - " + fileSize,
                                    url: fileUrl,
                                    headers: headers
                                });
                            }
                        }
                        
                        // Fallback pattern
                        if (processedFiles.size === 0) {
                            const generalPattern = /([^\s|]+\.mkv)/g;
                            while ((match = generalPattern.exec(browseHtml)) !== null) {
                                const fileName = match[1].trim();
                                
                                if (!processedFiles.has(fileName)) {
                                    processedFiles.add(fileName);
                                    const fileUrl = browseUrl.replace(/\/$/, '') + "/" + fileName;
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
            } else {
                // Series/Episode stream extraction
                const streamMatch = /<a[^>]+href="(http[^"]+\.mkv[^"]*)"/.exec(html);
                if (streamMatch) {
                    streams.push({
                        name: "Stream",
                        url: streamMatch[1],
                        headers: headers
                    });
                }
                
                callback(JSON.stringify(streams));
            }
        });
    });
}

// Helper functions
function getQualityFromFileName(fileName) {
    const lower = fileName.toLowerCase();
    if (lower.includes("4k") || lower.includes("2160p")) return 2160;
    if (lower.includes("1080p")) return 1080;
    if (lower.includes("720p")) return 720;
    if (lower.includes("480p")) return 480;
    if (lower.includes("ds4k")) return 1080;
    return 1080;
}

function getQualityLabel(fileName) {
    const lower = fileName.toLowerCase();
    if (lower.includes("4k") && lower.includes("2160p")) return "4K UHD";
    if (lower.includes("4k")) return "4K";
    if (lower.includes("2160p")) return "4K UHD";
    if (lower.includes("1080p") && lower.includes("ds4k")) return "1080p DS4K";
    if (lower.includes("1080p")) return "1080p HD";
    if (lower.includes("720p")) return "720p HD";
    if (lower.includes("480p")) return "480p";
    if (lower.includes("ds4k")) return "1080p DS4K";
    return "HD";
}
