// RPG System Engine v2 — Wired to real usage-bridge data

// Load saved state from localStorage, or use defaults
const SAVE_KEY = 'lifeos_rpg_state';

function loadState() {
    try {
        const saved = localStorage.getItem(SAVE_KEY);
        if (saved) return JSON.parse(saved);
    } catch (e) { /* corrupt state, reset */ }
    return null;
}

function saveState() {
    localStorage.setItem(SAVE_KEY, JSON.stringify({
        charData,
        dailyQuests: dailyQuests.map(q => ({ id: q.id, completed: q.completed })),
        weeklyQuests: weeklyQuests.map(q => ({ id: q.id, completed: q.completed })),
        epicQuests: epicQuests.map(q => ({ id: q.id, completed: q.completed })),
        savedDate: new Date().toISOString().split('T')[0]
    }));
}

let charData = {
    level: 1,
    xp: 0,
    xpMax: 500,
    hp: 1000,
    hpMax: 1000,
    mp: 1000,
    mpMax: 1000,
    cp: 50,
    cpMax: 1000,
    streak: 0
};

function initRPG() {
    // 1. Restore saved state
    const saved = loadState();
    const today = new Date().toISOString().split('T')[0];

    if (saved) {
        charData = { ...charData, ...saved.charData };

        // Restore quest completion (only if same day for dailies)
        if (saved.savedDate === today) {
            restoreQuestState(dailyQuests, saved.dailyQuests);
        }
        // Weeklies persist all week
        restoreQuestState(weeklyQuests, saved.weeklyQuests);
        restoreQuestState(epicQuests, saved.epicQuests);

        // Daily reset penalty: if yesterday's dailies weren't all done
        if (saved.savedDate && saved.savedDate !== today) {
            const missedDaily = saved.dailyQuests?.filter(q => !q.completed).length || 0;
            if (missedDaily > 0) {
                const penalty = missedDaily * 5;
                charData.hp = Math.max(100, charData.hp - penalty);
                logEvent(`Daily Reset: -${penalty} HP (${missedDaily} tasks missed yesterday)`);
            } else {
                charData.streak++;
                logEvent(`Perfect Day! Streak: ${charData.streak} 🔥`);
            }
        }
    }

    // 2. Sync Celestial Power from real provider data
    syncCelestialPower();

    // 3. Sync provider status indicators
    syncProviderStatus();

    // 3.5 Check for match day
    checkMatchDayPriority();

    // 4. Render everything
    renderQuests('daily-quests', dailyQuests);
    renderQuests('weekly-quests', weeklyQuests);
    renderQuests('epic-quests', epicQuests);
    updateBars();

    // 5. Update streak display
    const streakEl = document.getElementById('streak-count');
    if (streakEl) streakEl.textContent = charData.streak;

    logEvent('System initialized. All data is live.');
}

function restoreQuestState(questArray, savedArray) {
    if (!savedArray) return;
    savedArray.forEach(sq => {
        const quest = questArray.find(q => q.id === sq.id);
        if (quest) quest.completed = sq.completed;
    });
}

function syncCelestialPower() {
    // Read from the real usage-bridge output
    if (typeof usageLiveData !== 'undefined' && usageLiveData.celestialPower) {
        charData.cp = usageLiveData.celestialPower.current;
        charData.cpMax = usageLiveData.celestialPower.max;
    }
}

function syncProviderStatus() {
    if (typeof usageLiveData === 'undefined') return;

    const providers = usageLiveData.providers;

    // Update the hardware node indicators in the HTML
    const nodeItems = document.querySelectorAll('.node-item');
    nodeItems.forEach(node => {
        const text = node.textContent.trim();

        if (text.includes('ASUS') || text.includes('Local LLM')) {
            node.className = `node-item ${providers.local.status === 'online' ? 'online' : 'offline'}`;
        }
        if (text.includes('Pi')) {
            // Pi status is separate
        }
        if (text.includes('Remote') || text.includes('Google') || text.includes('Cloud')) {
            node.className = `node-item ${providers.google.status === 'online' ? 'online' : 'offline'}`;
        }
    });
}

