/* ============================================================
   Khwaja AI - Data Forge Engine (v6.0 - React Architecture Port)
   Strictly replicates App.tsx logic in Vanilla JS
   ============================================================ */

// ⬇️ IMPORTANT: CONNECTS TO YOUR RENDER CLOUD ⬇️
const API_URL = "https://khwaja-ai-backend.onrender.com";
let isBackendOnline = false;

// --- GLOBAL STATE (Replicating React 'useState') ---
let appState = {
    files: [],       // Metadata for "My Data" view
    activeData: [],  // Grid Rows (Array of Objects)
    columns: [],     // Grid Headers (Array of Strings)
    fileName: "Untitled"
};

// --- 1. LIFECYCLE (Replicating 'useEffect') ---
document.addEventListener("DOMContentLoaded", () => {
    checkBackendHealth();
    // Replicates the React Polling Interval (PING_INTERVAL = 5000)
    setInterval(syncGridState, 5000); 
});

async function checkBackendHealth() {
    try {
        const res = await fetch(`${API_URL}/`);
        if (res.ok) {
            if(!isBackendOnline) {
                isBackendOnline = true;
                updateStatus("online");
                // Fetch initial data immediately on connect
                syncGridState(); 
            }
        }
    } catch (e) {
        isBackendOnline = false;
        updateStatus("offline");
    }
}

// --- 2. DATA SYNC (The Missing Link) ---
// This function acts like your React 'fetchGridData'
async function syncGridState() {
    if (!isBackendOnline) return;

    try {
        const res = await fetch(`${API_URL}/grid`);
        const json = await res.json();

        // Only update if data is different (Prevents UI flickering)
        if (json.data && json.data.length > 0) {
            // Check if we actually have new data to avoid re-rendering constantly
            if (JSON.stringify(json.columns) !== JSON.stringify(appState.columns) || 
                json.data.length !== appState.activeData.length) {
                
                appState.activeData = json.data;
                appState.columns = json.columns;
                
                // If we are in the workspace, refresh the grid
                const workspace = document.getElementById('workspace-view');
                if (workspace.style.display !== 'none') {
                    renderGrid();
                    document.getElementById('rowCount').innerText = `${appState.activeData.length} rows`;
                }
            }
        }
    } catch (e) {
        console.error("Sync error:", e);
    }
}

function updateStatus(status) {
    const el = document.querySelector('.connection-status');
    if (status === 'online') {
        el.innerHTML = '<span class="dot pulse" style="background:#4ade80"></span> Engine: <strong>Online (Cloud)</strong>';
    } else {
        el.innerHTML = '<span class="dot" style="background:#ef4444"></span> Engine: <strong>Offline</strong>';
    }
}

// --- 3. VIEW CONTROLLER ---
function switchView(viewId) {
    document.querySelectorAll('.view').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.menu-btn').forEach(el => el.classList.remove('active'));
    
    document.getElementById(viewId).style.display = 'block';
    
    const btnMap = { 'import-view': 0, 'storage-view': 1, 'workspace-view': 2, 'viz-view': 3 };
    const btns = document.querySelectorAll('.menu-btn');
    if (btns[btnMap[viewId]]) btns[btnMap[viewId]].classList.add('active');

    if (viewId === 'storage-view') renderFileList();
    if (viewId === 'workspace-view') renderGrid(); 
}

// --- 4. FILE UPLOAD (Fixes Duplicate Issue) ---
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#4ade80'; });
dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.style.borderColor = '#1e293b'; });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#1e293b';
    handleUpload(e.dataTransfer.files);
});

fileInput.addEventListener('change', (e) => handleUpload(e.target.files));

async function handleUpload(fileList) {
    if (!fileList || fileList.length === 0) return;
    const file = fileList[0];

    addAiMsg(`Ingesting <strong>${file.name}</strong>...`);

    // FIX 1: STRICT DUPLICATE CHECK
    // Only add to the UI list if it doesn't exist yet
    const exists = appState.files.some(f => f.name === file.name);
    if (!exists) {
        appState.files.push({
            name: file.name,
            size: (file.size / 1024).toFixed(1) + ' KB',
            type: file.name.split('.').pop().toUpperCase()
        });
        document.getElementById('fileCount').innerText = appState.files.length;
    }

    if (isBackendOnline) {
        const formData = new FormData();
        formData.append('file', file);

        try {
            addAiMsg("🚀 Uploading to Cloud Engine...");
            const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
            const json = await res.json();

            if (json.error) {
                addAiMsg(`❌ Python Error: ${json.error}`);
            } else if (json.grid_update) {
                // SUCCESS: Update Global State directly from response
                appState.activeData = json.grid_update.data;
                appState.columns = json.grid_update.columns;
                appState.fileName = file.name;
                
                finalizeLoad(); // Switch view and render
                addAiMsg("✅ Data extracted & loaded.");
            }
        } catch (e) {
            addAiMsg(`❌ Connection Failed: ${e.message}`);
        }
    } else {
        if (file.type.startsWith('image/')) {
            alert("⚠️ Image OCR requires Cloud Engine.");
            return;
        }
    }
}

