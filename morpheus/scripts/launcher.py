"""
Windows PyInstaller entrypoint.
- Shows a tkinter splash screen while uvicorn starts
- Creates a system tray icon with Open / Exit
- Opens browser after server is ready
"""
import sys
import os
import threading
import time
import webbrowser
import socket
import subprocess

# Suppress stdout/stderr in windowed PyInstaller mode
if getattr(sys, "frozen", False) and sys.stdout is None:
    class NullWriter:
        def write(self, *a): pass
        def flush(self): pass
    sys.stdout = NullWriter()
    sys.stderr = NullWriter()

# Add project root to path
if getattr(sys, "frozen", False):
    ROOT = os.path.dirname(sys.executable)
else:
    ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

sys.path.insert(0, ROOT)
os.chdir(ROOT)

from dotenv import load_dotenv
load_dotenv()

PORT = int(os.environ.get("APP_PORT", 7860))
HOST = os.environ.get("APP_HOST", "127.0.0.1")
URL = f"http://localhost:{PORT}"


def wait_for_server(timeout=30) -> bool:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            sock = socket.create_connection(("localhost", PORT), timeout=1)
            sock.close()
            return True
        except OSError:
            time.sleep(0.3)
    return False


def run_server():
    import uvicorn
    uvicorn.run("app.main:app", host=HOST, port=PORT, workers=1, log_level="warning")


def show_splash():
    try:
        import tkinter as tk
        root = tk.Tk()
        root.overrideredirect(True)

        w, h = 380, 220
        sw, sh = root.winfo_screenwidth(), root.winfo_screenheight()
        root.geometry(f"{w}x{h}+{(sw-w)//2}+{(sh-h)//2}")
        root.configure(bg="#0d1117")

        tk.Label(root, text="M", font=("Arial", 42, "bold"), bg="#0d1117", fg="#58a6ff").pack(pady=(28, 4))
        tk.Label(root, text="Morpheus", font=("Arial", 18, "bold"), bg="#0d1117", fg="#e6edf3").pack()
        tk.Label(root, text="Self-Hosted AI Workspace", font=("Arial", 10), bg="#0d1117", fg="#8b949e").pack(pady=(2, 0))

        status_var = tk.StringVar(value="Starting server...")
        tk.Label(root, textvariable=status_var, font=("Arial", 9), bg="#0d1117", fg="#6e7681").pack(pady=(20, 0))

        prog_frame = tk.Frame(root, bg="#21262d", height=3, width=320)
        prog_frame.pack(pady=10)
        prog_fill = tk.Frame(prog_frame, bg="#58a6ff", height=3, width=0)
        prog_fill.place(x=0, y=0)

        def animate():
            for i in range(1, 101):
                prog_fill.configure(width=int(3.2 * i))
                if i == 50:
                    status_var.set("Loading modules...")
                elif i == 80:
                    status_var.set("Almost ready...")
                root.update()
                time.sleep(0.025)
            status_var.set("Opening browser...")
            root.update()
            time.sleep(0.5)
            root.destroy()

        threading.Thread(target=animate, daemon=True).start()
        root.mainloop()
    except Exception:
        time.sleep(3)


def setup_tray():
    try:
        import pystray
        from PIL import Image, ImageDraw

        # Create simple icon
        img = Image.new("RGB", (64, 64), "#0d1117")
        draw = ImageDraw.Draw(img)
        draw.ellipse([8, 8, 56, 56], fill="#58a6ff")
        draw.text((22, 18), "M", fill="white")

        def on_open(icon, item):
            webbrowser.open(URL)

        def on_exit(icon, item):
            icon.stop()
            os._exit(0)

        icon = pystray.Icon(
            "Morpheus",
            img,
            "Morpheus",
            menu=pystray.Menu(
                pystray.MenuItem("Open Morpheus", on_open, default=True),
                pystray.MenuItem("Exit", on_exit),
            )
        )
        icon.run()
    except ImportError:
        pass


if __name__ == "__main__":
    # Run first-time setup if needed
    if not os.path.exists(os.path.join(ROOT, "data", "app.db")):
        import subprocess
        subprocess.run([sys.executable, os.path.join(ROOT, "scripts", "setup.py")])

    # Start server in background thread
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()

    # Show splash while server starts
    splash_thread = threading.Thread(target=show_splash, daemon=False)
    splash_thread.start()

    # Wait for server, then open browser
    def open_browser():
        if wait_for_server():
            webbrowser.open(URL)

    threading.Thread(target=open_browser, daemon=True).start()

    # Wait for splash to close
    splash_thread.join()

    # Run tray icon (blocks until exit)
    setup_tray()
