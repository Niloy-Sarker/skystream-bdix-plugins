// Live test for series plugin
var https = require('https');
var http = require('http');

// Mock storage functions
globalThis.getPreference = async function(key) { return null; };
globalThis.setPreference = async function(key, value) { return; };

// Mock HTTP functions with real implementations
globalThis.http_get = async function(url, headers) {
    return new Promise((resolve, reject) => {
        var parsedUrl = new URL(url);
        var client = parsedUrl.protocol === 'https:' ? https : http;
        
        var options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'GET',
            headers: headers || {}
        };
        
        var req = client.request(options, (res) => {
            var data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    body: data,
                    headers: res.headers
                });
            });
        });
        
        req.on('error', reject);
        req.end();
    });
};

globalThis.http_post = async function(url, headers, body) {
    return new Promise((resolve, reject) => {
        var parsedUrl = new URL(url);
        var client = parsedUrl.protocol === 'https:' ? https : http;
        
        var options = {
            hostname: parsedUrl.hostname,
            port: parsedUrl.port,
            path: parsedUrl.pathname + parsedUrl.search,
            method: 'POST',
            headers: headers || {}
        };
        
        var req = client.request(options, (res) => {
            var data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                resolve({
                    statusCode: res.statusCode,
                    body: data,
                    headers: res.headers
                });
            });
        });
        
        req.on('error', reject);
        req.write(body);
        req.end();
    });
};

// Load plugin
require('./plugins/dflix_series.js');

async function testLive() {
    console.log("\n=== Live Testing Dflix Series Plugin ===\n");
    
    // Test manifest
    console.log("1. Testing getManifest()...");
    var manifest = await getManifest();
    console.log("✓ Manifest loaded:", manifest.name, "v" + manifest.version);
    
    // Test home page
    console.log("\n2. Testing getHome()...");
    try {
        var home = await getHome();
        console.log("✓ Home page loaded with", Object.keys(home).length, "sections:");
        for (var section in home) {
            console.log("  -", section + ":", home[section].length, "items");
            if (home[section].length > 0) {
                console.log("    First item:", home[section][0].title);
            }
        }
    } catch (e) {
        console.log("✗ Home test error:", e.message);
    }
    
    // Test search
    console.log("\n3. Testing search('friends')...");
    try {
        var results = await search("friends");
        console.log("✓ Search returned", results.length, "results");
        if (results.length > 0) {
            console.log("  First 3 results:");
            results.slice(0, 3).forEach(function(item, i) {
                console.log("    " + (i+1) + ". " + item.title);
            });
        }
    } catch (e) {
        console.log("✗ Search test error:", e.message);
    }
    
    console.log("\n=== Series Plugin Tests Complete ===\n");
}

testLive().catch(console.error);
