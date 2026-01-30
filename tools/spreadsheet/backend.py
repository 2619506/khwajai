# ============================================================
# backend.py
# BUSnX Enterprise – V10.0 (Universal Monolith)
# ============================================================

import os
import sys
import re
import io
import shutil
import warnings
import traceback
from io import StringIO

# --- 1. ROBUST IMPORTS ---
try:
    from fastapi import FastAPI, UploadFile, File
    from fastapi.middleware.cors import CORSMiddleware
    from pydantic import BaseModel
    import uvicorn
    import pandas as pd
    import numpy as np
except ImportError as e:
    print(f"❌ CRITICAL ERROR: Missing library. {e}")
    sys.exit(1)

warnings.filterwarnings("ignore")

# --- 2. CONFIGURATION ---
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
if BASE_DIR not in sys.path: sys.path.append(BASE_DIR)

# LOAD API KEY
API_KEY = None
try:
    from core.config import API_KEY
    print("✅ System: Core Config Loaded.")
except ImportError:
    print("❌ CRITICAL: 'core/config.py' not found.")

# LOAD GEMINI
try:
    import google.generativeai as genai
except ImportError:
    genai = None
    print("⚠️ Google AI Lib missing.")

# --- 3. APP SETUP ---
app = FastAPI(title="BUSnX Intelligence Engine", version="10.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# FILESYSTEM
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
SCAN_DIR = r"C:\Users\khwaj\Documents\BUSnX\Scans"
for d in [UPLOAD_DIR, SCAN_DIR]:
    try: os.makedirs(d, exist_ok=True)
    except: pass

# ============================================================
# 🧠 LOGIC CORE
# ============================================================

class DataSanitizer:
    @staticmethod
    def clean(df):
        if not isinstance(df, pd.DataFrame):
            # Return empty 50x12 grid if invalid
            return pd.DataFrame(index=range(50), columns=[chr(65+i) for i in range(12)]).fillna("")
        
        # Force headers to strings
        df.columns = df.columns.astype(str)
        # Clean ghost rows
        df = df.dropna(how='all', axis=0).dropna(how='all', axis=1)
        
        # Ensure grid isn't empty
        if df.empty:
            return pd.DataFrame(index=range(50), columns=[chr(65+i) for i in range(12)]).fillna("")
            
        return df.fillna("")

class GridState:
    def __init__(self):
        self.df = pd.DataFrame(index=range(50), columns=[chr(65+i) for i in range(12)]).fillna("")
        self.loaded_files = set()

    def update(self, new_df, filename=None):
        if new_df is not None:
            self.df = DataSanitizer.clean(new_df)
            if filename: self.loaded_files.add(filename)

    def get_payload(self):
        return {
            "columns": list(self.df.columns),
            "data": self.df.to_dict(orient="records")
        }

    def set_cell(self, row, col_idx, value):
        try:
            self.df.iat[row, col_idx] = value
        except: pass

state = GridState()

class BusinessAgent:
    def __init__(self):
        if API_KEY and genai:
            genai.configure(api_key=API_KEY)
            self.model = genai.GenerativeModel('gemini-2.0-flash-exp')
        else:
            self.model = None

    def process_image(self, image_path):
        """OCR Engine: Image -> CSV"""
        if not self.model: return None
        try:
            file_ref = genai.upload_file(image_path)
            prompt = """
            Analyze this image. Extract ALL tabular data found.
            Output strictly as RAW CSV format.
            NO markdown formatting (no ```csv).
            NO preamble.
            Use comma separators.
            If headers are missing, use generic A,B,C.
            """
            result = self.model.generate_content([file_ref, prompt])
            
            # Clean text
            raw_text = result.text.replace("```csv", "").replace("```", "").strip()
            
            if not raw_text: return None

            # Parse with fallback
            try:
                return pd.read_csv(StringIO(raw_text), sep=None, engine='python')
            except:
                return pd.read_csv(StringIO(raw_text))
                
        except Exception as e:
            print(f"OCR Error: {e}")
            return None

    def execute(self, user_query, selection=None):
        """AI Code Execution"""
        if not self.model: return "❌ AI Error: API Key missing."

        df = state.df.copy()
        rows, cols = df.shape
        
        sel_info = "Full Grid"
        r1, r2, c1, c2 = 0, rows-1, 0, cols-1
        target_h, target_w = rows, cols

        if selection and selection.get('active'):
            r1 = min(selection['startRow'], selection['endRow'])
            r2 = max(selection['startRow'], selection['endRow'])
            c1 = min(selection['startCol'], selection['endCol'])
            c2 = max(selection['startCol'], selection['endCol'])
            target_h = r2 - r1 + 1
            target_w = c2 - c1 + 1
            sel_info = f"Rows {r1}-{r2}, Cols {c1}-{c2}"

        prompt = f"""
        You are BUSnX AI.
        GRID: {rows}x{cols}. CONTEXT: {sel_info}.
        REQUEST: "{user_query}"
        
        RULES:
        1. **Chat:** If question, reply TEXT only.
        2. **Action:** If data change, reply PYTHON code.
        3. **Constraint:** USE `smart_write(data)`. Pass a list.
        4. **Format:** Wrap code in ```python ... ```.
        """

        try:
            response = self.model.generate_content(prompt)
            text_response = response.text.strip()

            if "```python" in text_response:
                code_match = re.search(r"```python(.*?)```", text_response, re.DOTALL)
                if not code_match: return "Error parsing code."
                raw_code = code_match.group(1).strip()
                
                # 🔥 PHYSICS ENGINE (Prevents Crashes)
                full_code = f"""
import pandas as pd
import numpy as np

def smart_write(data):
    import numpy as np
    
    # 1. Flatten
    if hasattr(data, 'flatten'): data = data.flatten().tolist()
    if not isinstance(data, list): data = list(data)
    
    # 2. Clean
    cleaned = []
    for x in data:
        try:
            if isinstance(x, float) and x.is_integer(): cleaned.append(int(x))
            else: cleaned.append(x)
        except: cleaned.append(x)
    data = cleaned

    # 3. Fit
    target_cells = {target_h} * {target_w}
    if len(data) > target_cells:
        data = data[:target_cells]
    elif len(data) < target_cells:
        data.extend([""] * (target_cells - len(data)))
        
    # 4. Write
    matrix = np.array(data).reshape({target_h}, {target_w})
    df.iloc[{r1}:{r2}+1, {c1}:{c2}+1] = matrix

{raw_code}
"""
                exec_globals = {'df': df, 'pd': pd, 'np': np, 'output_msg': "Done"}
                exec(full_code, exec_globals)
                
                state.update(exec_globals['df'])
                return f"⚡ {exec_globals.get('output_msg', 'Task Completed')}"

            return text_response

        except Exception as e:
            return f"⚠️ System Error: {str(e)}"

agent = BusinessAgent()

# --- ENDPOINTS ---
class ChatRequest(BaseModel):
    message: str
    selection: dict | None = None

class UpdateRequest(BaseModel):
    row: int
    col: int
    value: str

@app.get("/")
def health(): return {"status": "online", "ver": "10.0"}

@app.get("/grid")
def get_grid(): return state.get_payload()

@app.post("/chat")
def chat(req: ChatRequest):
    res = agent.execute(req.message, req.selection)
    return {"response": res, "grid_update": state.get_payload()}

@app.post("/update_cell")
def update_cell(req: UpdateRequest):
    state.set_cell(req.row, req.col, req.value)
    return {"status": "ok"}

@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    path = os.path.join(UPLOAD_DIR, file.filename)
    with open(path, "wb") as buffer: shutil.copyfileobj(file.file, buffer)
    
    try:
        df = None
        if path.endswith(".csv"): df = pd.read_csv(path)
        elif path.endswith((".xls", ".xlsx")): df = pd.read_excel(path)
        elif path.lower().endswith(('.png', '.jpg', '.jpeg', '.webp')):
            df = agent.process_image(path)
            if df is None: return {"error": "OCR failed to read text."}
        else:
            return {"error": "Unsupported file"}

        state.update(df, file.filename)
        return {"message": "Loaded", "grid_update": state.get_payload()}
    except Exception as e:
        return {"error": str(e)}

@app.post("/sync")
def sync_files():
    if not os.path.exists(SCAN_DIR): return {"response": "Scan dir not found"}
    files = [f for f in os.listdir(SCAN_DIR) if f.lower().endswith(('.csv', '.xlsx', '.png', '.jpg'))]
    files.sort(key=lambda x: os.path.getctime(os.path.join(SCAN_DIR, x)))
    
    count = 0
    for f in files:
        if f in state.loaded_files and not state.is_empty(): continue
        path = os.path.join(SCAN_DIR, f)
        try:
            df = None
            if f.endswith(".csv"): df = pd.read_csv(path)
            elif f.endswith((".xls", ".xlsx")): df = pd.read_excel(path)
            elif f.lower().endswith(('.png', '.jpg', '.jpeg')):
                df = agent.process_image(path)
            
            if df is not None:
                if state.is_empty(): state.update(df, f)
                else: 
                    merged = pd.concat([state.df, df], ignore_index=True)
                    state.update(merged, f)
                count += 1
        except: pass
    
    return {"response": f"Synced {count} files", "grid_update": state.get_payload()}

@app.post("/wipe")
def wipe():
    state.__init__()
    return {"response": "Wiped", "grid_update": state.get_payload()}

if __name__ == "__main__":
    print("🚀 BUSnX 10.0 Running on http://localhost:8000")
    uvicorn.run(app, host="0.0.0.0", port=8000)