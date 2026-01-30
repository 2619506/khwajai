/* ============================================================
   Khwaja AI - Data Forge Engine (v2.0)
   Replicates the functionality of BUSnX (App.tsx)
   ============================================================ */

// --- GLOBAL STATE ---
let appState = {
    files: [],       // Stores file metadata
    activeData: [],  // Current JSON data (Array of Objects)
    columns: [],     // Current column headers
    fileName: "",    // Current filename
    selection: []    // Array of selected cell values
};

// --- 1. INITIALIZATION & NAVIGATION ---
function switchView(viewId) {
    document.querySelectorAll('.view').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.menu-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(viewId).style.display = 'block';
    
    // Auto-highlight button logic
    const btnIndex = ['import-view', 'storage-view', 'workspace-view', 'viz-view'].indexOf(viewId);
    if(btnIndex >= 0) document.querySelectorAll('.menu-btn')[btnIndex].classList.add('active');

    if(viewId === 'storage-view') renderFileList();
    if(viewId === 'viz-view') renderChart();
}

// --- 2. FILE INGESTION (Drop & Click) ---
const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');

dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.style.borderColor = '#4ade80'; });
dropZone.addEventListener('dragleave', (e) => { e.preventDefault(); dropZone.style.borderColor = '#1e293b'; });
dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = '#1e293b';
    processFiles(e.dataTransfer.files);
});

fileInput.addEventListener('change', (e) => processFiles(e.target.files));

function processFiles(fileList) {
    Array.from(fileList).forEach(file => {
        // We just store the FILE OBJECT now. We parse it when "Opened".
        appState.files.push({
            id: Date.now() + Math.random(),
            fileObj: file,
            name: file.name,
            size: (file.size/1024).toFixed(1) + ' KB',
            type: file.name.split('.').pop().toUpperCase()
        });
    });
    
    updateFileCount();
    switchView('storage-view');
    addAiMsg(`Ingested ${fileList.length} files. Open them in "My Data".`);
}

function updateFileCount() {
    document.getElementById('fileCount').innerText = appState.files.length;
}

// --- 3. STORAGE VIEW (File Listing) ---
function renderFileList() {
    const list = document.getElementById('fileList');
    list.innerHTML = '';
    
    if (appState.files.length === 0) {
        list.innerHTML = `<div class="empty-state" style="text-align:center; color:#666; margin-top:50px;"><p>No files found.</p></div>`;
        return;
    }

    appState.files.forEach(f => {
        const card = document.createElement('div');
        card.className = 'file-card';
        card.onclick = () => loadFile(f);
        card.innerHTML = `
            <div class="file-icon"><i class="fas fa-file-csv"></i></div>
            <div class="file-info">
                <h4>${f.name}</h4>
                <span>${f.type} • ${f.size}</span>
            </div>
        `;
        list.appendChild(card);
    });
}

// --- 4. CORE: PARSING & WORKSPACE ---
function loadFile(fileData) {
    const reader = new FileReader();
    
    reader.onload = (e) => {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, {type: 'array'});
        
        // Get first sheet
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        
        // Parse to JSON (Header: 1 means array of arrays)
        const jsonData = XLSX.utils.sheet_to_json(sheet, {header: 1});
        
        if(jsonData.length === 0) { alert("Empty file!"); return; }

        appState.activeData = jsonData; // Full data (Rows + Header)
        appState.columns = jsonData[0]; // First row is header
        appState.fileName = fileData.name;

        renderGrid();
        
        // Enable tabs
        document.getElementById('processBtn').disabled = false;
        document.getElementById('vizBtn').disabled = false;
        
        // Update UI
        document.getElementById('activeFileName').innerText = fileData.name;
        document.getElementById('rowCount').innerText = `${jsonData.length - 1} rows`; // minus header
        
        switchView('workspace-view');
        addAiMsg(`Loaded <strong>${fileData.name}</strong> into Workspace.`);
    };
    
    reader.readAsArrayBuffer(fileData.fileObj);
}

function renderGrid() {
    const thead = document.querySelector('#dataTable thead');
    const tbody = document.querySelector('#dataTable tbody');
    thead.innerHTML = '';
    tbody.innerHTML = '';

    const data = appState.activeData;
    if(!data || data.length === 0) return;

    // 1. Render Headers
    let headerHtml = '<tr><th class="row-num">#</th>'; // Add Row Index Column
    data[0].forEach((col, idx) => {
        headerHtml += `<th onclick="selectColumn(${idx})">${col || `Col ${idx}`}</th>`;
    });
    headerHtml += '</tr>';
    thead.innerHTML = headerHtml;

    // 2. Render Rows (Lazy load logic could go here, for now rendering first 500)
    const previewLimit = 500; 
    let bodyHtml = '';
    
    for (let i = 1; i < Math.min(data.length, previewLimit); i++) {
        const row = data[i];
        bodyHtml += `<tr><td class="row-num">${i}</td>`;
        
        // Ensure row aligns with headers
        for(let j = 0; j < data[0].length; j++) {
            const val = row[j] !== undefined ? row[j] : "";
            // Add onclick for cell selection
            bodyHtml += `<td onclick="selectCell(this, '${val}')" class="grid-cell">${val}</td>`;
        }
        bodyHtml += '</tr>';
    }
    tbody.innerHTML = bodyHtml;
}

