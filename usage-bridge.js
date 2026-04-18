const fs = require('fs');
const path = require('path');
const https = require('https');

// Paths
const OUTPUT = path.join(__dirname, 'assets', 'usage-data.js');
const HEALTH_OUTPUT = path.join(__dirname, 'assets', 'health-data.js');

// Providers
const local = require('./lib/providers/local');
const google = require('./lib/providers/google');
const usageStore = require('./lib/usage-store');

async function bridge() {
    const timestamp = new Date().toLocaleString();
    
    // 1. Check Provider Health
    const localHealth = await local.healthCheck();
    const googleHealth = await google.healthCheck();

    // 2. Get Usage Summary
    const summary = usageStore.summarize();

    // 3. Fetch Matches
    const matches = await fetchMatches();

    // 4. Calculate Celestial Power
    const cpMax = 1000;
    let cpCurrent = 50; // Base
    if (localHealth.alive) cpCurrent += 500;
    if (googleHealth.alive) cpCurrent += 450;

    // 5. Prepare Dashboard Data
    const dashboardUsage = {
        timestamp: timestamp,
        providers: {
            local: { status: localHealth.alive ? 'online' : 'offline', detail: localHealth.version || localHealth.error },
            google: { status: googleHealth.alive ? 'online' : 'offline', detail: googleHealth.version || googleHealth.error }
        },
        usage: {
            totalEvents: summary.totalEvents,
            totalTokens: summary.totalTokens,
            breakdown: summary.breakdown
        },
        matches: matches,
        celestialPower: {
            current: cpCurrent,
            max: cpMax
        }
    };

    // 6. Prepare Health Data
    const healthData = {
        routine: {
            am: ["Gabapentin", "Multivitamins", "Fish Oil"],
            pm: ["Gabapentin", "Oral Steroid (Skin Split Repair)"],
            skin: "Apply Hydromol + Gloves/Socks (Repair Mode)",
            hydrationTarget: "4.2L - 6.2L",
            sleepBenchmark: 80
        },
        matches: matches,
        softwareLinks: [
            { name: "Samsung Health", url: "https://shealth.samsung.com/" },
            { name: "Google Fit", url: "https://fit.google.com/" },
            { name: "MUTV", url: "https://www.manutd.com/mutv" },
            { name: "MyFitnessPal", url: "https://www.myfitnesspal.com/" }
        ]
    };

    // 7. Write Files
    fs.writeFileSync(OUTPUT, `const usageLiveData = ${JSON.stringify(dashboardUsage, null, 2)};`);
    fs.writeFileSync(HEALTH_OUTPUT, `const healthData = ${JSON.stringify(healthData, null, 2)};`);

    console.log(`✅ Bridge synced successfully`);
    console.log(`  - CP: ${cpCurrent}/${cpMax}`);
    console.log(`  - Local: ${localHealth.alive ? 'ONLINE' : 'OFFLINE'}`);
    console.log(`  - Matches found: ${matches.length}`);
}

function fetchMatches() {
    return new Promise((resolve) => {
        https.get('https://www.wheresthematch.com/Football/Manchester-United.asp', (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                const matches = [];
                const nextMatchRegex = /Chelsea v Manchester United.*?on (.*?) in the Premier League.*?kick-off is at (.*?)\./s;
                const match = data.match(nextMatchRegex);
                if (match) {
                    matches.push({
                        opponent: "Chelsea",
                        competition: "Premier League",
                        time: match[2],
                        date: match[1],
                        channels: ["HBO Max", "TNT Sports 1", "TNT Sports Ultimate"],
                        isToday: match[1].includes('18 April') || match[1].includes('Today')
                    });
                }
                resolve(matches);
            });
        }).on('error', () => resolve([]));
    });
}

bridge().catch(e => {
    console.error('Bridge failed:', e.message);
    process.exit(1);
});
