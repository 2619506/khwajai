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
# Fix: Import directly from config (no "core." prefix)
try:
    from config import API_KEY
    print("✅ System: Config Loaded.")
except ImportError:
    import os
    API_KEY = os.getenv("GOOGLE_API_KEY") # Fallback to environment variable
    print("⚠️ Config file not found. Using Environment Variables.")

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
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
for d in [UPLOAD_DIR]:
    try: os.makedirs(d, exist_ok=True)
    except: pass

# ============================================================
# 🧠 LOGIC CORE
# ============================================================

class DataSanitizer:
    @staticmethod
    def clean(df):
        if not isinstance(df, pd.DataFrame):
            return pd.DataFrame(index=range(50), columns=[chr(65+i) for i in range(12)]).fillna("")
        
        # Force headers to strings
        df.columns = df.columns.astype(str)
        # Clean ghost rows
        df = df.dropna(how='all', axis=0).dropna(how='all', axis=1)
        
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
            raw_text = result.text.replace("```csv", "").replace("```", "").strip()
            
            if not raw_text: return None

            try:
                return pd.read_csv(StringIO(raw_text), sep=None, engine='python')
            except:
                return pd.read_csv(StringIO(raw_text))
                
        except Exception as e:
            print(f"OCR Error: {e}")
            return None

    def execute(self, user_query, selection=None):
        """AI Code Execution"""
        if not self.model: return "❌ AI Error: API Key missing or Invalid."

        df = state.df.copy()
        rows, cols = df.shape
        
        prompt = f"""
        You are BUSnX AI.
        GRID: {rows}x{cols}.
        REQUEST: "{user_query}"
        
        RULES:
        1. **Action:** If data change, reply PYTHON code.
        2. **Format:** Wrap code in ```python ... ```.
        3. **Variable:** The dataframe is named `df`.
        """

        try:
            response = self.model.generate_content(prompt)
            text_response = response.text.strip()

            if "```python" in text_response:
                code_match = re.search(r"```python(.*?)```", text_response, re.DOTALL)
                if not code_match: return "Error parsing code."
                raw_code = code_match.group(1).strip()
                
                exec_globals = {'df': df, 'pd': pd, 'np': np, 'output_msg': "Done"}
                try:
                    exec(raw_code, exec_globals)
                    state.update(exec_globals['df'])
                    return f"⚡ {exec_globals.get('output_msg', 'Task Completed')}"
                except Exception as ex:
                    return f"⚠️ Code Error: {str(ex)}"

            return text_response

        except Exception as e:
            return f"⚠️ System Error: {str(e)}"

agent = BusinessAgent()

# --- ENDPOINTS ---
class ChatRequest(BaseModel):
    message: str
    selection: dict | None = None

@app.get("/")
def health(): return {"status": "online", "ver": "10.0"}

@app.get("/grid")
def get_grid(): return state.get_payload()

@app.post("/chat")
def chat(req: ChatRequest):
    res = agent.execute(req.message, req.selection)
    return {"response": res, "grid_update": state.get_payload()}

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

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
