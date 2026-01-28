// Dflix Series Provider for Skystream
// Ported from Kotlin CloudStream provider (DflixSeriesProvider.kt)

const MAIN_URL = "https://dflix.discoveryftp.net";
let loginCookie = null;

const commonHeaders = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5"
};

function getManifest() {
    return {
        id: "com.niloy.dflix.series",
        name: "Dflix Series",
        internalName: "dflix_series",
        version: 1,
        description: "Dflix Series Provider - TV Series, Asian Drama, Anime, Documentary, Cartoon",
        language: "bn",
        tvTypes: ["TvSeries", "AsianDrama", "Anime", "Documentary", "Cartoon"],
        baseUrl: MAIN_URL,
        iconUrl: "https://dflix.discoveryftp.net/assets/images/icon.png"
    };
}

function login(callback) {
    if (loginCookie) {
        callback();
        return;
    }
    
    http_get(MAIN_URL + "/login/demo", commonHeaders, (status, data, cookies) => {
        if (cookies) {
            loginCookie = cookies;
        }
        callback();
    });
}

function getHome(callback) {
    login(() => {
        const categories = [
            { title: "English", url: MAIN_URL + "/s/category/Foreign/1" },
            { title: "Bangla", url: MAIN_URL + "/s/category/Bangla/1" },
            { title: "Hindi", url: MAIN_URL + "/s/category/Hindi/1" },
            { title: "South", url: MAIN_URL + "/s/category/South/1" },
            { title: "Animation", url: MAIN_URL + "/s/category/Animation/1" },
            { title: "Dubbed", url: MAIN_URL + "/s/category/Dubbed/1" }
        ];
        
        let finalResult = [];
        let pending = categories.length;
        
        categories.forEach(category => {
            const headers = Object.assign({}, commonHeaders);
            if (loginCookie) {
                headers["Cookie"] = loginCookie;
            }
            
            http_get(category.url, headers, (status, html) => {
                const items = parseSeriesCards(html);
                
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

function search(query, callback) {
    login(() => {
        const headers = Object.assign({}, commonHeaders);
        if (loginCookie) {
            headers["Cookie"] = loginCookie;
        }
        
        const searchUrl = MAIN_URL + "/search";
        const formData = "term=" + encodeURIComponent(query) + "&types=s";
        
        const postHeaders = Object.assign({}, headers);
        postHeaders["Content-Type"] = "application/x-www-form-urlencoded";
        
        http_post(searchUrl, formData, postHeaders, (status, html) => {
            const series = [];
            
            // Parse search results
            const searchItemRegex = /<div class="moviesearchiteam"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
            let match;
            
            while ((match = searchItemRegex.exec(html)) !== null) {
                const itemHtml = match[1];
                
                const urlMatch = /<a\s+href="([^"]+)"/.exec(itemHtml);
                if (!urlMatch) continue;
                const url = MAIN_URL + urlMatch[1];
                
                const titleMatch = /<div class="searchtitle">([^<]+)<\/div>/.exec(itemHtml);
                const title = titleMatch ? titleMatch[1].trim() : "";
                
                const posterMatch = /<img[^>]+src="([^"]+)"/.exec(itemHtml);
                const poster = posterMatch ? posterMatch[1] : "";
                
                // Check genre for type
                const genreMatch = /<div class="ganre-wrapper[^"]*">([\s\S]*?)<\/div>/.exec(itemHtml);
                let type = "TvSeries";
                if (genreMatch) {
                    const genreText = genreMatch[1].toLowerCase();
                    if (genreText.includes("animation") || genreText.includes("anime")) {
                        type = "Anime";
                    }
                }
                
                series.push({
                    name: title,
                    link: url,
                    image: poster,
                    description: "",
                    type: type
                });
            }
            
            const result = [];
            if (series.length > 0) {
                result.push({
                    title: "Search Results",
                    Data: series
                });
            }
            
            callback(JSON.stringify(result));
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
            // Extract title
            const titleMatch = /<div class="movie-detail-content-test"[^>]*>[\s\S]*?<h3[^>]*>([^<]+)<\/h3>/.exec(html);
            const title = titleMatch ? titleMatch[1].trim() : "";
            
            // Alternative title extraction
            const altTitleMatch = /<h3[^>]*>([^<]+)<\/h3>/.exec(html);
            const finalTitle = title || (altTitleMatch ? altTitleMatch[1].trim() : "");
            
            // Extract poster
            const imgMatch = /<div class="movie-detail-banner"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/.exec(html);
            const poster = imgMatch ? imgMatch[1] : "";
            
            // Extract plot/storyline
            const plotMatch = /<div class="storyline"[^>]*>([^<]+)<\/div>/.exec(html);
            const plot = plotMatch ? plotMatch[1].trim() : "";
            
            // Extract genres
            const genres = extractGenres(html);
            
            // Determine type based on genres
            const isAnime = genres.some(g => 
                g.toLowerCase().includes("animation") || 
                g.toLowerCase().includes("anime")
            );
            const type = isAnime ? "Anime" : "TvSeries";
            
            // Extract actors
            const actors = extractActors(html);
            
            // Extract seasons
            const seasons = extractSeasons(html);
            
            // Now we need to fetch episodes for each season
            if (seasons.length > 0) {
                fetchAllEpisodes(seasons, headers, (episodes) => {
                    // Build description
                    let description = plot;
                    if (genres.length > 0) {
                        description += "<br><br><b>Genres:</b> " + genres.join(", ");
                    }
                    
                    const loadData = {
                        type: "series",
                        episodes: episodes
                    };
                    
                    callback(JSON.stringify({
                        url: url,
                        data: JSON.stringify(loadData),
                        title: finalTitle,
                        description: description,
                        year: 0,
                        subtitle: "",
                        image: poster,
                        actors: actors,
                        type: type,
                        episodes: episodes
                    }));
                });
            } else {
                // No seasons found, return basic info
                let description = plot;
                if (genres.length > 0) {
                    description += "<br><br><b>Genres:</b> " + genres.join(", ");
                }
                
                callback(JSON.stringify({
                    url: url,
                    data: JSON.stringify({ type: "series", episodes: [] }),
                    title: finalTitle,
                    description: description,
                    year: 0,
                    subtitle: "",
                    image: poster,
                    actors: actors,
                    type: type,
                    episodes: []
                }));
            }
        });
    });
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
    const seasons = [];
    
    // Look for season table
    const seasonTableMatch = /<table class="table mb-0"[^>]*>[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/.exec(html);
    
    if (seasonTableMatch) {
        const seasonRegex = /<a\s+href="([^"]+)"[^>]*>/g;
        let match;
        
        while ((match = seasonRegex.exec(seasonTableMatch[1])) !== null) {
            seasons.push(match[1]);
        }
        
        // Reverse to get proper order (oldest first)
        seasons.reverse();
    }
    
    return seasons;
}

function fetchAllEpisodes(seasonUrls, headers, callback) {
    const allEpisodes = [];
    let pending = seasonUrls.length;
    let seasonNum = 0;
    
    seasonUrls.forEach((seasonUrl, index) => {
        const fullUrl = MAIN_URL + seasonUrl;
        const currentSeasonNum = index + 1;
        
        http_get(fullUrl, headers, (status, html) => {
            const episodes = parseSeasonEpisodes(html, currentSeasonNum);
            
            episodes.forEach(ep => {
                allEpisodes.push(ep);
            });
            
            pending--;
            if (pending === 0) {
                // Sort episodes by season and episode number
                allEpisodes.sort((a, b) => {
                    if (a.season !== b.season) return a.season - b.season;
                    return a.episode - b.episode;
                });
                
                callback(allEpisodes);
            }
        });
    });
    
    // Handle case with no seasons
    if (seasonUrls.length === 0) {
        callback([]);
    }
}

function parseSeasonEpisodes(html, seasonNum) {
    const episodes = [];
    let episodeNum = 0;
    
    // Parse episode cards: div.card.p-4
    const episodeRegex = /<div class="card p-4"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;
    let match;
    
    while ((match = episodeRegex.exec(html)) !== null) {
        const episodeHtml = match[1];
        episodeNum++;
        
        // Extract episode name from h4
        const nameMatch = /<h4[^>]*>([^<]+)/.exec(episodeHtml);
        const episodeName = nameMatch ? nameMatch[1].trim() : "Episode " + episodeNum;
        
        // Extract episode link from h5 > a
        const linkMatch = /<h5[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"/.exec(episodeHtml);
        const episodeLink = linkMatch ? linkMatch[1] : "";
        
        // Extract episode description
        const descMatch = /<div class="season_overview"[^>]*>[\s\S]*?<p[^>]*>([^<]*)<\/p>/.exec(episodeHtml);
        const description = descMatch ? descMatch[1].trim() : "";
        
        // Extract episode image from parent's background style
        const parentSearch = html.substring(Math.max(0, match.index - 500), match.index);
        const bgMatch = /url\(['"]?([^'")\s]+)['"]?\)/.exec(parentSearch);
        const episodeImage = bgMatch ? bgMatch[1] : "";
        
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

function loadStreams(url, callback) {
    login(() => {
        const headers = Object.assign({}, commonHeaders);
        if (loginCookie) {
            headers["Cookie"] = loginCookie;
        }
        
        // The URL for series episodes is the direct stream link
        // Check if it's already a direct link
        if (url.match(/\.(mkv|mp4|avi)($|\?)/i)) {
            callback(JSON.stringify([{
                name: "(BDIX) Dflix Series",
                url: url,
                headers: headers
            }]));
            return;
        }
        
        // Otherwise, try to fetch the page and extract stream
        http_get(url, headers, (status, html) => {
            const streams = [];
            
            // Try to find video link
            const streamMatch = /<a[^>]+href="(http[^"]+\.(?:mkv|mp4|avi)[^"]*)"/.exec(html);
            if (streamMatch) {
                streams.push({
                    name: "(BDIX) Dflix Series",
                    url: streamMatch[1],
                    headers: headers
                });
            }
            
            // Try alternative: look for any video source
            if (streams.length === 0) {
                const videoMatch = /(?:src|href)=["'](http[^"']+\.(?:mkv|mp4|avi)[^"']*)["']/i.exec(html);
                if (videoMatch) {
                    streams.push({
                        name: "(BDIX) Dflix Series",
                        url: videoMatch[1],
                        headers: headers
                    });
                }
            }
            
            // If URL itself looks like an episode page, use it directly
            if (streams.length === 0 && url.includes("/s/")) {
                // The episode link might be the stream itself
                streams.push({
                    name: "(BDIX) Dflix Series",
                    url: url,
                    headers: headers
                });
            }
            
            callback(JSON.stringify(streams));
        });
    });
}
