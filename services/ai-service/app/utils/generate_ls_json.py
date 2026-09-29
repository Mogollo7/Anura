import os
import json
import uuid

# app/utils -> ai-service -> services -> repo
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", ".."))
RAW_IMAGES_DIR = os.path.join(REPO_ROOT, "datasets", "raw")
OUTPUT_JSON = os.path.join(REPO_ROOT, "datasets", "labeled", "pre_annotated_dataset.json")

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
                    
                    rel_from_repo = "./" + os.path.relpath(full_path, REPO_ROOT).replace("\\", "/")

                    task = {
                        "data": {
                            "image": rel_from_repo,
                            "original_path": rel_from_repo
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
