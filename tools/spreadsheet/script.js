/* ============================================================
   Khwaja AI - Data Forge Engine (v5.0 - Connected)
   ============================================================ */

// ⬇️ IMPORTANT: THIS CONNECTS TO YOUR RENDER CLOUD ⬇️
const API_URL = "[https://khwaja-ai-backend.onrender.com](https://khwaja-ai-backend.onrender.com)";
let isBackendOnline = false;

// --- GLOBAL STATE ---
let appState = {
    files: [],
    activeData: [],
    columns: [],
    fileName: "Untitled"
};

// --- INITIALIZATION ---
document.addEventListener("DOMContentLoaded", () => {
    checkBackendHealth();
    setInterval(checkBackendHealth, 5000); 
});

async function checkBackendHealth() {
    try {
        const res = await fetch(`${API_URL}/`);
        if (res.ok) {
            if(!isBackendOnline) {
                isBackendOnline = true;
                updateStatus("online");
                // Fetch existing data if any
                fetchGridState();
            }
        }
    } catch (e) {
        isBackendOnline = false;
        updateStatus("offline");
    }
}

async function fetchGridState() {
    try {
        const res = await fetch(`${API_URL}/grid`);
        const json = await res.json();
        if (json.data && json.data.length > 0) {
            appState.activeData = json.data;
            appState.columns = json.columns;
            renderGrid();
            document.getElementById('rowCount').innerText = `${json.data.length} rows`;
        }
    } catch(e) { console.log("Sync error", e); }
}

function updateStatus(status) {
    const el = document.querySelector('.connection-status');
    if (status === 'online') {
        el.innerHTML = '<span class="dot pulse" style="background:#4ade80"></span> Engine: <strong>Online (Cloud)</strong>';
    } else {
        el.innerHTML = '<span class="dot" style="background:#ef4444"></span> Engine: <strong>Offline</strong>';
    }
}

// --- FILE UPLOAD ---
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

    // Prevent Duplicates in List
    const exists = appState.files.some(f => f.name === file.name);
    if (!exists) {
        appState.files.push({
            name: file.name,
            size: (file.size / 1024).toFixed(1) + ' KB',
            type: file.name.split('.').pop().toUpperCase()
        });
        document.getElementById('fileCount').innerText = appState.files.length;
        renderFileList();
    }

    if (isBackendOnline) {
        const formData = new FormData();
        formData.append('file', file);

        try {
            addAiMsg("🚀 Uploading to Cloud Engine...");
            const res = await fetch(`${API_URL}/upload`, { method: 'POST', body: formData });
            const json = await res.json();

            if (json.error) {
                addAiMsg(`❌ Error: ${json.error}`);
            } else if (json.grid_update) {
                appState.activeData = json.grid_update.data;
                appState.columns = json.grid_update.columns;
                appState.fileName = file.name;
                
                finalizeLoad();
                addAiMsg("✅ Data extracted & loaded.");
            }
        } catch (e) {
            addAiMsg(`❌ Connection Failed: ${e.message}`);
        }
    } else {
        if (file.type.startsWith('image/')) {
            alert("⚠️ Cloud Engine Offline! Cannot process images.");
            return;
        }
        // Local Parse fallback (omitted for brevity, assume cloud works)
    }
}

function finalizeLoad() {
    switchView('workspace-view');
    renderGrid();
    document.getElementById('activeFileName').innerText = appState.fileName;
    document.getElementById('rowCount').innerText = `${appState.activeData.length} rows`;
}

// --- RENDERERS ---
function renderGrid() {
    const thead = document.querySelector('#dataTable thead');
    const tbody = document.querySelector('#dataTable tbody');
    thead.innerHTML = ''; tbody.innerHTML = '';

    const cols = appState.columns;
    const rows = appState.activeData;

    if (!cols || cols.length === 0) return;

    let headerRow = '<tr><th class="row-num">#</th>';
    cols.forEach(col => headerRow += `<th>${col}</th>`);
    headerRow += '</tr>';
    thead.innerHTML = headerRow;

    const limit = 500; 
    let bodyHtml = '';
    rows.slice(0, limit).forEach((rowObj, i) => {
        bodyHtml += `<tr><td class="row-num">${i + 1}</td>`;
        cols.forEach(col => {
            let val = rowObj[col] !== undefined ? rowObj[col] : "";
            const isNum = !isNaN(parseFloat(val)) && isFinite(val);
            const style = isNum ? 'style="text-align:right; color:#a7f3d0;"' : '';
            bodyHtml += `<td ${style}>${val}</td>`;
        });
        bodyHtml += '</tr>';
    });
    tbody.innerHTML = bodyHtml;
}

function renderFileList() {
    const list = document.getElementById('fileList');
    list.innerHTML = '';
    appState.files.forEach(f => {
        const card = document.createElement('div');
        card.className = 'file-card';
        card.onclick = () => switchView('workspace-view');
        card.innerHTML = `<div class="file-icon"><i class="fas fa-table"></i></div>
                          <div class="file-info"><h4>${f.name}</h4><span>${f.type}</span></div>`;
        list.appendChild(card);
    });
}

function switchView(viewId) {
    document.querySelectorAll('.view').forEach(el => el.style.display = 'none');
    document.getElementById(viewId).style.display = 'block';
    if(viewId === 'workspace-view') renderGrid();
}

function addAiMsg(html) {
    const chat = document.getElementById('chatHistory');
    chat.innerHTML += `<div class="msg ai">${html}</div>`;
    chat.scrollTop = chat.scrollHeight;
}
