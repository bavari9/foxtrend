// index.js - EuroWebTV Pass Extractor with ?fresh=true support
const express = require('express');
const axios = require('axios');
const Tesseract = require('tesseract.js');
const NodeCache = require('node-cache');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;

// Enable compression to reduce bandwidth
app.use(compression());

// Cache with 1 hour TTL
const cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

// Request counter for monitoring
let requestCount = 0;
let lastReset = Date.now();

// ============================================
// HEALTH CHECK ENDPOINT
// ============================================
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        memory_usage: process.memoryUsage(),
        cache_size: cache.keys().length,
        requests: requestCount,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
});

// ============================================
// CLEAR CACHE ENDPOINT
// ============================================
app.get('/clear-cache', (req, res) => {
    cache.flushAll();
    res.json({ 
        message: 'Cache cleared successfully',
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
});

// ============================================
// MAIN EXTRACTION ENDPOINT with ?fresh=true
// ============================================
app.get('/extract', async (req, res) => {
    try {
        requestCount++;
        
        // Check for force-fresh parameter
        const forceFresh = req.query.fresh === 'true';
        
        // Only use cache if NOT forcing fresh
        if (!forceFresh) {
            const cacheKey = `pass_${new Date().toISOString().split('T')[0]}`;
            const cached = cache.get(cacheKey);
            if (cached && cached.parsed_data && cached.parsed_data.token) {
                console.log('✅ Returning valid cached result');
                return res.json({ 
                    ...cached, 
                    cached: true,
                    fresh_requested: false
                });
            }
        } else {
            console.log('🔄 Force fresh requested - bypassing cache');
        }

        console.log('🔄 Fetching fresh data...');
        
        // 1. Fetch pass page
        const passResponse = await axios.get('https://www.eurowebtv.cc/pass', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Accept-Encoding': 'gzip, deflate'
            },
            timeout: 15000
        });

        // 2. Extract image
        const match = passResponse.data.match(/src="data:image\/png;base64,([^"]+)"/);
        if (!match) {
            throw new Error('No image found in HTML');
        }

        const base64Data = match[1];
        console.log(`📷 Image extracted: ${(base64Data.length / 1024).toFixed(1)} KB`);

        // 3. OCR with Tesseract.js (enhanced)
        console.log('🔍 Starting OCR...');
        const ocrResult = await Tesseract.recognize(
            Buffer.from(base64Data, 'base64'),
            'eng',
            {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        console.log(`OCR progress: ${Math.round(m.progress * 100)}%`);
                    }
                },
                psm: 6,  // Block of text
                tessedit_char_whitelist: '0123456789',
                tessedit_pageseg_mode: '6',
                tessedit_ocr_engine_mode: '2',
                wasmPaths: 'https://cdn.jsdelivr.net/npm/tesseract.js@v5.0.0/dist/',
                workerBlobURL: false
            }
        );

        const extractedNumber = ocrResult.data.text.replace(/[^0-9]/g, '');
        console.log(`🔢 Extracted number: ${extractedNumber}`);

        // Validate number
        if (!extractedNumber || extractedNumber.length < 6) {
            throw new Error(`Invalid extracted number: ${extractedNumber}`);
        }

        // 4. Auth request
        const cookieHeader = passResponse.headers['set-cookie'] || '';
        const authResponse = await axios.post(
            'https://www.eurowebtv.cc/auth',
            `pass=${encodeURIComponent(extractedNumber)}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Origin': 'https://www.eurowebtv.cc',
                    'Referer': 'https://www.eurowebtv.cc/pass',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Accept-Encoding': 'gzip, deflate',
                    'Cookie': cookieHeader
                },
                timeout: 15000
            }
        );

        console.log('📝 Auth response received');
        console.log(`📄 Auth raw: ${authResponse.data}`);

        // 5. Parse auth response
        const lines = authResponse.data.trim().split('\n');
        
        // Validate auth response
        if (lines.length < 3 || !lines[0] || !lines[1]) {
            throw new Error(`Invalid auth response: ${authResponse.data}`);
        }

        const result = {
            extracted_number: extractedNumber,
            http_status: authResponse.status,
            auth_raw_response: authResponse.data,
            parsed_data: {
                status: lines[0] || '',
                token: lines[1] || '',
                code: lines[2] || '',
                extra: lines[3] || ''
            },
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            cached: false,
            fresh_requested: forceFresh
        };

        // 6. Cache the result (only if valid)
        if (result.parsed_data.token) {
            const cacheKey = `pass_${new Date().toISOString().split('T')[0]}`;
            cache.set(cacheKey, result);
            cache.set('last_successful', result);
            console.log('💾 Valid result cached');
        } else {
            console.log('⚠️ Result had no token, not caching');
        }

        // Calculate response size for monitoring
        const responseSize = JSON.stringify(result).length;
        console.log(`📊 Response size: ${(responseSize / 1024).toFixed(2)} KB`);

        res.json(result);

    } catch (error) {
        console.error('❌ Error:', error.message);
        
        // Try to return fallback cached data if available
        const fallbackCache = cache.get('last_successful');
        if (fallbackCache) {
            console.log('⚠️ Returning fallback cached data');
            return res.json({
                ...fallbackCache,
                warning: 'Using cached data due to error',
                error: error.message,
                timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
            });
        }

        res.status(500).json({
            error: error.message,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
        });
    }
});

// ============================================
// USAGE STATISTICS ENDPOINT
// ============================================
app.get('/usage', (req, res) => {
    const memory = process.memoryUsage();
    const cacheStats = cache.getStats();
    
    res.json({
        requests_processed: requestCount,
        cache_size: cache.keys().length,
        cache_hits: cacheStats.hits || 0,
        cache_misses: cacheStats.misses || 0,
        memory_used: `${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        uptime: `${(process.uptime() / 3600).toFixed(1)} hours`,
        bandwidth_estimate: `${(requestCount * 2 / 1024).toFixed(2)} MB`,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
});

// ============================================
// ROOT ENDPOINT
// ============================================
app.get('/', (req, res) => {
    res.json({
        service: 'EuroWebTV Pass Extractor',
        version: '1.1.0',
        description: 'Extract pass codes from EuroWebTV with OCR',
        endpoints: {
            root: '/',
            extract: '/extract',
            'extract?fresh=true': '/extract?fresh=true (force new extraction)',
            health: '/health',
            usage: '/usage',
            'clear-cache': '/clear-cache'
        },
        cache_info: {
            ttl: '1 hour',
            current_size: cache.keys().length
        },
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
});

// ============================================
// RESET REQUEST COUNTER DAILY
// ============================================
setInterval(() => {
    const now = Date.now();
    if (now - lastReset > 86400000) {
        requestCount = 0;
        lastReset = now;
        console.log('🔄 Daily request counter reset');
    }
}, 3600000);

// ============================================
// START SERVER
// ============================================
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://127.0.0.1:${PORT}`);
    console.log(`📊 Endpoints:`);
    console.log(`   - Root: http://127.0.0.1:${PORT}/`);
    console.log(`   - Extract: http://127.0.0.1:${PORT}/extract`);
    console.log(`   - Extract (fresh): http://127.0.0.1:${PORT}/extract?fresh=true`);
    console.log(`   - Health: http://127.0.0.1:${PORT}/health`);
    console.log(`   - Usage: http://127.0.0.1:${PORT}/usage`);
    console.log(`   - Clear Cache: http://127.0.0.1:${PORT}/clear-cache`);
});
