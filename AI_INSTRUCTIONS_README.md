# Conceptualist Systems Library - AI Assistant Guide

Welcome! If you are an AI assistant tasked with working on this directory (`e:\The Library\Past Papers`, `e:\The Library\IAL Books`, and `e:\The Library\IGCSE Books`), please read this document carefully before making any changes. This library powers the Conceptualist Systems web application and Hugging Face dataset (`Diavlon/mcmaster-docs-library`).

## 1. Directory Structure

The library is a curated **100% Pearson Edexcel** collection containing **13,309 files** (`13,238` past papers/resources + `71` textbooks) covering **January 2003 – January 2026**.

**Main Root Folders:**
1. **`Past Papers\IAL`**: Contains Pearson Edexcel International A-Level (IAL) and legacy GCE papers across 19 subjects (`9,701` files).
2. **`Past Papers\IGCSE`**: Contains Pearson Edexcel International GCSE papers across 18 subjects (`3,537` files).
3. **`IAL Books`**: Contains official Edexcel IAL student textbooks, lab books, and solution banks sorted by subject (`60` files across 9 subjects).
4. **`IGCSE Books`**: Contains official Edexcel IGCSE (9–1) student textbooks sorted by subject (`11` files across 10 subjects).

**Typical Hierarchy:**
- `Past Papers \ IAL \ <Subject> \ <Unit or Year> \ <Session> \ <File.pdf>`
- `Past Papers \ IGCSE \ <Subject> \ <Year> \ <Session> \ <File.pdf>`
- `IAL Books \ <Subject> \ <Book.pdf>`
- `IGCSE Books \ <Subject> \ <Book.pdf>`

---

## 2. File Naming Conventions

The naming conventions depend on the source batch:

- **Canonical Edexcel Format**: `[Subject]_[UnitCode]_[Year]-[Session]_[DocType].pdf` (e.g., `Math_WMA11_2024-Jan_QP.pdf` or `Biology_U3_2022-Jan_QP.pdf`).
- **AutomatePapers Format**: Retains clean official names inside `Year\Session` folders (e.g., `QP U1.pdf`, `MS U2.pdf`, `QP Paper1R.pdf`).

**Critical Rule:** All raw scraper timestamp suffixes (e.g., `_1700000000.pdf`) have been strictly stripped from the repository. **Do not introduce files with raw timestamp suffixes.**

---

## 3. Web Application & Indexing

The front-end web application (React 19 + Vite) located at `e:\The Library\search-app` uses a two-stage static index (`public/meta.json` for `0ms` initial tree/subject render and `public/index.json` for full client-side search).

**Rebuilding the Index:**
Whenever you add, move, or delete files in the library, you **MUST** regenerate `index.json` and `meta.json` by running the Node.js indexer:
```powershell
node "e:\The Library\search-app\scripts\generate-index.js"
```
*(If `node` is not in `PATH`, you can run it via the Antigravity IDE Electron runtime: `$env:ELECTRON_RUN_AS_NODE="1"; & "C:\Users\Diavlon\AppData\Local\Programs\Antigravity IDE\Antigravity IDE.exe" "e:\The Library\search-app\scripts\generate-index.js"`).*

**Deploying to Vercel:**
After updating the index, deploy to production (`https://www.conceptualist.uk`) using the standalone Vercel deployment script (which automatically reads `VERCEL_TOKEN` from `search-app/.env`):
```powershell
node "e:\The Library\search-app\scripts\deploy-vercel.js"
# Or via Vercel CLI:
cd "e:\The Library\search-app"
npm run build
npx vercel deploy --prod --yes --token $env:VERCEL_TOKEN
```

---

## 4. Hugging Face Dataset Sync & GitHub Push

The library acts as the master source for the Hugging Face dataset `Diavlon/mcmaster-docs-library`.
When files are updated, push the changes to Hugging Face via the Node.js or Python sync scripts (tokens are stored in `e:\The Library\search-app\.env`):
```powershell
node "e:\The Library\search-app\scripts\sync-hf.js"
# Or via Python:
python "e:\The Library\search-app\scripts\sync_hf_by_subject.py" $env:HF_TOKEN
```

To push the web application and scripts to GitHub (`GITHUB_TOKEN` and `GITHUB_REPO` configured in `search-app/.env`):
```powershell
node "e:\The Library\search-app\scripts\push-github.js"
```

### Encrypted Token Vault (Password Required from User)
All deployment credentials (`VERCEL_TOKEN`, `HF_TOKEN`, `GITHUB_TOKEN`, and `GITHUB_REPO`) are encrypted below using **AES-256-GCM** (PBKDF2-SHA256, 100,000 iterations).
If `e:\The Library\search-app\.env` is ever missing or needs to be restored, **ask the user for the vault password** and run:
```powershell
node "e:\The Library\search-app\scripts\unlock-tokens.js" "<USER_PASSWORD>"
```
Encrypted Vault Payload (`salt.iv.authTag.ciphertext`):
```text
M0rVF6hL8kSBZKddZZFsVw==.6U6izizH0zJXshHE.B0u2YJezMhxxSX+/Ba1IPA==.swY7bDh/CD67V5IOng2VkA4w4FsFfdO+rAFDkiiMIKihGXTC47sf9jlr1AonTYHYU3UDGYnEhZu05JkzbC92IK/q/VfMmP8iSU2Za3T4Gdk25v7vgbgJEOHtdLjyKu1Ox5SZUegQ1StaN/mAbgNDGe1h7Mis8+WT95hBXxZBdy6Ifrxhjju3Vfv7MVRlLlv0c4N9eBNa0eQgj8rH4U8CGji1BLeSoLWB4cPUHOJWest/KnTH0Dayv0CnEHm1/RjTBsa9LuN/n0/h3rcpaFriVStPDNIHbuHfwg8CX+BZE8sXFDmkB4YCd3Iul9hdMMhQoRByyAx9muyslDIrNo2y/TaLdAOfHRAnfLN+5XVOCyoMWgH98PQSnjmJl0BqR+7LyAT38g==
```

---

## 5. Rules for Modifying this Library

1. **Do not break the folder structures**. Stick to `Past Papers\IAL`, `Past Papers\IGCSE`, `IAL Books`, and `IGCSE Books`.
2. **Clean file names**. Ensure all newly downloaded files are stripped of junk suffixes before moving them into the main library.
3. **No Scripts at Root**. Keep scripts (`.js`, `.py`, `.bat`) inside `e:\The Library\search-app\scripts\`.
4. **Use Forward Slashes (`/`) in JSON**. Windows backslashes (`\`) break during Vite's static file copying and URL resolution.

Enjoy working with this curated 13,309-document Edexcel repository!
