import sys
from huggingface_hub import HfApi

token = sys.argv[1]
api = HfApi(token=token)
repo_id = "Diavlon/mcmaster-docs-library"

print("Deleting Past Papers/Edexcel from Hugging Face...")
try:
    api.delete_folder(
        path_in_repo="Past Papers/Edexcel",
        repo_id=repo_id,
        repo_type="dataset",
        commit_message="Remove duplicate Edexcel folder"
    )
    print("Deleted Past Papers/Edexcel folder successfully.")
except Exception as e:
    print(f"Note on delete: {e}")

print("Uploading live_index.json...")
try:
    api.upload_file(
        path_or_fileobj=r"e:\The Library\search-app\public\index.json",
        path_in_repo="live_index.json",
        repo_id=repo_id,
        repo_type="dataset",
        commit_message="Update index with clean Past Papers tree structure"
    )
    print("Index uploaded successfully.")
except Exception as e:
    print(f"Error uploading index: {e}")

folders_to_sync = [
    (r"e:\The Library\Past Papers\IAL", "Past Papers/IAL"),
    (r"e:\The Library\Past Papers\IGCSE", "Past Papers/IGCSE")
]

for local_folder, remote_path in folders_to_sync:
    print(f"Syncing {local_folder} -> {remote_path}...")
    try:
        api.upload_folder(
            folder_path=local_folder,
            path_in_repo=remote_path,
            repo_id=repo_id,
            repo_type="dataset",
            commit_message=f"Sync clean folder structure for {remote_path}",
            allow_patterns=["*.zip", "*.pdf"]
        )
        print(f"Synced {remote_path} successfully.")
    except Exception as e:
        print(f"Error syncing {remote_path}: {e}")

print("Clean structure sync completed!")
