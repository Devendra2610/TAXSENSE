import subprocess
import time
import webbrowser
import sys
import os

def start_dashboard():
    print("=" * 60)
    print("         TAX AUDIT & ITR REVIEW DASHBOARD LAUNCHER")
    print("=" * 60)
    
    # Ensure current directory is correct
    script_dir = os.path.dirname(os.path.abspath(__file__))
    os.chdir(script_dir)
    
    print("\n[1/3] Starting backend FastAPI server via Uvicorn...")
    
    # Launch uvicorn as a subprocess
    try:
        # Command to run uvicorn
        cmd = [sys.executable, "-m", "uvicorn", "backend.main:app", "--host", "127.0.0.1", "--port", "8000", "--reload"]
        
        # Start subprocess
        process = subprocess.Popen(cmd, cwd=script_dir)
        
        print("[2/3] Waiting for server to initialize (2 seconds)...")
        time.sleep(2)
        
        url = "http://127.0.0.1:8000/"
        print(f"[3/3] Opening dashboard in your default browser: {url}")
        webbrowser.open(url)
        
        print("\n" + "=" * 60)
        print("          DASHBOARD IS NOW ACTIVE AND RUNNING")
        print("  Press Ctrl+C in this terminal window to shut down the server.")
        print("=" * 60 + "\n")
        
        # Wait for the process to finish (blocks until Ctrl+C)
        process.wait()
        
    except KeyboardInterrupt:
        print("\n\nShutting down backend server...")
        process.terminate()
        print("Dashboard shut down successfully.")
    except Exception as e:
        print(f"\nError occurred while launching: {e}")
        print("Please check if uvicorn or fastapi is installed in your python environment.")

if __name__ == "__main__":
    start_dashboard()
