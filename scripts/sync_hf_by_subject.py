import sys
from huggingface_hub import HfApi

token = sys.argv[1]
api = HfApi(token=token)
repo_id = "Diavlon/mcmaster-docs-library"

# Upload IAL folder by subject to avoid timeout
import os

ial_root = r"e:\The Library\Past Papers\IAL"
subjects = os.listdir(ial_root)
print(f"Found {len(subjects)} IAL subjects to sync")

for subj in sorted(subjects):
    subj_path = os.path.join(ial_root, subj)
    if not os.path.isdir(subj_path):
        continue
    remote = f"Past Papers/IAL/{subj}"
    print(f"\n--- Syncing {subj} -> {remote} ---")
    try:
        api.upload_folder(
            folder_path=subj_path,
            path_in_repo=remote,
            repo_id=repo_id,
            repo_type="dataset",
            commit_message=f"Upload IAL {subj}",
            allow_patterns=["*.zip", "*.pdf"]
        )
        print(f"DONE: {subj}")
    except Exception as e:
        print(f"ERROR on {subj}: {e}")

# Upload IAL Books
ial_books = r"e:\The Library\IAL Books"
if os.path.exists(ial_books):
    for subj in sorted(os.listdir(ial_books)):
        subj_path = os.path.join(ial_books, subj)
        remote = f"IAL Books/{subj}"
        print(f"\n--- Syncing IAL Book {subj} -> {remote} ---")
        try:
            if os.path.isdir(subj_path):
                api.upload_folder(
                    folder_path=subj_path,
                    path_in_repo=remote,
                    repo_id=repo_id,
                    repo_type="dataset",
                    commit_message=f"Upload IAL Books/{subj}",
                    allow_patterns=["*.zip", "*.pdf"]
                )
            else:
                api.upload_file(
                    path_or_fileobj=subj_path,
                    path_in_repo=f"IAL Books/{subj}",
                    repo_id=repo_id,
                    repo_type="dataset",
                    commit_message=f"Upload IAL Books/{subj}"
                )
            print(f"DONE: IAL Books/{subj}")
        except Exception as e:
            print(f"ERROR on IAL Books/{subj}: {e}")

# Upload IGCSE Books (now sorted by subject)
igcse_books = r"e:\The Library\IGCSE Books"
if os.path.exists(igcse_books):
    for subj in sorted(os.listdir(igcse_books)):
        subj_path = os.path.join(igcse_books, subj)
        remote = f"IGCSE Books/{subj}"
        print(f"\n--- Syncing IGCSE Book {subj} -> {remote} ---")
        try:
            if os.path.isdir(subj_path):
                api.upload_folder(
                    folder_path=subj_path,
                    path_in_repo=remote,
                    repo_id=repo_id,
                    repo_type="dataset",
                    commit_message=f"Upload IGCSE Books/{subj}",
                    allow_patterns=["*.zip", "*.pdf"]
                )
            else:
                api.upload_file(
                    path_or_fileobj=subj_path,
                    path_in_repo=f"IGCSE Books/{subj}",
                    repo_id=repo_id,
                    repo_type="dataset",
                    commit_message=f"Upload IGCSE Books/{subj}"
                )
            print(f"DONE: IGCSE Books/{subj}")
        except Exception as e:
            print(f"ERROR on IGCSE Books/{subj}: {e}")

# Upload IGCSE past papers
igcse_pp = r"e:\The Library\Past Papers\IGCSE"
if os.path.exists(igcse_pp):
    for subj in sorted(os.listdir(igcse_pp)):
        subj_path = os.path.join(igcse_pp, subj)
        if not os.path.isdir(subj_path):
            continue
        remote = f"Past Papers/IGCSE/{subj}"
        print(f"\n--- Syncing IGCSE PP {subj} -> {remote} ---")
        try:
            api.upload_folder(
                folder_path=subj_path,
                path_in_repo=remote,
                repo_id=repo_id,
                repo_type="dataset",
                commit_message=f"Upload IGCSE {subj}",
                allow_patterns=["*.zip", "*.pdf"]
            )
            print(f"DONE: IGCSE {subj}")
        except Exception as e:
            print(f"ERROR on IGCSE {subj}: {e}")

print("\n=== ALL SYNC COMPLETED ===")
