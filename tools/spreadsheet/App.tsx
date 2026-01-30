/* ============================================================
   App.tsx - BUSnX Infinity (Fixed Grid & Theme)
   ============================================================ */
   import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
   import { AgGridReact } from 'ag-grid-react';
   import axios from 'axios';
   import { 
     Table, Terminal, Save, Trash2, Plus, Upload, 
     RefreshCw, Command, Bot, User, Minus, Wifi, WifiOff 
   } from 'lucide-react';
   
   import type { ColDef, CellMouseDownEvent, CellMouseOverEvent, CellContextMenuEvent } from 'ag-grid-community';
   import { ModuleRegistry, AllCommunityModule } from 'ag-grid-community';
   ModuleRegistry.registerModules([ AllCommunityModule ]);
   
   // Import Styles
   import 'ag-grid-community/styles/ag-grid.css';
   import 'ag-grid-community/styles/ag-theme-quartz.css'; 
   import './App.css';
   
   const API_URL = "http://localhost:8000";
   const PING_INTERVAL = 5000;
   
   interface Sheet { id: number; name: string; data: any[]; columns: string[]; }
   interface SelectionBox { startRow: number; startCol: number; endRow: number; endCol: number; active: boolean; mode: 'range' | 'row' | 'col' | 'all'; }
   interface ChatMessage { role: 'user' | 'ai'; text: string; }
   
   const createEmptyData = (count: number) => Array.from({ length: count }, () => ({}));
   
   function App() {
     const [sheets, setSheets] = useState<Sheet[]>([{ id: 1, name: 'Sheet1', data: [], columns: [] }]);
     const [activeSheetId, setActiveSheetId] = useState<number>(1);
     const [colDefs, setColDefs] = useState<ColDef[]>([]);
     
     const [status, setStatus] = useState("Connecting...");
     const [isOnline, setIsOnline] = useState(false);
     const [stats, setStats] = useState("Sum: 0 | Count: 0");
     const [zoom, setZoom] = useState(1.0);
     
     const [chatInput, setChatInput] = useState("");
     const [chatHistory, setChatHistory] = useState<ChatMessage[]>([]);
     const [chatOpen, setChatOpen] = useState(false);
     const [loading, setLoading] = useState(false);
     
     const [showTools, setShowTools] = useState(false);
     const [menuVisible, setMenuVisible] = useState(false);
     const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
     
     const selectionRef = useRef<SelectionBox>({ startRow: -1, startCol: -1, endRow: -1, endCol: -1, active: false, mode: 'range' });
     const isDragging = useRef(false);
     const gridRef = useRef<AgGridReact>(null);
     const fileInputRef = useRef<HTMLInputElement>(null);
   
     // --- INIT ---
     useEffect(() => {
       checkHealth();
       const interval = setInterval(checkHealth, PING_INTERVAL);
       const handleClick = () => setMenuVisible(false);
       window.addEventListener('click', handleClick);
       
       const defaultCols = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i)); 
       const defaultData = createEmptyData(50); 
       fetchGridData(defaultCols, defaultData);
   
       return () => { clearInterval(interval); window.removeEventListener('click', handleClick); };
     }, []);
   
     const checkHealth = async () => {
       try {
           await axios.get(`${API_URL}/`);
           setIsOnline(true);
           setStatus("Online");
       } catch (e) {
           setIsOnline(false);
           setStatus("Offline");
       }
     };
   
     const activeSheet = useMemo(() => sheets.find(s => s.id === activeSheetId) || sheets[0], [sheets, activeSheetId]);
     const rowData = activeSheet?.data || [];
   
     // --- DATA SYNC ---
     const updateActiveSheet = useCallback((newData: any[], newCols?: string[]) => {
         setSheets(prev => prev.map(s => s.id === activeSheetId ? { ...s, data: newData, columns: newCols || s.columns } : s));
         if (gridRef.current && gridRef.current.api) {
             if (newCols && newCols.length > 0) setupColumns(newCols);
             gridRef.current.api.setGridOption('rowData', newData);
         }
     }, [activeSheetId]);
   
     const fetchGridData = async (defaultCols: string[], defaultData: any[]) => {
       try {
         const res = await axios.get(`${API_URL}/grid`);
         if (res.data.columns && res.data.columns.length > 0) {
           setSheets(prev => prev.map(s => s.id === 1 ? { ...s, data: res.data.data, columns: res.data.columns } : s));
         } else {
           setSheets(prev => prev.map(s => s.id === 1 ? { ...s, data: defaultData, columns: defaultCols } : s));
         }
       } catch (err) { 
           setSheets(prev => prev.map(s => s.id === 1 ? { ...s, data: defaultData, columns: defaultCols } : s));
       }
     };
   
     const setupColumns = (columns: any[]) => {
       const stringCols = columns.map(c => String(c));
       const getColIndex = (field: string) => stringCols.indexOf(field);
       
       const dataCols: ColDef[] = stringCols.map((col) => ({
         field: col, headerName: col, 
         editable: true, singleClickEdit: true, filter: false, sortable: true, resizable: true, width: 80,
         headerClass: 'centered-header',
         cellClassRules: {
           'custom-range-selected': (params) => {
               const sel = selectionRef.current;
               if (!sel.active || !params.colDef.field) return false;
               const r = params.node.rowIndex;
               const c = getColIndex(params.colDef.field);
               if(r===null || r===undefined) return false;
               return r >= Math.min(sel.startRow, sel.endRow) && r <= Math.max(sel.startRow, sel.endRow) &&
                      c >= Math.min(sel.startCol, sel.endCol) && c <= Math.max(sel.startCol, sel.endCol);
           }
         }
       }));
       
       const rowNumCol: ColDef = {
           headerName: "◢", field: "rowNum", valueGetter: "node.rowIndex + 1", width: 45, 
           pinned: 'left', lockPosition: true, resizable: false, editable: false, 
           cellClass: 'row-number-col', headerClass: 'corner-header',
       };
       setColDefs([rowNumCol, ...dataCols]);
     };
   
     // --- ACTIONS ---
     const handleExportCSV = () => gridRef.current?.api.exportDataAsCsv({ fileName: `${activeSheet?.name}.csv` });
   
     const handleTurboSync = async () => {
       setStatus("Syncing..."); setShowTools(false);
       try {
           const res = await axios.post(`${API_URL}/sync`);
           if (res.data.grid_update) {
               updateActiveSheet(res.data.grid_update.data, res.data.grid_update.columns);
               setStatus(res.data.response || "Synced");
           } else { setStatus(res.data.response || "No New Files"); }
       } catch (e) { setStatus("Sync Error"); }
     };
   
     const handleWipe = async () => { 
         if(confirm("Wipe grid?")) {
             try {
               const res = await axios.post(`${API_URL}/wipe`);
               if(res.data.grid_update) updateActiveSheet(res.data.grid_update.data, res.data.grid_update.columns);
               setStatus("Wiped");
             } catch(e) { setStatus("Wipe Failed"); }
         }
     };
   
     const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
       if (!e.target.files || e.target.files.length === 0) return;
       setStatus("Uploading...");
       const formData = new FormData();
       formData.append('file', e.target.files[0]);
       try {
           const res = await axios.post(`${API_URL}/upload`, formData);
           if (res.data.grid_update) {
               updateActiveSheet(res.data.grid_update.data, res.data.grid_update.columns);
               setStatus("File Loaded");
           } else if (res.data.error) {
               alert("Upload Failed: " + res.data.error);
               setStatus("Error");
           }
       } catch (err) { setStatus("Upload Failed"); }
     };
   
     const sendChat = async (inputOverride?: string) => {
         const msg = inputOverride || chatInput;
         if (!msg) return;
         if (!inputOverride) setChatInput("");
         
         setChatHistory(prev => [...prev, { role: 'user', text: msg }]);
         setLoading(true); setChatOpen(true);
         
         const sel = selectionRef.current;
         const payload = { message: msg, selection: sel.active ? sel : null };
   
         try {
           const res = await axios.post(`${API_URL}/chat`, payload);
           setChatHistory(prev => [...prev, { role: 'ai', text: res.data.response }]);
           if (res.data.grid_update) updateActiveSheet(res.data.grid_update.data, res.data.grid_update.columns);
         } catch (err) { 
             setChatHistory(prev => [...prev, { role: 'ai', text: "❌ Backend Error." }]); 
         } finally { setLoading(false); }
     };
   
     // --- MOUSE & SELECTION ---
     const calculateStats = useCallback(() => {
       const api = gridRef.current?.api;
       const sel = selectionRef.current;
       if (!api || !sel.active) { setStats("Sum: 0 | Count: 0"); return; }
       let sum = 0, count = 0;
       const r1 = Math.min(sel.startRow, sel.endRow), r2 = Math.max(sel.startRow, sel.endRow);
       const c1 = sel.mode === 'row' ? 0 : Math.min(sel.startCol, sel.endCol);
       const c2 = sel.mode === 'row' ? colDefs.length - 2 : Math.max(sel.startCol, sel.endCol);
       const dataCols = colDefs.slice(1);
   
       for (let r = r1; r <= r2; r++) {
           const rowNode = api.getDisplayedRowAtIndex(r);
           if (!rowNode?.data) continue;
           for (let c = c1; c <= c2; c++) {
               const colId = dataCols[c]?.field;
               if (!colId) continue;
               const val = rowNode.data[colId];
               if (val) { count++; const n = parseFloat(val); if(!isNaN(n)) sum+=n; }
           }
       }
       setStats(`Sum: ${sum.toFixed(2)} | Count: ${count}`); 
     }, [colDefs]);
   
     const onCellMouseDown = (params: CellMouseDownEvent) => {
       if (params.event && (params.event as MouseEvent).button === 2) return; 
       if (!params.colDef.field) return; 
       
       if (params.colDef.field === 'rowNum') {
           const r = params.node.rowIndex;
           if(r !== null) {
               selectionRef.current = { startRow: r, endRow: r, startCol: 0, endCol: colDefs.length-2, active: true, mode: 'row' };
               params.api.refreshCells(); calculateStats();
           }
           return;
       }
       const colIdx = colDefs.findIndex(c => c.field === params.colDef.field) - 1;
       if (colIdx < 0) return;
       isDragging.current = true;
       selectionRef.current = { startRow: params.node.rowIndex!, endRow: params.node.rowIndex!, startCol: colIdx, endCol: colIdx, active: true, mode: 'range' };
       params.api.refreshCells(); calculateStats();
     };
   
     const onCellMouseOver = (params: CellMouseOverEvent) => {
       if (!isDragging.current || !params.colDef.field) return;
       const colIdx = colDefs.findIndex(c => c.field === params.colDef.field) - 1;
       if (colIdx < 0 && params.colDef.field !== 'rowNum') return;
       selectionRef.current.endRow = params.node.rowIndex!;
       if (params.colDef.field !== 'rowNum') selectionRef.current.endCol = colIdx;
       params.api.refreshCells(); calculateStats();
     };
   
     const onCellContextMenu = (params: CellContextMenuEvent) => {
         if (params.event) {
             params.event.preventDefault();
             const mouseEvent = params.event as unknown as MouseEvent;
             setMenuPos({ x: mouseEvent.clientX, y: mouseEvent.clientY });
             setMenuVisible(true);
         }
     };
   
     const handleMenuAction = useCallback(async (action: string) => { 
         setMenuVisible(false);
         const api = gridRef.current?.api;
         if (!api) return;
         const sel = selectionRef.current;
         if (!sel.active) return;
   
         const r1 = Math.min(sel.startRow, sel.endRow);
         const r2 = Math.max(sel.startRow, sel.endRow);
         const c1 = sel.mode === 'row' ? 0 : Math.min(sel.startCol, sel.endCol);
         const c2 = sel.mode === 'row' ? colDefs.length - 2 : Math.max(sel.startCol, sel.endCol);
         const dataCols = colDefs.slice(1);
   
         if (action === 'delete') {
            const newData = [...rowData]; 
            for (let r = r1; r <= r2; r++) {
               if(!newData[r]) continue;
               for (let c = c1; c <= c2; c++) {
                   const colDef = dataCols[c];
                   if(colDef && colDef.field) newData[r] = { ...newData[r], [colDef.field]: "" };
               }
            }
            updateActiveSheet(newData);
            api.refreshCells();
         }
     }, [colDefs, rowData, updateActiveSheet]);
   
     return (
       <div className="app-container" onMouseUp={() => { isDragging.current = false; }}>
         <div className="sidebar">
           <div className="logo">BUSn <span className="logo-x">X</span></div>
           <div className="menu-group"><div className="menu-label">INTELLIGENCE</div><div className="menu-item active-item"><Table size={16}/> Forensic Lab</div></div>
           <div className="menu-group" style={{marginTop: '20px'}}>
             <div className="menu-label">AI TOOLS</div>
             <div className="menu-item" onClick={() => { setChatInput("Analyze this"); setChatOpen(true); }}><Terminal size={16}/> Deep Analyze</div>
             <div className="menu-item" onClick={() => { setChatInput("Clean data"); sendChat(); }}><Save size={16}/> Auto Clean</div> 
           </div>
         </div>
   
         <div className="main-content">
           <div className="status-bar">
             <div className="status-left">
               {isOnline ? <Wifi size={14} color="#00ff00" /> : <WifiOff size={14} color="#ff5555" />}
               <span style={{marginLeft: 8}}>{activeSheet?.name} — {status}</span>
             </div>
             <div className="status-center text-orange">{stats}</div>
             <div className="status-right">v10.0</div>
           </div>
           
           <div className="grid-wrapper" style={{ height: '100%', width: '100%', '--ag-font-size': `${12 * zoom}px`, '--ag-header-height': `${28 * zoom}px` } as any}>
             {/* NOTE: theme="legacy" fixes the conflict error you saw */}
             <div className="ag-theme-quartz-dark" style={{ height: '100%', width: '100%' }}>
               <AgGridReact
                 ref={gridRef}
                 theme="legacy" 
                 rowData={rowData}
                 columnDefs={colDefs}
                 defaultColDef={{ editable: true, sortable: true, resizable: true, cellStyle: { borderRight: '1px solid #3a3a3a' } }}
                 animateRows={false}
                 rowSelection={{ mode: 'multiRow', enableClickSelection: false, checkboxes: false, headerCheckbox: false }}
                 suppressCellFocus={false} 
                 rowHeight={20 * zoom} 
                 onCellMouseDown={onCellMouseDown}
                 onCellMouseOver={onCellMouseOver}
                 onCellContextMenu={onCellContextMenu}
                 onCellValueChanged={() => updateActiveSheet([...rowData])}
               />
             </div>
           </div>
   
           {/* CONTEXT MENU */}
           {menuVisible && (
             <div className="context-menu" style={{ top: menuPos.y, left: menuPos.x }} onClick={(e) => e.stopPropagation()}>
               <div onClick={() => handleMenuAction('copy')}>Copy</div>
               <div onClick={() => handleMenuAction('paste')}>Paste</div>
               <div className="divider-h"></div>
               <div onClick={() => handleMenuAction('delete')} className="text-red">Delete Range</div>
             </div>
           )}
   
           <div className="excel-footer">
               <div className="sheet-container">
                   {sheets.map(sheet => (
                     <div key={sheet.id} className={`sheet-tab ${activeSheetId === sheet.id ? 'active-tab' : ''}`} onClick={() => setActiveSheetId(sheet.id)}>{sheet.name}</div>
                   ))}
                   <button className="neon-btn neon-green" onClick={() => {/* Add sheet logic later */}}><Plus className="icon-visible"/></button>
               </div>
               <div className="footer-tools">
                   <button className="neon-btn neon-blue" onClick={handleExportCSV} title="Export"><Save className="icon-visible"/></button>
                   <button className="neon-btn neon-red" onClick={handleWipe} title="Wipe"><Trash2 className="icon-visible"/></button>
                   <div className="zoom-controls">
                       <button className="neon-btn neon-red" onClick={() => setZoom(z => Math.max(0.5, z - 0.1))}><Minus className="icon-visible"/></button>
                       <span>{(zoom * 100).toFixed(0)}%</span>
                       <button className="neon-btn neon-green" onClick={() => setZoom(z => Math.min(2.0, z + 0.1))}><Plus className="icon-visible"/></button>
                   </div>
               </div>
           </div>
   
           <div className="chat-container">
              {chatOpen && chatHistory.length > 0 && (
               <div className="chat-history">
                 {chatHistory.map((msg, i) => (
                   <div key={i} className={`msg ${msg.role === 'user' ? "msg-you" : "msg-ai"}`}>
                     {msg.role === 'ai' && <Bot size={16} className="msg-icon" />}
                     {msg.role === 'user' && <User size={16} className="msg-icon" />}
                     <span style={{marginLeft:8, whiteSpace: 'pre-wrap'}}>{msg.text}</span>
                   </div>
                 ))}
               </div>
             )}
             <div className="input-bar-wrapper">
               <div className="input-bar">
                 <button className="tools-btn" onClick={(e) => { e.stopPropagation(); setShowTools(!showTools); }}><Command size={16}/></button>
                 <div className="divider"></div>
                 <input value={chatInput} onChange={e => setChatInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && !loading && sendChat()} placeholder="Ask BUSnX AI..." disabled={loading}/>
                 {loading ? <div className="loader"></div> : <button className="send-btn" onClick={() => sendChat()}>➤</button>}
                 <button className="toggle-btn" onClick={() => setChatOpen(!chatOpen)}>{chatOpen ? "▼" : "▲"}</button>
               </div>
               {showTools && (
                 <div className="tools-popup" onMouseLeave={() => setShowTools(false)} onClick={(e) => e.stopPropagation()}>
                   <div className="tool-item" onClick={() => { fileInputRef.current?.click(); setShowTools(false); }}><Upload size={14}/> Upload / OCR</div>
                   <div className="tool-item" onClick={() => { handleTurboSync(); setShowTools(false); }}><RefreshCw size={14}/> Turbo Sync</div>
                 </div>
               )}
               <input type="file" ref={fileInputRef} hidden onChange={handleFileUpload} />
             </div>
           </div>
         </div>
       </div>
     );
   }
   export default App;