/* ============================================================
   Khwaja AI - Data Forge Engine (v15.0 - Excel Experience)
   Features: Drag Select, Header Select, AI Context, New Sheet
   ============================================================ */

const API_URL = "[https://khwaja-ai-backend.onrender.com](https://khwaja-ai-backend.onrender.com)";
let isBackendOnline = false;

// --- STATE ---
let appState = {
    files: [],
    activeData: [],
    columns: [],
    fileName: "Untitled",
    selection: {
        isDragging: false,
        start: null, // {r: 0, c: 0}
        end: null,
        active: false
    }
};

// --- INIT ---
document.addEventListener("DOMContentLoaded", () => {
    checkBackendHealth();
    setInterval(syncGridState, 5000); // Polling for updates
    
    // Global Mouse Up to stop dragging
    document.addEventListener('mouseup', () => {
        appState.selection.isDragging = false;
    });
});

async function checkBackendHealth() {
    try {
        const res = await fetch(`${API_URL}/`);
        if (res.ok && !isBackendOnline) {
            isBackendOnline = true;
            updateStatus("online");
            syncGridState(); 
        }
    } catch (e) {
        isBackendOnline = false;
        updateStatus("offline");
    }
}

async function syncGridState() {
    if (!isBackendOnline) return;
    try {
        const res = await fetch(`${API_URL}/grid`);
        const json = await res.json();
        if (json.data && (JSON.stringify(json.columns) !== JSON.stringify(appState.columns) || json.data.length !== appState.activeData.length)) {
            appState.activeData = json.data;
            appState.columns = json.columns;
            if (document.getElementById('workspace-view').style.display !== 'none') {
                renderGrid();
                updateInfo();
            }
        }
    } catch (e) { console.error(e); }
}

function updateStatus(status) {
    const el = document.querySelector('.connection-status');
    el.innerHTML = status === 'online' 
        ? '<span class="dot pulse" style="background:#4ade80"></span> Engine: <strong>Online</strong>' 
        : '<span class="dot" style="background:#ef4444"></span> Engine: <strong>Offline</strong>';
}

// --- VIEW NAVIGATION ---
function switchView(viewId) {
    document.querySelectorAll('.view').forEach(el => el.style.display = 'none');
    document.getElementById(viewId).style.display = 'block';
    if(viewId === 'workspace-view') renderGrid();
}

// --- NEW SHEET FUNCTION ---
async function createNewSheet() {
    if(!confirm("Create new blank sheet? Unsaved data will be lost.")) return;
    
    appState.activeData = [];
    appState.columns = [];
    appState.fileName = "New Sheet";
    
    if (isBackendOnline) {
        // Reset Backend
        await fetch(`${API_URL}/reset`, { method: 'POST' });
        syncGridState();
    } else {
        // Local Reset
        appState.activeData = []; 
        renderGrid();
    }
    switchView('workspace-view');
    addAiMsg("✨ Created new blank workspace.");
}

// --- FILE UPLOAD ---
async function handleUpload(fileList) {
    if (!fileList.length) return;
    const file = fileList[0];
    addAiMsg(`Ingesting <strong>${file.name}</strong>...`);

    if (isBackendOnline) {
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
            const json = await res.json();
            if (json.grid_update) {
                appState.activeData = json.grid_update.data;
                appState.columns = json.grid_update.columns;
                appState.fileName = file.name;
                switchView('workspace-view');
                renderGrid();
                addAiMsg("✅ Data Loaded.");
            } else {
                addAiMsg(`❌ Error: ${json.error}`);
            }
        } catch (e) { addAiMsg("❌ Upload Failed"); }
    }
}

// ============================================================
// 🎮 EXCEL-LIKE GRID SYSTEM (The Magic)
// ============================================================

