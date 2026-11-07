import sys
from huggingface_hub import HfApi

token = sys.argv[1]
api = HfApi(token=token)
repo_id = "Diavlon/mcmaster-docs-library"

print("Cleaning up old remote folders on Hugging Face...")
for old_folder in ["Past Papers/New Spec (2018)", "Books"]:
    try:
        api.delete_folder(
            path_in_repo=old_folder,
            repo_id=repo_id,
            repo_type="dataset",
            commit_message=f"Remove legacy folder {old_folder}"
        )
        print(f"Deleted remote {old_folder}")
    except Exception as e:
        print(f"Note on {old_folder}: {e}")

print("Uploading live_index.json...")
try:
    api.upload_file(
        path_or_fileobj=r"e:\The Library\search-app\public\index.json",
        path_in_repo="live_index.json",
        repo_id=repo_id,
        repo_type="dataset",
        commit_message="Update live_index.json with IAL, IAL Books, and IGCSE Books subject structure"
    )
    print("Index uploaded successfully.")
except Exception as e:
    print(f"Error uploading index: {e}")

folders_to_sync = [
    (r"e:\The Library\Past Papers\IAL", "Past Papers/IAL"),
    (r"e:\The Library\IAL Books", "IAL Books"),
    (r"e:\The Library\IGCSE Books", "IGCSE Books")
]

for local_folder, remote_path in folders_to_sync:
    print(f"Syncing {local_folder} -> {remote_path}...")
    try:
        api.upload_folder(
            folder_path=local_folder,
            path_in_repo=remote_path,
            repo_id=repo_id,
            repo_type="dataset",
            commit_message=f"Sync {remote_path} structure",
            allow_patterns=["*.zip", "*.pdf"]
        )
        print(f"Synced {remote_path} successfully.")
    except Exception as e:
        print(f"Error syncing {remote_path}: {e}")

print("HF structure sync completed!")
