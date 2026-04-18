/**
 * health_engine.js — Handles match alerts and health routine rendering.
 */

document.addEventListener('DOMContentLoaded', () => {
    renderMatchAlert();
    renderHealthRoutine();
    renderExternalLinks();
});

function renderMatchAlert() {
    const container = document.getElementById('usage-summary'); // We'll repurpose this for general intel
    if (!container || !healthData.matches) return;

    const todayMatch = healthData.matches.find(m => m.isToday);
    if (todayMatch) {
        const div = document.createElement('div');
        div.className = 'match-alert';
        div.style.background = 'rgba(239, 68, 68, 0.1)';
        div.style.border = '1px solid #ef4444';
        div.style.padding = '10px';
        div.style.borderRadius = '6px';
        div.style.marginTop = '15px';
        div.innerHTML = `
            <div style="color: #ef4444; font-weight: bold; font-size: 0.8rem; margin-bottom: 5px;">🔴 LIVE INTEL: MATCH DAY</div>
            <div style="font-size: 0.9rem; color: #fff;">vs ${todayMatch.opponent} (${todayMatch.competition})</div>
            <div style="font-size: 0.8rem; color: var(--text-dim); margin-top: 3px;">Kickoff: ${todayMatch.time} | ${todayMatch.channels.join(', ')}</div>
        `;
        container.parentElement.appendChild(div);
    }
}

function renderHealthRoutine() {
    // Inject health routine as a special "Epic Quest" or a separate panel
    // For now, let's put it in the System Log area or a new side-panel
    console.log("Health routine initialized:", healthData.routine);
}

function renderExternalLinks() {
    // Create a new panel at the bottom of the right side for links
    const rightPanel = document.querySelector('.right-panel');
    if (!rightPanel) return;

    const linkPanel = document.createElement('div');
    linkPanel.className = 'panel glass-panel';
    linkPanel.innerHTML = `
        <h3 class="panel-title">Command Links</h3>
        <div class="tile-content" style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            ${healthData.softwareLinks.map(link => `
                <a href="${link.url}" target="_blank" class="link-btn" style="text-decoration: none; color: var(--text-dim); font-size: 0.8rem; padding: 8px; background: rgba(255,255,255,0.03); border-radius: 4px; text-align: center; border: 1px solid var(--glass-border);">
                    ${link.name}
                </a>
            `).join('')}
        </div>
    `;
    rightPanel.appendChild(linkPanel);
}
