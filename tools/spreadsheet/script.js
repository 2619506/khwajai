/* ============================================================
   Khwaja AI - Data Forge Engine (v5.0 - Stability Fix)
   Replicates BUSnX React Architecture & State Management
   ============================================================ */

const API_URL = "http://localhost:8000";
let isBackendOnline = false;

// --- GLOBAL STATE ---
let appState = {
    files: [],       // Metadata for "My Data" view
    activeData: [],  // Grid Rows (Array of Objects)
    columns: [],     // Grid Headers (Array of Strings)
    fileName: "Untitled"
};

// --- 1. INITIALIZATION (Like App.tsx useEffect) ---
document.addEventListener("DOMContentLoaded", () => {
    checkBackendHealth();
    // Poll backend every 2s to sync state (like your React App)
    setInterval(syncGridState, 2000); 
});

async function checkBackendHealth() {
    try {
        const res = await fetch(`${API_URL}/`);
        if (res.ok) {
            if(!isBackendOnline) {
                isBackendOnline = true;
                updateStatus("online");
                // Fetch initial grid data immediately on connect
                syncGridState(); 
            }
        }
    } catch (e) {
        isBackendOnline = false;
        updateStatus("offline");
    }
}

// Replicates fetchGridData from App.tsx
async function syncGridState() {
    if (!isBackendOnline) return;

    try {
        const res = await fetch(`${API_URL}/grid`);
        const json = await res.json();

        // Only update if data actually changed to avoid UI flickering
        if (JSON.stringify(json.columns) !== JSON.stringify(appState.columns) || 
            json.data.length !== appState.activeData.length) {
            
            appState.columns = json.columns || [];
            appState.activeData = json.data || [];
            
            // If we have data, ensure we are in Workspace view
            if (appState.activeData.length > 0) {
                renderGrid();
                updateStats();
                document.getElementById('rowCount').innerText = `${appState.activeData.length} rows`;
            }
        }
    } catch (e) {
        console.error("Sync error:", e);
    }
}

function updateStatus(status) {
    const el = document.querySelector('.connection-status');
    if (status === 'online') {
        el.innerHTML = '<span class="dot pulse" style="background:#4ade80"></span> Engine: <strong>Online (Python)</strong>';
    } else {
        el.innerHTML = '<span class="dot" style="background:#ef4444"></span> Engine: <strong>Offline (Local Mode)</strong>';
    }
}

// --- 2. VIEW CONTROLLER ---
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

// --- 3. FILE INGESTION (Fixes Duplicate Issue) ---
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

    // FIX 1: Don't add to file list yet. Wait for processing.
    // We only add to 'appState.files' once we confirm data is valid.

    if (isBackendOnline) {
        // --- BACKEND UPLOAD (Replicates handleFileUpload from App.tsx) ---
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
            const json = await res.json();

            if (json.error) {
                addAiMsg(`❌ Python Error: ${json.error}`);
            } else if (json.grid_update) {
                // SUCCESS
                addFileToList(file); // Add to UI list ONLY now
                // Update State directly from Backend Response
                appState.columns = json.grid_update.columns;
                appState.activeData = json.grid_update.data;
                appState.fileName = file.name;
                
                finalizeLoad();
                addAiMsg("✅ Data extracted successfully.");
            }
        } catch (e) {
            addAiMsg(`❌ Upload Failed: ${e.message}`);
        }
    } else {
        // --- LOCAL FALLBACK ---
        if (file.type.startsWith('image/')) {
            alert("⚠️ Image OCR requires 'backend.py' to be running!");
            return;
        }
        addFileToList(file);
        parseLocalFile(file);
    }
}

// Helper to safely add file to list without duplicates
function addFileToList(file) {
    const exists = appState.files.some(f => f.name === file.name);
    if (!exists) {
        appState.files.push({
            name: file.name,
            size: (file.size / 1024).toFixed(1) + ' KB',
            type: file.name.split('.').pop().toUpperCase(),
            rawFile: file
        });
        document.getElementById('fileCount').innerText = appState.files.length;
    }
}

// --- 4. DATA LOADING ---
function finalizeLoad() {
    // Enable Buttons
    document.getElementById('processBtn').disabled = false;
    document.getElementById('vizBtn').disabled = false;
    
    // Update Header
    document.getElementById('activeFileName').innerText = appState.fileName;
    document.getElementById('rowCount').innerText = `${appState.activeData.length} rows`;

    // Auto-switch to workspace
    switchView('workspace-view');
    renderGrid(); // Force render immediately
}

function parseLocalFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, {header: 1});

        if (json.length > 0) {
            const cols = json[0].map(c => String(c));
            const rows = json.slice(1).map(row => {
                let obj = {};
                cols.forEach((col, i) => obj[col] = row[i] || "");
                return obj;
            });
            
            appState.columns = cols;
            appState.activeData = rows;
            appState.fileName = file.name;
            finalizeLoad();
        }
    };
    reader.readAsArrayBuffer(file);
}

// --- 5. GRID RENDERER (Professional Table) ---
function renderGrid() {
    const thead = document.querySelector('#dataTable thead');
    const tbody = document.querySelector('#dataTable tbody');
    
    // Clear current
    thead.innerHTML = '';
    tbody.innerHTML = '';

    const cols = appState.columns;
    const rows = appState.activeData;

    // Safety Check
    if (!cols || cols.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">No data to display</td></tr>';
        return;
    }

    // 1. HEADERS
    let headerRow = '<tr><th class="row-num">#</th>';
    cols.forEach(col => {
        headerRow += `<th>${col}</th>`;
    });
    headerRow += '</tr>';
    thead.innerHTML = headerRow;

    // 2. BODY (Limit to 500 rows for DOM performance)
    const limit = 500; 
    let bodyHtml = '';

    rows.slice(0, limit).forEach((rowObj, i) => {
        bodyHtml += `<tr><td class="row-num">${i + 1}</td>`;
        cols.forEach(col => {
            // Safe Access: matches Python's dict keys
            let val = rowObj[col]; 
            if (val === undefined || val === null) val = "";
            
            // Numeric Styling (Green aligned right)
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
        card.onclick = () => {
            // Restore context when clicking a file in storage
            appState.fileName = f.name;
            switchView('workspace-view');
        };
        
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

// --- 7. UTILS & AI ---
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
        fetch(`${API_URL}/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: txt })
        })
        .then(res => res.json())
        .then(data => {
            addAiMsg(data.response);
            // If AI updated data (e.g. "Clean this"), refresh grid
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

// --- 8. MATH STATS ---
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
    } else {
        appState.activeData = appState.activeData.filter(row => Object.values(row).some(x => x !== "" && x !== null));
        renderGrid();
        addAiMsg("Removed empty rows locally.");
    }
}

function exportCurrentData() {
    const ws = XLSX.utils.json_to_sheet(appState.activeData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Data");
    XLSX.writeFile(wb, `Cleaned_${appState.fileName}.xlsx`);
}
