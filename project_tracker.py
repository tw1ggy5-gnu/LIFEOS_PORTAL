import os
import json
import glob
from pathlib import Path

# Paths to scan for projects
SEARCH_PATHS = [
    Path.home() / "Documents",
    Path.home() / "OneDrive" / "Documents"
]

# Output path for the LIFEOS dashboard
OUTPUT_FILE = Path.home() / "Documents" / "LIFEOS_PORTAL" / "assets" / "data.js"

def find_projects():
    projects = []
    
    # We will look for directories that contain a status.json
    for base_path in SEARCH_PATHS:
        if not base_path.exists():
            continue
            
        # Traverse directories up to 2 levels deep
        for root, dirs, files in os.walk(base_path):
            # Limit depth
            depth = root[len(str(base_path)):].count(os.sep)
            if depth > 2:
                dirs.clear() # Stop traversing further
                continue
                
            if "status.json" in files:
                status_path = Path(root) / "status.json"
                try:
                    with open(status_path, "r", encoding="utf-8") as f:
                        data = json.load(f)
                        # Ensure it has basic keys expected by the dashboard
                        if isinstance(data, dict) and "project" in data:
                            projects.append(data)
                        elif isinstance(data, list):
                            projects.extend(data)
                except Exception as e:
                    print(f"Error reading {status_path}: {e}")

    return projects

def update_dashboard_data(projects):
    try:
        # Create the JS content
        js_content = f"const projectData = {json.dumps(projects, separators=(',', ':'))};\n"
        
        # Write to assets/data.js
        with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
            f.write(js_content)
        print(f"Successfully synced {len(projects)} projects to {OUTPUT_FILE}")
    except Exception as e:
        print(f"Error writing to dashboard: {e}")

if __name__ == "__main__":
    print("Initializing LIFEOS Project Brain Scanner...")
    all_projects = find_projects()
    update_dashboard_data(all_projects)
