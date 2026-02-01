/* ============================================================
   BUSnX Logic V38 (Web Ready & Console Hygiene)
   ============================================================ */

// 🔥 FIX: Dynamic API URL for Web/Local Support
const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' 
    ? "http://localhost:8000" 
    : window.location.origin;

// 🔥 FIX: Silence Extension Errors
window.addEventListener('error', function(e) {
    if (e.message.includes('chrome-extension') || e.message.includes('tooltip')) {
        e.stopImmediatePropagation();
        e.preventDefault();
        return true;
    }
}, true);

let appState = {
    gridData: [], columns: [], sheets: [], activeSheet: "Sheet 1",
    selection: { start: null, end: null, active: false },
    isDragging: false, uploadMode: 'replace', rowsCount: 50,
    sheetToClose: null, warehouseViewMode: 'grid',
    history: [], colWidths: [], targetSheet: null
};

document.addEventListener("DOMContentLoaded", () => {
    fetchState();
    setupGlobalEvents();
});

// --- 1. STATE & STORAGE ---
async function fetchState() {
    try {
        const res = await fetch(`${API_URL}/grid`);
        const data = await res.json();
        
        if (!data.storage_configured) {
            document.getElementById("settings-modal").classList.remove("hidden");
        }

        appState.sheets = data.sheets || ["Sheet 1"];
        appState.activeSheet = data.active || "Sheet 1";
        appState.colWidths = data.columns.map(() => 120); 
        renderTabs();
        initGrid(data.data, data.columns);
        sendToAI(true); // Handshake
    } catch(e) { console.error("Init Error", e); }
}

async function configureStorage(mode) {
    let path = "BROWSER_DOWNLOAD";
    if (mode === 'path') path = document.getElementById("storage-path").value;
    
    const fd = new FormData(); fd.append("path", path);
    const res = await fetch(`${API_URL}/config/set_path`, {method:"POST", body:fd});
    const d = await res.json();
    if (d.success) {
        document.getElementById("settings-modal").classList.add("hidden");
        refreshWarehouse();
    } else {
        document.getElementById("config-status").innerText = d.message;
    }
}

// --- 2. GRID & LAYOUT FIX ---
function initGrid(data = null, columns = null) {
    const container = document.getElementById("spreadsheet"); container.innerHTML = "";
    
    // 🔥 FIX: Force fresh layout calc on new data
    if (columns) {
        appState.columns = columns;
        if (appState.colWidths.length !== columns.length) {
            appState.colWidths = columns.map(() => 120);
        }
    }
    
    const cols = appState.columns;
    if (data) { appState.gridData = data; appState.rowsCount = data.length; }
    else if (!appState.gridData.length) {
        appState.gridData = Array.from({length: 50}, () => { let row={}; cols.forEach(c=>row[c]=""); return row; });
    }
    
    const gridTemplate = `40px ` + appState.colWidths.map(w => `${w}px`).join(" ");
    container.style.gridTemplateColumns = gridTemplate;

    createCell(container, "corner", '<i class="fa-solid fa-table-cells"></i>', selectAll);
    cols.forEach((col, i) => {
        const h = document.createElement("div"); h.className = "header"; h.innerText = col;
        h.onclick = (e) => selectColumn(i, e);
        const resizer = document.createElement("div"); resizer.className = "resizer";
        resizer.addEventListener("mousedown", (e) => initResize(e, i));
        resizer.addEventListener("dblclick", (e) => autoFitColumn(i));
        h.appendChild(resizer); container.appendChild(h);
    });

    appState.gridData.forEach((row, r) => {
        createCell(container, "header", r + 1, () => selectRow(r));
        cols.forEach((col, c) => {
            const cell = document.createElement("div");
            cell.className = "cell"; cell.contentEditable = true;
            cell.innerText = row[col] || "";
            cell.dataset.r = r; cell.dataset.c = c;
            cell.onkeydown = (e) => { if(e.key==="Enter" && !e.shiftKey) { e.preventDefault(); cell.blur(); }};
            cell.onmousedown = (e) => startSelect(e, r, c);
            cell.onmouseenter = (e) => updateSelect(e, r, c);
            cell.onmouseup = endSelect;
            cell.oncontextmenu = (e) => showContext(e, r, c);
            cell.onblur = () => handleUpdate(cell, r, col);
            if(String(row[col]).includes("TOTAL")) cell.style.fontWeight = "bold";
            container.appendChild(cell);
        });
    });
}

