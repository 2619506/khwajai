/* ============================================================
   Khwaja AI - Data Forge Engine (v3.0 - Hybrid AI)
   Connects HTML Frontend to Python FastAPI Backend
   ============================================================ */

const API_URL = "http://localhost:8000";
let isBackendOnline = false;

// --- STATE ---
let appState = {
    files: [],
    activeData: [],
    columns: [],
    fileName: "Untitled"
};

// --- 1. INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
    checkBackendHealth();
    setInterval(checkBackendHealth, 5000); // Check connection every 5s
});

async function checkBackendHealth() {
    try {
        const res = await fetch(`${API_URL}/`);
        if (res.ok) {
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

// --- 2. VIEW NAVIGATION ---
function switchView(viewId) {
    document.querySelectorAll('.view').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.menu-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(viewId).style.display = 'block';
    
    // Highlight button
    const btnMap = { 'import-view': 0, 'storage-view': 1, 'workspace-view': 2, 'viz-view': 3 };
    const btns = document.querySelectorAll('.menu-btn');
    if (btns[btnMap[viewId]]) btns[btnMap[viewId]].classList.add('active');

    if (viewId === 'storage-view') renderFileList();
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
    const file = fileList[0];
    if (!file) return;

    // UI Feedback
    addAiMsg(`Processing <strong>${file.name}</strong>...`);
    
    // DECISION: Local or Backend?
    const isImage = file.type.startsWith('image/');
    
    if (isBackendOnline) {
        // --- PATH A: SEND TO PYTHON (OCR & AI) ---
        addAiMsg("🚀 Sending to Python Engine for intelligent extraction...");
        
        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch(`${API_URL}/upload`, {
                method: 'POST',
                body: formData
            });
            const result = await response.json();

            if (result.error) {
                addAiMsg(`❌ Server Error: ${result.error}`);
            } else if (result.grid_update) {
                // SUCCESS: Python returns structured data
                loadDataFromBackend(result.grid_update, file.name);
                addAiMsg("✅ Data extracted and structured successfully.");
            }
        } catch (err) {
            addAiMsg(`❌ Connection Failed: ${err.message}`);
        }

    } else {
        // --- PATH B: LOCAL FALLBACK (CSV/Excel Only) ---
        if (isImage) {
            alert("⚠️ Image OCR requires Python Backend. Please run 'backend.py'.");
            return;
        }
        addAiMsg("⚠️ Python Offline. Using Local Parsing.");
        parseLocalFile(file);
    }
}

// --- 4. DATA LOADING & RENDERING ---

// Load data formatted by Python Backend
function loadDataFromBackend(gridPayload, name) {
    appState.columns = gridPayload.columns;
    appState.activeData = gridPayload.data; // Array of dicts: [{'Col1': Val, 'Col2': Val}...]
    appState.fileName = name;

    finalizeLoad();
}

// Fallback: Parse CSV/Excel locally
function parseLocalFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        
        // Raw JSON (Array of Arrays)
        const raw = XLSX.utils.sheet_to_json(sheet, {header: 1});
        
        if (raw.length > 0) {
            appState.columns = raw[0]; // First row as header
            // Convert rest to objects for consistency with backend format
            appState.activeData = raw.slice(1).map(row => {
                let obj = {};
                raw[0].forEach((col, i) => obj[col] = row[i] || "");
                return obj;
            });
            appState.fileName = file.name;
            finalizeLoad();
        }
    };
    reader.readAsArrayBuffer(file);
}

function finalizeLoad() {
    // 1. Add to File List (Visual only)
    appState.files.push({
        name: appState.fileName,
        rows: appState.activeData.length,
        cols: appState.columns.length
    });
    document.getElementById('fileCount').innerText = appState.files.length;

    // 2. Render Workspace
    renderGrid();
    
    // 3. Enable UI
    document.getElementById('activeFileName').innerText = appState.fileName;
    document.getElementById('rowCount').innerText = `${appState.activeData.length} rows`;
    document.getElementById('processBtn').disabled = false;
    document.getElementById('vizBtn').disabled = false;

    switchView('workspace-view');
}