function renderGrid() {
    const thead = document.querySelector('#dataTable thead');
    const tbody = document.querySelector('#dataTable tbody');
    thead.innerHTML = ''; tbody.innerHTML = '';

    const cols = appState.columns;
    const rows = appState.activeData;

    if (!cols.length) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#666;">Empty Grid</td></tr>';
        return;
    }

    // --- HEADERS ---
    let headerRow = document.createElement('tr');
    
    // Corner Cell (Select All)
    let cornerTh = document.createElement('th');
    cornerTh.className = 'row-num';
    cornerTh.innerText = '◢';
    cornerTh.onclick = () => selectRange(0, 0, rows.length - 1, cols.length - 1);
    headerRow.appendChild(cornerTh);

    cols.forEach((col, cIndex) => {
        let th = document.createElement('th');
        th.innerText = col;
        // CLICK HEADER -> Select Column
        th.onclick = () => selectRange(0, cIndex, rows.length - 1, cIndex);
        headerRow.appendChild(th);
    });
    thead.appendChild(headerRow);

    // --- BODY ---
    rows.forEach((rowObj, rIndex) => {
        let tr = document.createElement('tr');

        // Row Number (Select Row)
        let rowHeader = document.createElement('td');
        rowHeader.className = 'row-num';
        rowHeader.innerText = rIndex + 1;
        rowHeader.onclick = () => selectRange(rIndex, 0, rIndex, cols.length - 1);
        tr.appendChild(rowHeader);

        cols.forEach((col, cIndex) => {
            let td = document.createElement('td');
            let val = rowObj[col] !== undefined ? rowObj[col] : "";
            
            // Numeric Styling
            if (!isNaN(parseFloat(val)) && isFinite(val)) {
                td.style.textAlign = 'right';
                td.style.color = '#a7f3d0';
            }
            td.innerText = val;

            // --- DRAG EVENTS ---
            td.dataset.r = rIndex;
            td.dataset.c = cIndex;

            td.onmousedown = (e) => {
                appState.selection.isDragging = true;
                appState.selection.start = {r: rIndex, c: cIndex};
                appState.selection.end = {r: rIndex, c: cIndex};
                // If Ctrl not pressed, clear previous
                if (!e.ctrlKey) clearSelection();
                updateSelectionVisuals();
            };

            td.onmouseover = () => {
                if (appState.selection.isDragging) {
                    appState.selection.end = {r: rIndex, c: cIndex};
                    updateSelectionVisuals();
                }
            };

            tr.appendChild(td);
        });
        tbody.appendChild(tr);
    });
}

// --- SELECTION LOGIC ---
function clearSelection() {
    document.querySelectorAll('td.selected').forEach(el => el.classList.remove('selected'));
    appState.selection.active = false;
}

function selectRange(r1, c1, r2, c2) {
    clearSelection();
    appState.selection.start = {r: r1, c: c1};
    appState.selection.end = {r: r2, c: c2};
    updateSelectionVisuals();
}

function updateSelectionVisuals() {
    const s = appState.selection.start;
    const e = appState.selection.end;
    if (!s || !e) return;

    // Normalize bounds
    const minR = Math.min(s.r, e.r), maxR = Math.max(s.r, e.r);
    const minC = Math.min(s.c, e.c), maxC = Math.max(s.c, e.c);

    // Track values for stats
    let values = [];
    
    // Apply Class
    const rows = document.querySelector('#dataTable tbody').children;
    for (let i = 0; i < rows.length; i++) {
        const cells = rows[i].children;
        for (let j = 1; j < cells.length; j++) { // Skip row number col
            const r = i, c = j - 1;
            const cell = cells[j];
            
            if (r >= minR && r <= maxR && c >= minC && c <= maxC) {
                cell.classList.add('selected');
                const val = parseFloat(cell.innerText);
                if (!isNaN(val)) values.push(val);
            } else {
                // Only remove if we are in a single drag mode (omitting complex ctrl+select for now)
                cell.classList.remove('selected');
            }
        }
    }
    
    appState.selection.active = true;
    updateStats(values);
}

function updateStats(values) {
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = values.length ? (sum / values.length) : 0;
    
    document.getElementById('selCount').innerText = values.length;
    document.getElementById('selSum').innerText = sum.toLocaleString(undefined, {maximumFractionDigits: 2});
    document.getElementById('selAvg').innerText = avg.toLocaleString(undefined, {maximumFractionDigits: 2});
}

function updateInfo() {
    document.getElementById('rowCount').innerText = `${appState.activeData.length} rows`;
    document.getElementById('activeFileName').innerText = appState.fileName;
}

// --- AI CHAT ---
function handleChat() {
    const input = document.getElementById('userQuery');
    const txt = input.value;
    if (!txt) return;

    addAiMsg(txt, 'user'); // User msg
    input.value = '';

    // Prepare Payload with Selection Context
    const payload = { message: txt };
    
    if (appState.selection.active) {
        const s = appState.selection.start;
        const e = appState.selection.end;
        // Send simplified range context (e.g., Rows 0-5, Cols 1-3)
        payload.selection = {
            active: true,
            rows: `${Math.min(s.r, e.r)}-${Math.max(s.r, e.r)}`,
            cols: appState.columns.slice(Math.min(s.c, e.c), Math.max(s.c, e.c) + 1).join(", ")
        };
    }

    if (isBackendOnline) {
        fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        })
        .then(res => res.json())
        .then(data => {
            addAiMsg(data.response, 'ai');
            if (data.grid_update) {
                appState.activeData = data.grid_update.data;
                appState.columns = data.grid_update.columns;
                renderGrid();
            }
        })
        .catch(err => addAiMsg("❌ Backend Error", 'ai'));
    } else {
        addAiMsg("Offline Mode: Connect Python backend for AI.", 'ai');
    }
}

function addAiMsg(html, type) {
    const chat = document.getElementById('chatHistory');
    chat.innerHTML += `<div class="msg ${type === 'user' ? 'user' : 'ai'}">${html}</div>`;
    chat.scrollTop = chat.scrollHeight;
}