// --- 3. CORE LOGIC (Preserved from V36/37) ---
let startX, startWidth, resizeColIndex;
function initResize(e, colIndex) { e.stopPropagation(); startX=e.clientX; startWidth=appState.colWidths[colIndex]; resizeColIndex=colIndex; document.addEventListener("mousemove", doResize); document.addEventListener("mouseup", stopResize); }
function doResize(e) { const newWidth=startWidth+(e.clientX-startX); if (newWidth>30) { appState.colWidths[resizeColIndex]=newWidth; document.getElementById("spreadsheet").style.gridTemplateColumns=`40px `+appState.colWidths.map(w=>`${w}px`).join(" "); } }
function stopResize() { document.removeEventListener("mousemove", doResize); document.removeEventListener("mouseup", stopResize); }
function autoFitColumn(colIndex) { const colName=appState.columns[colIndex]; let maxLen=colName.length*10; appState.gridData.forEach(row=>{ const val=row[colName]||""; const len=val.toString().length*8; if(len>maxLen)maxLen=len; }); appState.colWidths[colIndex]=Math.min(Math.max(maxLen+20,50),400); initGrid(appState.gridData, appState.columns); }

function executeAIAction(text) {
    if (text.includes("<<ACTION:VIEW_GRID>>")) toggleView('grid');
    if (text.includes("<<ACTION:VIEW_WAREHOUSE>>")) toggleView('warehouse');
    if (text.includes("<<ACTION:CLEAN>>")) triggerCleanup();
    return text.replace(/<<ACTION:.*?>>/g, "");
}

async function commitToSource(){ 
    const name=prompt("Save as:", `${appState.activeSheet}_Final`); if(!name)return; 
    const fd=new FormData(); fd.append("filename",name); 
    const res=await fetch(`${API_URL}/commit`,{method:"POST",body:fd}); 
    const d=await res.json(); 
    if(d.download) {
        const blob = new Blob([d.data], {type: 'text/csv'});
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href=url; a.download=`${name}.csv`; a.click();
    } else { alert(d.message); }
}

async function resetGrid(){ if(confirm("Clear?")) { saveState(); await fetch(`${API_URL}/reset`,{method:"POST"}); fetchState(); } }
async function triggerCleanup(){ saveState(); document.getElementById("btn-clean").innerHTML='...'; const res=await fetch(`${API_URL}/cleanup`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({grid:appState.gridData})}); const d=await res.json(); if(d.grid_update) initGrid(d.grid_update.data, d.grid_update.columns); document.getElementById("btn-clean").innerHTML='AI Clean'; }
function handleFile(file){ if(!file)return; saveState(); const fd=new FormData(); fd.append("file",file); fd.append("mode",appState.uploadMode); addChat("system", `📂 Loading ${file.name}...`); fetch(`${API_URL}/upload`,{method:"POST",body:fd}).then(r=>r.json()).then(d=>{ if(d.grid_update) { initGrid(d.grid_update.data, d.grid_update.columns); addChat("system", "✅ Done."); } else addChat("system", "❌ Error."); }); }
function sendToAI(silent=false){ 
    if(silent) { fetch(`${API_URL}/chat`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:"Session Restore"})}); return; }
    const v=document.getElementById("ai-input").value.trim(); if(!v)return; addChat("user",v); document.getElementById("ai-input").value=""; 
    fetch(`${API_URL}/chat`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({message:v})}).then(r=>r.json()).then(d=>{ const c=executeAIAction(d.response); addChat("ai",c); if(d.grid_update) { saveState(); initGrid(d.grid_update.data, d.grid_update.columns); } }); 
}
function addChat(r,t){ const box=document.getElementById("chat-box"); let h=""; if(r==='ai'){ const tm=t.match(/THINKING:([\s\S]*?)FINAL ANSWER:/), am=t.match(/FINAL ANSWER:([\s\S]*)/); if(tm&&am) h=`<div class="message system-message"><div class="avatar"><i class="fa-solid fa-robot"></i></div><div class="bubble"><details class="thinking-box"><summary>Show Thinking</summary><div class="thinking-content">${formatCode(tm[1].trim())}</div></details><div class="final-answer">${formatCode(am[1].trim())}</div></div></div>`; else h=`<div class="message system-message"><div class="avatar"><i class="fa-solid fa-robot"></i></div><div class="bubble">${formatCode(t)}</div></div>`; } else h=`<div class="message user-message"><div class="bubble">${t}</div></div>`; box.innerHTML+=h; box.scrollTop=box.scrollHeight; }
function formatCode(t){ return t.replace(/```python([\s\S]*?)```/g,"<pre><code>$1</code></pre>").replace(/\n/g,"<br>"); }
function saveState(){ if(appState.gridData.length) { appState.history.push(JSON.parse(JSON.stringify(appState.gridData))); if(appState.history.length>10) appState.history.shift(); } }
async function undo(){ if(appState.history.length===0)return; appState.gridData=appState.history.pop(); initGrid(appState.gridData,appState.columns); syncBackend(); }
function syncBackend(){ fetch(`${API_URL}/sync`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({grid:appState.gridData})}); }
function exportExcel(){ const ws=XLSX.utils.json_to_sheet(appState.gridData); const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,ws,appState.activeSheet); XLSX.writeFile(wb,`${appState.activeSheet}.xlsx`); }

