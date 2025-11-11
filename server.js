import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import FormData from 'form-data';
// WebSocket imports - COMMENTED OUT
// import { createServer } from 'http';
// import { Server } from 'socket.io';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
// WebSocket setup - COMMENTED OUT
// const httpServer = createServer(app);
// const io = new Server(httpServer, {
//     cors: {
//         origin: "*",
//         methods: ["GET", "POST"]
//     }
// });
const PORT = process.env.PORT || 3005;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Create screenshots directory if it doesn't exist
const screenshotsDir = path.join(__dirname, 'public', 'screenshots');
try {
    await fs.access(screenshotsDir);
} catch {
    await fs.mkdir(screenshotsDir, { recursive: true });
}

// API Proxy endpoint (equivalent to api_proxy.php)
app.post('/api/proxy', async (req, res) => {
    try {
        const { target_url, method = 'GET', body } = req.body;

        if (!target_url) {
            return res.status(400).json({ error: 'Missing target_url' });
        }

        const options = {
            method: method,
            headers: {
                'Content-Type': 'application/json'
            }
        };

        if (method === 'POST' && body) {
            options.body = JSON.stringify(body);
            options.headers['Content-Length'] = Buffer.byteLength(options.body);
        }

        const response = await fetch(target_url, options);
        const data = await response.json();

        res.status(response.status).json(data);
    } catch (error) {
        console.error('Proxy error:', error);
        res.status(500).json({
            error: 'Proxy Error: ' + error.message,
            target_url: req.body.target_url
        });
    }
});

// Screenshot handler endpoint (equivalent to screenshot_handler.php)
app.post('/api/screenshot', async (req, res) => {
    try {
        const { target_url } = req.body;

        if (!target_url) {
            return res.status(400).json({ error: 'Missing target_url' });
        }

        const response = await fetch(target_url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({})
        });

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({
                error: 'HTTP Error: ' + response.status,
                response: errorText
            });
        }

        // Get image data as buffer
        const imageBuffer = await response.buffer();
        const contentType = response.headers.get('content-type');

        // Generate filename with timestamp
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `screenshot_${timestamp}.jpg`;
        const filepath = path.join(screenshotsDir, filename);

        // Save the image
        await fs.writeFile(filepath, imageBuffer);
        const stats = await fs.stat(filepath);

        res.status(200).json({
            success: true,
            filename: filename,
            filepath: 'screenshots/' + filename,
            size: stats.size,
            content_type: contentType,
            timestamp: timestamp
        });
    } catch (error) {
        console.error('Screenshot error:', error);
        res.status(500).json({
            error: 'Screenshot Error: ' + error.message,
            target_url: req.body.target_url
        });
    }
});

// Upload screenshot to external API endpoint
app.post('/api/upload-to-api', async (req, res) => {
    try {
        const { filepath, player_id } = req.body;

        if (!filepath) {
            return res.status(400).json({ error: 'Missing filepath' });
        }

        const uploadApiUrl = process.env.UPLOAD_API_URL;
        if (!uploadApiUrl) {
            console.error('UPLOAD_API_URL not configured!');
            console.error('Current env:', process.env);
            return res.status(500).json({ error: 'UPLOAD_API_URL not configured in .env' });
        }

        console.log(`📤 Uploading to API: ${uploadApiUrl}`);

        // Read the screenshot file
        const fullPath = path.join(__dirname, 'public', filepath);
        console.log(`📁 Reading file from: ${fullPath}`);

        const fileBuffer = await fs.readFile(fullPath);
        console.log(`✅ File read successfully: ${fileBuffer.length} bytes`);

        // Get clean filename
        const filename = path.basename(filepath);

        // Create form data with Blob
        const formData = new FormData();
        formData.append('image', fileBuffer, {
            filename: filename,
            contentType: 'image/jpeg',
            knownLength: fileBuffer.length
        });

        // Sanitize player_id (remove special characters that might cause issues)
        const sanitizedPlayerId = player_id ? player_id.replace(/[^a-zA-Z0-9.-]/g, '_') : 'unknown';

        formData.append('player_id', sanitizedPlayerId);
        formData.append('timestamp', new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5));

        console.log(`📋 Form data prepared:`);
        console.log(`   - player_id: ${sanitizedPlayerId}`);
        console.log(`   - filename: ${filename}`);

        // Upload to external API
        const response = await fetch(uploadApiUrl, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders()
        });

        console.log(`📥 API Response Status: ${response.status} ${response.statusText}`);

        let data;
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
            data = await response.json();
        } else {
            const text = await response.text();
            console.error('Non-JSON response:', text);
            data = { error: 'Non-JSON response', response_text: text };
        }

        if (!response.ok) {
            console.error('Upload failed:', data);
            return res.status(response.status).json({
                error: 'Upload failed',
                status: response.status,
                details: data
            });
        }

        console.log('✅ Upload successful:', data);

        res.status(200).json({
            success: true,
            message: 'Screenshot uploaded to API successfully',
            api_response: data
        });
    } catch (error) {
        console.error('Upload to API error:', error);
        console.error('Stack trace:', error.stack);
        res.status(500).json({
            error: 'Upload to API Error: ' + error.message,
            stack: error.stack
        });
    }
});

