import os
import re

MATH_DIR = r"e:\The Library\Past Papers\IAL\Mathematics"

UNIT_CODE_MAP = {
    'P1': 'WMA11',
    'P2': 'WMA12',
    'P3': 'WMA13',
    'P4': 'WMA14',
    'C12': 'WMA01',
    'C34': 'WMA02',
    'FP1': 'WFM01',
    'FP2': 'WFM02',
    'FP3': 'WFM03',
    'M1': 'WME01',
    'M2': 'WME02',
    'M3': 'WME03',
    'S1': 'WST01',
    'S2': 'WST02',
    'S3': 'WST03',
    'D1': 'WDM11',
}

def get_session_str(folder_name):
    folder_name = folder_name.lower()
    if 'jan' in folder_name:
        return 'Jan'
    elif 'jun' in folder_name or 'may' in folder_name:
        return 'Jun'
    elif 'oct' in folder_name:
        return 'Oct'
    return 'Unk'

def main():
    pattern = re.compile(r'^(MS|QP|ER|GT)\s+(.*?)\.pdf$', re.IGNORECASE)
    
    renamed_count = 0
    for root, dirs, files in os.walk(MATH_DIR):
        for filename in files:
            match = pattern.match(filename)
            if match:
                doc_type = match.group(1).upper()
                unit = match.group(2).upper().strip()
                
                code = UNIT_CODE_MAP.get(unit, unit)
                
                # Extract year and session from path
                # typically: ...\Mathematics\2022\January
                parts = root.split(os.sep)
                if len(parts) >= 2:
                    year = parts[-2]
                    session_folder = parts[-1]
                    session = get_session_str(session_folder)
                    
                    new_name = f"Math_{code}_{year}-{session}_{doc_type}.pdf"
                    old_path = os.path.join(root, filename)
                    new_path = os.path.join(root, new_name)
                    
                    # Print and rename
                    print(f"Renaming: {os.path.join(year, session_folder, filename)} -> {new_name}")
                    os.rename(old_path, new_path)
                    renamed_count += 1
    
    print(f"\nTotal files renamed: {renamed_count}")

if __name__ == "__main__":
    main()
