document.addEventListener('DOMContentLoaded', () => {
    renderProjects();
    updateSystemStats();
});

function renderProjects() {
    const tbody = document.getElementById('project-tbody');
    if (!window.projectData || projectData.length === 0) return;

    const sortedProjects = [...projectData].sort((a, b) => b.priority - a.priority);

    tbody.innerHTML = '';
    sortedProjects.forEach(proj => {
        const row = document.createElement('tr');
        const prioColor = getPriorityColor(proj.priority);
        row.innerHTML = `
            <td>${proj.project} ${proj.codename ? `<span class="version">[${proj.codename}]</span>` : ''}</td>
            <td>${proj.completeness}%</td>
            <td style="color: ${prioColor}; font-weight: bold;">${proj.priority}%</td>
        `;
        tbody.appendChild(row);
    });
}

function getPriorityColor(score) {
    if (score > 80) return '#f472b6';
    if (score > 50) return '#38bdf8';
    return '#94a3b8';
}

function updateSystemStats() {
    const now = new Date();
    const hours = Math.floor((now - new Date(now.toDateString())) / 3600000);
    const mins = now.getMinutes();
    document.getElementById('uptime').textContent = `${hours}h ${mins}m`;

    // Refresh every 60 seconds
    setInterval(() => {
        const n = new Date();
        const h = Math.floor((n - new Date(n.toDateString())) / 3600000);
        const m = n.getMinutes();
        document.getElementById('uptime').textContent = `${h}h ${m}m`;
    }, 60000);
}
