# ============================================================
# config.py - Secure Configuration
# ============================================================
import os
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# API Keys (Fetched securely)
API_KEY = os.getenv("GOOGLE_API_KEY")

# UI Theme Colors
ACCENT_BLUE = "#4FC3F7"
ACCENT_ORANGE = "#FF9900"
ACCENT_RED = "#FF3131"
BG_DARK = "#0e0e10"
GRID_BG = "#1f1f1f"
BORDER_COLOR = "#333333"
TEXT_COLOR = "#E0E0E0"
