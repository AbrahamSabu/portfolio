"""Entry point for Streamlit Community Cloud (and `streamlit run streamlit_app.py`)."""
import os, runpy, sys
ROOT = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, ROOT)
runpy.run_path(os.path.join(ROOT, "heloria_sim", "app.py"), run_name="__main__")
