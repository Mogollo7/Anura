import os
import json
import uuid

# Configuration
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW_IMAGES_DIR = r"d:\user\Downloads\Datos Crudos label-20260413T023117Z-3-001\Datos Crudos label"
OUTPUT_JSON = os.path.join(BASE_DIR, "data", "pre_annotated_dataset.json")

def main():
    ls_tasks = []
    
    # Walk through the directory
    for root, dirs, files in os.walk(RAW_IMAGES_DIR):
        for file in files:
            if file.lower().endswith(('.png', '.jpg', '.jpeg', '.webp', '.bmp')):
                full_path = os.path.join(root, file)
                
                # We expect the structure to be:
                # RAW_IMAGES_DIR / Family / Genus / Species / filename
                rel_path = os.path.relpath(root, RAW_IMAGES_DIR)
                parts = rel_path.split(os.sep)
                
                if len(parts) >= 3:
                    family = parts[0]
                    genus = parts[1]
                    species = parts[2]
                    
                    # Construct taxonomy array
                    taxonomy_path = [family, genus, species]
                    
                    # In Label Studio, local files can be referenced using the Local Storage feature
                    # But for now, we write the absolute path. Note: You must setup local storage in LS 
                    # for absolute paths to render as images, or upload them to a server.
                    # As a safe default locally:
                    image_url = "file:///" + full_path.replace("\\", "/")
                    
                    task = {
                        "data": {
                            "image": image_url,
                            "original_path": full_path # Helper field
                        },
                        "annotations": [{
                            "result": [{
                                "id": str(uuid.uuid4())[:10],
                                "type": "taxonomy",
                                "value": {
                                    "taxonomy": [
                                        taxonomy_path
                                    ]
                                },
                                "origin": "manual",
                                "to_name": "image",
                                "from_name": "taxonomy"
                            }]
                        }]
                    }
                    ls_tasks.append(task)
                    
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(ls_tasks, f, indent=2, ensure_ascii=False)
        
    print(f"Generated {len(ls_tasks)} pre-annotated tasks in {OUTPUT_JSON}")

if __name__ == "__main__":
    main()