// --- 5. CELL SELECTION & MATH LOGIC ---
function selectCell(cell, value) {
    // Basic single/multi select logic simulation
    // For simplicity: toggle selection class
    if(cell.classList.contains('selected')) {
        cell.classList.remove('selected');
        // Remove from selection array
        const index = appState.selection.indexOf(value);
        if (index > -1) appState.selection.splice(index, 1);
    } else {
        cell.classList.add('selected');
        appState.selection.push(value);
    }
    calculateStats();
}

function calculateStats() {
    const vals = appState.selection;
    const count = vals.length;
    let sum = 0;
    let numCount = 0;

    vals.forEach(v => {
        const n = parseFloat(v);
        if(!isNaN(n)) {
            sum += n;
            numCount++;
        }
    });

    const avg = numCount > 0 ? (sum / numCount).toFixed(2) : 0;

    document.getElementById('selCount').innerText = count;
    document.getElementById('selSum').innerText = sum.toFixed(2);
    document.getElementById('selAvg').innerText = avg;
}

// --- 6. AUTO CLEAN & EXPORT ---
function runAutoClean() {
    addAiMsg("Analyzing data integrity...");
    // Simulation: Remove empty rows
    const originalLen = appState.activeData.length;
    appState.activeData = appState.activeData.filter(row => row.length > 0 && row.some(cell => cell !== ""));
    const newLen = appState.activeData.length;
    
    renderGrid();
    addAiMsg(`Cleaned dataset. Removed ${originalLen - newLen} empty rows.`);
}

function exportCurrentData() {
    const ws = XLSX.utils.aoa_to_sheet(appState.activeData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
    XLSX.writeFile(wb, `Cleaned_${appState.fileName}`);
    addAiMsg("File exported successfully.");
}

// --- 7. VISUALIZATION (Chart.js) ---
function renderChart() {
    const ctx = document.getElementById('mainChart').getContext('2d');
    
    // Auto-detect numeric column
    const data = appState.activeData;
    if(data.length < 2) return;

    let labelCol = 0;
    let valueCol = -1;

    // Find first numeric column
    for(let j=0; j<data[1].length; j++) {
        if(!isNaN(parseFloat(data[1][j]))) {
            valueCol = j;
            break;
        }
    }

    if(valueCol === -1) { 
        addAiMsg("Could not find numeric data to visualize."); 
        return; 
    }

    const labels = data.slice(1, 15).map(row => row[labelCol]); // Top 15 rows
    const values = data.slice(1, 15).map(row => parseFloat(row[valueCol]));

    if(window.myChart) window.myChart.destroy(); // Destroy old chart

    window.myChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: data[0][valueCol],
                data: values,
                backgroundColor: '#4ade80',
                borderColor: '#4ade80',
                borderWidth: 1
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: { beginAtZero: true, grid: { color: '#333' } },
                x: { grid: { color: '#333' } }
            },
            plugins: {
                legend: { labels: { color: '#fff' } }
            }
        }
    });
}

// --- 8. AI CHAT ---
function addAiMsg(text) {
    const chat = document.getElementById('chatHistory');
    const div = document.createElement('div');
    div.className = 'msg ai';
    div.innerHTML = text;
    chat.appendChild(div);
    chat.scrollTop = chat.scrollHeight;
}

function handleChat() {
    const input = document.getElementById('userQuery');
    const txt = input.value;
    if(!txt) return;
    
    // User msg
    const chat = document.getElementById('chatHistory');
    chat.innerHTML += `<div class="msg user">${txt}</div>`;
    input.value = '';

    // Simple keyword logic for demo
    setTimeout(() => {
        if(txt.toLowerCase().includes('clean')) {
            runAutoClean();
            addAiMsg("I've triggered the Auto-Clean protocol.");
        } else if (txt.toLowerCase().includes('count')) {
            addAiMsg(`This dataset has ${appState.activeData.length - 1} data rows.`);
        } else {
            addAiMsg("I'm analyzing the data context... (Connect Python backend for deep insight)");
        }
    }, 600);
}
