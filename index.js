// index.js - Single file solution
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
        requests: requestCount
    });
});

// Main extraction endpoint
app.get('/extract', async (req, res) => {
    try {
        requestCount++;
        
        // Check cache
        const cacheKey = `pass_${new Date().toISOString().split('T')[0]}`;
        const cached = cache.get(cacheKey);
        if (cached) {
            console.log('✅ Returning cached result');
            return res.json({ ...cached, cached: true });
        }

        console.log('🔄 Fetching fresh data...');
        
        // Fetch pass page
        const passResponse = await axios.get('https://www.eurowebtv.cc/pass', {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 15000
        });

        // Extract image
        const match = passResponse.data.match(/src="data:image\/png;base64,([^"]+)"/);
        if (!match) throw new Error('No image found');

        const base64Data = match[1];

        // OCR
        console.log('🔍 OCR in progress...');
        const ocrResult = await Tesseract.recognize(
            Buffer.from(base64Data, 'base64'),
            'eng',
            {
                logger: m => console.log(`OCR: ${Math.round(m.progress * 100)}%`),
                psm: 7,
                tessedit_char_whitelist: '0123456789'
            }
        );

        const number = ocrResult.data.text.replace(/[^0-9]/g, '');
        console.log(`🔢 Number: ${number}`);

        if (!number || number.length < 6) {
            throw new Error(`Invalid number: ${number}`);
        }

        // Auth request
        const authResponse = await axios.post(
            'https://www.eurowebtv.cc/auth',
            `pass=${encodeURIComponent(number)}`,
            {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Origin': 'https://www.eurowebtv.cc',
                    'Referer': 'https://www.eurowebtv.cc/pass',
                    'X-Requested-With': 'XMLHttpRequest',
                    'Cookie': passResponse.headers['set-cookie'] || ''
                }
            }
        );

        const lines = authResponse.data.trim().split('\n');
        
        const result = {
            extracted_number: number,
            http_status: authResponse.status,
            auth_raw_response: authResponse.data,
            parsed_data: {
                status: lines[0] || '',
                token: lines[1] || '',
                code: lines[2] || '',
                extra: lines[3] || ''
            },
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
        };

        // Cache
        cache.set(cacheKey, result);
        cache.set('last_successful', result);

        res.json(result);

    } catch (error) {
        console.error('Error:', error.message);
        
        const fallback = cache.get('last_successful');
        if (fallback) {
            return res.json({ ...fallback, warning: 'Cached data (error occurred)' });
        }

        res.status(500).json({
            error: error.message,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19)
        });
    }
});

// Root
app.get('/', (req, res) => {
    res.json({
        service: 'EuroWebTV Pass Extractor',
        endpoints: ['/extract', '/health', '/usage']
    });
});

app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
});
