import sys
import traceback
import os

print(f"Python executable: {sys.executable}")
print(f"Python version: {sys.version}")
print(f"Current working directory: {os.getcwd()}")

try:
    import uvicorn
    print("uvicorn successfully imported!")
    import main
    print("main.py successfully imported!")
    print("Starting uvicorn server on http://127.0.0.1:8000 ...")
    uvicorn.run(main.app, host="127.0.0.1", port=8000, log_level="info")
except Exception as e:
    err_text = traceback.format_exc()
    print("STARTUP ERROR:\n", err_text)
    with open("startup_trace.txt", "w") as f:
        f.write(err_text)
