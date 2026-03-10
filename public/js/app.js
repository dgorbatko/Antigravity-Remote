// ════════════════════════════════════════════════════════
// Antigravity Remote — Client Application v2.0
// ════════════════════════════════════════════════════════

// ── Globals ──
let ws = null;
let reconnectTimer = null;
let pollTimer = null;
let isConnected = false;
let currentView = 'loading'; // 'projects' | 'chat' | 'loading'
let lastSnapshotHash = null;
let userScrollLock = false;
let scrollLockTimer = null;
let appState = { mode: '', model: '' };

// ── Utility ──
function escapeHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
}

async function fetchWithAuth(url, opts = {}) {
    const res = await fetch(url, { credentials: 'include', ...opts });
    if (res.status === 401) {
        window.location.href = '/login.html';
        throw new Error('Unauthorized');
    }
    return res;
}

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        const c = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + c;
        hash |= 0;
    }
    return hash.toString(36);
}

// ── WebSocket ──
function connectWebSocket() {
    if (ws && ws.readyState <= 1) return;

    const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${location.host}`;
    
    try {
        ws = new WebSocket(wsUrl);
    } catch (e) {
        console.error('WS connect failed:', e);
        scheduleReconnect();
        return;
    }

    ws.onopen = () => {
        console.log('WebSocket connected');
        setConnectionStatus('connected');
        clearTimeout(reconnectTimer);
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'snapshot-update' || data.type === 'update') {
                loadSnapshot();
            }
        } catch (e) {}
    };

    ws.onclose = () => {
        setConnectionStatus('disconnected');
        scheduleReconnect();
    };

    ws.onerror = () => {
        ws?.close();
    };
}

function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(connectWebSocket, 3000);
}

// ── Connection Status ──
function setConnectionStatus(status) {
    const dot = document.getElementById('statusDot');
    const subtitle = document.getElementById('topBarSubtitle');
    dot.className = 'status-dot';
    
    if (status === 'connected') {
        dot.classList.add('connected');
        isConnected = true;
        subtitle.textContent = appState.model || 'Connected';
    } else if (status === 'connecting') {
        dot.classList.add('connecting');
        subtitle.textContent = 'Connecting...';
    } else {
        isConnected = false;
        subtitle.textContent = 'Disconnected';
    }
}

// ── View Management ──
function showView(view) {
    currentView = view;
    document.getElementById('projectPicker').classList.toggle('active', view === 'projects');
    document.getElementById('chatView').classList.toggle('active', view === 'chat');
    document.getElementById('inputSection').style.display = view === 'chat' ? '' : 'none';
    document.getElementById('loadingState').style.display = view === 'loading' ? '' : 'none';
}

// ── Project Picker ──
async function showProjectPicker() {
    showView('projects');
    closeDrawer();
    const grid = document.getElementById('projectGrid');
    grid.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div><p>Loading projects...</p></div>';

    try {
        const res = await fetchWithAuth('/projects');
        const data = await res.json();

        if (!data.configured) {
            grid.innerHTML = `
                <div class="loading-state" style="grid-column:1/-1">
                    <p style="text-align:center;max-width:320px">
                        Projects directory not configured.<br>
                        Run <code>bash setup.sh</code> to configure.
                    </p>
                </div>`;
            return;
        }

        if (!data.projects || data.projects.length === 0) {
            grid.innerHTML = `
                <div class="loading-state" style="grid-column:1/-1">
                    <p>No projects found in configured directory.</p>
                </div>`;
            return;
        }

        grid.innerHTML = data.projects.map(p => `
            <div class="project-card ${p.isActive ? 'active' : ''}" onclick="openProject('${escapeHtml(p.path)}', '${escapeHtml(p.name)}', this)">
                <div class="project-card-name">
                    ${p.isActive ? '🟢' : '📂'} ${escapeHtml(p.name)}
                </div>
                <div class="project-card-meta">
                    <span class="project-type-badge ${p.type}">${p.type}</span>
                    ${p.hasGit ? '🔀 git' : ''}
                    ${p.lastModified ? `· ${timeAgo(p.lastModified)}` : ''}
                </div>
                <div class="project-card-loading">
                    <div class="spinner"></div>
                </div>
            </div>
        `).join('');
    } catch (e) {
        grid.innerHTML = `<div class="loading-state" style="grid-column:1/-1"><p>Failed to load projects: ${e.message}</p></div>`;
    }
}

async function openProject(path, name, card) {
    const loader = card.querySelector('.project-card-loading');
    if (loader) loader.classList.add('visible');

    try {
        const res = await fetchWithAuth('/open-project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path, name })
        });
        const data = await res.json();
        
        if (data.success) {
            document.getElementById('topBarTitle').textContent = data.project.name;
            showView('chat');
            lastSnapshotHash = null;
            loadSnapshot();
        } else {
            alert('Failed to open project: ' + (data.error || 'Unknown error'));
        }
    } catch (e) {
        alert('Error: ' + e.message);
    } finally {
        if (loader) loader.classList.remove('visible');
    }
}

function timeAgo(dateStr) {
    const d = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now - d) / 1000);
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + 'm ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + 'h ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + 'd ago';
    return d.toLocaleDateString();
}

// ── Snapshot Loading ──
let snapshotStyleElement = null;

async function loadSnapshot() {
    try {
        const res = await fetchWithAuth('/snapshot');
        if (!res.ok) {
            if (res.status === 503) {
                // No snapshot yet — check for active project
                const projRes = await fetchWithAuth('/active-project');
                const projData = await projRes.json();
                if (!projData.activeProject && projData.configured) {
                    showProjectPicker();
                    return;
                }
                // Show loading state
                if (currentView !== 'chat') showView('chat');
                document.getElementById('loadingState').style.display = '';
            }
            return;
        }

        const data = await res.json();
        
        // Check if anything changed
        const newHash = hashString(data.html || '');
        if (newHash === lastSnapshotHash) return;
        lastSnapshotHash = newHash;

        // Show chat view
        if (currentView !== 'chat') showView('chat');
        document.getElementById('loadingState').style.display = 'none';

        // Update workspace name
        if (data.workspaceName) {
            document.getElementById('topBarTitle').textContent = data.workspaceName;
        }

        // Render chat HTML
        renderChatHtml(data);

        // Update generation & continue bars  
        updateGenerationBars(data);

        // Update workspace chats in drawer
        if (data.workspaceChats && data.workspaceChats.length > 0) {
            updateWorkspaceChats(data.workspaceChats);
        }

        // Auto-scroll if user isn't manually scrolling
        if (!userScrollLock) {
            requestAnimationFrame(() => {
                const container = document.getElementById('chatContainer');
                container.scrollTop = container.scrollHeight;
            });
        }

    } catch (e) {
        console.error('Snapshot load error:', e);
    }
}

function renderChatHtml(data) {
    const content = document.getElementById('chatContent');
    
    if (data.html) {
        // Inject the HTML from Antigravity
        content.innerHTML = data.html;

        // Inject Antigravity's CSS into our page (scoped)
        if (data.css) {
            if (!snapshotStyleElement) {
                snapshotStyleElement = document.createElement('style');
                snapshotStyleElement.id = 'snapshot-styles';
                document.head.appendChild(snapshotStyleElement);
            }
            snapshotStyleElement.textContent = data.css;
        }

        // Apply dark theme overrides
        applyDarkOverrides(content);

        // Make buttons interactive
        wireUpButtons(content);

        // Make images responsive
        content.querySelectorAll('img').forEach(img => {
            img.style.maxWidth = '100%';
            img.style.height = 'auto';
            img.style.borderRadius = '8px';
        });
    }
}

function applyDarkOverrides(container) {
    // Force dark backgrounds on any light elements  
    const overrideCSS = `
        .chat-content * {
            max-width: 100% !important;
            word-wrap: break-word !important;
            overflow-wrap: break-word !important;
        }
        .chat-content [contenteditable],
        .chat-content [class*="input"],
        .chat-content [class*="editor"] {
            display: none !important;
        }
        .chat-content [class*="interaction-area"],
        .chat-content [class*="agentSidePanel"] {
            display: none !important;
        }
    `;
    
    let overrideEl = document.getElementById('dark-overrides');
    if (!overrideEl) {
        overrideEl = document.createElement('style');
        overrideEl.id = 'dark-overrides';
        document.head.appendChild(overrideEl);
    }
    overrideEl.textContent = overrideCSS;
}

function wireUpButtons(container) {
    container.querySelectorAll('button, [role="button"]').forEach(btn => {
        const text = (btn.textContent || '').trim();
        if (!text) return;
        
        // Make all buttons clickable via remote-click
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Find occurrence index
            const tag = btn.tagName.toLowerCase();
            const allSame = container.querySelectorAll(tag);
            let index = 0;
            for (const el of allSame) {
                if ((el.textContent || '').trim() === text) {
                    if (el === btn) break;
                    index++;
                }
            }
            
            remoteClick(tag, text, index);
        });
    });
}

async function remoteClick(tag, text, occurrenceIndex) {
    try {
        await fetchWithAuth('/remote-click', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag, text, occurrenceIndex })
        });
        // Reload snapshot after a click to see the result
        setTimeout(loadSnapshot, 500);
    } catch (e) {
        console.error('Remote click error:', e);
    }
}

function updateGenerationBars(data) {
    const genBar = document.getElementById('generationBar');
    const contBar = document.getElementById('continueBar');
    
    genBar.classList.toggle('active', !!data.activeGeneration);
    contBar.classList.toggle('active', !!data.hasContinueButton && !data.activeGeneration);
}

function updateWorkspaceChats(chats) {
    const title = document.getElementById('wsChatsTitle');
    const container = document.getElementById('wsChatsContainer');
    
    if (chats.length > 0) {
        title.style.display = '';
        container.innerHTML = chats.map(c => 
            `<div class="workspace-chat-item" onclick="selectWorkspaceChat('${escapeHtml(c)}')">${escapeHtml(c)}</div>`
        ).join('');
    } else {
        title.style.display = 'none';
        container.innerHTML = '';
    }
}

// ── Scroll Management ──
(function initScroll() {
    const container = document.getElementById('chatContainer');
    const fab = document.getElementById('scrollFab');

    container.addEventListener('touchstart', () => {
        userScrollLock = true;
        clearTimeout(scrollLockTimer);
    }, { passive: true });

    container.addEventListener('touchend', () => {
        scrollLockTimer = setTimeout(() => { userScrollLock = false; }, 5000);
    }, { passive: true });

    container.addEventListener('scroll', () => {
        const scrollBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
        fab.classList.toggle('visible', scrollBottom > 200);
        
        if (scrollBottom < 50) {
            userScrollLock = false;
        }
    }, { passive: true });
})();

function scrollToBottom() {
    const c = document.getElementById('chatContainer');
    c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
    userScrollLock = false;
}

// ── Message Sending ──
const messageInput = document.getElementById('messageInput');

messageInput.addEventListener('input', function() {
    this.style.height = 'auto';
    this.style.height = Math.min(this.scrollHeight, 120) + 'px';
});

messageInput.addEventListener('keydown', function(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
});

async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text) return;

    messageInput.value = '';
    messageInput.style.height = 'auto';

    try {
        await fetchWithAuth('/send', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: text })
        });
        userScrollLock = false;
        setTimeout(loadSnapshot, 300);
    } catch (e) {
        console.error('Send failed:', e);
    }
}

// ── Control Actions ──
async function stopGeneration() {
    try {
        await fetchWithAuth('/stop', { method: 'POST' });
        setTimeout(loadSnapshot, 500);
    } catch (e) {}
}

async function continueGeneration() {
    // Click the continue button on desktop
    try {
        await fetchWithAuth('/remote-click', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tag: 'button', text: 'Continue', occurrenceIndex: 0 })
        });
        setTimeout(loadSnapshot, 500);
    } catch (e) {}
}

async function startNewChat() {
    closeDrawer();
    try {
        await fetchWithAuth('/new-chat', { method: 'POST' });
        lastSnapshotHash = null;
        setTimeout(loadSnapshot, 1000);
    } catch (e) {}
}

async function selectWorkspaceChat(title) {
    closeDrawer();
    try {
        await fetchWithAuth('/select-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
        });
        lastSnapshotHash = null;
        setTimeout(loadSnapshot, 500);
    } catch (e) {}
}

// ── Chat History ──
async function showChatHistory() {
    const layer = document.getElementById('historyLayer');
    const list = document.getElementById('historyList');
    layer.classList.add('open');
    list.innerHTML = '<div class="loading-state"><div class="loading-spinner"></div></div>';

    try {
        const res = await fetchWithAuth('/chat-history');
        const data = await res.json();
        const titles = data.titles || data.history || [];

        if (titles.length === 0) {
            list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">No conversations found</div>';
            return;
        }

        list.innerHTML = titles.map(t => `
            <div class="history-item" onclick="selectHistoryChat('${escapeHtml(t)}')">
                <div class="history-item-title">${escapeHtml(t)}</div>
            </div>
        `).join('');
    } catch (e) {
        list.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)">Could not load history</div>`;
    }
}