function finalizeLoad() {
    switchView('workspace-view');
    renderGrid();
    document.getElementById('activeFileName').innerText = appState.fileName;
    document.getElementById('rowCount').innerText = `${appState.activeData.length} rows`;
}

// --- 5. GRID RENDERER (Handling Objects like React) ---
function renderGrid() {
    const thead = document.querySelector('#dataTable thead');
    const tbody = document.querySelector('#dataTable tbody');
    thead.innerHTML = ''; tbody.innerHTML = '';

    const cols = appState.columns;
    const rows = appState.activeData;

    // Safety check
    if (!cols || cols.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:#666;">Waiting for data...</td></tr>';
        return;
    }

    // 1. HEADERS
    let headerRow = '<tr><th class="row-num">#</th>';
    cols.forEach(col => headerRow += `<th>${col}</th>`);
    headerRow += '</tr>';
    thead.innerHTML = headerRow;

    // 2. BODY (Limit 500 rows for performance)
    const limit = 500; 
    let bodyHtml = '';

    rows.slice(0, limit).forEach((rowObj, i) => {
        bodyHtml += `<tr><td class="row-num">${i + 1}</td>`;
        cols.forEach(col => {
            // FIX 2: Correctly access data from Object (Dictionary)
            let val = rowObj[col]; 
            if (val === undefined || val === null) val = "";
            
            // Numeric Styling
            const isNum = !isNaN(parseFloat(val)) && isFinite(val);
            const style = isNum ? 'style="text-align:right; color:#a7f3d0;"' : '';
            
            bodyHtml += `<td ${style} onclick="toggleCell(this, '${val}')">${val}</td>`;
        });
        bodyHtml += '</tr>';
    });
    tbody.innerHTML = bodyHtml;
}

// --- 6. FILE STORAGE VIEW ---
function renderFileList() {
    const list = document.getElementById('fileList');
    list.innerHTML = '';
    
    if (appState.files.length === 0) {
        list.innerHTML = `<div class="empty-state"><p>No files loaded.</p></div>`;
        return;
    }

    appState.files.forEach(f => {
        const card = document.createElement('div');
        card.className = 'file-card';
        // Clicking a file just takes you to workspace (Single session for now)
        card.onclick = () => switchView('workspace-view');
        
        card.innerHTML = `
            <div class="file-icon"><i class="fas fa-table"></i></div>
            <div class="file-info">
                <h4>${f.name}</h4>
                <span>${f.type} • ${f.size}</span>
            </div>
        `;
        list.appendChild(card);
    });
}

// --- 7. UTILS & AI CHAT ---
function addAiMsg(html) {
    const chat = document.getElementById('chatHistory');
    chat.innerHTML += `<div class="msg ai">${html}</div>`;
    chat.scrollTop = chat.scrollHeight;
}

function handleChat() {
    const input = document.getElementById('userQuery');
    const txt = input.value;
    if (!txt) return;

    document.getElementById('chatHistory').innerHTML += `<div class="msg user">${txt}</div>`;
    input.value = '';

    if (isBackendOnline) {
        // Send to Python AI
        fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: txt })
        })
        .then(res => res.json())
        .then(data => {
            addAiMsg(data.response);
            // If AI updated data, refresh grid
            if (data.grid_update) {
                appState.activeData = data.grid_update.data;
                appState.columns = data.grid_update.columns;
                renderGrid();
            }
        })
        .catch(err => addAiMsg("❌ Backend Error"));
    } else {
        setTimeout(() => addAiMsg("I am running locally. Connect Python backend for full AI capabilities."), 500);
    }
}

// --- 8. MATH & STATS ---
let selectedValues = [];

function toggleCell(cell, val) {
    cell.classList.toggle('selected');
    const num = parseFloat(val);
    if (!isNaN(num)) {
        if (cell.classList.contains('selected')) selectedValues.push(num);
        else {
            const idx = selectedValues.indexOf(num);
            if (idx > -1) selectedValues.splice(idx, 1);
        }
    }
    updateStats();
}

function updateStats() {
    const sum = selectedValues.reduce((a, b) => a + b, 0);
    const avg = selectedValues.length ? (sum / selectedValues.length) : 0;
    
    document.getElementById('selCount').innerText = selectedValues.length;
    document.getElementById('selSum').innerText = sum.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 2});
    document.getElementById('selAvg').innerText = avg.toLocaleString(undefined, {minimumFractionDigits: 0, maximumFractionDigits: 2});
}

function runAutoClean() {
    if (isBackendOnline) {
        handleChat("Clean this data, remove empty rows and standardize formats.");
    }
}

function exportCurrentData() {
    const ws = XLSX.utils.json_to_sheet(appState.activeData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, `Cleaned_${appState.fileName}.xlsx`);
}
