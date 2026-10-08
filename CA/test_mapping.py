import sys
sys.stdout.reconfigure(encoding='utf-8')
from backend.parser_engine import _build_bs_pl_mapping, check_local_files

_, files = check_local_files()
print("Calling _build_bs_pl_mapping(files)...")
mapping = _build_bs_pl_mapping(files)
print("Success!")
for idx, row in enumerate(mapping):
    print(f"{idx+1:2d}. Head: {row['head']:35s} | Books: {row['financials']:15,.2f} | ITR: {row['itr_amount']:15,.2f} | Match: {row['match']} | Remarks: {row['remarks']}")