// --- WAREHOUSE OPS & TABS (Standard) ---
async function deleteWarehouseItem(e, f) { e.stopPropagation(); if (!confirm("Delete?")) return; const fd = new FormData(); fd.append("filename", f); await fetch(`${API_URL}/warehouse/delete`, {method:"POST", body:fd}); refreshWarehouse(); }
async function renameWarehouseItem(e, f) { e.stopPropagation(); const n = prompt("Rename:", f.replace(".csv", "")); if (n && n!==f) { const fd = new FormData(); fd.append("old_name", f); fd.append("new_name", n); await fetch(`${API_URL}/warehouse/rename`, {method:"POST", body:fd}); refreshWarehouse(); } }
async function duplicateWarehouseItem(e, f) { e.stopPropagation(); const fd = new FormData(); fd.append("filename", f); await fetch(`${API_URL}/warehouse/duplicate`, {method:"POST", body:fd}); refreshWarehouse(); }
function renderWarehouseItems(files) { const c = document.getElementById("warehouse-grid"); c.innerHTML = ""; c.className = appState.warehouseViewMode === 'list' ? 'warehouse-list' : 'warehouse-grid'; files.forEach(f => { const item = document.createElement("div"); item.className = "data-item"; const acts = `<div class="item-actions"><i class="fa-solid fa-pen" onclick="renameWarehouseItem(event, '${f.name}')"></i><i class="fa-regular fa-copy" onclick="duplicateWarehouseItem(event, '${f.name}')"></i><i class="fa-solid fa-trash danger" onclick="deleteWarehouseItem(event, '${f.name}')"></i></div>`; if (appState.warehouseViewMode === 'grid') item.innerHTML = `<div class="item-icon"><i class="fa-solid fa-table"></i></div><div class="item-info"><div class="item-title">${f.name}</div><div class="item-meta">${f.date}</div></div>${acts}`; else item.innerHTML = `<div class="list-row"><div class="list-col icon"><i class="fa-solid fa-file-csv"></i></div><div class="list-col name">${f.name}</div><div class="list-col date">${f.date}</div><div class="list-col size">${f.size}</div><div class="list-col action">${acts}</div></div>`; item.onclick = () => loadWarehouseFile(f.name); c.appendChild(item); }); }
function renderTabs() { const b = document.getElementById("sheet-tabs"); b.innerHTML = ""; appState.sheets.forEach(s => { const t = document.createElement("div"); t.className = `sheet-tab ${s === appState.activeSheet ? 'active' : ''}`; const sp = document.createElement("span"); sp.innerText = s; sp.onclick = () => switchSheet(s); sp.oncontextmenu = (e) => showTabContext(e, s); const cl = document.createElement("span"); cl.className = "close-tab"; cl.innerHTML = "&times;"; cl.onclick = (e) => { e.stopPropagation(); confirmCloseSheet(s); }; t.appendChild(sp); t.appendChild(cl); b.appendChild(t); }); }
function showTabContext(e, s) { e.preventDefault(); appState.targetSheet = s; const m = document.getElementById("tab-context-menu"); m.style.display="block"; m.style.left=e.pageX+"px"; m.style.top=e.pageY+"px"; document.getElementById("context-menu").style.display="none"; }
async function performTabAction(a) { document.getElementById("tab-context-menu").style.display="none"; const s = appState.targetSheet; if (a === 'rename') { const n = prompt("Rename:", s); if(n && n!==s) { const fd = new FormData(); fd.append("old_name", s); fd.append("new_name", n); await fetch(`${API_URL}/sheet/rename`, {method:"POST", body:fd}); fetchState(); } } if (a === 'duplicate') { const fd = new FormData(); fd.append("name", s); await fetch(`${API_URL}/sheet/duplicate`, {method:"POST", body:fd}); fetchState(); } if (a === 'export') exportExcel(); if (a === 'metadata') { const fd = new FormData(); fd.append("name", s); const res = await fetch(`${API_URL}/sheet/metadata`, {method:"POST", body:fd}); const meta = await res.json(); alert(`Rows: ${meta.rows}\nCols: ${meta.columns}`); } }
function confirmCloseSheet(n) { appState.sheetToClose=n; document.getElementById("close-sheet-name").innerText=n; document.getElementById("close-filename").value=`${n}_Final`; document.getElementById("close-modal").classList.remove("hidden"); }
async function handleCloseAction(a) { const n=appState.sheetToClose; if(a==='save'){ const s=document.getElementById("close-filename").value||`${n}_Final`; const fd=new FormData(); fd.append("filename",s); await fetch(`${API_URL}/commit`,{method:"POST",body:fd}); } if(a!=='cancel'){ const fd=new FormData(); fd.append("name",n); const res=await fetch(`${API_URL}/sheet/delete`,{method:"POST",body:fd}); const d=await res.json(); appState.sheets=d.sheets; appState.activeSheet=d.active; renderTabs(); initGrid(d.data,d.columns); } document.getElementById("close-modal").classList.add("hidden"); }
function toggleView(v) { document.getElementById("view-grid").classList.toggle("hidden",v!=='grid'); document.getElementById("view-warehouse").classList.toggle("hidden",v!=='warehouse'); document.getElementById("btn-nav-grid").classList.toggle("active",v==='grid'); document.getElementById("btn-nav-warehouse").classList.toggle("active",v==='warehouse'); if(v==='warehouse') refreshWarehouse(); }
function setWarehouseView(m) { appState.warehouseViewMode=m; document.getElementById("btn-view-grid").classList.toggle("active",m==='grid'); document.getElementById("btn-view-list").classList.toggle("active",m==='list'); refreshWarehouse(); }
async function refreshWarehouse() { const res=await fetch(`${API_URL}/warehouse`); const d=await res.json(); renderWarehouseItems(d.files); }
async function loadWarehouseFile(f) { const fd=new FormData(); fd.append("filename",f); const res=await fetch(`${API_URL}/sheet/load_warehouse`,{method:"POST",body:fd}); const d=await res.json(); if(d.sheets){ appState.sheets=d.sheets; appState.activeSheet=d.active; toggleView('grid'); renderTabs(); initGrid(d.data,d.columns); } }
async function switchSheet(n) { if(n===appState.activeSheet)return; const fd=new FormData(); fd.append("name",n); const res=await fetch(`${API_URL}/sheet/switch`,{method:"POST",body:fd}); const d=await res.json(); appState.activeSheet=d.active; appState.history=[]; renderTabs(); initGrid(d.data,d.columns); }
async function addSheet() { const n=`Sheet ${appState.sheets.length+1}`; const fd=new FormData(); fd.append("name",n); const res=await fetch(`${API_URL}/sheet/add`,{method:"POST",body:fd}); const d=await res.json(); appState.sheets=d.sheets; appState.activeSheet=d.active; appState.history=[]; renderTabs(); initGrid(d.data,d.columns); }
function performContextAction(a) { hideContext(); const {start}=appState.selection; if(a==='insert-row'&&start){ saveState(); const row={}; appState.columns.forEach(c=>row[c]=""); appState.gridData.splice(start.r,0,row); initGrid(appState.gridData,appState.columns); syncBackend(); } if(a==='delete'&&start){ saveState(); document.querySelectorAll(".selected").forEach(cell=>{ const r=cell.dataset.r,c=cell.dataset.c; appState.gridData[r][appState.columns[c]]=""; cell.innerText=""; }); syncBackend(); } if(a==='undo') undo(); }
async function clipboardAction(a){ hideContext(); const {start,end}=appState.selection; if(!start&&a!=='paste')return; if(a==='copy'||a==='cut'){ let t=""; const rMin=Math.min(start.r,end.r),rMax=Math.max(start.r,end.r),cMin=Math.min(start.c,end.c),cMax=Math.max(start.c,end.c); for(let r=rMin;r<=rMax;r++){ let row=[]; for(let c=cMin;c<=cMax;c++) row.push(appState.gridData[r][appState.columns[c]]); t+=row.join("\t")+"\n"; } try{await navigator.clipboard.writeText(t);}catch(e){} if(a==='cut') { saveState(); syncBackend(); } } if(a==='paste'){ try{ const t=await navigator.clipboard.readText(); const rows=t.split("\n").filter(r=>r); const rStart=start?start.r:0,cStart=start?start.c:0; saveState(); rows.forEach((rowStr,ro)=>{ rowStr.split("\t").forEach((val,co)=>{ const r=rStart+ro,c=cStart+co; if(appState.gridData[r]) appState.gridData[r][appState.columns[c]]=val.trim(); }); }); initGrid(appState.gridData,appState.columns); syncBackend(); }catch{alert("Paste error.");} } }
function createCell(p, c, h, click) { const d=document.createElement("div"); d.className=c; d.innerHTML=h; d.onclick=click; p.appendChild(d); }
function handleUpdate(cell, r, col) { let val = cell.innerText.trim(); if(val !== appState.gridData[r][col]) { saveState(); if(val.startsWith("=")) { try { const exp = val.substring(1).toUpperCase().replace(/[A-Z]\d+/g, m=>{ const cI=m.charCodeAt(0)-65, rI=parseInt(m.substring(1))-1; return appState.gridData[rI]?(parseFloat(appState.gridData[rI][appState.columns[cI]])||0):0; }); if(/^[\d+\-*/().\s]+$/.test(exp)){ cell.innerText=eval(exp); appState.gridData[r][col]=eval(exp); } } catch {} } else { appState.gridData[r][col] = val; } syncBackend(); } }
function startSelect(e,r,c){ if(e.button===2)return; appState.isDragging=true; appState.selection={start:{r,c},end:{r,c},active:true}; renderSelection(); hideContext(); }
function updateSelect(e,r,c){ if(appState.isDragging){ appState.selection.end={r,c}; renderSelection(); }}
function endSelect(){ appState.isDragging=false; calculateStats(); }
function renderSelection(){ document.querySelectorAll(".selected").forEach(e=>e.classList.remove("selected")); const {start,end}=appState.selection; if(!start)return; const rMin=Math.min(start.r,end.r),rMax=Math.max(start.r,end.r),cMin=Math.min(start.c,end.c),cMax=Math.max(start.c,end.c); document.getElementById("sel-range").innerText = `${appState.columns[cMin]}${rMin+1}:${appState.columns[cMax]}${rMax+1}`; for(let r=rMin;r<=rMax;r++) for(let c=cMin;c<=cMax;c++) { const el=document.querySelector(`.cell[data-r='${r}'][data-c='${c}']`); if(el) el.classList.add("selected"); } }
function selectAll(){ appState.selection={start:{r:0,c:0},end:{r:appState.gridData.length-1,c:appState.columns.length-1}}; renderSelection(); calculateStats(); }
function selectRow(r){ appState.selection={start:{r,c:0},end:{r,c:appState.columns.length-1}}; renderSelection(); calculateStats(); }
function selectColumn(i,e){ let startC=i; if(e && e.shiftKey && appState.selection.start) startC=appState.selection.start.c; appState.selection={start:{r:0,c:startC},end:{r:appState.gridData.length-1,c:i}}; renderSelection(); calculateStats(); }
function calculateStats(){ const {start, end} = appState.selection; if(!start) return; let isSummable = true; const colName = appState.columns[start.c] || ""; if(/id|date|ref|year|code|num/i.test(colName)) isSummable = false; let sum=0, count=0, validNums=0; let min=Infinity, max=-Infinity; const rMin=Math.min(start.r,end.r), rMax=Math.max(start.r,end.r); const cMin=Math.min(start.c,end.c), cMax=Math.max(start.c,end.c); for(let r=rMin; r<=rMax; r++) { for(let c=cMin; c<=cMax; c++) { const val = appState.gridData[r]?.[appState.columns[c]]; if(val && val !== "") { count++; let cleanVal = String(val).replace(/,/g,''); if(!isNaN(cleanVal)) { let num = parseFloat(cleanVal); sum += num; validNums++; if(num < min) min = num; if(num > max) max = num; } else { isSummable = false; } } } } const showStat = (id, val) => { const el = document.getElementById(id); el.innerText = val; el.parentElement.style.display = isSummable && validNums > 0 ? "flex" : "none"; }; showStat("stat-sum", sum.toLocaleString()); showStat("stat-avg", validNums ? (sum/validNums).toLocaleString() : "0"); showStat("stat-min", min===Infinity?"-":min); showStat("stat-max", max===-Infinity?"-":max); document.getElementById("stat-count").innerText = count; }
function hideContext(){ document.getElementById("context-menu").style.display="none"; document.getElementById("tab-context-menu").style.display="none"; }
function showContext(e,r,c){ e.preventDefault(); const m=document.getElementById("context-menu"); m.style.display="block"; m.style.left=e.pageX+"px"; m.style.top=e.pageY+"px"; document.getElementById("tab-context-menu").style.display="none"; }