// ========================================
// PLAYER ID STORAGE
// ========================================
// In-memory storage for player IDs (mapped by IP address or player_id itself)
const playerIdStorage = new Map();

// Helper function to update .env file
async function updateEnvFile(key, value) {
    try {
        const envPath = path.join(__dirname, '.env');
        let envContent = '';

        // Read existing .env file or create empty if doesn't exist
        try {
            envContent = await fs.readFile(envPath, 'utf-8');
        } catch (error) {
            if (error.code !== 'ENOENT') throw error;
            // File doesn't exist, will create new one
            envContent = '';
        }

        const lines = envContent.split('\n');
        let found = false;

        // Update existing key or add new one
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith(`${key}=`)) {
                lines[i] = `${key}=${value}`;
                found = true;
                break;
            }
        }

        if (!found) {
            // Add new key at the end
            if (envContent && !envContent.endsWith('\n')) {
                lines.push('');
            }
            lines.push(`${key}=${value}`);
        }

        // Write back to .env file
        await fs.writeFile(envPath, lines.join('\n'), 'utf-8');

        return true;
    } catch (error) {
        console.error(`❌ Error updating .env file:`, error);
        return false;
    }
}

// PUT endpoint to receive XML file and extract player_id
app.put('/get-uuid-player/:player_id/:filename', async (req, res) => {
    try {
        playerIdStorage.clear();

        const { player_id, filename } = req.params;

        // Store player_id for reuse
        playerIdStorage.set(player_id, {
            player_id: player_id,
            filename: filename,
            last_updated: new Date().toISOString(),
            ip_address: req.ip || req.connection.remoteAddress
        });

        // Update DEFAULT_PLAYER_ID in .env file (optional, controlled by AUTO_UPDATE_ENV_PLAYER_ID)
        if (process.env.AUTO_UPDATE_ENV_PLAYER_ID === 'true') {
            await updateEnvFile('DEFAULT_PLAYER_ID', player_id);
        }

        res.status(200).json({
            success: true,
            message: 'Player ID received and stored',
            player_id: player_id,
            filename: filename
        });
    } catch (error) {
        console.error('❌ Error receiving player ID:', error);
        res.status(500).json({
            error: 'Error receiving player ID: ' + error.message
        });
    }
});

// GET endpoint to retrieve stored player_id
app.get('/api/get-player-id/:player_id', (req, res) => {
    const { player_id } = req.params;
    const data = playerIdStorage.get(player_id);

    if (data) {
        res.json({
            success: true,
            data: data
        });
    } else {
        res.status(404).json({
            success: false,
            message: 'Player ID not found'
        });
    }
});

// GET endpoint to list all stored player IDs
app.get('/api/list-player-ids', (req, res) => {
    const players = Array.from(playerIdStorage.entries()).map(([id, data]) => ({
        player_id: id,
        ...data
    }));

    res.json({
        success: true,
        count: players.length,
        players: players
    });
});

// GET endpoint to find player_id by IP address
app.get('/api/get-player-id-by-ip/:ip', (req, res) => {
    const targetIp = req.params.ip;

    // Search for player with matching IP
    for (const [player_id, data] of playerIdStorage.entries()) {
        // Match IP or extract IP from player_id if it's IP-based
        if (data.ip_address && data.ip_address.includes(targetIp)) {
            return res.json({
                success: true,
                data: data
            });
        }
    }

    res.status(404).json({
        success: false,
        message: `No player_id found for IP: ${targetIp}`
    });
});

// GET endpoint to retrieve current/latest player_id (real-time from memory)
app.get('/api/get-current-player-id', (req, res) => {
    if (playerIdStorage.size > 0) {
        // Get the first (most recent) player_id from storage
        const firstEntry = playerIdStorage.values().next().value;
        if (firstEntry) {
            return res.json({
                success: true,
                data: firstEntry
            });
        }
    }

    res.status(404).json({
        success: false,
        message: 'No player_id stored yet. Waiting for Garlic Player to send UUID...'
    });
});