function hideHistory() {
    document.getElementById('historyLayer').classList.remove('open');
}

async function selectHistoryChat(title) {
    hideHistory();
    try {
        await fetchWithAuth('/select-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title })
        });
        lastSnapshotHash = null;
        setTimeout(loadSnapshot, 500);
    } catch (e) {}
}

// ── Drawer ──
function openDrawer() { document.getElementById('drawerOverlay').classList.add('open'); }
function closeDrawer() { document.getElementById('drawerOverlay').classList.remove('open'); }

// ── Mode / Model Modal ──
function openModeModal() {
    const modal = document.getElementById('modalOverlay');
    const title = document.getElementById('modalTitle');
    const opts = document.getElementById('modalOptions');
    
    title.textContent = 'Select Mode';
    opts.innerHTML = ['Fast', 'Planning'].map(m => `
        <div class="modal-option ${appState.mode === m ? 'selected' : ''}" onclick="setMode('${m}')">
            <span>${m === 'Fast' ? '⚡' : '🧠'} ${m}</span>
        </div>
    `).join('');
    modal.classList.add('open');
}

function openModelModal() {
    const modal = document.getElementById('modalOverlay');
    const title = document.getElementById('modalTitle');
    const opts = document.getElementById('modalOptions');
    
    title.textContent = 'Select Model';
    const models = ['Claude Sonnet', 'Claude Opus', 'Gemini Pro', 'Gemini Flash', 'GPT-4.1'];
    opts.innerHTML = models.map(m => `
        <div class="modal-option ${appState.model === m ? 'selected' : ''}" onclick="setModel('${m}')">
            <span>${m}</span>
        </div>
    `).join('');
    modal.classList.add('open');
}

