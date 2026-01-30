import pandas as pd
import numpy as np
import re
import google.generativeai as genai
import traceback
import os
import sys

# 🔥 FIX: Robust Config Import
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
try: from core.config import API_KEY
except: API_KEY = None

os.environ["GRPC_VERBOSITY"] = "ERROR"
os.environ["GLOG_minloglevel"] = "2"

class SheetAgent:
    def __init__(self, grid_engine):
        self.engine = grid_engine
        self.use_llm = False
        if API_KEY:
            try:
                genai.configure(api_key=API_KEY)
                self.model = genai.GenerativeModel('gemini-2.0-flash-exp')
                self.use_llm = True
            except: pass

    def run_command(self, text: str) -> str:
        if not self.use_llm: return "Check API Key."
        return self.ask_gemini_hybrid(text)

    def ask_gemini_hybrid(self, user_query):
        df = self.engine.df
        columns = list(df.columns)
        rows_count, col_count = df.shape
        
        prompt = f"""
        You are BUSnX AI. DataFrame `df`. GRID: {rows_count}x{col_count}.
        REQUEST: "{user_query}"
        RULES: Use `""` for empty cells. Output Python code block only.
        """
        try:
            response = self.model.generate_content(prompt)
            raw = response.text
            if "```python" in raw:
                code = re.search(r"```python(.*?)```", raw, re.DOTALL).group(1).strip()
                local_vars = {'df': df, 'pd': pd, 'np': np, 'output_msg': None}
                exec(code, {}, local_vars)
                self.engine.df = local_vars['df'].fillna("").astype(str)
                return f"🤖 {local_vars.get('output_msg', 'Done')}"
            return raw
        except Exception as e: return f"❌ Error: {str(e)}"