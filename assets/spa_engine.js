/**
 * spa_engine.js — Handles Single Page Application behavior and module previews.
 */

function openModule(url, title) {
    const mainGrid = document.querySelector('.grid-layout');
    let viewer = document.getElementById('module-viewer');
    
    if (!viewer) {
        viewer = document.createElement('div');
        viewer.id = 'module-viewer';
        viewer.style.display = 'none';
        viewer.style.flexDirection = 'column';
        viewer.style.height = 'calc(100vh - 100px)';
        viewer.style.background = 'var(--panel-bg)';
        viewer.style.border = '1px solid var(--glass-border)';
        viewer.style.borderRadius = '12px';
        viewer.style.overflow = 'hidden';
        viewer.style.marginTop = '20px';
        viewer.style.position = 'relative';
        
        viewer.innerHTML = `
            <div style="padding: 10px 20px; background: rgba(0,0,0,0.2); border-bottom: 1px solid var(--glass-border); display: flex; justify-content: space-between; align-items: center;">
                <h3 id="module-viewer-title" style="margin: 0; font-size: 1rem;">Module</h3>
                <button onclick="closeModule()" style="background: var(--bg-color); border: 1px solid var(--glass-border); color: white; padding: 5px 15px; border-radius: 4px; cursor: pointer;">Close & Return</button>
            </div>
            <iframe id="module-iframe" src="" style="width: 100%; height: 100%; border: none; background: white;"></iframe>
        `;
        document.querySelector('.container').appendChild(viewer);
    }
    
    document.getElementById('module-viewer-title').innerText = title;
    document.getElementById('module-iframe').src = url;
    
    // Animate transition
    mainGrid.style.display = 'none';
    viewer.style.display = 'flex';
}

function closeModule() {
    const mainGrid = document.querySelector('.grid-layout');
    const viewer = document.getElementById('module-viewer');
    if (viewer) viewer.style.display = 'none';
    document.getElementById('module-iframe').src = 'about:blank'; // free memory
    mainGrid.style.display = 'grid';
}

async function loadJobPreviews() {
    try {
        const response = await fetch('modules/career.html');
        if (!response.ok) return;
        const text = await response.text();
        
        const parser = new DOMParser();
        const doc = parser.parseFromString(text, 'text/html');
        
        const roles = Array.from(doc.querySelectorAll('.role-card')).slice(0, 5);
        
        const container = document.getElementById('career-preview-tbody');
        if (!container) return;
        
        container.innerHTML = '';
        
        roles.forEach(role => {
            const titleElement = role.querySelector('.role-title');
            const title = titleElement ? titleElement.innerText.replace(/^\d+\.\s*/, '') : 'Unknown Role';
            
            let salary = 'Unstated';
            const metaItems = role.querySelectorAll('.meta-item');
            metaItems.forEach(item => {
                if (item.innerText.includes('Salary')) {
                    salary = item.querySelector('.meta-value')?.innerText || 'Unstated';
                }
            });

            let verdictClass = 'consider';
            let verdictText = 'Review';
            const verdictEl = role.querySelector('.verdict');
            if(verdictEl) {
                if(verdictEl.classList.contains('apply')) { verdictClass = 'apply'; verdictText = 'Apply'; }
                if(verdictEl.classList.contains('skip')) { verdictClass = 'skip'; verdictText = 'Skip'; }
            }

            let color = '#f59e0b';
            if(verdictClass === 'apply') color = '#10b981';
            if(verdictClass === 'skip') color = '#ef4444';
            
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td style="font-size: 0.85rem; max-width: 140px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;" title="${title}">${title}</td>
                <td style="font-size: 0.8rem; color: var(--text-dim);">${salary}</td>
                <td><span style="background: ${color}22; color: ${color}; padding: 2px 6px; border-radius: 4px; font-size: 0.7rem; display: inline-block;">${verdictText}</span></td>
            `;
            container.appendChild(tr);
        });
    } catch (e) {
        console.error("Failed to load job previews:", e);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadJobPreviews();
});
