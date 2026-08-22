import sys
import os
from pathlib import Path

# Add backend directory to sys.path
backend_dir_root = Path(__file__).resolve().parent.parent / "backend"
backend_dir_local = Path(__file__).resolve().parent / "backend"
for bdir in [backend_dir_root, backend_dir_local]:
    if bdir.exists() and str(bdir) not in sys.path:
        sys.path.insert(0, str(bdir))

# Also add project root for database resolution
project_root = Path(__file__).resolve().parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from main import app

handler = app

