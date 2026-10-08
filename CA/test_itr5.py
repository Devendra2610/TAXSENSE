import sys
sys.stdout.reconfigure(encoding='utf-8')
from backend.itr5_parser import parse_itr5, get_itr5_summary

print("Starting parse...")
data = parse_itr5()
print("Parse completed.")
if data:
    print(get_itr5_summary(data))
    print(f"Total keys extracted: {len(data)}")
else:
    print("Failed to parse ITR-5.")
