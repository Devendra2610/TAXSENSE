import sys
sys.stdout.reconfigure(encoding='utf-8')
from backend.parser_engine import get_reconciliation_data

print("Calling get_reconciliation_data()...")
data = get_reconciliation_data()
print("Success!")

mapping = data.get("mapping", [])
print(f"\n--- Mapping Sheet (Sheet 4) - Total rows: {len(mapping)} ---")
for idx, row in enumerate(mapping):
    print(f"{idx+1:2d}. Head: {row['head']:35s} | Books: {row['financials']:15,.2f} | ITR: {row['itr_amount']:15,.2f} | Match: {row['match']} | Remarks: {row['remarks']}")
