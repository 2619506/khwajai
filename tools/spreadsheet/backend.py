# ============================================================
# backend.py
# BUSnX Enterprise – V11.0 (Auto-Switching AI + Debug Mode)
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
try:
    from config import API_KEY
    print("✅ System: Config Loaded.")
except ImportError:
    import os
    API_KEY = os.getenv("GOOGLE_API_KEY") 
    print("⚠️ Config file not found. Using Environment Variables.")

# LOAD GEMINI
try:
    import google.generativeai as genai
except ImportError:
    genai = None
    print("⚠️ Google AI Lib missing.")

# --- 3. APP SETUP ---
app = FastAPI(title="BUSnX Intelligence Engine", version="11.0.0")

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
            return pd.DataFrame()
        
        # Force headers to strings
        df.columns = df.columns.astype(str)
        # Clean ghost rows
        df = df.dropna(how='all', axis=0).dropna(how='all', axis=1)
        return df.fillna("")

class GridState:
    def __init__(self):
        self.df = pd.DataFrame(index=range(20), columns=[chr(65+i) for i in range(10)]).fillna("")
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
        self.api_key_status = "Missing"
        if API_KEY and genai:
            genai.configure(api_key=API_KEY)
            self.api_key_status = "Active"
        else:
            self.api_key_status = "Missing"

    def process_image(self, image_path):
        """
        OCR Engine with Auto-Fallback.
        Tries 3 different models before giving up.
        """
        if self.api_key_status == "Missing":
            raise Exception("Google API Key is missing on Server.")

        # LIST OF MODELS TO TRY (In order of preference)
        # 1. Flash (Fastest/Cheapest)
        # 2. Flash-8b (Backup)
        # 3. Pro (Strongest)
        models_to_try = ['gemini-1.5-flash', 'gemini-1.5-flash-8b', 'gemini-1.5-pro']
        
        last_error = ""

        for model_name in models_to_try:
            try:
                print(f"🔄 Attempting OCR with model: {model_name}...")
                model = genai.GenerativeModel(model_name)
                
                file_ref = genai.upload_file(image_path)
                prompt = """
                Analyze this image. Extract ALL tabular data found.
                Output strictly as RAW CSV format.
                NO markdown formatting (no ```csv).
                NO preamble.
                Use comma separators.
                If headers are missing, use generic A,B,C.
                """
                result = model.generate_content([file_ref, prompt])
                raw_text = result.text.replace("```csv", "").replace("```", "").strip()
                
                if not raw_text: 
                    raise Exception("Model returned empty text.")

                try:
                    return pd.read_csv(StringIO(raw_text), sep=None, engine='python')
                except:
                    return pd.read_csv(StringIO(raw_text))
            
            except Exception as e:
                print(f"⚠️ {model_name} failed: {e}")
                last_error = str(e)
                continue # Try next model

        # If we reach here, all models failed
        raise Exception(f"All AI models failed. Last error: {last_error}")

    def execute(self, user_query, selection=None):
        """AI Code Execution"""
        if self.api_key_status == "Missing": return "❌ AI Error: API Key missing."

        df = state.df.copy()
        rows, cols = df.shape
        
        # Use stable model for Logic
        model = genai.GenerativeModel('gemini-1.5-flash')
        
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
            response = model.generate_content(prompt)
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
def health(): return {"status": "online", "ver": "11.0", "ai_key": agent.api_key_status}

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
            # CRITICAL CHANGE: We now catch the REAL error and send it to UI
            try:
                df = agent.process_image(path)
            except Exception as ocr_err:
                return {"error": f"AI Error: {str(ocr_err)}"}
        else:
            return {"error": "Unsupported file"}

        state.update(df, file.filename)
        return {"message": "Loaded", "grid_update": state.get_payload()}
    except Exception as e:
        # Catch-all for non-AI errors (like pandas failing)
        return {"error": f"System Error: {str(e)}"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
