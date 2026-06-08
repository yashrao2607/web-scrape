import json

def inspect():
    with open("output/results.json", "r") as f:
        data = json.load(f)
    
    print(f"Total successful banks: {len(data)}")
    for bank in data:
        name = bank.get("bank_name")
        rates = bank.get("fd_rates", [])
        print(f"\nBank: {name} (Total rates: {len(rates)})")
        print(f"Source URL: {bank.get('source_url')}")
        
        # Show first 3 rates
        for i, r in enumerate(rates[:5]):
            print(f"  - Tenure: {r.get('tenure')} | General: {r.get('general_rate')}% | Senior: {r.get('senior_citizen_rate')}%")
        if len(rates) > 5:
            print(f"  - ... and {len(rates)-5} more rows")

if __name__ == "__main__":
    inspect()
