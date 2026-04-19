const http = require('http');
const { exec } = require('child_process');
const path = require('path');
const os = require('os');

const PORT = 31415;

const server = http.createServer((req, res) => {
    // Add CORS headers so Vercel can talk to localhost
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    if (req.url === '/api/status' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'online', version: '1.0' }));
        return;
    }

    if (req.url === '/api/sync-modules' && req.method === 'POST') {
        console.log('[Agent] Syncing modules from Downloads...');
        
        const downloadsPath = path.join(os.homedir(), 'Downloads');
        const modulesPath = path.join(__dirname, 'modules');

        const psCommand = `
            $downloads = "${downloadsPath}"
            $modules = "${modulesPath}"
            if (!(Test-Path $modules)) { New-Item -ItemType Directory -Force -Path $modules }
            
            # Find newest files by pattern
            $finance = Get-ChildItem -Path $downloads -Filter "FinancialDashboard*.html" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
            $nutrition = Get-ChildItem -Path $downloads -Filter "nutrition-hub*.html" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
            $career = Get-ChildItem -Path $downloads -Filter "Crawford*Market*Refresh*.html" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
            $watchlist = Get-ChildItem -Path $downloads -Filter "watchlist*.html" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
            $household = Get-ChildItem -Path $downloads -Filter "Household_Hub*.xlsx" | Sort-Object LastWriteTime -Descending | Select-Object -First 1
            
            $moved = @()
            
            if ($finance) { Copy-Item $finance.FullName -Destination "$modules\\finance.html" -Force; $moved += "Finance" }
            if ($nutrition) { Copy-Item $nutrition.FullName -Destination "$modules\\nutrition.html" -Force; $moved += "Nutrition" }
            if ($career) { Copy-Item $career.FullName -Destination "$modules\\career.html" -Force; $moved += "Career" }
            if ($watchlist) { Copy-Item $watchlist.FullName -Destination "$modules\\watchlist.html" -Force; $moved += "Watchlist" }
            if ($household) { Copy-Item $household.FullName -Destination "$modules\\Household_Hub.xlsx" -Force; $moved += "Household" }
            
            $moved -join ", "
        `;

        exec(`powershell.exe -NoProfile -Command "${psCommand}"`, (error, stdout, stderr) => {
            if (error) {
                console.error(`exec error: ${error}`);
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: error.message }));
                return;
            }
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ success: true, synced: stdout.trim() }));
        });
        return;
    }

    // ─── MQTT MOCK / TELEMETRY STREAM (Server-Sent Events) ───
    if (req.url === '/api/telemetry' && req.method === 'GET') {
        res.writeHead(200, {
            'Content-Type': 'text/event-stream',
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive'
        });
        
        res.write(`data: ${JSON.stringify({ type: 'system', message: 'Nervous System Connected' })}\n\n`);

        let basePulse = 65;
        let baseHrv = 45;

        const sendMockData = () => {
            // Randomly trigger specific events 15% of the time
            const r = Math.random();
            let ev;

            if (r < 0.05) {
                ev = { type: 'trigger', event: 'Dairy Intake (Late Night)', action: 'pulse_spike' };
                basePulse = 110;
            } else if (r < 0.10) {
                ev = { type: 'trigger', event: 'Narrative Loop Detected', action: 'hrv_drop' };
                baseHrv = 25;
            } else if (r < 0.15) {
                ev = { type: 'trigger', event: 'Sunlight Exposure (Walk)', action: 'productivity_boost' };
            } else {
                // Normal biometric drift
                basePulse += (Math.random() * 4 - 2);
                if (basePulse < 55) basePulse = 55;
                if (basePulse > 120) basePulse -= 5;

                baseHrv += (Math.random() * 4 - 2);
                if (baseHrv < 20) baseHrv = 20;
                if (baseHrv > 80) baseHrv -= 5;

                ev = { 
                    type: 'biometric', 
                    pulse: Math.round(basePulse), 
                    hrv: Math.round(baseHrv),
                    light_lux: Math.floor(Math.random() * 500) + 200
                };
            }

            res.write(`data: ${JSON.stringify(ev)}\n\n`);
        };

        // Broadcast every 2 seconds
        const interval = setInterval(sendMockData, 2000);

        req.on('close', () => {
            clearInterval(interval);
        });
        return;
    }

    res.writeHead(404);
    res.end();
});

server.listen(PORT, () => {
    console.log(`🚀 LIFEOS Local Agent running on port ${PORT}`);
    console.log(`Ready to bridge Vercel Dashboard -> Local Filesystem`);
});