// --- 5. GRID RENDERER (Professional Shape) ---
function renderGrid() {
    const thead = document.querySelector('#dataTable thead');
    const tbody = document.querySelector('#dataTable tbody');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    const cols = appState.columns;
    const rows = appState.activeData;

    if (cols.length === 0) return;

    // HEADER
    let headerRow = '<tr><th class="row-num">#</th>';
    cols.forEach(col => {
        headerRow += `<th>${col}</th>`;
    });
    headerRow += '</tr>';
    thead.innerHTML = headerRow;

    // BODY (Limit render for performance)
    const renderLimit = 1000;
    let bodyHtml = '';

    rows.slice(0, renderLimit).forEach((rowObj, index) => {
        bodyHtml += `<tr><td class="row-num">${index + 1}</td>`;
        cols.forEach(col => {
            const val = rowObj[col] !== undefined ? rowObj[col] : "";
            // Check if value is number for styling
            const isNum = !isNaN(parseFloat(val)) && isFinite(val);
            const alignStyle = isNum ? 'style="text-align:right; color:#a7f3d0;"' : '';
            
            bodyHtml += `<td ${alignStyle} onclick="selectCell(this, '${val}')">${val}</td>`;
        });
        bodyHtml += '</tr>';
    });
    tbody.innerHTML = bodyHtml;
}

// --- 6. UTILS (Storage View) ---
function renderFileList() {
    const list = document.getElementById('fileList');
    list.innerHTML = '';
    if (appState.files.length === 0) {
        list.innerHTML = `<div class="empty-state"><p>No data loaded.</p></div>`;
        return;
    }
    appState.files.forEach(f => {
        const card = document.createElement('div');
        card.className = 'file-card';
        card.innerHTML = `
            <div class="file-icon"><i class="fas fa-table"></i></div>
            <div class="file-info">
                <h4>${f.name}</h4>
                <span>${f.rows} Rows • ${f.cols} Cols</span>
            </div>
        `;
        card.onclick = () => {
            // In a real app, we would fetch specific file data again.
            // Here we assume the last loaded is active for simplicity.
            switchView('workspace-view');
        };
        list.appendChild(card);
    });
}

// --- 7. AI ASSISTANT ---
function addAiMsg(html) {
    const chat = document.getElementById('chatHistory');
    const div = document.createElement('div');
    div.className = 'msg ai';
    div.innerHTML = html;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

function handleChat() {
    const input = document.getElementById('userQuery');
    const text = input.value;
    if(!text) return;

    // Show User Msg
    const chat = document.getElementById('chatHistory');
    chat.innerHTML += `<div class="msg user">${text}</div>`;
    input.value = '';

    // Send to Backend Logic
    if(isBackendOnline) {
        // Future: Implement chat endpoint in backend.py
        setTimeout(() => addAiMsg("Analyzing grid context... (Backend connected)"), 600);
    } else {
        setTimeout(() => addAiMsg("I am running locally. Start Python backend for deep analysis."), 600);
    }
}

// --- 8. MATH STATS ---
let selection = [];
function selectCell(el, val) {
    el.classList.toggle('selected');
    const num = parseFloat(val);
    if (!isNaN(num)) {
        if (el.classList.contains('selected')) selection.push(num);
        else {
            const idx = selection.indexOf(num);
            if (idx > -1) selection.splice(idx, 1);
        }
    }
    updateStats();
}

function updateStats() {
    const sum = selection.reduce((a, b) => a + b, 0);
    const avg = selection.length ? (sum / selection.length).toFixed(2) : 0;
    
    document.getElementById('selCount').innerText = selection.length;
    document.getElementById('selSum').innerText = sum.toLocaleString();
    document.getElementById('selAvg').innerText = avg;
}