// Get environment config for frontend
app.get('/api/config', (req, res) => {
    // Get the most recent player_id from memory storage (real-time)
    let currentPlayerId = '';
    if (playerIdStorage.size > 0) {
        // Get the first (most recent) player_id from storage
        const firstEntry = playerIdStorage.values().next().value;
        currentPlayerId = firstEntry ? firstEntry.player_id : '';
    }

    // Fallback to .env if memory is empty
    if (!currentPlayerId) {
        currentPlayerId = process.env.DEFAULT_PLAYER_ID || '';
    }

    res.json({
        auto_screenshot_enabled: process.env.AUTO_SCREENSHOT_ENABLED === 'true',
        screenshot_interval_minutes: parseInt(process.env.SCREENSHOT_INTERVAL_MINUTES) || 5,
        upload_api_url: process.env.UPLOAD_API_URL || '',
        default_garlic_ip: process.env.DEFAULT_GARLIC_IP || '127.0.0.1',
        default_garlic_username: process.env.DEFAULT_GARLIC_USERNAME || 'admin',
        default_garlic_password: process.env.DEFAULT_GARLIC_PASSWORD || '',
        default_player_id: currentPlayerId  // Real-time from memory!
    });
});

// Serve index.html for root route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Socket.IO connection handling - COMMENTED OUT
// io.on('connection', (socket) => {
//     console.log(`✅ Client connected: ${socket.id}`);
//
//     socket.on('disconnect', () => {
//         console.log(`❌ Client disconnected: ${socket.id}`);
//     });
// });

// ========================================
// POLLING MECHANISM: Listen to adnova-be - COMMENTED OUT
// ========================================

// let lastCheckedTimestamp = Date.now() / 1000; // Unix timestamp in seconds
// let knownScreenshotIds = new Set(); // Track IDs to avoid duplicates
// const POLLING_INTERVAL = parseInt(process.env.POLLING_INTERVAL_SECONDS) || 10; // Default 10 seconds
// const ADNOVA_API_URL = process.env.ADNOVA_API_URL || 'http://localhost/adnova-be/public/api/v1/garlic/screenshots';
//
// async function pollAdnovaBE() {
//     try {
//         const response = await fetch(ADNOVA_API_URL);
//
//         if (!response.ok) {
//             console.error(`❌ Polling error: HTTP ${response.status}`);
//             return;
//         }
//
//         const result = await response.json();
//
//         if (!result.data || !result.data.screenshots) {
//             return;
//         }
//
//         const screenshots = result.data.screenshots;
//
//         // Filter hanya screenshot yang baru (setelah lastCheckedTimestamp dan belum pernah diprocess)
//         const newScreenshots = screenshots.filter(s => {
//             const isNew = s.last_modified > lastCheckedTimestamp && !knownScreenshotIds.has(s.id);
//             if (isNew) {
//                 knownScreenshotIds.add(s.id);
//             }
//             return isNew;
//         });
//
//         if (newScreenshots.length > 0) {
//             console.log(`\n🔔 POLLING: Detected ${newScreenshots.length} new screenshot(s)!`);
//
//             newScreenshots.forEach(screenshot => {
//                 console.log(`   📸 ${screenshot.player_name} (${screenshot.player_id})`);
//                 console.log(`      URL: ${screenshot.url}`);
//                 console.log(`      Created: ${screenshot.created_at}`);
//
//                 // Broadcast ke semua clients via Socket.IO
//                 io.emit('screenshot-uploaded', {
//                     type: 'screenshot',
//                     player_id: screenshot.player_id,
//                     player_name: screenshot.player_name,
//                     url: screenshot.url,
//                     created_at: screenshot.created_at,
//                     message: `Screenshot baru dari ${screenshot.player_name}`
//                 });
//             });
//
//             // Update lastCheckedTimestamp ke yang paling baru
//             lastCheckedTimestamp = Math.max(...newScreenshots.map(s => s.last_modified));
//         }
//
//         // Cleanup old IDs from Set (keep only last 100 to prevent memory leak)
//         if (knownScreenshotIds.size > 100) {
//             const idsArray = Array.from(knownScreenshotIds);
//             knownScreenshotIds = new Set(idsArray.slice(-100));
//         }
//
//     } catch (error) {
//         console.error('❌ Polling error:', error.message);
//     }
// }
//
// // Start polling
// setInterval(pollAdnovaBE, POLLING_INTERVAL * 1000);
// console.log(`🔄 Polling adnova-be every ${POLLING_INTERVAL} seconds`);

