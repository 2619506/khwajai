# ============================================================
# backend.py
# BUSnX Enterprise – V12.0 (Self-Healing Model Discovery)
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
app = FastAPI(title="BUSnX Intelligence Engine", version="12.0.0")

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
# 🧠 INTELLIGENT MODEL SELECTOR
# ============================================================

def get_best_available_model():
    """
    Asks Google API for list of available models and picks the best one.
    This prevents 404 errors when model names change.
    """
    if not API_KEY or not genai:
        return None

    try:
        genai.configure(api_key=API_KEY)
        
        # 1. Get all models that support 'generateContent'
        all_models = []
        try:
            for m in genai.list_models():
                if 'generateContent' in m.supported_generation_methods:
                    all_models.append(m.name)
        except Exception as list_err:
            print(f"⚠️ Could not list models: {list_err}. Defaulting.")
            return "gemini-1.5-flash"
        
        print(f"🔎 Available Models for your Key: {all_models}")

        # 2. Priority List (We prioritize 2.0 Flash based on your account)
        preferences = [
            'gemini-2.0-flash', # Your confirmed model
            'gemini-1.5-flash', # Fallback
            'gemini-1.5-pro',
            'gemini-pro'
        ]

        # 3. Find the first match
        for pref in preferences:
            for model_name in all_models:
                if pref in model_name:
                    # Clean up the name (remove 'models/' prefix)
                    clean_name = model_name.replace("models/", "")
                    print(f"✅ Selected AI Model: {clean_name}")
                    return clean_name
        
        # 4. Fallback: If no preference matches, take the first valid one
        if all_models:
            return all_models[0].replace("models/", "")
            
        return "gemini-1.5-flash" # Absolute fallback
        
    except Exception as e:
        print(f"⚠️ Model Discovery Failed: {e}")
        return "gemini-1.5-flash"

# Initialize Model Selection
CURRENT_MODEL_NAME = get_best_available_model()

# ============================================================
# 🧠 LOGIC CORE
# ============================================================

class DataSanitizer:
    @staticmethod
    def clean(df):
        if not isinstance(df, pd.DataFrame):
            return pd.DataFrame()
        df.columns = df.columns.astype(str)
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
        if API_KEY and genai and CURRENT_MODEL_NAME:
            genai.configure(api_key=API_KEY)
            self.api_key_status = "Active"
            self.model = genai.GenerativeModel(CURRENT_MODEL_NAME)
        else:
            self.api_key_status = "Missing or No Model Found"
            self.model = None

    def process_image(self, image_path):
        """OCR Engine"""
        if not self.model: 
            raise Exception(f"AI Setup Failed. Key Status: {self.api_key_status}")

        try:
            file_ref = genai.upload_file(image_path)
            prompt = """
            Analyze this image. Extract ALL tabular data found.
            Output strictly as RAW CSV format.
            NO markdown formatting. NO preamble.
            Use comma separators.
            """
            result = self.model.generate_content([file_ref, prompt])
            raw_text = result.text.replace("```csv", "").replace("```", "").strip()
            
            if not raw_text: raise Exception("AI returned empty text.")

            try:
                return pd.read_csv(StringIO(raw_text), sep=None, engine='python')
            except:
                return pd.read_csv(StringIO(raw_text))
                
        except Exception as e:
            # Add specific error about model to help debug
            raise Exception(f"AI Error ({CURRENT_MODEL_NAME}): {str(e)}")

    def execute(self, user_query, selection=None):
        """AI Code Execution"""
        if not self.model: return "❌ AI Error: System not ready."

        df = state.df.copy()
        rows, cols = df.shape
        
        prompt = f"""
        You are BUSnX AI. DataFrame `df`.
        REQUEST: "{user_query}"
        RULES: If data changes, reply with PYTHON code block ```python ... ```.
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
def health(): 
    return {
        "status": "online", 
        "ver": "12.0", 
        "ai_model": CURRENT_MODEL_NAME, # See exactly which model was picked
        "key_status": agent.api_key_status
    }

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
            try:
                df = agent.process_image(path)
            except Exception as ocr_err:
                return {"error": str(ocr_err)}
        else:
            return {"error": "Unsupported file"}

        state.update(df, file.filename)
        return {"message": "Loaded", "grid_update": state.get_payload()}
    except Exception as e:
        return {"error": f"System Error: {str(e)}"}

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)
