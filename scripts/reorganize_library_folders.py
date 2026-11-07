import os
import shutil

library_root = r"e:\The Library"

# 1. Move Past Papers/New Spec (2018) contents -> Past Papers/IAL
new_spec_dir = os.path.join(library_root, "Past Papers", "New Spec (2018)")
ial_dir = os.path.join(library_root, "Past Papers", "IAL")

if os.path.exists(new_spec_dir):
    os.makedirs(ial_dir, exist_ok=True)
    for item in os.listdir(new_spec_dir):
        s = os.path.join(new_spec_dir, item)
        d = os.path.join(ial_dir, item)
        if os.path.exists(d):
            if os.path.isdir(s):
                for sub in os.listdir(s):
                    shutil.move(os.path.join(s, sub), os.path.join(d, sub))
                os.rmdir(s)
            else:
                shutil.move(s, d)
        else:
            shutil.move(s, d)
    try:
        shutil.rmtree(new_spec_dir)
    except Exception as e:
        print(f"Could not remove {new_spec_dir}: {e}")
    print("Moved Past Papers/New Spec (2018) -> Past Papers/IAL")

# 2. Move Books contents -> IAL Books
books_dir = os.path.join(library_root, "Books")
ial_books_dir = os.path.join(library_root, "IAL Books")

if os.path.exists(books_dir):
    os.makedirs(ial_books_dir, exist_ok=True)
    for item in os.listdir(books_dir):
        s = os.path.join(books_dir, item)
        d = os.path.join(ial_books_dir, item)
        if os.path.exists(d):
            if os.path.isdir(s):
                for sub in os.listdir(s):
                    shutil.move(os.path.join(s, sub), os.path.join(d, sub))
                os.rmdir(s)
            else:
                shutil.move(s, d)
        else:
            shutil.move(s, d)
    try:
        shutil.rmtree(books_dir)
    except Exception as e:
        print(f"Could not remove {books_dir}: {e}")
    print("Moved Books -> IAL Books")

# 3. Sort IGCSE Books by subject
igcse_books_dir = os.path.join(library_root, "IGCSE Books")
if os.path.exists(igcse_books_dir):
    mapping = {
        "Accounting": ["Accounting"],
        "Biology": ["Biology .pdf"],
        "Business": ["Business.pdf"],
        "Chemistry": ["Chemistry.pdf"],
        "Economics": ["Economics.pdf"],
        "Further Pure Maths": ["Further Pure Mathematics"],
        "Human Biology": ["Human Biology"],
        "Physics": ["Physics"],
        "Information Technology": ["Information and Communication Technology"],
        "Maths": ["Mathematics_A"]
    }
    
    for f in os.listdir(igcse_books_dir):
        src_path = os.path.join(igcse_books_dir, f)
        if not os.path.isfile(src_path):
            continue
            
        matched_subject = "General"
        for subj, patterns in mapping.items():
            if any(p.lower() in f.lower() for p in patterns):
                matched_subject = subj
                break
                
        target_dir = os.path.join(igcse_books_dir, matched_subject)
        os.makedirs(target_dir, exist_ok=True)
        dest_path = os.path.join(target_dir, f)
        shutil.move(src_path, dest_path)
        print(f"Moved IGCSE Book: {f} -> {matched_subject}/")

print("Reorganization complete.")
