# ============================================================
# backend.py - BUSnX V38 (Portability & Layout Fix)
# ============================================================

import os
import sys
import re
import shutil
import warnings
import json
import logging
import tempfile
import pickle
import traceback
from io import StringIO
from datetime import datetime
from glob import glob

# --- 1. CONFIGURATION ---
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("BUSnX")

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError: pass

API_KEY = os.getenv("GOOGLE_API_KEY")
PORT = int(os.getenv("PORT", 8000)) # 🔥 FIX: Cloud Port Support

try:
    from fastapi import FastAPI, UploadFile, File, Form
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    import uvicorn
    import pandas as pd
    import numpy as np
    import google.generativeai as genai
    
    try:
        from sklearn.impute import KNNImputer
        SKLEARN_AVAILABLE = True
    except ImportError:
        SKLEARN_AVAILABLE = False
        logger.warning("sklearn not found. KNN disabled.")

except ImportError:
    sys.exit(1)

warnings.filterwarnings("ignore")

app = FastAPI(title="BUSnX Intelligence Engine", version="38.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 2. AI SETUP ---
CURRENT_MODEL_NAME = "gemini-2.0-flash"
if API_KEY:
    genai.configure(api_key=API_KEY)

# --- 3. STORAGE & PRIVACY MANAGER ---
class StorageConfig:
    def __init__(self):
        self.warehouse_path = None
        self.is_configured = False
        self.mode = "local" # 'local' or 'download'

    def set_path(self, path):
        if path == "BROWSER_DOWNLOAD":
            self.mode = "download"
            self.is_configured = True
            return True, "Mode set: Browser Download (No server storage)"

        if not path:
            return False, "Path cannot be empty."
        
        expanded_path = os.path.expanduser(path)
        try:
            os.makedirs(expanded_path, exist_ok=True)
            # Permission Check
            test_file = os.path.join(expanded_path, ".busnx_test")
            with open(test_file, "w") as f: f.write("access_check")
            os.remove(test_file)
            
            self.warehouse_path = expanded_path
            self.is_configured = True
            self.mode = "local"
            return True, f"Storage connected: {expanded_path}"
        except Exception as e:
            return False, f"Access Denied: {str(e)}"

    def get_path(self):
        return self.warehouse_path

storage_cfg = StorageConfig()
TEMP_DIR = tempfile.gettempdir()
STATE_FILE = os.path.join(TEMP_DIR, "busnx_workspace_v38.pkl")

# --- 4. DATA LOGIC ---
class DateSanitizer:
    @staticmethod
    def normalize_column(series):
        try: return pd.to_datetime(series, errors='coerce').dt.strftime('%Y-%m-%d')
        except: pass
        try: return pd.to_datetime(series, dayfirst=True, errors='coerce').dt.strftime('%Y-%m-%d')
        except: return series

class SmartMerger:
    @staticmethod
    def clean_totals(df):
        if df.empty: return df
        mask = df.astype(str).apply(lambda x: x.str.contains(r'^(Total|Sum|Grand Total|Carried Forward)$', case=False, na=False, regex=True)).any(axis=1)
        return df[~mask].reset_index(drop=True)

    @staticmethod
    def enforce_id_continuity(current_df, new_df, id_col=None):
        if not id_col:
            for col in current_df.columns:
                if 'id' in col.lower(): id_col = col; break
        if not id_col or id_col not in new_df.columns: return new_df
        try:
            curr_ids = pd.to_numeric(current_df[id_col], errors='coerce').dropna()
            if curr_ids.empty: return new_df
            last_num = int(curr_ids.max())
            new_ids = pd.to_numeric(new_df[id_col], errors='coerce').fillna(0).astype(int)
            if not new_ids.empty and new_ids.iloc[0] <= last_num:
                offset = last_num
                new_df[id_col] = new_df[id_col].apply(lambda x: int(re.search(r'(\d+)', str(x)).group(1)) + offset if re.search(r'(\d+)', str(x)) else x)
        except: pass
        return new_df

    @staticmethod
    def inject_dynamic_total(df):
        numeric_df = df.apply(pd.to_numeric, errors='coerce')
        sums = numeric_df.sum(numeric_only=True)
        if sums.empty: return df
        total_row = {col: "" for col in df.columns}
        for col, val in sums.items():
            if not any(x in col.lower() for x in ['id', 'date', 'year', 'phone', 'zip']): 
                if val > 0: total_row[col] = val
        if 'Description' in df.columns: total_row['Description'] = "GRAND TOTAL"
        elif len(df.columns)>0: total_row[df.columns[0]] = "GRAND TOTAL"
        return pd.concat([df, pd.DataFrame([total_row])], ignore_index=True)

class WorkspaceState:
    def __init__(self):
        self.sheets = {}
        self.active_sheet = "Sheet 1"
        self.load_from_disk()
        if not self.sheets: self.create_sheet("Sheet 1")

    def create_sheet(self, name):
        self.sheets[name] = pd.DataFrame(index=range(50), columns=[chr(65+i) for i in range(12)]).fillna("")
        self.active_sheet = name
        self.save_to_disk()

    def remove_sheet(self, name):
        if name in self.sheets:
            del self.sheets[name]
            if self.active_sheet == name:
                self.active_sheet = list(self.sheets.keys())[0] if self.sheets else "Sheet 1"
                if not self.sheets: self.create_sheet("Sheet 1")
            self.save_to_disk()

    def duplicate_sheet(self, name):
        if name in self.sheets:
            new_name = f"{name} Copy"
            i = 1
            while new_name in self.sheets: new_name = f"{name} Copy ({i})"; i+=1
            self.sheets[new_name] = self.sheets[name].copy()
            self.active_sheet = new_name
            self.save_to_disk()

    def rename_sheet(self, old, new):
        if old in self.sheets and new not in self.sheets:
            self.sheets[new] = self.sheets.pop(old)
            if self.active_sheet == old: self.active_sheet = new
            self.save_to_disk()

    def load_from_warehouse(self, filename):
        path_root = storage_cfg.get_path()
        if not path_root or not os.path.exists(path_root): return False
        path = os.path.join(path_root, filename)
        if os.path.exists(path):
            try:
                df = pd.read_csv(path).fillna("").astype(str)
                self.sheets[filename.replace(".csv","")] = df
                self.active_sheet = filename.replace(".csv","")
                self.save_to_disk()
                return True
            except: pass
        return False

    def get_active_df(self): return self.sheets.get(self.active_sheet, pd.DataFrame())
    def update_active(self, df): 
        if df is not None: 
            self.sheets[self.active_sheet] = df.fillna("").astype(str)
            self.save_to_disk()
    def append_to_active(self, new_df):
        current = self.get_active_df()
        clean_curr = SmartMerger.clean_totals(current)
        clean_new = SmartMerger.clean_totals(new_df)
        if clean_curr.empty: self.update_active(clean_new); return
        clean_new = SmartMerger.enforce_id_continuity(clean_curr, clean_new)
        try:
            merged = pd.concat([clean_curr, clean_new], ignore_index=True)
            self.sheets[self.active_sheet] = SmartMerger.inject_dynamic_total(merged).fillna("").astype(str)
            self.save_to_disk()
        except: pass

    def commit_to_warehouse(self, filename):
        if storage_cfg.mode == "download": return "DOWNLOAD_MODE"
        path_root = storage_cfg.get_path()
        if not path_root: raise Exception("Storage not configured.")
        df = SmartMerger.clean_totals(self.get_active_df())
        path = os.path.join(path_root, f"{filename}.csv")
        df.to_csv(path, index=False)
        return path

    def get_metadata(self, name):
        if name in self.sheets:
            df = self.sheets[name]
            return {"rows":len(df), "cols":len(df.columns), "size":f"{df.memory_usage(deep=True).sum()/1024:.2f} KB"}
        return {}

    def get_payload(self):
        df = self.get_active_df()
        return {
            "sheets": list(self.sheets.keys()),
            "active": self.active_sheet,
            "columns": list(df.columns),
            "data": df.to_dict(orient="records"),
            "storage_configured": storage_cfg.is_configured
        }

    def save_to_disk(self):
        try: with open(STATE_FILE, "wb") as f: pickle.dump((self.sheets, self.active_sheet), f)
        except: pass
    def load_from_disk(self):
        if os.path.exists(STATE_FILE):
            try: 
                with open(STATE_FILE, "rb") as f: self.sheets, self.active_sheet = pickle.load(f)
            except: self.sheets = {}

state = WorkspaceState()

class BusinessAgent:
    def __init__(self):
        self.model = genai.GenerativeModel(CURRENT_MODEL_NAME) if API_KEY else None

    def process_complex_media(self, file_path):
        """
        🔥 FIX: STRICT FORMATTING
        Enforces proper CSV structure to prevent misalignment.
        """
        if not self.model: return None
        file_ref = genai.upload_file(file_path)
        prompt = """
        Extract data to CSV.
        RULES:
        1. NO Markdown format (just raw CSV inside ```csv tags).
        2. Keep rows aligned.
        3. Do NOT include row numbers/indices as a column.
        4. Use standard headers: Date, Description, Amount, etc.
        """
        try:
            res = self.model.generate_content([file_ref, prompt])
            match = re.search(r"```csv(.*?)```", res.text, re.DOTALL)
            if match:
                csv_txt = match.group(1).strip()
                # Parse with strict settings
                df = pd.read_csv(StringIO(csv_txt), sep=",", skipinitialspace=True, on_bad_lines='skip')
                # Filter bad columns
                df = df.loc[:, ~df.columns.str.contains('^Unnamed')]
                return df
            return None
        except: return None

    def advanced_clean(self, grid_data):
        df = pd.DataFrame(grid_data)
        df = SmartMerger.clean_totals(df)
        
        numeric_cols = []
        for col in df.columns:
            # Preservation Check
            sample = df[col].dropna().astype(str)
            is_text = sample.apply(lambda x: len(x)>0 and not x.replace('.','').isdigit()).mean() > 0.5
            if 'desc' in col.lower() or 'name' in col.lower() or is_text: continue
            
            if 'date' in col.lower():
                df[col] = DateSanitizer.normalize_column(df[col])
                continue

            try:
                orig = df[col].copy()
                clean = df[col].astype(str).str.replace(r'[^\d\.-]', '', regex=True)
                df[col] = pd.to_numeric(clean, errors='coerce')
                if df[col].isna().mean() > 0.8: df[col] = orig
                else: numeric_cols.append(col)
            except: pass

        if SKLEARN_AVAILABLE and numeric_cols:
            try:
                df[numeric_cols] = KNNImputer(n_neighbors=3).fit_transform(df[numeric_cols])
            except: pass

        return SmartMerger.inject_dynamic_total(df).fillna("").astype(str).to_dict(orient="records")

    def execute_chat(self, query):
        if not self.model: return "API Key Required."
        df = state.get_active_df()
        prompt = f"""
        Act as Data Engineer.
        DETECT language -> TRANSLATE to English -> EXECUTE.
        Data: {df.head().to_string()}
        Query: "{query}"
        OUTPUT: THINKING (Python Code) -> FINAL ANSWER (Message).
        ACTION TAGS: <<ACTION:VIEW_GRID>>, <<ACTION:CLEAN>>, <<ACTION:VIEW_WAREHOUSE>>.
        """
        try:
            res = self.model.generate_content(prompt)
            txt = res.text
            match = re.search(r"```python(.*?)```", txt, re.DOTALL)
            if match:
                try:
                    local = {'df': df.copy(), 'pd': pd, 'np': np, 're': re}
                    exec(match.group(1), {}, local)
                    if not local['df'].empty: state.update_active(local['df'])
                except Exception as e: return f"THINKING:\nError: {e}\nFINAL ANSWER:\nI couldn't run that code safely."
            return txt
        except Exception as e: return f"Error: {e}"

agent = BusinessAgent()

# --- ENDPOINTS ---
class ChatRequest(BaseModel): message: str
class SyncRequest(BaseModel): grid: list 

@app.get("/")
def health(): return {"status": "online"}
@app.get("/grid")
def get_grid(): return state.get_payload()

@app.get("/warehouse")
def list_warehouse():
    path = storage_cfg.get_path()
    if not path or not os.path.exists(path): return {"files": []}
    files = []
    for f in os.listdir(path):
        if f.endswith(".csv"):
            fp = os.path.join(path, f)
            sz = os.path.getsize(fp)/1024
            dt = datetime.fromtimestamp(os.path.getmtime(fp)).strftime('%Y-%m-%d')
            files.append({"name": f, "size": f"{sz:.1f} KB", "date": dt})
    return {"files": files}

@app.post("/config/set_path")
def set_storage(path: str = Form(...)):
    ok, msg = storage_cfg.set_path(path)
    return {"success": ok, "message": msg}

@app.post("/warehouse/delete")
def delete_wh(filename: str = Form(...)):
    p = storage_cfg.get_path()
    if p and os.path.exists(os.path.join(p, filename)):
        os.remove(os.path.join(p, filename))
        return {"status": "deleted"}
    return {"error": "Failed"}

@app.post("/warehouse/rename")
def rename_wh(old_name: str = Form(...), new_name: str = Form(...)):
    p = storage_cfg.get_path()
    if p:
        if not new_name.endswith(".csv"): new_name+=".csv"
        os.rename(os.path.join(p, old_name), os.path.join(p, new_name))
        return {"status": "renamed"}
    return {"error": "Failed"}

@app.post("/warehouse/duplicate")
def dup_wh(filename: str = Form(...)):
    p = storage_cfg.get_path()
    if p:
        shutil.copy(os.path.join(p, filename), os.path.join(p, filename.replace(".csv","_Copy.csv")))
        return {"status": "copied"}
    return {"error": "Failed"}

@app.post("/sheet/add")
def add_sheet(name: str = Form(...)): state.create_sheet(name); return state.get_payload()
@app.post("/sheet/switch")
def switch_sheet(name: str = Form(...)): 
    if name in state.sheets: state.active_sheet = name
    return state.get_payload()
@app.post("/sheet/delete")
def delete_sheet(name: str = Form(...)): state.remove_sheet(name); return state.get_payload()
@app.post("/sheet/duplicate")
def dup_sheet(name: str = Form(...)): state.duplicate_sheet(name); return state.get_payload()
@app.post("/sheet/rename")
def ren_sheet(old_name: str = Form(...), new_name: str = Form(...)): state.rename_sheet(old_name, new_name); return state.get_payload()
@app.post("/sheet/metadata")
def meta(name: str = Form(...)): return state.get_metadata(name)
@app.post("/sheet/load_warehouse")
def load_wh(filename: str = Form(...)): 
    if state.load_from_warehouse(filename): return state.get_payload()
    return {"error": "Failed"}

@app.post("/sync")
def sync(req: SyncRequest): state.update_active(pd.DataFrame(req.grid)); return {"status":"ok"}
@app.post("/cleanup")
async def clean(req: SyncRequest):
    d = agent.advanced_clean(req.grid)
    state.update_active(pd.DataFrame(d))
    return {"grid_update": state.get_payload()}
@app.post("/chat")
def chat(req: ChatRequest):
    r = agent.execute_chat(req.message)
    return {"response": r, "grid_update": state.get_payload()}
@app.post("/commit")
def commit(filename: str = Form(...)):
    res = state.commit_to_warehouse(filename)
    if res == "DOWNLOAD_MODE": return {"download": True, "data": state.get_active_df().to_csv(index=False)}
    return {"message": f"Saved to {res}"}

@app.post("/upload")
async def upload(file: UploadFile = File(...), mode: str = Form("replace")):
    path = os.path.join(TEMP_DIR, file.filename)
    with open(path, "wb") as b: shutil.copyfileobj(file.file, b)
    try:
        ext = file.filename.split('.')[-1].lower()
        if ext == 'csv': df = pd.read_csv(path)
        elif ext in ['xls','xlsx']: df = pd.read_excel(path)
        else: df = agent.process_complex_media(path)
        
        if df is None or df.empty: return {"error": "Empty data"}
        if mode == "append": state.append_to_active(df)
        else: state.update_active(df)
        return {"message": "Loaded", "grid_update": state.get_payload()}
    except Exception as e: return {"error": str(e)}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=PORT)