function closeModal() { document.getElementById('modalOverlay').classList.remove('open'); }

async function setMode(mode) {
    closeModal();
    closeDrawer();
    try {
        await fetchWithAuth('/set-mode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ mode })
        });
        appState.mode = mode;
        document.getElementById('modeText').textContent = mode;
    } catch (e) {}
}

async function setModel(model) {
    closeModal();
    closeDrawer();
    try {
        await fetchWithAuth('/set-model', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model })
        });
        appState.model = model;
        document.getElementById('modelText').textContent = model;
        document.getElementById('topBarSubtitle').textContent = model;
    } catch (e) {}
}

// ── App State Polling ──
async function pollAppState() {
    try {
        const res = await fetchWithAuth('/app-state');
        const data = await res.json();
        if (data.mode) {
            appState.mode = data.mode;
            document.getElementById('modeText').textContent = data.mode;
        }
        if (data.model) {
            appState.model = data.model;
            document.getElementById('modelText').textContent = data.model;
            document.getElementById('topBarSubtitle').textContent = data.model;
        }
    } catch (e) {}
}

// ── SSL ──
async function enableHttps() {
    try {
        const res = await fetchWithAuth('/generate-ssl', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            alert('HTTPS certificate generated. The server will restart — please reload the page.');
        } else {
            alert('Failed to generate certificate: ' + (data.error || data.message));
        }
    } catch (e) {
        alert('Error: ' + e.message);
    }
}

// ── Initialization ──
async function init() {
    setConnectionStatus('connecting');
    
    // Check SSL
    if (location.protocol === 'http:' && !location.hostname.includes('localhost') && !location.hostname.includes('127.0.0.1')) {
        document.getElementById('sslBanner').style.display = 'flex';
    }

    // Connect WebSocket
    connectWebSocket();

    // Check active project
    try {
        const res = await fetchWithAuth('/active-project');
        const data = await res.json();
        
        if (data.activeProject) {
            document.getElementById('topBarTitle').textContent = data.activeProject.name;
            showView('chat');
            loadSnapshot();
        } else if (data.configured) {
            showProjectPicker();
        } else {
            // No config — try loading snapshot directly (backward compat)
            showView('chat');
            loadSnapshot();
        }
    } catch (e) {
        // Backward compat: just try snapshot
        showView('chat');
        loadSnapshot();
    }

    // Start polling
    setInterval(loadSnapshot, 1200);
    setInterval(pollAppState, 5000);
    pollAppState();
}

init();