// ========================================
// COMMAND POLLING: Listen for commands from adnova-be
// ========================================

const COMMAND_POLLING_ENABLED = process.env.COMMAND_POLLING_ENABLED === 'true';
const COMMAND_POLLING_INTERVAL = parseInt(process.env.COMMAND_POLLING_INTERVAL_SECONDS) || 5;
const ADNOVA_API_BASE = process.env.ADNOVA_API_BASE_URL || 'http://127.0.0.1:8000/api/v1';

// Store garlic player access token and IP (will be set when first command is polled)
let garlicAccessToken = null;
let garlicPlayerIP = null;

/**
 * Get Garlic Player credentials
 */
function getGarlicCredentials() {
    return {
        ip: process.env.DEFAULT_GARLIC_IP || '127.0.0.1',
        username: process.env.DEFAULT_GARLIC_USERNAME || 'admin',
        password: process.env.DEFAULT_GARLIC_PASSWORD || ''
    };
}

/**
 * Get or refresh Garlic Player access token
 */
async function getGarlicAccessToken() {
    try {
        const credentials = getGarlicCredentials();
        garlicPlayerIP = credentials.ip;

        const targetUrl = `http://${credentials.ip}:8080/v2/oauth2/token`;

        const response = await fetch(targetUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                grant_type: 'password',
                username: credentials.username,
                password: credentials.password
            })
        });

        if (!response.ok) {
            console.error(`❌ Failed to get Garlic Player token: HTTP ${response.status}`);
            return null;
        }

        const data = await response.json();
        garlicAccessToken = data.access_token;

        console.log(`✅ Garlic Player token obtained for ${credentials.ip}`);
        return garlicAccessToken;
    } catch (error) {
        console.error('❌ Error getting Garlic Player token:', error.message);
        return null;
    }
}

/**
 * Execute RELOAD PLAYLIST command
 */
