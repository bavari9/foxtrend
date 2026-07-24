// index.js - Updated with better error handling
const express = require('express');
const axios = require('axios');
const Tesseract = require('tesseract.js');
const NodeCache = require('node-cache');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(compression());
const cache = new NodeCache({ stdTTL: 3600 });

let requestCount = 0;

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        uptime: process.uptime(),
        cache_size: cache.keys().length,
        requests: requestCount,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
});

// Clear cache endpoint
app.get('/clear-cache', (req, res) => {
    cache.flushAll();
    res.json({ 
        message: 'Cache cleared successfully',
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
});

// Main extraction endpoint
app.get('/extract', async (req, res) => {
    try {
        requestCount++;
        
        // Check cache - but only return cached if it was successful
        const cacheKey = `pass_${new Date().toISOString().split('T')[0]}`;
        const cached = cache.get(cacheKey);
        if (cached && cached.parsed_data && cached.parsed_data.token) {
            console.log('✅ Returning valid cached result');
            return res.json({ ...cached, cached: true });
        }

        console.log('🔄 Fetching fresh data...');
        
        // Fetch pass page
        const passResponse = await axios.get('https://www.eurowebtv.cc/pass', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache'
            },
            timeout: 15000
        });

        // Extract image
        const match = passResponse.data.match(/src="data:image\/png;base64,([^"]+)"/);
        if (!match) throw new Error('No image found');

        const base64Data = match[1];
        console.log(`📷 Image extracted: ${(base64Data.length / 1024).toFixed(1)} KB`);

        // Enhanced OCR
        console.log('🔍 Running OCR...');
        const ocrResult = await Tesseract.recognize(
            Buffer.from(base64Data, 'base64'),
            'eng',
            {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        console.log(`OCR progress: ${Math.round(m.progress * 100)}%`);
                    }
                },
                psm: 6,
                tessedit_char_whitelist: '0123456789',
                tessedit_pageseg_mode: '6',
                tessedit_ocr_engine_mode: '2'
            }
        );

        const extractedNumber = ocrResult.data.text.replace(/[^0-9]/g, '');
        console.log(`🔢 Extracted number: ${extractedNumber}`);

        // Validate number
        if (!extractedNumber || extractedNumber.length < 6) {
            throw new Error(`Invalid extracted number: ${extractedNumber}`);
        }

        // Auth request
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
                    'Cookie': passResponse.headers['set-cookie'] || ''
                },
                timeout: 15000
            }
        );

        console.log('📝 Auth response:', authResponse.data);

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
            cached: false
        };

        // Only cache valid results
        if (result.parsed_data.token) {
            cache.set(cacheKey, result);
            cache.set('last_successful', result);
            console.log('💾 Valid result cached');
        } else {
            console.log('⚠️ Result had no token, not caching');
        }

        res.json(result);

    } catch (error) {
        console.error('❌ Error:', error.message);
        
        // Return last successful cached result if available
        const fallback = cache.get('last_successful');
        if (fallback) {
            console.log('⚠️ Returning fallback cached data');
            return res.json({
                ...fallback,
                warning: 'Using cached data (error occurred)',
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

// Usage endpoint
app.get('/usage', (req, res) => {
    const memory = process.memoryUsage();
    res.json({
        requests_processed: requestCount,
        cache_size: cache.keys().length,
        memory_used: `${(memory.heapUsed / 1024 / 1024).toFixed(2)} MB`,
        uptime: `${(process.uptime() / 3600).toFixed(1)} hours`,
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
});

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        service: 'EuroWebTV Pass Extractor',
        endpoints: ['/extract', '/health', '/usage', '/clear-cache'],
        timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
