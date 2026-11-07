import os
import shutil

past_papers = r"e:\The Library\Past Papers"
edexcel_dir = os.path.join(past_papers, "Edexcel")
ial_src = os.path.join(edexcel_dir, "IAL")
igcse_src = os.path.join(edexcel_dir, "IGCSE")

new_spec_dest = os.path.join(past_papers, "New Spec (2018)")
igcse_dest = os.path.join(past_papers, "IGCSE")

def merge_folders(src_root, dest_root):
    if not os.path.exists(src_root):
        return
    for root, dirs, files in os.walk(src_root):
        for f in files:
            src_file = os.path.join(root, f)
            rel_path = os.path.relpath(src_file, src_root)
            dest_file = os.path.join(dest_root, rel_path)
            
            os.makedirs(os.path.dirname(dest_file), exist_ok=True)
            
            if os.path.exists(dest_file):
                base, ext = os.path.splitext(dest_file)
                counter = 1
                while True:
                    candidate = f"{base} ({counter}){ext}"
                    if not os.path.exists(candidate):
                        dest_file = candidate
                        break
                    counter += 1
                    
            shutil.move(src_file, dest_file)
            print(f"Moved: {src_file} -> {dest_file}")

print("Merging Edexcel IAL -> New Spec (2018)...")
merge_folders(ial_src, new_spec_dest)

print("Merging Edexcel IGCSE -> IGCSE...")
merge_folders(igcse_src, igcse_dest)

# Remove Edexcel directory
if os.path.exists(edexcel_dir):
    shutil.rmtree(edexcel_dir)
    print("Removed Past Papers/Edexcel directory.")

print("Merge completed successfully.")
