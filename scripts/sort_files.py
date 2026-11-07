import os
import shutil
import re

source_dir = r"e:\The Library\new files to sort"
dest_base = r"e:\The Library\Past Papers"

def extract_year_session(filename):
    # Try to find year (e.g., 2019, 2021)
    year_match = re.search(r'(20\d{2})', filename)
    year = year_match.group(1) if year_match else "Unknown_Year"
    
    # Try to find session (e.g., MayJune, Oct, Nov, Jan)
    session = "Unknown_Session"
    lower_fname = filename.lower()
    if 'mayjune' in lower_fname or 'may-june' in lower_fname or 'jun' in lower_fname:
        session = "May-June"
    elif 'octnov' in lower_fname or 'oct-nov' in lower_fname or 'oct' in lower_fname or 'nov' in lower_fname:
        session = "Oct-Nov"
    elif 'jan' in lower_fname:
        session = "January"
        
    return year, session

def strip_timestamp(filename):
    # Removes _1778588950672 or similar (>= 10 digits)
    return re.sub(r'_\d{10,}', '', filename)

def get_unique_filename(target_path):
    if not os.path.exists(target_path):
        return target_path
    
    base, ext = os.path.splitext(target_path)
    counter = 1
    while True:
        new_path = f"{base} ({counter}){ext}"
        if not os.path.exists(new_path):
            return new_path
        counter += 1

# Process AutomatePapers
automate_edexcel = os.path.join(source_dir, "AutomatePapers", "Edexcel")
if os.path.exists(automate_edexcel):
    for root, dirs, files in os.walk(automate_edexcel):
        for f in files:
            if f == ".DS_Store": continue
            src_file = os.path.join(root, f)
            rel_path = os.path.relpath(root, automate_edexcel)
            
            # rel_path looks like IAL\French\2019\January
            parts = rel_path.split(os.sep)
            if parts[0] == "IAL":
                dest_curriculum = "New Spec (2018)"
            elif parts[0] == "IGCSE":
                dest_curriculum = "IGCSE"
            else:
                dest_curriculum = parts[0]
                
            dest_folder = os.path.join(dest_base, dest_curriculum, *parts[1:])
            os.makedirs(dest_folder, exist_ok=True)
            
            new_filename = strip_timestamp(f)
            dest_file = get_unique_filename(os.path.join(dest_folder, new_filename))
            shutil.move(src_file, dest_file)
            print(f"Moved: {dest_file}")

# Process IAL
ial_dir = os.path.join(source_dir, "IAL")
if os.path.exists(ial_dir):
    for root, dirs, files in os.walk(ial_dir):
        for f in files:
            if f == ".DS_Store": continue
            src_file = os.path.join(root, f)
            subject = os.path.relpath(root, ial_dir).split(os.sep)[0]
            if subject == ".": continue
            
            year, session = extract_year_session(f)
            dest_folder = os.path.join(dest_base, "New Spec (2018)", subject, year, session)
            os.makedirs(dest_folder, exist_ok=True)
            
            new_filename = strip_timestamp(f)
            dest_file = get_unique_filename(os.path.join(dest_folder, new_filename))
            shutil.move(src_file, dest_file)
            print(f"Moved: {dest_file}")

# Process IGCSE
igcse_dir = os.path.join(source_dir, "IGCSE")
if os.path.exists(igcse_dir):
    for root, dirs, files in os.walk(igcse_dir):
        for f in files:
            if f == ".DS_Store": continue
            src_file = os.path.join(root, f)
            subject = os.path.relpath(root, igcse_dir).split(os.sep)[0]
            if subject == ".": continue
            
            year, session = extract_year_session(f)
            dest_folder = os.path.join(dest_base, "IGCSE", subject, year, session)
            os.makedirs(dest_folder, exist_ok=True)
            
            new_filename = strip_timestamp(f)
            dest_file = get_unique_filename(os.path.join(dest_folder, new_filename))
            shutil.move(src_file, dest_file)
            print(f"Moved: {dest_file}")

print("Sorting completed successfully.")
