# Conceptualist Systems — Multi-Board Architecture & Exam Board Deep-Dive

**Status:** Implemented & Fully Rolled Out in `v8.1.0` (`78,739` Archived Files / `74,877` Unique Records across `62` Edexcel Subjects + All `107/107` International Cambridge Syllabuses `2002–2026`)  
**Target Scope:** Strictly **International Exam Boards Only** (excluding UK domestic GCSE / GCE A-Level boards such as OCR, UK AQA, UK Edexcel GCE, and WJEC/Eduqas). Adding **Cambridge International (CAIE — International AS & A Level, IGCSE, O Level)** alongside **Pearson Edexcel International (IAL & IGCSE)** via an isolated, extensible **Board Switcher + Pluggable Adapter** architecture—designed so future international boards (**OxfordAQA** International A-Level/GCSE, **IB Diploma**, **AP**) can be added cleanly without modifying core UI layouts, breaking search precision, or disrupting existing Edexcel routes and data.

---

## Table of Contents

1. [Core Design Philosophy & Non-Negotiable Invariants](#1-core-design-philosophy--non-negotiable-invariants)
2. [Deep Dive: How Pearson Edexcel Works](#2-deep-dive-how-pearson-edexcel-works)
3. [Deep Dive: How Cambridge International (CAIE) Works](#3-deep-dive-how-cambridge-international-caie-works)
4. [Side-by-Side Comparison: Edexcel vs Cambridge](#4-side-by-side-comparison-edexcel-vs-cambridge)
5. [Pluggable Multi-Board Architecture (Data, Folders, Parsers, Unification)](#5-pluggable-multi-board-architecture)
6. [Search Engine Isolation & Collision Prevention](#6-search-engine-isolation--collision-prevention)
7. [Performance, Partitioned Indexing & Serverless Scaling](#7-performance-partitioned-indexing--serverless-scaling)
8. [UI / UX, Reader & SEO Blueprint](#8-ui--ux-reader--seo-blueprint)
9. [Upstream Sync Strategy (`sync-sources.js`)](#9-upstream-sync-strategy)
10. [Phased Implementation Roadmap](#10-phased-implementation-roadmap)

---

## 1. Core Design Philosophy & Non-Negotiable Invariants

### The Architectural Shift: Board-First Isolation
Today, the Conceptualist Systems app treats the catalog as a binary Edexcel world (`spec === 'IGCSE' ? 'Edexcel IGCSE' : 'Edexcel IAL'`). Bolting Cambridge onto that flat structure would cause:
- **UI bloat:** 5–6 curriculum pills wrapping the search bar, 140+ subject cards on one homepage, and mismatched session dropdowns (`January` vs `Feb/March`).
- **Search engine collisions:** Edexcel query rules (`pure 1 -> wma11`, 2-digit numbers `12 -> 2012`, `winter -> January`) actively break Cambridge queries (`9709 pure 1`, `0625 22`, `9702 w24`).
- **Memory & payload walls:** Monolithic `public/index.json` (already `4.1 MB` for 16,051 Edexcel records) would balloon to `20–30 MB` once Cambridge (50,000–100,000+ records) is added, hurting mobile Safari Web Workers and Vercel serverless function bundles.

Instead, we adopt a **Board Switcher + Board Adapter Registry** architecture:
- Every exam board is an **isolated module** with its own folder root, parser adapter, syllabus catalog, session taxonomy, partitioned index file, URL prefix, and theme badge accent.
- The **UI always focuses on one active board at a time** (with optional cross-board discovery when a user explicitly selects *All Boards* or types a foreign syllabus code like `0625` while browsing Edexcel).
- Adding a 3rd or 4th international board later (e.g., **OxfordAQA**, **IB Diploma**, **AP**) requires **registering one new adapter + config entry**, not rewriting search, routing, or UI components. *(Crucially, OxfordAQA also uses 4-digit `9xxx` syllabus codes like `9610`/`9620`/`9630`/`9660` and `9201`–`9260`, so board-first isolation protects against future 4-digit code overlap too!)*

### Non-Negotiable Invariants (Zero Regressions on Edexcel)
1. **Zero breaking changes to Edexcel sitting keys:** Keep `spec = 'IAL'` and `spec = 'IGCSE'` verbatim so all existing MongoDB `paper_views` keys (`IAL|Physics|WPH11||June 2024`), `audio_subtitles` keys, `localStorage` history snapshots, and `#paper=...` deep links continue working without migration.
2. **Zero breaking changes to Edexcel URLs:** All 296 currently indexed canonical Edexcel routes (`/ial/...`, `/igcse/...`, `/textbooks/ial/...`, `/textbooks/igcse/...`) remain untouched to preserve Google Search Console rankings.
3. **Zero re-uploads of existing Hugging Face files:** Keep `Past Papers/IAL`, `Past Papers/IGCSE`, `IAL Books`, and `IGCSE Books` physical paths untouched.
4. **Zero-overhead Edexcel boot:** An Edexcel student must never download a single byte of Cambridge catalog JSON during normal browsing.
5. **Strict Non-Affiliation Legal Rule:** Never claim "Official Pearson", "Official Edexcel", or "Official Cambridge". Always maintain independent study archive disclaimers for both **Pearson Edexcel** and **Cambridge University Press & Assessment (CAIE)**.

---

## 2. Deep Dive: How Pearson Edexcel Works

### 2.1 Qualification & Specification Structure

| Level | Spec Codes | Assessment Model | Key Structural Features |
| :--- | :--- | :--- | :--- |
| **Edexcel IAL** | Cash-in: `X*` (AS), `Y*` (A2)<br>Units: `W*1x` (2018+), `W*0x` (Legacy), `6*` (Legacy GCE) | **100% Modular** (unit-by-unit exams; candidates cash in units for AS/A2 using UMS scores) | • Sciences have **6 units** (`U1–U6`; `U3` & `U6` are written Practical Alternatives, not lab exams).<br>• Mathematics has **20 distinct module units** (`P1–P4`, `M1–M3`, `S1–S3`, `D1`, `FP1–FP3`, plus legacy `C12`/`C34`/`C1–C4`).<br>• 2018 spec overhaul shifted `WPH01–06` → `WPH11–16`, `WCH01–06` → `WCH11–16`, `WBI01–06` → `WBI11–16`, `WBS01–04` → `WBS11–14`, `WEC01–04` → `WEC11–14`.<br>• History units have **Lettered Options** (`OptA–OptD`). |
| **Edexcel IGCSE (9–1)** | Linear: `4*1` / `4*0`<br>Modular (2024+): `4W*1`<br>Legacy: `4*0`, `4400`, `4357`, `4308`, `7042` | **Linear** (all papers sat together) + **Modular** (2024+ unit-by-unit `4W*1` route in 14 subjects) | • **Tiering:** Maths A (`4MA1` / `4WM1H` / `4WM1F`) splits into **Foundation (`1F`/`2F`)** and **Higher (`1H`/`2H`)**; legacy `4MA0` used `3H`/`4H` for Higher.<br>• **Regional (`R`) Variants:** Time-zone alternative papers (`1R`, `2R`, `1HR`, `2HR`, `WMA11R`, `Alt A`) sat in East Asia / Middle East.<br>• **Double Award Science (`4SD0` / `4WSD1`):** Shares `1B`, `1C`, `1P` papers with Triple Sciences.<br>• **History (`4HI1`):** `OptA` / `OptB` + `-R`. **CS (`4CP0`):** `P2A`/`P2B`/`P2C` language variants. |

### 2.2 Exam Sessions
- **January** (`Jan` / `Jan–Feb`): Major IAL session + legacy/modular IGCSE session.
- **May / June** (`Jun` / `Summer`): Primary global session for both IAL and IGCSE.
- **October / November** (`Oct` / `Nov` / `Autumn`): IAL sits in **October**; IGCSE sits in **November**.

### 2.3 File Naming Conventions (Wild Ecosystems)
Edexcel past papers arrive in 4+ inconsistent naming styles across upstream aggregators:
1. **Raw Pearson Asset Names:** `WMA11_01_que_20240115.pdf`, `WMA11_01_rms_20240307.pdf`, `4MA1_2HR_pef_20240822.pdf`
   - Codes: `que` = Question Paper, `rms` / `msc` / `mcs` / `eams` = Mark Scheme, `pef` / `perf` = Examiner Report.
   - *Quirk:* The `YYYYMMDD` date in `_rms_` and `_pef_` files is the **results-day release date** (2–3 months *after* the exam sitting!), NOT the exam date (`20240307` = Jan 2024 MS, `20240822` = June 2024 ER).
2. **Canonical Aggregator Names:** `Math_WMA11_2024-Jan_QP.pdf`, `Biology_U3_2022-Jan_QP.pdf`.
3. **AutomatePapers Folder-Dependent Names:** `Past Papers/IGCSE/Physics/2023/June/QP Paper1R.pdf`, `MS U2.pdf`.
4. **Supplemental Assets:** Solomon practice packs (`Sol-A`..`Sol-L`), combined multi-unit language listening archives (`Audio U2U4.zip`), practical IT/CS ZIPs (`DF`), and 14 IAL Maths Worked Solution Bank ZIPs (`SOL`).

### 2.4 How Edexcel Students Actually Search & Study
1. **Unit-Code-First Mental Model:** IAL students memorize 5-character **unit codes** (`WMA11`, `WPH14`, `WCH12`, `WBI15`, `WEC13`) or module shorthands (`P1`, `P3`, `M1`, `S1`, `FP2`, `U1`, `U4`). IGCSE students memorize 4-character **spec + paper + tier/regional tags** (`4MA1 2HR`, `4PH1 1PR`, `4BI1 2B`, `4WCH1`).
2. **Real Query Examples:**
   - `"wma11 jan 2024"` / `"p3 oct 2023 ms"` / `"pure 2 june 2025"`
   - `"wph11 unit 1 2022"` / `"chem u4 oct 24"` / `"bio u3"`
   - `"4ma1 2hr june 2023"` / `"4ph1 1pr"` / `"igcse math higher regional"`
   - `"solomon m1"` / `"wfr02 audio"` / `"p2 solution bank"`
3. **Spec Isolation Matters:** Students revising 2018+ IAL Physics (`WPH11`) know old-spec `WPH01` has slightly shifted topics; they want **Current Spec** listed first and **Legacy Pre-2018** clearly separated underneath.
4. **Doubling Practice via `R` Papers:** IGCSE students intentionally solve **both** the standard paper (`1H`) and the Regional paper (`1HR`) from the same year—they want both clearly labeled right next to each other.
5. **Core Study Loop:** Open `QP` + `MS` in **Split View** → check `ER` (Examiner Report) for hard questions → look up worked steps in **Solution Banks** (for IAL Maths) → play **Listening Audio + Synced Subtitles** inline above Language/ESL papers.

---

## 3. Deep Dive: How Cambridge International (CAIE) Works

### 3.1 Qualification Structure

| Level | Syllabus Code Range | Assessment Model | Key Structural Features |
| :--- | :--- | :--- | :--- |
| **Cambridge IGCSE (A\*–G)** | `04xx`, `05xx`, `06xx` (e.g. `0580`, `0625`, `0620`, `0610`, `0500`, `0510`, `0478`, `0417`, `0455`, `0450`, `0452`) | **Linear** (usually 2–3 papers depending on Core/Extended & Practical/ATP choice) | • **Core (grades C–G)** vs **Extended (grades A\*–G)** tiers in Maths & Sciences.<br>• Sciences offer **Paper 5 (Hands-on Lab Practical)** OR **Paper 6 (Alternative to Practical — ATP)**.<br>• Multiple distinct syllabuses can share the same subject name: e.g. `0580` Mathematics, `0606` Additional Mathematics, `0607` International Mathematics, `0510` ESL (Speaking Endorsement), `0511` ESL (Count-in Speaking). |
| **Cambridge IGCSE (9–1)** | `09xx` & `71xx` (e.g. `0970`, `0971`, `0972`, `0980`, `0984`, `0990`, `0993`, `7156`) | **Identical curriculum & exam papers** to A\*–G counterparts—only the grading scale (`9–1`) differs! | Widely taken by international schools across **Administrative Zone 3** (Middle East & North Africa — UAE, Egypt, Saudi Arabia, Qatar, Jordan, Oman, Bahrain — plus Europe). **Must be linked/aliased directly to A\*–G counterparts** (see §3.5) so we never store duplicate PDFs while supporting `0972` search & browsing seamlessly. |
| **Cambridge AS & A Level** | `9xxx` (plus `8xxx` AS-only languages/GP, e.g. `8021` English General Paper, `9709` Maths, `9231` Further Maths, `9702` Physics, `9701` Chemistry, `9700` Biology, `9618` CS, `9626` IT, `9708` Economics, `9609` Business, `9706` Accounting, `9990` Psychology, `9093` English Lang, `9695` Literature, `9696` Geography, `9489` History, `9084` Law, `9699` Sociology) | **Staged Linear** (AS papers taken in Year 12, A2 papers in Year 13, or all together) | • **Sciences (`9700`/`9701`/`9702`) follow a universal 5-paper blueprint:**<br>  - `P1`: AS Multiple Choice (40 MCQ)<br>  - `P2`: AS Structured Questions<br>  - `P3`: AS Advanced Practical Skills (Lab — **6 variants: `31–36`**!)<br>  - `P4`: A Level Structured Questions (A2 + assumed AS)<br>  - `P5`: A Level Planning, Analysis & Evaluation (written practical)<br>• **Maths (`9709`):** 6 papers (`P1` Pure 1, `P2` Pure 2, `P3` Pure 3, `P4` Mechanics, `P5` Prob & Stats 1, `P6` Prob & Stats 2). |
| **Cambridge O Level** | `1xxx`, `2xxx`, `3xxx`, `4xxx`, `5xxx`, `7xxx` (e.g. `4024` Maths D, `4037` Add Maths, `5054` Physics, `5070` Chemistry, `5090` Biology, `2058` Islamiyat, `2059` Pakistan Studies, `1123` English, `2210` CS, `2281` Economics, `7707` Accounting, `7115` Business, `3204` Bengali, `3248` Urdu) | **Linear** (untiered, grades A\*–E) | Huge demand across South Asia (Pakistan, Bangladesh, Sri Lanka, Singapore, Mauritius, Brunei). Usually **only 2 variants (`1` & `2`: `11/12`, `21/22`)** and **2 sessions (`May/June` & `Oct/Nov`)**—no Feb/March series. |

### 3.2 Exam Series (Sessions) & Official Series Letters
Cambridge uses **single-letter series codes** embedded directly in every filename:

| Series Code | Official Name | Common Student Shorthands | Geography & Variant Rule |
| :---: | :--- | :--- | :--- |
| **`m`** | **February / March** | `m24`, `fm24`, `f/m`, `feb march`, `mar` | Primarily **India** (and select regional centers); restricted subject list; uses **Variant `2` exclusively** (`12`, `22`, `42`, `62`). Students worldwide treat Feb/March as the freshest mock paper right before May/June! |
| **`s`** | **May / June** | `s24`, `mj24`, `m/j`, `may june`, `summer` | Global main series; all 3 variants (`1`, `2`, `3`, and `31–36` for A-Level science practicals). |
| **`w`** | **October / November** | `w24`, `on24`, `o/n`, `oct nov`, `winter` | Global autumn/winter series; all 3 variants (`1`, `2`, `3`, and `31–36` for practicals). **CRITICAL:** In Cambridge, `w` / `winter` means **Oct/Nov**, NOT January! |

*(Rare legacy/special prefix: `y` for Specimen/Syllabus year e.g. `0625_y25_sp_4.pdf`, or `g` occasionally seen in ICT `0417` practical despatch packs like `g24_qp_21_sf.zip`.)*

### 3.3 Official Cambridge Filename Anatomy & Document Type Matrix

Cambridge's official file naming convention is remarkably clean and uniform compared to Edexcel:

```text
Modern (2010+):   <4-digit syllabus>_<series><2-digit year>_<doctype>[_<component>].<ext>
  Examples:       0625_s24_qp_42.pdf     (Physics 0625, May/June 2024, Question Paper, Paper 4 Variant 2)
                  9709_w23_ms_12.pdf     (Maths 9709, Oct/Nov 2023, Mark Scheme, Paper 1 Variant 2)
                  0500_m25_in_12.pdf     (First Lang English 0500, Feb/March 2025, Insert, Paper 1 Variant 2)
                  9701_s24_ci_33.pdf     (Chem 9701, May/June 2024, Confidential Instructions, Practical 33)
                  0625_s24_gt.pdf        (Physics 0625, May/June 2024, Grade Thresholds — NO component!)
                  0625_s24_er.pdf        (Physics 0625, May/June 2024, Examiner Report — NO component!)
                  0417_s24_sf_21.zip     (ICT 0417, May/June 2024, Practical Source Files, Paper 2 Variant 1)
                  0510_s24_sf_22.mp3     (ESL 0510, May/June 2024, Listening Sound File, Paper 2 Variant 2)
                  0510_s24_tn_22.pdf     (ESL 0510, May/June 2024, Listening Transcript / Tapescript, Paper 2 Variant 2)

Legacy (2002–09): <4-digit syllabus>_<series><2-digit year>_<doctype>_<1-digit or 0-padded paper>.<ext>
  Examples:       9709_s08_qp_1.pdf      (Pre-variant era: Paper 1, global single paper)
                  9702_s09_qp_03.pdf     (Zero-padded Paper 3, no variant digit)
```

#### Complete Cambridge Document Type Code Mapping

| CIE Code | Official Meaning | Granularity | Maps to Conceptualist `docType` | UI Label / Behavior |
| :---: | :--- | :--- | :---: | :--- |
| **`qp`** | Question Paper | Per-component-variant (`42`) | **`QP`** | `Question Paper` / `QP` (Left pane in Split View) |
| **`ms`** | Mark Scheme | Per-component-variant (`42`) | **`MS`** | `Mark Scheme` / `MS` (Right pane in Split View) |
| **`er`** | Examiner Report | **Per-syllabus-session** (shared!) | **`ER`** | `Examiner Report` / `ER` (Auto-attached to all sittings in that session) |
| **`gt`** | Grade Thresholds | **Per-syllabus-session** (shared!) | **`GT`** *(new)* | `Thresholds` / `GT` (Auto-attached to all sittings in that session — huge Cambridge USP!) |
| **`in`** | Insert (Reading passage, map, source text) | Per-component-variant (`12`) | **`SC`** (`subType: 'IN'`) | `Insert` / `IN` (Allow **Split View `QP | IN`** alongside `QP | MS`!) |
| **`ci`** | Confidential Instructions (Lab setup) | Per-component-variant (`33`) | **`SC`** (`subType: 'CI'`) | `Lab Setup` / `CI` |
| **`tn`** | Transcript / Tapescript (Listening text) | Per-component-variant (`22`) | **`SC`** (`subType: 'TN'`) | `Transcript` (Also feeds forced-alignment subtitle indexer!) |
| **`pm`** | Pre-Release Material (CS / Business case study) | Per-component-variant (`22`) | **`SC`** (`subType: 'PM'`) | `Pre-Release` / `PM` |
| **`sf`** | Source Files (`.zip` for ICT `0417`/`9626` OR `.mp3` for Languages/ESL!) | Per-component-variant (`21`) | **`.mp3`/`.wav` or Audio ZIP → `AUD`**<br>**ICT/IT/CS `.zip` → `DF`** | Extension + subject disambiguates `sf` cleanly! |
| **`qr` / `rp`** | Listening Recording / Role Play / Resource | Per-component-variant | `.mp3` → `AUD`, `.pdf` → `SC` | Handled by extension + context |
| **`sp` / `sm` / `su`** | Specimen Paper / Specimen MS / Specimen Update | Per-paper | **`SAM`** | `Specimen` / `SAM` (session = `Specimen YYYY`) |
| **`sy`** | Syllabus PDF | Per-syllabus | **`SAM`** *(or excluded)* | Syllabus document (optional) |

### 3.4 Administrative Zones (1–6) vs Paper Variants (`x1`, `x2`, `x3`, `31–36`)
- Cambridge divides the globe into **6 Administrative Zones** (`Zone 1`: Americas, `Zone 2`: Americas/Caribbean, `Zone 3`: UK/Europe/parts of Middle East, `Zone 4`: Africa/Middle East, `Zone 5` & `Zone 6`: South Asia / East Asia / Australasia).
- **Critical Fact:** **Zone number ≠ Variant digit!** While there are 6 administrative zones, most written papers have **3 variants** (`1`, `2`, `3`):
  - Two-digit component code `<Paper><Variant>`: e.g., `42` = **Paper 4, Variant 2**; `13` = **Paper 1, Variant 3**.
  - **Exceptions the parser MUST handle:**
    1. **AS Science Practicals (`9700`, `9701`, `9702` Paper 3):** Run across **6 lab sessions/variants: `31`, `32`, `33`, `34`, `35`, `36`** (not just `1–3`!).
    2. **Pre-2010 Legacy Papers (`2002–2009`):** Single global paper (`_1`, `_2`, `_01`, `_02`, `_03`) → `paper = 1..7`, `variant = ''` (Global).
    3. **Zero-padded single-variant components (`_01`, `_02`, `_03`, `_04`):** Modern papers with only 1 global variant (e.g. certain coursework, speaking, or niche languages) use `01`/`02` where leading `0` means *no variant* (`paper = 1`, `variant = ''`), NOT "Paper 0 Variant 1"!
    4. **Single-digit components (`_1`, `_2`, `_4`):** Same rule — `paper = N`, `variant = ''`.

### 3.5 Cambridge IGCSE 9–1 ↔ A\*–G Equivalent Syllabus Pairs (Deduplication Goldmine!)
In Cambridge IGCSE, **9–1 syllabuses and A\*–G syllabuses have functionally identical content and exam papers**—only the grade scale and cover-page code differ. Indexing the 9–1 codes as **first-class searchable aliases + subject badges** on the primary A\*–G subject (unless separate 9–1 GT PDFs are stored) saves ~20,000 duplicate PDFs while making `0972`, `0980`, `0970`, etc. work flawlessly:

| Subject | Primary A\*–G Code | Equivalent 9–1 Code |
| :--- | :---: | :---: |
| **Biology** | `0610` | `0970` |
| **Chemistry** | `0620` | `0971` |
| **Physics** | `0625` | `0972` |
| **Co-ordinated Sciences (Double Award)** | `0654` | `0973` |
| **Mathematics** | `0580` | `0980` |
| **Computer Science** | `0478` | `0984` |
| **ICT** | `0417` | `0983` |
| **English — First Language** | `0500` | `0990` |
| **English as a Second Language (Speaking Endorsement)** | `0510` | `0993` |
| **English as a Second Language (Count-in Speaking)** | `0511` | `0991` |
| **Literature in English** | `0475` *(legacy `0486`)* | `0992` |
| **Accounting** | `0452` | `0985` |
| **Business Studies** | `0450` | `0986` |
| **Economics** | `0455` | `0987` |
| **Geography** | `0460` | `0976` |
| **History** | `0470` | `0977` |
| **French (Foreign Language)** | `0520` | `7156` |
| **German (Foreign Language)** | `0525` | `7159` |
| **Spanish (Foreign Language)** | `0530` | `7160` |
| **Arabic (First Language)** | `0508` | `7180` |

#### Cambridge IGCSE vs Cambridge O Level: Shared-Paper vs Separate-Paper Reality
Unlike Pearson Edexcel (which retired O Level and only runs IGCSE), **Cambridge IGCSE** and **Cambridge O Level** are two separate, active qualifications at the same academic level (ages 14–16):
- **Different Exams & Structures (Most Core Subjects):**
  - **Mathematics:** IGCSE `0580` (Core/Extended tiered, 4 papers) ≠ O Level `4024` (untiered, 2 papers).
  - **Sciences:** IGCSE `0625` Physics / `0620` Chemistry / `0610` Biology (Core/Extended tiered, P1–P6) ≠ O Level `5054` / `5070` / `5090` (untiered, P1 MCQ, P2 Theory, P3/P4 Prac/ATP).
  - **English:** IGCSE `0500` (First Language) ≠ O Level `1123` (English Language).
  - **O-Level-Only Subjects:** `2058` Islamiyat, `2059` Pakistan Studies, `7094` Bangladesh Studies, `3204` Bengali, `3248` Urdu, etc. (widely taken in Bangladesh, Pakistan, Sri Lanka, Singapore, Mauritius, Brunei).
- **Identical Shared Papers (Same Exam Hall PDFs, Different Codes):**
  - **Computer Science:** IGCSE `0478` ≡ O Level `2210`
  - **Economics:** IGCSE `0455` ≡ O Level `2281`
  - **Business Studies:** IGCSE `0450` ≡ O Level `7115`
  - **Accounting:** IGCSE `0452` ≡ O Level `7707`
  - **Additional Mathematics:** IGCSE `0606` ≡ O Level `4037`
  - *Architecture Note:* Keep O Level (`CIE-OL`) as a dedicated curriculum tab alongside `CIE-IGCSE` and `CIE-AL` so O-Level students can browse their exact syllabus codes cleanly (with SHA-256 shared-file linking/copying where Cambridge uses identical papers, just like Edexcel Double Award Science!).

### 3.6 Critical Historical Syllabus Renumberings (A Massive Differentiator!)
Almost every existing past paper site (PapaCambridge, GCEGuide, etc.) groups files naively by raw component digit, causing students to accidentally practice the wrong paper! Our `cambridgeParser.js` will handle **year-aware paper mapping** so Conceptualist is cleaner than every competitor:

1. **AS & A Level Mathematics (`9709`) — 2020 Renumbering:**
   - **Pre-2020:** `P1` = Pure 1, `P2` = Pure 2, `P3` = Pure 3, `P4` = Mechanics 1, **`P5` = Mechanics 2**, **`P6` = Prob & Stats 1**, **`P7` = Prob & Stats 2**.
   - **2020+:** `P1` = Pure 1, `P2` = Pure 2, `P3` = Pure 3, `P4` = Mechanics, **`P5` = Prob & Stats 1**, **`P6` = Prob & Stats 2** *(M2 retired into `9231`)*.
   - **Our Mapping:** Group `2020+ P5` AND `Pre-2020 P6` cleanly under **`Probability & Statistics 1 (P5 / Old P6)`**; group `2020+ P6` AND `Pre-2020 P7` under **`Probability & Statistics 2 (P6 / Old P7)`**; isolate `Pre-2020 P5` under **`Legacy Mechanics 2 (Old P5)`**!
2. **IGCSE Sciences (`0610` Biology, `0620` Chemistry, `0625` Physics) — 2016 Renumbering:**
   - **Pre-2016:** `P1` = MCQ (Core+Ext), **`P2` = Extended Theory**, `P3` = Core Theory, `P4` = Coursework (withdrawn), `P5` = Practical, `P6` = ATP.
   - **2016+:** `P1` = Core MCQ, **`P2` = Extended MCQ**, `P3` = Core Theory, **`P4` = Extended Theory**, `P5` = Practical, `P6` = ATP.
   - **Our Mapping:** Never mix Pre-2016 `P2` (written theory!) with 2016+ `P2` (multiple choice!). Map Pre-2016 `P2` cleanly alongside Extended Theory (`Paper 4: Extended Theory (Pre-2016 P2)`) or clearly separate `Legacy Pre-2016` units—exactly like we already do for Edexcel Pre-2018 specs!
3. **IGCSE ESL (`0510` / `0511`) — 2024 Overhaul:**
   - Core/Extended tiering removed; Listening moved from old `P3`/`P4` into universal `Paper 2: Listening (100% MCQ)`. Separate Pre-2024 tiered papers (`Core`/`Extended`) cleanly from 2024+ untiered `P1`/`P2`.
4. **IGCSE Mathematics (`0580`) — 2025 Overhaul:**
   - `Paper 1` (Core, **Non-Calculator**) & `Paper 3` (Core, Calculator); `Paper 2` (Extended, **Non-Calculator**) & `Paper 4` (Extended, Calculator), rebalanced to 50%/50% weight. Label Core vs Extended clearly in Wizard group headings (`Extended Tier: P2 & P4` vs `Core Tier: P1 & P3`)!
5. **AS & A Level Further Mathematics (`9231`) — 2020 Overhaul:**
   - Pre-2020 had 2 linear papers (`P1` Pure, `P2` Mech+Stats). 2020+ split into 4 modular-style papers (`P1` Further Pure 1, `P2` Further Pure 2, `P3` Further Mechanics, `P4` Further Prob & Stats). Separate `Current Spec (2020+)` vs `Legacy Spec (Pre-2020)`.
6. **Replaced Syllabus Codes (Legacy Equivalence Links):**
   - `9618` Computer Science ← replaced `9608`
   - `9489` History ← replaced `9389`
   - `0475` Literature in English ← replaced `0486`
   - `7707` O-Level Accounting ← replaced `7110`

### 3.7 How Cambridge Students Actually Search & Study
1. **4-Digit Syllabus-Code-First Mental Model:** Every Cambridge student knows their 4-digit codes by heart (`0625`, `0620`, `0610`, `0580`, `9709`, `9702`, `9701`, `9700`, `4024`, `5054`, `2058`, `2059`).
2. **Real Query Patterns (Must All Work Out-of-the-Box!):**
   - Full cover code: `"9709/12/M/J/23"`, `"0625/42/O/N/24"`, `"9702/22/F/M/25"`
   - Filename / PapaCambridge shorthand: `"0625 s24 qp 42"`, `"9709 w23 12"`, `"0580 m24 42 ms"`, `"9701 s23 ci 33"`
   - Natural shorthand: `"0625 p4 2024"`, `"9709 pure 1 2023"`, `"9709 s1 2022"`, `"cambridge physics paper 4 extended"`, `"olevel math 4024 p1"`, `"0625 gt 2024"`
   - 9–1 queries: `"0972 paper 4"`, `"0980 2024"` → seamlessly returns `0625` / `0580` papers!
3. **Variant Grinding Strategy:**
   - Step 1: Student filters to **their own region's variant** (e.g. Variant `2`: `12`, `22`, `42`) for recent years.
   - Step 2: To get 3× more mock papers, they toggle to **All Variants** (`v1`, `v2`, `v3`) and also solve **Feb/March (`m`)** because it sits 3 months before May/June and previews the year's examiner style!
4. **Core Study Loop (`QP` + `MS` + `GT` + `IN`):**
   - Sit `QP` timed (with **`Insert (IN)`** open side-by-side for English/Geography/History/Economics!) → self-mark with **`MS` in Split View** → immediately open **`Grade Thresholds (GT)`** for that exact session to check if their raw score hits `A*`/`A` → read **`ER`** for examiner traps.

---

## 4. Side-by-Side Comparison: Edexcel vs Cambridge

| Dimension | Pearson Edexcel | Cambridge International (CAIE) |
| :--- | :--- | :--- |
| **Qualifications** | `IAL`, `IGCSE (9–1)` | `AS & A Level`, `IGCSE (A*–G & 9–1)`, `O Level` |
| **Primary Identifier** | 5-char Unit Code (`WMA11`, `WPH11`) or 4-char Spec (`4MA1`, `4WBI1`) | **4-digit numeric Syllabus Code** (`0625`, `9709`, `4024`, `2058`) |
| **Paper / Unit Structure** | Named Units (`U1–U6`) or Math branches (`P1–P4`, `M1–M3`, `S1–S3`, `D1`, `FP1–FP3`) | Numbered Papers (`P1–P6`) + **Time-Zone Variant digit** (`11/12/13`, `41/42/43`, practicals `31–36`) |
| **Sessions** | `January`, `June`, `October` (IGCSE `November`) | `Feb/March` (`m`), `May/June` (`s`), `Oct/Nov` (`w`) |
| **`winter` / `feb` meaning** | `Jan/Feb` = Winter (`January`) | `Feb/March` = `m`; **`Oct/Nov` = `w` (Winter)** |
| **Tiering** | `Higher (H)` / `Foundation (F)` (IGCSE Maths), `Modular (Mod)` | `Core` (`P1`/`P3`) vs `Extended` (`P2`/`P4`) in IGCSE Maths & Sciences |
| **Regional Variants** | `Standard` vs `Regional (R)` / `Alt A` | `Variant 1`, `Variant 2`, `Variant 3` (plus `31–36` for A-Level Practicals, `Global` pre-2010) |
| **Doc Types per Sitting** | `QP`, `MS`, `ER`, `SC`, `AUD`, `DF`, `SOL`, `SAM` | `QP`, `MS`, `ER` *(session-wide)*, **`GT`** *(session-wide)*, **`IN`** (Insert), **`CI`** (Lab Setup), `SF` (`DF`/`AUD`), `TN` (Transcript), `PM` (Pre-Release), `SAM` |
| **ER / GT Sharing** | Edexcel `ER` is usually per-unit (IGCSE sometimes multi-paper) | Cambridge `ER` & `GT` are **1 shared PDF per syllabus per session** (must attach to all papers/variants in that session) |
| **Catalog Scale** | ~19,900 files / ~16,050 unique records (`4.1 MB` index) | **~50,000–120,000+ files** across all syllabuses (`15–30 MB` if unpartitioned!) |

---

## 5. Pluggable Multi-Board Architecture

### 5.1 Declarative Board Registry (`src/data/boards.js`)
Every board is defined in a single declarative registry shared across Vite SPA, Web Worker, Node build scripts, and SEO pre-renderer:

```js
export const BOARD_REGISTRY = {
  edexcel: {
    id: 'edexcel',
    label: 'Pearson Edexcel',
    shortLabel: 'Edexcel',
    routePrefix: '', // Preserves legacy /ial and /igcse root URLs!
    specs: ['IAL', 'IGCSE'],
    curriculums: [
      { id: 'Edexcel IAL', spec: 'IAL', shortLabel: 'IAL', routeSlug: 'ial', indexFile: 'index-edexcel.json' },
      { id: 'Edexcel IGCSE', spec: 'IGCSE', shortLabel: 'IGCSE', routeSlug: 'igcse', indexFile: 'index-edexcel.json' }
    ],
    sessions: ['January', 'June', 'October'],
    supportsVariants: false, // Uses Regional (R) / Higher / Foundation inline
    parserId: 'edexcel',
    disclaimer: 'Not affiliated with Pearson plc or Edexcel.'
  },
  cambridge: {
    id: 'cambridge',
    label: 'Cambridge International',
    shortLabel: 'Cambridge',
    routePrefix: 'cambridge',
    specs: ['CIE-AL', 'CIE-IGCSE', 'CIE-OL'],
    curriculums: [
      { id: 'Cambridge AS & A Level', spec: 'CIE-AL', shortLabel: 'A-Level', routeSlug: 'cambridge/a-level', indexFile: 'index-cie-al.json' },
      { id: 'Cambridge IGCSE', spec: 'CIE-IGCSE', shortLabel: 'IGCSE', routeSlug: 'cambridge/igcse', indexFile: 'index-cie-igcse.json' },
      { id: 'Cambridge O Level', spec: 'CIE-OL', shortLabel: 'O-Level', routeSlug: 'cambridge/o-level', indexFile: 'index-cie-ol.json' }
    ],
    sessions: ['Feb/March', 'May/June', 'Oct/Nov'],
    supportsVariants: true, // Enables Variant filter (All | v1 | v2 | v3)
    parserId: 'cambridge',
    disclaimer: 'Not affiliated with Cambridge University Press & Assessment (CAIE).'
  }
  // Future international boards (oxfordaqa, ib, ap) plug in here as one new object!
  // UK domestic boards (OCR, UK AQA, UK Edexcel GCE/GCSE, WJEC/Eduqas) remain strictly excluded.
};
```

### 5.2 Record Schema Extensions (Backwards-Compatible Tuple Encoding)
Extend `keys` in `generate-index.js` cleanly with optional fields (null/empty for Edexcel so Edexcel tuple size barely moves):
- Existing 15 keys stay unchanged: `name`, `path`, `size`, `subject`, `docType`, `year`, `session`, `sortKey`, `unitCode`, `unitName`, `spec`, `category`, `variant`, `cleanUnitLabel`, `altPaths`.
- Add 2 lightweight keys (or derive `board` from `spec` in `catalogEngine.js` at 0 bytes cost!):
  - **`board`** → derived deterministically from `spec` (`SPEC_TO_BOARD[spec]`) with **0 bytes added to JSON**!
  - **`syllabusCode`** (e.g. `'0625'`, `'9709'`, `null` for Edexcel) — enables O(1) syllabus lookup, `ER`/`GT` session attachment, and clean UI chips.
  - **`scSubType`** (optional or derived from filename: `'IN' | 'CI' | 'TN' | 'PM'`, 0 bytes if derived cleanly).

### 5.3 Disk & Hugging Face Folder Layout
Keep Edexcel folders 100% untouched. Add parallel top-level or nested Cambridge trees:

```text
e:\The Library\
├── Past Papers\
│   ├── IAL\                              (UNCHANGED — Edexcel IAL)
│   ├── IGCSE\                            (UNCHANGED — Edexcel IGCSE)
│   └── Cambridge\
│       ├── A-Level\
│       │   └── Mathematics (9709)\
│       │       └── 2024\May-June\9709_s24_qp_12.pdf
│       ├── IGCSE\
│       │   └── Physics (0625)\
│       │       └── 2024\May-June\0625_s24_qp_42.pdf
│       └── O-Level\
│           └── Mathematics D (4024)\
│               └── 2024\May-June\4024_s24_qp_12.pdf
├── IAL Books\                            (UNCHANGED)
├── IGCSE Books\                          (UNCHANGED)
└── Cambridge Books\
    ├── A-Level\<Subject (Code)>\...
    ├── IGCSE\<Subject (Code)>\...
    └── O-Level\<Subject (Code)>\...
```

> **Ordering Rule in `extractSpec(relPath)`:** Always match `Past Papers/Cambridge/A-Level` (`CIE-AL`), `Past Papers/Cambridge/IGCSE` (`CIE-IGCSE`), `Past Papers/Cambridge/O-Level` (`CIE-OL`), and `Cambridge Books/...` **before** checking generic `IGCSE` or `IAL` substrings!

### 5.4 Board-Dispatched Parser Split (`src/parsers/`)
Split [src/unitParser.js](file:///e:/The%20Library/search-app/src/unitParser.js) into clean isolated adapters:
1. **`src/parsers/edexcelParser.js`**: Exact existing 817 lines of battle-tested Edexcel logic (guaranteed 0 diffs across all 19,912 existing files).
2. **`src/parsers/cambridgeParser.js`**: Dedicated Cambridge parser:
   - Primary regex for standard Cambridge filenames:
     `/^(\d{4})_([smwyg])(\d{2})_([a-z]{2,3})(?:_(\d{1,2}|[a-z0-9]+))?(?:\.[a-z0-9]+)?$/i`
   - Secondary fallback parser for messy aggregator folder/file names (e.g. `June 2024 Question Paper 42.pdf`, `g24_qp_21_sf.zip`, `0625-2023-Oct-Nov-MS-42.pdf`).
   - Component decomposition rules:
     - 2-digit starting with `0` (`01`..`06`) → `paper = 1..6`, `variant = ''` (Global).
     - 1-digit (`1`..`7`) → `paper = 1..7`, `variant = ''` (Legacy/Global).
     - 2-digit `11..79` → `paper = Math.floor(n / 10)`, `variant = String(n % 10)` (handles standard `1–3` AND AS Science practical `31–36`!).
   - Session decoder:
     - `m` → `Feb/March YYYY` (`monthNum = 3`, `sortKey = year * 100 + 3`)
     - `s` → `May/June YYYY` (`monthNum = 6`, `sortKey = year * 100 + 6`)
     - `w` → `Oct/Nov YYYY` (`monthNum = 11`, `sortKey = year * 100 + 11`)
     - `y` / `sp` / `sm` → `Specimen YYYY`
   - Year-aware `getCleanUnitLabel()` handling `9709` (2020 renumbering), `0610`/`0620`/`0625` (2016 renumbering), `0510`/`0511` (2024 renumbering), `9231` (2020 renumbering), and `0580` Core/Extended labels.
   - `unitCode` format: `<syllabus>-P<paper>` (e.g. `0625-P4`, `9709-P1`) and `variant` = `'1' | '2' | '3' | '4' | '5' | '6' | ''`.
3. **`src/unitParser.js`**: Thin board dispatcher exporting the exact same public API (`detectDocType`, `detectSubject`, `extractYear`, `extractSessionDate`, `extractUnitInfo`, `extractVariant`, `getCleanUnitLabel`).

### 5.5 Unified Sitting Grouping & Shared `ER` / `GT` Attachment (`catalogEngine.js`)
In [catalogEngine.js](file:///e:/The%20Library/search-app/src/lib/catalogEngine.js):
- **Pass 1 (Per-Variant Sitting Grouping):**
  - Cambridge sitting key: `CIE-IGCSE|Physics (0625)|0625-P4|2|May/June 2024`
  - Unifies `QP` (`0625_s24_qp_42.pdf`), `MS` (`0625_s24_ms_42.pdf`), `IN` (`0625_s24_in_42.pdf`), `CI`, `SF` (`DF`/`AUD`), `TN` into one sitting row so **Split View always pairs exact matching variants (`qp_42` ↔ `ms_42` or `qp_12` ↔ `in_12`)**.
- **Pass 2 (Session-Level Shared `ER` & `GT` Attachment):**
  - Collect all Cambridge `ER` (`0625_s24_er.pdf`) and `GT` (`0625_s24_gt.pdf`) files keyed by `${spec}|${syllabusCode}|${session}`.
  - Attach them onto every unified sitting matching that `${spec}|${syllabusCode}|${session}` as `group.docs.ER` and `group.docs.GT` (identical to how `combinedU2U4Zips` already attaches shared audio across Edexcel `WFR02` + `WFR04` in lines 226–238!).
  - Also keep standalone `ER`/`GT` rows accessible if a user filters strictly by `docType === 'GT'` or `Individual Files` view.

---

## 6. Search Engine Isolation & Collision Prevention

Every single one of these **7 concrete bugs** found in [src/searchEngine.js](file:///e:/The%20Library/search-app/src/searchEngine.js) and [src/data/searchDictionaries.js](file:///e:/The%20Library/search-app/src/data/searchDictionaries.js) MUST be resolved before Cambridge goes live:

### 6.1 The 7 Collision Fixes

| # | Current Code Trap | Why It Breaks Cambridge | Exact Engineering Fix |
| :---: | :--- | :--- | :--- |
| **1** | **2-Digit Year Auto-Expansion**<br>`searchEngine.js:532` expands any `03..29` → `2003..2029` | Searching `"0625 22"`, `"9709 12"`, `"9702 21"` silently rewrites component codes `22`, `12`, `21` into years **`2022`, `2012`, `2021`**! | Only expand standalone 2-digit tokens `03..29` into `20XX` when: (a) immediately preceded by a month/session token (`jun 24`, `may 22`, `oct 23`, `fm 25`), OR (b) NOT in Cambridge context and NOT preceded by a 4-digit syllabus code (`9709 12` stays component `12`!). |
| **2** | **4-Digit Year Classification**<br>`searchEngine.js:612` sets `isYear = /^\d{4}$/.test(tok)` and `unitParser.js:527` matches `20[0-2]\d` | Every Cambridge syllabus code (`0625`, `9709`, `2058`) gets marked `isYear = true, isCode = false`! Worse, O-Level Literature **`2010`** triggers `extractYear()` as Year 2010! | Restrict `isYear` to `^(?:199\d\|20[0-3]\d)$` AND NOT in `CAMBRIDGE_SYLLABUS_CODES` (unless a second valid year or syllabus code is already present). Parse Cambridge filenames via `cambridgeParser.js` *before* any generic year regex. |
| **3** | **Global Math Phrase Rewrite**<br>`searchEngine.js:460` rewrites `"pure 1"` → `wma11`, `"mechanics 1"` → `m1` (`wme01`) | Cambridge `9709` ALSO has **Pure Mathematics 1 (`P1`), Pure 2 (`P2`), Pure 3 (`P3`), Mechanics (`M1`), Statistics 1 (`S1`), Statistics 2 (`S2`)**. Rewriting `"pure 1"` → `wma11` returns **0 hits** on Cambridge! | Replace board-specific query rewrites with **board-neutral canonical tokens** (`pure1`, `pure2`, `pure3`, `pure4`, `mech1`, `stat1`, `stat2`, `fp1`, `fp2`). Index neutral tokens onto BOTH boards' items in `buildFileSearchData()`, while keeping `wma11`/`wme01` strictly on Edexcel items and `9709`/`9709p1` strictly on Cambridge items! |
| **4** | **Global Session Alias Clash**<br>`searchDictionaries.js:346` maps `feb` & `winter` → `January` | In Cambridge, **`Feb/March` (`m`) is March** and **`Winter` (`w`) is Oct/Nov**! Global `winter -> jan` contaminates both boards. | Remove cross-board month contamination from global synonyms; instead index exact board-correct session tokens per file inside `buildFileSearchData(fileObj)`:<br>• Edexcel `January`: `jan`, `january`, `jan24`<br>• Cambridge `Feb/March`: `feb`, `february`, `mar`, `march`, `fm`, `fm24`, `m24`<br>• Cambridge `May/June`: `may`, `jun`, `june`, `summer`, `mj`, `mj24`, `s24`<br>• Cambridge `Oct/Nov`: `oct`, `october`, `nov`, `november`, `autumn`, `winter`, `on`, `on24`, `w24` |
| **5** | **Cambridge Cover-Code & Session-Letter Parsing**<br>`normalizeQueryString()` only knows Edexcel `WMA11/01` & `4MA1/2HR` | Students paste exact Cambridge strings: `9709/12/M/J/23`, `0625/42`, `0580_s24_qp_22`, `9702 w23 22`, `0620 fm25 42` | Add Cambridge-aware normalizers in `normalizeQueryString()`:<br>• `(\d{4})[/_\s-]+(\d{2})[/_\s-]+m[/\s]*j[/_\s]*(\d{2})` → `$1 $2 mj20$3`<br>• `(\d{4})[/_\s-]+(\d{2})[/_\s-]+o[/\s]*n[/_\s]*(\d{2})` → `$1 $2 on20$3`<br>• `(\d{4})[/_\s-]+(\d{2})[/_\s-]+f[/\s]*m[/_\s]*(\d{2})` → `$1 $2 fm20$3`<br>• `(\d{4})[/_\s-]+(\d{1,2})\b` → `$1 c$2` (matches component `42` or paper `p4` + variant `v2`!)<br>• Standalone `\b([msw])(\d{2})\b` (e.g. `s24`, `w23`, `m25`) → expands cleanly when in Cambridge context (`s24` → `s24 mayjune 2024`, while protecting Edexcel `s1`/`s2`/`s3` and `m1`/`m2`/`m3` because `s24` has **2 digits** `02–29`, never 1 digit!). |
| **6** | **9–1 ↔ A\*–G Equivalence Bridging** | A student searching `"0972 paper 4"` or `"0980 2024"` gets 0 results if papers are filed under `0625` / `0580`. | Index the equivalent 9–1 code directly into `highSet` on the corresponding A\*–G file object (e.g. every `0625` item indexes `'0972'` in `highSet` and vice versa), plus add `'gt'`, `'threshold'`, `'thresholds'`, `'insert'`, `'in'`, `'ci'`, `'confidential'`, `'extended'`, `'core'`, `'atp'`, `'mcq'`, `'variant'`, `'v1'`, `'v2'`, `'v3'` to `STATIC_SEARCH_VOCAB`. |
| **7** | **Pure-Digit Typo Safety & `catalogVocab` Isolation** | Fuzzy edit-distance must NEVER mutate `0625` → `0620` or `9702` → `9701` or `12` → `13`. | Preserve the existing `!isNumeric` guard on Damerau-Levenshtein fuzzy matching AND build separate per-board `catalogVocab` arrays inside the worker so Edexcel spelling suggestions never suggest Cambridge-only jargon (and vice versa). |

### 6.2 Mandatory Search Verification Test Suite (24 Edge-Case Queries)
Before shipping Phase 2, run an automated scratch test harness (stored in AppData scratch dir) verifying **100% pass rate** on:

| Board | Test Query | Expected Result |
| :--- | :--- | :--- |
| **Edexcel** | `wma11 jan 2024` | Edexcel IAL Pure Maths 1 Jan 2024 (`WMA11`) only |
| **Edexcel** | `pure 3 oct 2023` | Edexcel IAL `WMA13` Oct 2023 (NOT Further Pure `WFM03`) |
| **Edexcel** | `4ma1 2hr june 2023` | Edexcel IGCSE Maths A Paper 2 Higher Regional June 2023 |
| **Edexcel** | `wph11 u1 22` | Edexcel IAL Physics Unit 1 2022 (`22` → `2022` still works in Edexcel!) |
| **Edexcel** | `bio u6 ms` | Edexcel IAL Biology Unit 6 Mark Schemes |
| **Edexcel** | `4wbi1` | Edexcel IGCSE Modular Biology |
| **Edexcel** | `m1 solomon` | Edexcel IAL Mechanics 1 Solomon papers (`m1` not confused with Cambridge `m21`) |
| **Edexcel** | `s2 june 2024` | Edexcel IAL Statistics 2 June 2024 (`s2` has 1 digit, never treated as `s20`) |
| **Cambridge** | `0625 42 s24` | IGCSE Physics (`0625`) Paper 4 Variant 2 May/June 2024 (NOT Year 2042!) |
| **Cambridge** | `9709/12/M/J/23` | A-Level Maths (`9709`) Pure 1 Variant 2 May/June 2023 |
| **Cambridge** | `9709 pure 1 2024` | Cambridge `9709` Paper 1 (2024) — ZERO `wma11` collision |
| **Cambridge** | `9709 s1 2019` | Cambridge `9709` **Old Paper 6 (`61/62/63`)** from 2019 (renumbering-aware!) |
| **Cambridge** | `9709 s1 2023` | Cambridge `9709` **Paper 5 (`51/52/53`)** from 2023 |
| **Cambridge** | `0625 p2 2015` | Pre-2016 Extended Theory (`P2`) clearly distinguished from 2016+ Extended MCQ |
| **Cambridge** | `0625 extended mcq` | 2016+ Paper 2 Extended MCQ (`21/22/23`) |
| **Cambridge** | `0972 paper 4 2024` | Matches `0625` Physics Paper 4 (2024) via 9–1 equivalence |
| **Cambridge** | `0580 fm25 42` | IGCSE Maths (`0580`) Paper 4 Variant 2 Feb/March 2025 |
| **Cambridge** | `9702 w23 33 ci` | A-Level Physics (`9702`) Practical Variant 33 Confidential Instructions Oct/Nov 2023 |
| **Cambridge** | `0500 12 insert` | IGCSE First Language English (`0500`) Paper 1 Variant 2 Insert (`IN`) |
| **Cambridge** | `0625 gt 2024` | IGCSE Physics (`0625`) 2024 Grade Thresholds (`GT`) |
| **Cambridge** | `4024 12 oct 2023` | O-Level Maths D (`4024`) Paper 1 Variant 2 Oct/Nov 2023 |
| **Cambridge** | `2010 s23 qp 12` | O-Level Literature (`2010`) May/June **2023** (NOT Year 2010!) |
| **Cambridge** | `0625 22` | `0625` Paper 2 Variant 2 across ALL years (NOT Year 2022!) |
| **Cross-Board** | Typing `0625` while in Edexcel mode | Triggers 1-click **"Switch to Cambridge"** smart banner instead of dead-end 0 results |

---

## 7. Performance, Partitioned Indexing & Serverless Scaling

### Why Monolithic `index.json` Will Not Scale
| Metric | Current (Edexcel Only) | Unpartitioned (Edexcel + Full Cambridge) | Partitioned By Board/Level (Target) |
| :--- | :---: | :---: | :---: |
| Total Files | 19,912 (16,051 unique) | ~80,000–130,000 | Same on disk/HF |
| Single Index JSON Size | `4.1 MB` (~800 KB gzip) | `~22–32 MB` (~4.5 MB gzip) | **`4.1 MB`** (Edexcel) / **`4–7 MB`** per CIE level |
| Worker Hydrated RAM | ~45 MB | ~350–500 MB *(iOS Safari OOM risk!)* | **~45–75 MB** (only active board/level loaded) |
| Cold Landing Route Shard | `~15–90 KB` (`69` shards) | `~15–90 KB` | `~15–120 KB` (`~160–220` shards across all subjects) |
| Vercel `api/*.js` Bundle | `4.1 MB` (`public/index.json`) | `25+ MB` *(slow cold starts / risk limit)* | **`< 1.5 MB`** compact `allowlist-keys.json` |

### Partitioning Blueprint
1. **Split Full Indexes (`generate-index.js`):**
   - `public/index-edexcel.json` *(keep `public/index.json` as an alias/symlink copy during transition or point Edexcel directly to `index-edexcel.json`)*
   - `public/index-cie-al.json` (Cambridge AS & A Level)
   - `public/index-cie-igcse.json` (Cambridge IGCSE)
   - `public/index-cie-ol.json` (Cambridge O Level)
   - Upload matching `live_index_<board>.json` fallbacks to Hugging Face (`upload-live-index-hf.js`).
2. **Fast `public/meta.json` (`~65–95 KB`):**
   - Contains lightweight board totals (`boards: { edexcel: {...}, cambridge: {...} }`) and `wizard` trees for instant `0ms` homepage & wizard hydration across both boards. *(If `meta.json` ever exceeds `120 KB`, split into `meta-edexcel.json` + `meta-cambridge.json`.)*
3. **Subject Route Shards (`dist/shards/*.json`):**
   - Keep Edexcel's 69 shards untouched (`ial-physics.json`, `ial-mathematics-pure.json`, etc.).
   - Emit per-syllabus Cambridge shards: `cie-igcse-physics-0625.json`, `cie-al-mathematics-9709.json`, `cie-ol-mathematics-d-4024.json`, plus board-scoped `textbooks-cambridge.json`, `audio-cambridge.json`, `data-files-cambridge.json`.
   - Update `index.html` inline early-fetch `<head>` `<script>` to recognize `/cambridge/<level>/<subject-slug>` shards — **and recompute & update its strict SHA-256 CSP hash in `vercel.json`!**
4. **Multi-Slot Web Worker (`src/workers/catalog.worker.js`):**
   - Replace single `catalogState` with a `Map<boardKey, CatalogState>` cache in worker memory (LRU cap of 2 active board indexes on mobile to cap RAM).
   - Switching boards in the UI checks Cache API (`cs_index_cache`) for that board's index first, keeping switches sub-100ms after first visit.
5. **Compact Serverless API Allowlist (`api/_shared.js`):**
   - During `generate-index.js`, generate a minimal `public/allowlist.json` (compact key prefixes / hashed keys or stripped array of valid sitting IDs + audio paths—stripping `name`, `size`, `unitName`, `cleanUnitLabel`, `sortKey`, `altPaths`, `meta`). This cuts Vercel serverless bundle size by ~75% even with 100,000+ papers!
6. **Audio Subtitles (`scripts/index-audio-subtitles.js`):**
   - Already sharded by subject (`public/subtitles/<shard>.json`) and deduplicated by SHA-256! Cambridge listening audio (`0510`/`0511` ESL, `0520` French, `0525` German, `0530` Spanish, `0547` Chinese) slots directly into `cie-igcse-esl-0510.json`, etc. Even better: Cambridge publishes official `_tn_` transcript PDFs, which plug directly into your existing **PDF.js verbatim forced-alignment pipeline**!

---

## 8. UI / UX, Reader & SEO Blueprint

*(Note: No UI or code edits are being made yet—this documents the exact target experience for review before implementation.)*

### 8.1 Zero-Clutter Board Switcher UX
1. **Board Switcher Control:**
   - A compact 2-pill institutional segmented control (**`Edexcel`** | **`Cambridge`**) integrated cleanly into the top bar / Welcome hero (matching existing `32px–34px` button heights, geometric typography, zero emojis, full keyboard + ARIA `role="tablist"` / `aria-pressed` support).
   - **Priority Order for Active Board:**
     1. Explicit URL route (`/ial/...`, `/igcse/...` → `edexcel`; `/cambridge/...` → `cambridge`)
     2. Saved `localStorage.getItem('cs_board')` on `/`
     3. Default: `edexcel`
   - Clicking the switcher on `/` transitions smoothly between the Edexcel Welcome catalog and the Cambridge Welcome catalog without page reload.
2. **Context-Aware Search Banner ([SearchBanner.jsx](file:///e:/The%20Library/search-app/src/components/SearchBanner.jsx)):**
   - **Placeholder dynamically adapts** to the active board:
     - Edexcel: `Search by course code, subject, unit or year (e.g. WMA11, Biology, 4MA1)...`
     - Cambridge: `Search by syllabus code, paper or session (e.g. 0625 42, 9709 s24, Physics)...`
   - **Quick Curriculum Pills stay compact (`3–4` pills max):**
     - Edexcel: `All` · `IAL` · `IGCSE`
     - Cambridge: `All` · `A-Level` · `IGCSE` · `O-Level`
   - **Smart Cross-Board Detection Pill:** If a user types a clear Cambridge query (`0625`, `9709`, `0580`, `cambridge`, `caie`, `o level`) while on Edexcel—or an Edexcel query (`wma11`, `wph11`, `4ma1`, `edexcel`, `ial`) while on Cambridge—display a subtle inline banner right above results:  
     > *Looks like a Cambridge syllabus code (`0625`). [Switch to Cambridge Archive →]*
3. **Board-Aware Filter Drawer ([FilterDrawer.jsx](file:///e:/The%20Library/search-app/src/components/FilterDrawer.jsx)):**
   - Top row includes `Board: [Edexcel] [Cambridge] [All Boards]`.
   - `Session` dropdown adapts dynamically:
     - Edexcel: `January`, `June`, `October`
     - Cambridge: `Feb/March`, `May/June`, `Oct/Nov`
   - Cambridge-only **`Variant` pill group** (`All Variants | v1 | v2 | v3`) appears cleanly only when Cambridge is active, letting students isolate their zone's variant or view all 3 side-by-side.
   - Cambridge IGCSE Sciences/Maths optional **`Tier` filter** (`All Tiers | Extended | Core`).
4. **Homepage Subject Cards & Wizard ([WelcomePage.jsx](file:///e:/The%20Library/search-app/src/components/WelcomePage.jsx)):**
   - Each Cambridge subject card displays: Subject Title + crisp monospace syllabus code badge (`0625` — and `0972` muted tooltip/tag for 9–1 equivalents) + date coverage + doc count.
   - Clicking a Cambridge subject opens the existing 3-step Wizard grouped cleanly by **Paper / Tier** (`Extended Tier`, `Core Tier`, `Practical / ATP`, or `AS Level`, `A2 Level`, `Legacy Spec`) — **never** exploding into 18 separate variant buttons!
5. **Table Rows & Visual Board Identity ([PaperTable.jsx](file:///e:/The%20Library/search-app/src/components/PaperTable.jsx)):**
   - Keep identical `40% / 19% / 41%` desktop columns.
   - Distinct WCAG-AA semantic CSS tokens across Light, Dark, and Pure OLED:
     - Edexcel badges: existing Crimson/Gold (`IAL`, `IGCSE`).
     - Cambridge badges: muted Academic Slate-Navy / Steel-Blue (`CAIE AL`, `CAIE IGCSE`, `CAIE OL`) so cross-board search results and Recent History cards are instantaneously distinguishable without clashing with the site's institutional aesthetic.
   - Cambridge Series column shows: `[CAIE IGCSE]` `[0625 / 42]` `[May/June 2024]` `[Var 2]`.
   - Cambridge Actions column shows: `[Question Paper]` `[Mark Scheme]` `[Insert]` *(when present)* `[Thresholds]` `[Examiner Report]` `[Split View]`.

### 8.2 Reader Enhancements Tailored to Cambridge (`PreviewModal.jsx`)
Your existing `PdfViewerPane.jsx` already does 95% of what Cambridge students dream of! Two small, high-impact enhancements make it unbeatable for Cambridge:
1. **Flexible Split View Pairings (`QP | MS` AND `QP | Insert`):**
   - For Cambridge English (`0500`, `1123`), Geography (`0460`), History (`0470`), and Economics, students MUST read the **Insert (`IN`)** while answering the **Question Paper (`QP`)**. Allow toggling the right split pane between `MS` and `IN` (and viewing `GT` Grade Thresholds in one click right inside the modal header tab strip!).
2. **Instant `GT` (Grade Thresholds) Tab:**
   - Because `GT` is a 1-page PDF auto-attached to every sitting in that session, students can finish marking their `QP` against `MS` and click **`Thresholds`** in the modal header without ever leaving the paper!

### 8.3 SEO & Canonical URL Architecture ([routeCore.js](file:///e:/The%20Library/search-app/src/lib/routeCore.js), [prerender-seo.js](file:///e:/The%20Library/search-app/scripts/prerender-seo.js))
- **Edexcel URLs:** 100% unchanged (`/ial/...`, `/igcse/...`, `/textbooks/ial/...`, `/textbooks/igcse/...`).
- **Cambridge URLs:**
  - `/cambridge` (Cambridge hub)
  - `/cambridge/a-level`, `/cambridge/igcse`, `/cambridge/o-level`
  - `/cambridge/igcse/physics-0625`, `/cambridge/igcse/physics-0625/paper-4-extended-theory`
  - `/cambridge/a-level/mathematics-9709`, `/cambridge/a-level/mathematics-9709/pure-mathematics-1-p1`
  - `/cambridge/o-level/mathematics-d-4024`, `/cambridge/o-level/mathematics-d-4024/paper-1`
  - `/textbooks/cambridge`, `/textbooks/cambridge/a-level`, `/textbooks/cambridge/igcse`
- **High-Intent Redirects in `vercel.json` (Permanent `308`):**
  - Short syllabus code URLs: `/cambridge/0625` → `/cambridge/igcse/physics-0625`, `/cambridge/9709` → `/cambridge/a-level/mathematics-9709`, `/cambridge/0972` → `/cambridge/igcse/physics-0625` (9–1 alias!).
  - Add `Cache-Control: public, max-age=0, must-revalidate` for `/cambridge` and `/cambridge/(.*)` in `vercel.json`.
  - Keep `< 3`-file thin unit routes `noindex, follow` with parent canonical consolidation (same rule as Edexcel).

---

## 9. Upstream Sync Strategy (`sync-sources.js`)

In [scripts/sync-sources.js](file:///e:/The%20Library/search-app/scripts/sync-sources.js):
- Add `--board=edexcel|cambridge` (defaulting to **`edexcel`** so existing workflows stay 100% isolated and never leak Cambridge into Edexcel folders!).
- Notice several of your **existing** crawled sources ALREADY host Cambridge archives right next to Edexcel:
  - **Elevare (`elevareisonline.com/papers`)**: `past-papers.js` explicitly separates `Edexcel` and `Cambridge` Drive roots + curated JS catalogs!
  - **DynamicPapers (`dynamicpapers.com`)**: Hosts full Cambridge IGCSE, O Level, and AS & A Level sections behind the same auth flow.
  - **IGExams (`igexams.com`)**, **Smart Study Campus (`smartstudycampus.com`)**, **British Student Room (`britishstudentroom.com`)**, **PMT (`physicsandmathstutor.com`)** (CAIE IGCSE/A-Level sciences & maths), plus standard Cambridge repositories (**PapaCambridge**, **GCEGuide**, **BestExamHelp**).
- **Cambridge Sync Safeguards:**
  - Whitelist strict 4-digit Cambridge syllabus codes per level (`CIE_AL_SYLLABUSES`, `CIE_IGCSE_SYLLABUSES`, `CIE_OL_SYLLABUSES`).
  - Block any Edexcel codes (`W*`, `4MA1`, `4BI1`, `6*`), AQA/OCR/WJEC leaks, and `toaz.info` watermarks.
  - **Allow** `gt` (Grade Thresholds), `in` (Inserts), `ci` (Confidential Instructions), `sf` (Source Files / Listening MP3s), `tn` (Transcripts), and `pm` (Pre-Release) in `--board=cambridge` mode!
  - Reuse your existing SHA-256 incremental cache (`.data/library_sha_cache.json`), PDF magic + `%%EOF` trailer check, `curl.exe` large-file fallback, and `qpdf --linearize --object-streams=generate` optimization for `>= 5 MB` PDFs.
  - Deduplicate 9–1 vs A\*–G identical papers automatically via SHA-256 + syllabus equivalence mapping so disk & Hugging Face stay lean.

---

## 10. Phased Implementation Roadmap

Build and verify in **5 isolated phases** so production stays rock-solid at every checkpoint:

1. **Phase 1 — Board Registry & Parser Split (Zero UI / Zero User-Visible Change)**
   - Create `src/data/boards.js`, `src/data/cambridgeCatalog.js`, `src/parsers/edexcelParser.js`, `src/parsers/cambridgeParser.js`.
   - Convert `src/unitParser.js` into a board dispatcher.
   - Update `catalogEngine.js` with `board` derivation + Pass-2 shared `ER`/`GT` attachment.
   - **Gate:** Run `generate-index.js` on existing library and verify **0 diffs** on all 16,051 Edexcel records and `0` `oxlint` warnings.

2. **Phase 2 — Search Engine Hardening & Test Harness**
   - Implement all 7 search isolation fixes in `src/searchEngine.js` and `src/data/searchDictionaries.js`.
   - Build a scratch verification test suite (in AppData scratch dir) executing all 24 Edexcel + Cambridge + cross-board test queries.
   - **Gate:** 24/24 queries pass with 100% precision and zero Edexcel regressions.

3. **Phase 3 — Partitioned Indexing, Shards, API Allowlist & Routing**
   - Partition `generate-index.js` into board/level indexes (`index-edexcel.json`, `index-cie-*.json`) + compact `allowlist.json`.
   - Update `catalog.worker.js` to cache & switch board indexes cleanly (LRU memory cap).
   - Add `/cambridge/...` routes, metadata, JSON-LD, shards, and redirects in `routeCore.js`, `seoRoutes.js`, `prerender-seo.js`, `index.html` (recomputing SHA-256 CSP hash in `vercel.json`!), and `api/_shared.js`.
   - **Gate:** `build.js` + `oxlint` pass cleanly; all 296 existing Edexcel routes unchanged.

4. **Phase 4 — UI Board Switcher, Board-Aware Filters & Reader Upgrades**
   - Add the `Edexcel | Cambridge` Switcher, dynamic quick pills, board-aware Session/Variant/Tier filters, cross-board query nudge banner, Cambridge academic badge CSS tokens (Light / Dark / Pure OLED), and `QP | IN` Split View + `GT` Thresholds modal tab.
   - **Gate:** Headless Brave verification across `1366×768`, `1440×900`, and `390×844` in Light, Dark, and Pure OLED + `prefers-reduced-motion` (`no-preference` & `reduce`).

5. **Phase 5 — Pilot Cambridge Ingestion & Full Rollout**
   - Add `--board=cambridge` mode to `scripts/sync-sources.js`.
   - Onboard a **Pilot Cohort** of the highest-demand Cambridge syllabuses first to verify real-world UX, shard sizes, and SEO:
     - **IGCSE:** `0625` Physics (`0972`), `0620` Chemistry (`0971`), `0610` Biology (`0970`), `0580` Mathematics (`0980`), `0500` First Language English (`0990`), `0510` ESL (`0993`), `0478` Computer Science (`0984`), `0417` ICT (`0983`)
     - **AS & A Level:** `9709` Mathematics, `9702` Physics, `9701` Chemistry, `9700` Biology, `9618` Computer Science, `9708` Economics
     - **O Level:** `4024` Mathematics D, `5054` Physics, `5070` Chemistry, `5090` Biology, `2058` Islamiyat, `2059` Pakistan Studies, `1123` English
   - Run `index-audio-subtitles.js` on Cambridge listening tracks (using official `_tn_` transcripts for verbatim forced alignment), `sync-hf.js`, `upload-live-index-hf.js`, `build.js`, `push-github.js`, `.git` sync, and `deploy-vercel.js`.
