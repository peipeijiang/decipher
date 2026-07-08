#!/usr/bin/env python3
"""Packaged app entry point — API + SPA frontend, port 18888."""
import os
import sys
import threading
import webbrowser

# Determine frontend directory
if getattr(sys, 'frozen', False):
    # PyInstaller bundle: frontend/dist is next to the binary
    BASE = sys._MEIPASS
    FRONTEND_DIR = os.path.join(BASE, "frontend", "dist")
else:
    BASE = os.path.dirname(os.path.abspath(__file__))
    FRONTEND_DIR = os.path.join(BASE, "..", "frontend", "dist")

# Workdir to app base so relative paths resolve
os.chdir(BASE)

# Import the FastAPI app
from main import app
from starlette.staticfiles import StaticFiles
from starlette.responses import FileResponse

# Mount frontend SPA (catch-all AFTER all API routes are registered)
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    file_path = os.path.join(FRONTEND_DIR, full_path) if full_path else os.path.join(FRONTEND_DIR, "index.html")
    if os.path.isfile(file_path):
        return FileResponse(file_path)
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

@app.get("/")
async def serve_root():
    return FileResponse(os.path.join(FRONTEND_DIR, "index.html"))

def open_browser():
    import time
    time.sleep(2)
    webbrowser.open("http://localhost:18888")

if __name__ == "__main__":
    import uvicorn
    threading.Thread(target=open_browser, daemon=True).start()
    uvicorn.run(app, host="127.0.0.1", port=18888, log_level="info")
