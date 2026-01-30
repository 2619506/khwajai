/* ============================================================
   Khwaja AI - Data Forge Engine (v4.0 - Production Fix)
   Replicates BUSnX React Architecture in Vanilla JS
   ============================================================ */

const API_URL = "http://localhost:8000";
let isBackendOnline = false;

// --- GLOBAL STATE ---
let appState = {
    files: [],       // Metadata for the "My Data" view
    activeData: [],  // The actual rows (Array of Objects)
    columns: [],     // The headers
    fileName: "Untitled"
};

// --- 1. INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
    checkBackendHealth();
    setInterval(checkBackendHealth, 5000);
});

async function checkBackendHealth() {
    try {
        const res = await fetch(`${API_URL}/`);
        if (res.ok) {
            if(!isBackendOnline) addAiMsg("System connected to Python Neural Engine.");
            isBackendOnline = true;
            updateStatus("online");
        }
    } catch (e) {
        isBackendOnline = false;
        updateStatus("offline");
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
    // Hide all
    document.querySelectorAll('.view').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.menu-btn').forEach(el => el.classList.remove('active'));
    
    // Show target
    document.getElementById(viewId).style.display = 'block';
    
    // Update Menu
    const btnMap = { 'import-view': 0, 'storage-view': 1, 'workspace-view': 2, 'viz-view': 3 };
    const btns = document.querySelectorAll('.menu-btn');
    if (btns[btnMap[viewId]]) btns[btnMap[viewId]].classList.add('active');

    // Trigger renders
    if (viewId === 'storage-view') renderFileList();
    if (viewId === 'workspace-view') renderGrid(); // Force re-render when entering workspace
}

// --- 3. FILE INGESTION ---
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

    // Prevent Duplicates in File List
    const exists = appState.files.some(f => f.name === file.name);
    if (!exists) {
        appState.files.push({
            name: file.name,
            size: (file.size / 1024).toFixed(1) + ' KB',
            type: file.name.split('.').pop().toUpperCase(),
            rawFile: file // Keep reference for local fallback
        });
        document.getElementById('fileCount').innerText = appState.files.length;
    }

    // PROCESSING LOGIC
    if (isBackendOnline) {
        // --- BACKEND MODE (Preferred) ---
        const formData = new FormData();
        formData.append('file', file);

        try {
            addAiMsg("Sending to Python OCR/Parser...");
            const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
            const json = await res.json();

            if (json.error) {
                addAiMsg(`❌ Python Error: ${json.error}`);
            } else if (json.grid_update) {
                loadIntoState(json.grid_update.data, json.grid_update.columns, file.name);
                addAiMsg("✅ Extraction Complete. Data loaded.");
            }
        } catch (e) {
            addAiMsg(`❌ Upload Failed: ${e.message}`);
        }
    } else {
        // --- LOCAL MODE (Fallback) ---
        if (file.type.startsWith('image/')) {
            alert("⚠️ Image OCR requires the Python Backend to be running!");
            return;
        }
        parseLocalFile(file);
    }
}

// --- 4. CORE STATE MANAGEMENT ---
function loadIntoState(data, columns, fileName) {
    if (!data || data.length === 0) {
        addAiMsg("⚠️ Warning: Extracted dataset is empty.");
        return;
    }

    appState.activeData = data;
    appState.columns = columns;
    appState.fileName = fileName;

    // Enable Buttons
    document.getElementById('processBtn').disabled = false;
    document.getElementById('vizBtn').disabled = false;
    
    // Update Header
    document.getElementById('activeFileName').innerText = fileName;
    document.getElementById('rowCount').innerText = `${data.length} rows`;

    // Auto-switch to workspace
    switchView('workspace-view');
}

// Local Parser (SheetJS)
function parseLocalFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(sheet, {header: 1}); // Array of Arrays

        if (json.length > 0) {
            const cols = json[0].map(c => String(c)); // Force string headers
            // Convert Array-of-Arrays to Array-of-Objects to match Python format
            const rows = json.slice(1).map(row => {
                let obj = {};
                cols.forEach((col, i) => obj[col] = row[i] || "");
                return obj;
            });
            loadIntoState(rows, cols, file.name);
        }
    };
    reader.readAsArrayBuffer(file);
}

// --- 5. GRID RENDERER (The Fix) ---
function renderGrid() {
    const thead = document.querySelector('#dataTable thead');
    const tbody = document.querySelector('#dataTable tbody');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    const cols = appState.columns;
    const rows = appState.activeData;

    if (!cols || cols.length === 0) return;

    // 1. HEADERS
    let headerRow = '<tr><th class="row-num">#</th>';
    cols.forEach(col => {
        headerRow += `<th>${col}</th>`;
    });
    headerRow += '</tr>';
    thead.innerHTML = headerRow;

    // 2. BODY (Virtualized/Limited for performance)
    const limit = 1000; 
    let bodyHtml = '';

    rows.slice(0, limit).forEach((row, i) => {
        bodyHtml += `<tr><td class="row-num">${i + 1}</td>`;
        cols.forEach(col => {
            // Safe Access: row[col] handles dictionary format from Python
            let val = row[col]; 
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
        // IMPORTANT: Clicking card re-loads that specific file
        card.onclick = () => {
            if(f.rawFile) parseLocalFile(f.rawFile); // Reload local
            else addAiMsg("⚠️ Please re-upload to view (Session storage limitation).");
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

    // UI Update
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
            if (data.grid_update) {
                loadIntoState(data.grid_update.data, data.grid_update.columns, appState.fileName);
            }
        })
        .catch(err => addAiMsg("❌ Backend Error"));
    } else {
        setTimeout(() => addAiMsg("I am running locally. Connect Python backend for full AI capabilities."), 500);
    }
}

// --- 8. MATH & AUTO CLEAN ---
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
        // Simple Local Clean
        addAiMsg("Running local auto-clean...");
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