function setupGlobalEvents() {
    document.getElementById("btn-add-sheet").onclick = addSheet; document.getElementById("btn-reset").onclick = resetGrid; document.getElementById("btn-undo").onclick = undo; document.getElementById("btn-commit").onclick = commitToSource;
    document.getElementById("btn-import").onclick = () => { appState.uploadMode='replace'; document.getElementById("up").click(); };
    document.getElementById("btn-append").onclick = () => { appState.uploadMode='append'; document.getElementById("up").click(); };
    document.getElementById("up").onchange = (e) => handleFile(e.target.files[0]);
    document.getElementById("btn-export").onclick = exportExcel; document.getElementById("btn-clean").onclick = triggerCleanup;
    document.getElementById("send-btn").onclick = () => sendToAI(false); document.getElementById("ai-input").onkeydown = (e) => { if(e.key==="Enter"&&!e.shiftKey){ e.preventDefault(); sendToAI(false); }};
    document.getElementById("ctx-insert-row").onclick = () => performContextAction('insert-row'); document.getElementById("ctx-delete").onclick = () => performContextAction('delete'); document.getElementById("ctx-undo").onclick = () => performContextAction('undo'); document.getElementById("ctx-copy").onclick = () => clipboardAction("copy"); document.getElementById("ctx-paste").onclick = () => clipboardAction("paste"); document.getElementById("ctx-cut").onclick = () => clipboardAction("cut");
    document.getElementById("ctx-tab-rename").onclick = () => performTabAction('rename'); document.getElementById("ctx-tab-duplicate").onclick = () => performTabAction('duplicate'); document.getElementById("ctx-tab-export").onclick = () => performTabAction('export'); document.getElementById("ctx-tab-meta").onclick = () => performTabAction('metadata');
    document.getElementById("btn-nav-grid").onclick = () => toggleView('grid'); document.getElementById("btn-nav-warehouse").onclick = () => toggleView('warehouse'); document.getElementById("btn-nav-settings").onclick = () => document.getElementById("settings-modal").classList.remove("hidden");
    document.getElementById("btn-view-grid").onclick = () => setWarehouseView('grid'); document.getElementById("btn-view-list").onclick = () => setWarehouseView('list'); document.getElementById("btn-refresh-wh").onclick = refreshWarehouse;
    document.getElementById("btn-modal-save").onclick = () => handleCloseAction('save'); document.getElementById("btn-modal-discard").onclick = () => handleCloseAction('discard'); document.getElementById("btn-modal-cancel").onclick = () => handleCloseAction('cancel');
    document.getElementById("btn-save-config").onclick = () => configureStorage('path'); document.getElementById("btn-use-download").onclick = () => configureStorage('download');
    window.onclick = (e) => { if(!e.target.closest(".context-menu")) hideContext(); };
    window.onkeydown = (e) => { if(e.ctrlKey){ if(e.key==='c')clipboardAction('copy'); if(e.key==='v')clipboardAction('paste'); if(e.key==='z')undo(); }};
}