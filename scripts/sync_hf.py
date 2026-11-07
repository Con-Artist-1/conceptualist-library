import sys
from huggingface_hub import HfApi

token = sys.argv[1]
api = HfApi(token=token)
repo_id = "Diavlon/mcmaster-docs-library"

print("Deleting Cambridge folder from Hugging Face...")
try:
    api.delete_folder(
        path_in_repo="Past Papers/Cambridge",
        repo_id=repo_id,
        repo_type="dataset",
        commit_message="Remove Cambridge Curriculum"
    )
    print("Deleted Cambridge folder successfully.")
except Exception as e:
    print(f"Error deleting folder or it doesn't exist: {e}")

print("Uploading updated index.json...")
try:
    api.upload_file(
        path_or_fileobj=r"e:\The Library\search-app\public\index.json",
        path_in_repo="live_index.json",
        repo_id=repo_id,
        repo_type="dataset",
        commit_message="Update index.json after removing Cambridge and sorting new files"
    )
    print("Index uploaded successfully.")
except Exception as e:
    print(f"Error uploading index: {e}")

# Folders to sync
folders_to_sync = [
    (r"e:\The Library\Past Papers\IAL\French", "Past Papers/IAL/French"),
    (r"e:\The Library\Past Papers\IAL\IT", "Past Papers/IAL/IT"),
    (r"e:\The Library\Past Papers\IAL\Spanish", "Past Papers/IAL/Spanish"),
    (r"e:\The Library\Past Papers\IGCSE\ICT", "Past Papers/IGCSE/ICT"),
    (r"e:\The Library\Past Papers\IGCSE\Computer Science", "Past Papers/IGCSE/Computer Science")
]

for local_folder, remote_path in folders_to_sync:
    print(f"Syncing {local_folder} to {remote_path}...")
    try:
        api.upload_folder(
            folder_path=local_folder,
            path_in_repo=remote_path,
            repo_id=repo_id,
            repo_type="dataset",
            commit_message=f"Upload sorted files for {remote_path}",
            allow_patterns=["*.zip", "*.pdf"]
        )
        print(f"Synced {remote_path} successfully.")
    except Exception as e:
        print(f"Error syncing {remote_path}: {e}")

print("All Hugging Face sync tasks completed!")
