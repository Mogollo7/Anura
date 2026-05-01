import requests
import json
import os

# Configuration
TAXONOMY = {
    "Dendrobates truncatus": {"family": "Dendrobatidae", "genus": "Dendrobates"},
    "Dendropsophus bogerti": {"family": "Hylidae", "genus": "Dendropsophus"},
    "Dendropsophus microcephalus": {"family": "Hylidae", "genus": "Dendropsophus"},
    "Hyloscirtus palmeri": {"family": "Hylidae", "genus": "Hyloscirtus"},
    "Leucostethus fraterdanieli": {"family": "Dendrobatidae", "genus": "Leucostethus"},
    "Pristimantis achatinus": {"family": "Craugastoridae", "genus": "Pristimantis"},
    "Pristimantis paisa": {"family": "Craugastoridae", "genus": "Pristimantis"},
    "Pristimantis penelopus": {"family": "Craugastoridae", "genus": "Pristimantis"},
    "Rhinella alata": {"family": "Bufonidae", "genus": "Rhinella"},
    "Rhinella horribilis": {"family": "Bufonidae", "genus": "Rhinella"}
}

COUNTRY_CODE = "CO"
LIMIT = 300
# The script is in LOCALIZACION/scripts/, we want the root relative to LOCALIZACION
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOCALIZACION_DIR = os.path.dirname(SCRIPT_DIR)
OUTPUT_ROOT = os.path.join(LOCALIZACION_DIR, "PAIS", COUNTRY_CODE)
GBIF_URL = "https://api.gbif.org/v1/occurrence/search"

def download_species_data(species_name):
    tax = TAXONOMY.get(species_name)
    if not tax:
        print(f"Taxonomy not found for {species_name}. Skipping.")
        return 0
        
    family = tax["family"]
    genus = tax["genus"]
    # Species folder name with underscores instead of spaces
    species_folder = species_name.replace(" ", "_")
    
    # Path: LOCALIZACION/PAIS/CO/FAMILY/GENUS/SPECIES/
    target_dir = os.path.join(OUTPUT_ROOT, family, genus, species_folder)
    os.makedirs(target_dir, exist_ok=True)
    
    print(f"Downloading data for: {species_name}...")
    params = {
        "scientificName": species_name,
        "country": COUNTRY_CODE,
        "limit": LIMIT
    }
    
    try:
        response = requests.get(GBIF_URL, params=params)
        response.raise_for_status()
        data = response.json()
        
        results = []
        for occ in data.get("results", []):
            lat = occ.get("decimalLatitude")
            lon = occ.get("decimalLongitude")
            if lat is not None and lon is not None:
                results.append({
                    "scientificName": occ.get("scientificName"),
                    "decimalLatitude": lat,
                    "decimalLongitude": lon,
                    "eventDate": occ.get("eventDate"),
                    "basisOfRecord": occ.get("basisOfRecord")
                })
        
        # Save to JSON
        filename = species_name.lower().replace(" ", "_") + ".json"
        filepath = os.path.join(target_dir, filename)
        
        with open(filepath, "w", encoding="utf-8") as f:
            json.dump(results, f, indent=4, ensure_ascii=False)
            
        print(f"Successfully saved {len(results)} occurrences to {family}/{genus}/{species_folder}/{filename}")
        return len(results)
        
    except Exception as e:
        print(f"Error downloading data for {species_name}: {e}")
        return 0

def main():
    total_records = 0
    for species in TAXONOMY.keys():
        total_records += download_species_data(species)
    
    print(f"\nDone! Total records processed: {total_records}")

if __name__ == "__main__":
    main()