function checkMatchDayPriority() {
    if (typeof healthData === 'undefined') return;
    const todayMatch = healthData.matches?.find(m => m.isToday);
    if (todayMatch) {
        const title = document.querySelector('.highlight-panel h4');
        const desc = document.querySelector('.highlight-panel p');
        const btn = document.querySelector('.highlight-panel .action-btn');

        if (title && desc && btn) {
            title.innerText = `"Match Day: vs ${todayMatch.opponent}"`;
            desc.innerText = `Kickoff at ${todayMatch.time}. Priority: Hit 6.2L Hydration target to offset any match snacks.`;
            btn.innerText = "Target Complete (+50 XP)";
        }
    }
}

function renderQuests(containerId, questArray) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    questArray.forEach((quest, index) => {
        const li = document.createElement('li');
        li.className = `quest-item ${quest.completed ? 'completed' : ''}`;
        li.onclick = () => toggleQuest(questArray, index, containerId);

        li.innerHTML = `
            <div class="quest-checkbox"></div>
            <div class="quest-name">${quest.name} <span style="font-size: 0.7em; color: var(--text-dim);">[${quest.stat}]</span></div>
            <div class="quest-xp">+${quest.xp} XP</div>
        `;
        container.appendChild(li);
    });
}

function toggleQuest(questArray, index, containerId) {
    const quest = questArray[index];
    quest.completed = !quest.completed;

    if (quest.completed) {
        addXP(quest.xp);
        logEvent(`Completed: ${quest.name} (+${quest.xp} XP)`);
        // Task completion restores focus energy
        charData.mp = Math.min(charData.mpMax, charData.mp + 10);
    } else {
        addXP(-quest.xp);
        logEvent(`Reverted: ${quest.name} (-${quest.xp} XP)`);
    }

    renderQuests(containerId, questArray);
    updateBars();
    saveState();
}

function addXP(amount) {
    charData.xp += amount;

    // Level Up
    if (charData.xp >= charData.xpMax) {
        charData.level++;
        charData.xp -= charData.xpMax;
        charData.xpMax = Math.floor(charData.xpMax * 1.2);

        // Full restore on level up
        charData.hp = charData.hpMax;
        charData.mp = charData.mpMax;

        logEvent(`⚡ LEVEL UP! You are now Level ${charData.level}!`);
    } else if (charData.xp < 0) {
        if (charData.level > 1) {
            charData.level--;
            charData.xpMax = Math.floor(charData.xpMax / 1.2);
            charData.xp += charData.xpMax;
        } else {
            charData.xp = 0;
        }
    }
}

function updateBars() {
    document.getElementById('char-level').innerText = charData.level;
    document.getElementById('xp-text').innerText = `${charData.xp.toLocaleString()} / ${charData.xpMax.toLocaleString()} XP`;

    const xpPct = (charData.xp / charData.xpMax) * 100;
    const hpPct = (charData.hp / charData.hpMax) * 100;
    const mpPct = (charData.mp / charData.mpMax) * 100;
    const cpPct = (charData.cp / charData.cpMax) * 100;

    document.getElementById('bar-xp').style.width = `${xpPct}%`;
    document.getElementById('bar-hp').style.width = `${hpPct}%`;
    document.getElementById('bar-mp').style.width = `${mpPct}%`;
    document.getElementById('bar-cp').style.width = `${cpPct}%`;

    const statValues = document.querySelectorAll('.v-stat-value');
    if (statValues.length >= 3) {
        statValues[0].innerText = `${charData.hp}/${charData.hpMax}`;
        statValues[1].innerText = `${charData.mp}/${charData.mpMax}`;
        statValues[2].innerText = `${charData.cp}/${charData.cpMax}`;
    }
}

window.completeQuest = function (id, xp) {
    addXP(xp);
    logEvent(`Smart Target Complete: (+${xp} XP)`);
    updateBars();
    saveState();

    const btn = document.querySelector('.action-btn');
    if (btn) {
        btn.innerText = "Completed ✓";
        btn.disabled = true;
        btn.style.background = "var(--success)";
    }
};

function logEvent(message) {
    const logContainer = document.getElementById('event-log');
    if (!logContainer) return;

    const now = new Date();
    const timeString = `[${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}]`;

    const li = document.createElement('li');
    li.innerHTML = `<span class="time">${timeString}</span> ${message}`;

    logContainer.prepend(li);

    // Keep log to 8 items max
    while (logContainer.children.length > 8) {
        logContainer.removeChild(logContainer.lastChild);
    }
}

document.addEventListener('DOMContentLoaded', initRPG);
