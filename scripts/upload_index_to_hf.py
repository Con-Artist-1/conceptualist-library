import sys
from huggingface_hub import HfApi

token = sys.argv[1]
api = HfApi(token=token)

repo_id = "Diavlon/mcmaster-docs-library"
file_path = "e:/The Library/search-app/public/index.json"
path_in_repo = "live_index.json"

print(f"Uploading {file_path} to {repo_id} as {path_in_repo}...")
try:
    api.upload_file(
        path_or_fileobj=file_path,
        path_in_repo=path_in_repo,
        repo_id=repo_id,
        repo_type="dataset",
        commit_message="Update index.json with forward slashes"
    )
    print("Upload successful!")
except Exception as e:
    print(f"Error: {e}")