async function executeReloadPlaylist(command) {
    try {
        console.log(`\n🔄 Executing RELOAD PLAYLIST command #${command.id}`);

        if (!garlicAccessToken) {
            await getGarlicAccessToken();
        }

        if (!garlicAccessToken) {
            throw new Error('Failed to get Garlic Player access token');
        }

        const contentUrl = command.payload?.content_url;
        const url = `http://${garlicPlayerIP}:8080/v2/app/switch?access_token=${garlicAccessToken}`;

        console.log(`   Target: ${garlicPlayerIP}`);
        if (contentUrl) {
            console.log(`   Content URL: ${contentUrl}`);
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mode: 'start'
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        const result = await response.json();
        console.log(`✅ Playlist reloaded successfully`);

        return {
            success: true,
            result: result,
            executed_at: new Date().toISOString()
        };
    } catch (error) {
        console.error(`❌ Failed to reload playlist:`, error.message);
        throw error;
    }
}

/**
 * Execute TAKE SCREENSHOT command
 */
async function executeTakeScreenshot(command) {
    try {
        console.log(`\n📸 Executing TAKE SCREENSHOT command #${command.id}`);

        if (!garlicAccessToken) {
            await getGarlicAccessToken();
        }

        if (!garlicAccessToken) {
            throw new Error('Failed to get Garlic Player access token');
        }

        const url = `http://${garlicPlayerIP}:8080/v2/task/screenshot?access_token=${garlicAccessToken}`;

        console.log(`   Target: ${garlicPlayerIP}`);

        // Take screenshot via Garlic Player API
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${await response.text()}`);
        }

        // Get image data as buffer
        const imageBuffer = await response.buffer();

        // Save to local storage
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
        const filename = `screenshot_${timestamp}.jpg`;
        const filepath = path.join(screenshotsDir, filename);

        await fs.writeFile(filepath, imageBuffer);
        console.log(`✅ Screenshot saved locally: ${filename}`);

        // Get current player_id from storage
        let currentPlayerId = process.env.DEFAULT_PLAYER_ID || garlicPlayerIP;
        if (playerIdStorage.size > 0) {
            const firstEntry = playerIdStorage.values().next().value;
            if (firstEntry) {
                currentPlayerId = firstEntry.player_id;
            }
        }

        // Upload to adnova-be
        const uploadApiUrl = process.env.UPLOAD_API_URL;
        if (uploadApiUrl) {
            const fileBuffer = await fs.readFile(filepath);
            const formData = new FormData();

            formData.append('image', fileBuffer, {
                filename: filename,
                contentType: 'image/jpeg',
                knownLength: fileBuffer.length
            });

            formData.append('player_id', currentPlayerId);
            formData.append('timestamp', timestamp);

            const uploadResponse = await fetch(uploadApiUrl, {
                method: 'POST',
                body: formData,
                headers: formData.getHeaders()
            });

            if (uploadResponse.ok) {
                const uploadResult = await uploadResponse.json();
                console.log(`✅ Screenshot uploaded to adnova-be: ${uploadResult.data?.url || 'success'}`);

                return {
                    success: true,
                    screenshot_url: uploadResult.data?.url,
                    local_path: `screenshots/${filename}`,
                    executed_at: new Date().toISOString()
                };
            } else {
                console.log(`⚠️ Screenshot saved locally but upload failed`);
            }
        }

        return {
            success: true,
            local_path: `screenshots/${filename}`,
            executed_at: new Date().toISOString()
        };
    } catch (error) {
        console.error(`❌ Failed to take screenshot:`, error.message);
        throw error;
    }
}

/**
 * Poll pending commands from adnova-be
 */
async function pollCommands() {
    try {
        // Get current player_id
        let currentPlayerId = process.env.DEFAULT_PLAYER_ID;
        if (playerIdStorage.size > 0) {
            const firstEntry = playerIdStorage.values().next().value;
            if (firstEntry) {
                currentPlayerId = firstEntry.player_id;
            }
        }

        if (!currentPlayerId) {
            // No player_id yet, skip this poll
            return;
        }

        // Fetch pending commands
        const response = await fetch(`${ADNOVA_API_BASE}/garlic/commands/pending?player_id=${currentPlayerId}`);

        if (!response.ok) {
            console.error(`❌ Failed to fetch commands: HTTP ${response.status}`);
            return;
        }

        const result = await response.json();
        const commands = result.data?.commands || [];

        if (commands.length === 0) {
            return; // No pending commands
        }

        console.log(`\n🔔 Received ${commands.length} pending command(s) from adnova-be`);

        // Execute each command
        for (const command of commands) {
            try {
                // Mark as processing
                await fetch(`${ADNOVA_API_BASE}/garlic/commands/${command.id}/status`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ status: 'processing' })
                });

                // Execute command based on type
                let result;
                if (command.command_type === 'reload_playlist') {
                    result = await executeReloadPlaylist(command);
                } else if (command.command_type === 'take_screenshot') {
                    result = await executeTakeScreenshot(command);
                } else {
                    throw new Error(`Unknown command type: ${command.command_type}`);
                }

                // Mark as completed
                await fetch(`${ADNOVA_API_BASE}/garlic/commands/${command.id}/status`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        status: 'completed',
                        result: result
                    })
                });

                console.log(`✅ Command #${command.id} completed successfully`);

            } catch (error) {
                // Mark as failed
                await fetch(`${ADNOVA_API_BASE}/garlic/commands/${command.id}/status`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        status: 'failed',
                        result: { error: error.message }
                    })
                }).catch(() => {}); // Ignore errors on status update

                console.error(`❌ Command #${command.id} failed:`, error.message);
            }
        }

    } catch (error) {
        // Silent fail - will retry on next poll
        if (error.code !== 'ECONNREFUSED') {
            console.error('❌ Command polling error:', error.message);
        }
    }
}

// Start command polling
if (COMMAND_POLLING_ENABLED) {
    setInterval(pollCommands, COMMAND_POLLING_INTERVAL * 1000);
    console.log(`🔄 Command polling enabled (every ${COMMAND_POLLING_INTERVAL} seconds)`);
    console.log(`   Listening to: ${ADNOVA_API_BASE}/garlic/commands/pending`);
} else {
    console.log(`ℹ️  Command polling disabled (set COMMAND_POLLING_ENABLED=true to enable)`);
}

app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📁 Screenshots directory: ${screenshotsDir}`);
    // console.log(`🔌 Socket.IO enabled for real-time updates`); // COMMENTED OUT
    console.log(`🔧 Environment loaded:`);
    console.log(`   - AUTO_SCREENSHOT_ENABLED: ${process.env.AUTO_SCREENSHOT_ENABLED}`);
    console.log(`   - SCREENSHOT_INTERVAL_MINUTES: ${process.env.SCREENSHOT_INTERVAL_MINUTES}`);
    console.log(`   - UPLOAD_API_URL: ${process.env.UPLOAD_API_URL}`);
    console.log(`   - .env path: ${path.join(__dirname, '.env')}`);
});
