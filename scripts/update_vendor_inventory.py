#!/usr/bin/env python3
"""
Update a vendor's inventory to include all Retail and Produce items from the vendor's university.
- Retail: adds a specified quantity per item (increments existing quantity)
- Produce: sets availability to 'Y'

Usage:
  python update_vendor_inventory.py --backend http://localhost:5001 --vendor VENDOR_ID --retail-qty 20
  # multiple vendors
  python update_vendor_inventory.py --backend http://localhost:5001 --vendor V1 --vendor V2 --retail-qty 20

Matching by ObjectId (from Compass exports):
  # If you have Compass-exported JSON files of Retail/Produce collections, pass them to ensure exact ObjectId matching
  python update_vendor_inventory.py --backend http://localhost:5001 \
    --vendor VENDOR_ID --retail-qty 20 \
    --retails-json "C:\\path\\to\\KIITBites.retails.json" \
    --produces-json "C:\\path\\to\\KIITBites.produces.json" \
    --uni-id 68320fd75c6f79ec179ad3bb

When JSON files are provided, the script will:
- Parse ObjectIds from the files (array JSON or NDJSON)
- Optionally filter by the provided --uni-id
- Cross-check against API results for the university and only update intersection
  (It will report missing/extraneous IDs to help diagnose mismatches.)
"""

import argparse
import requests
import sys
import json
from typing import List, Dict, Any, Iterable, Set, Optional

DEFAULT_BACKEND = "http://localhost:5001"

SESSION = requests.Session()
SESSION.headers.update({"Content-Type": "application/json"})


def fetch_vendor_uni_id(backend: str, vendor_id: str) -> str:
    """Get vendor's university ID via existing endpoint that returns uniID."""
    url = f"{backend}/api/item/getvendors/{vendor_id}"
    resp = SESSION.get(url, timeout=20)
    resp.raise_for_status()
    data = resp.json()
    uni_id = data.get("uniID") or data.get("uniId")
    if not uni_id:
        raise RuntimeError(f"Could not determine uniID for vendor {vendor_id}; response keys: {list(data.keys())}")
    return uni_id


def fetch_all_items_for_uni(backend: str, uni_id: str, category: str, page_size: int = 200) -> List[Dict[str, Any]]:
    """Fetch ALL items for a uni in a category ('retail' or 'produce') using paginated endpoint."""
    url = f"{backend}/api/item/{category}/uni/{uni_id}"
    page = 1
    all_items: List[Dict[str, Any]] = []
    total_pages = None

    while True:
        resp = SESSION.get(url, params={"page": page, "limit": page_size}, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        # If endpoint ever returns a plain array (non-paginated), just use it
        if isinstance(data, list):
            all_items.extend(data)
            break

        items = []
        if isinstance(data, dict):
            if isinstance(data.get("items"), list):
                items = data["items"]
            elif isinstance(data.get("data"), list):
                items = data["data"]
            # discover total pages if provided
            if total_pages is None:
                tp = data.get("totalPages")
                if isinstance(tp, int) and tp >= 1:
                    total_pages = tp

        if not items:
            # Fallback: try to detect array-like values inside the dict
            for v in data.values():
                if isinstance(v, list) and v and isinstance(v[0], dict) and ("_id" in v[0] or "id" in v[0]):
                    items = v
                    break

        if not items:
            break

        all_items.extend(items)

        # Stop conditions: reached provided totalPages or last short page
        if total_pages is not None and page >= total_pages:
            break
        if len(items) < page_size:
            break

        page += 1

    # De-duplicate by _id
    seen = set()
    unique_items: List[Dict[str, Any]] = []
    for it in all_items:
        _id = it.get("_id") or it.get("id")
        if not _id or _id in seen:
            continue
        seen.add(_id)
        unique_items.append(it)
    return unique_items


def _extract_object_id(value: Any) -> str:
    """Extract a MongoDB ObjectId string from various shapes (string or {'$oid': '...'})"""
    if value is None:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, dict):
        if "$oid" in value and isinstance(value["$oid"], str):
            return value["$oid"]
        if "_id" in value:
            return _extract_object_id(value["_id"])
    return ""


def _iter_json_records(path: str) -> Iterable[Dict[str, Any]]:
    """Yield records from either an array JSON file or newline-delimited JSON (NDJSON) file."""
    with open(path, "r", encoding="utf-8") as f:
        head = f.read(2048)
        if not head:
            return
        if head.lstrip().startswith("["):
            f.seek(0)
            data = json.load(f)
            if isinstance(data, list):
                for rec in data:
                    if isinstance(rec, dict):
                        yield rec
            return
        f.seek(0)
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                rec = json.loads(line)
                if isinstance(rec, dict):
                    yield rec
            except json.JSONDecodeError:
                continue


def load_ids_from_json(path: str, uni_filter: Optional[str] = None) -> Set[str]:
    ids: Set[str] = set()
    total = 0
    kept = 0
    for rec in _iter_json_records(path):
        total += 1
        if uni_filter:
            rec_uni = rec.get("uniId") or rec.get("uniID")
            rec_uni_str = _extract_object_id(rec_uni)
            if rec_uni_str and rec_uni_str != uni_filter:
                continue
        oid = _extract_object_id(rec.get("_id")) or _extract_object_id(rec.get("id"))
        if oid:
            ids.add(oid)
            kept += 1
    print(f"Loaded {kept} ObjectIds from {path} (scanned {total} records) with uni filter: {bool(uni_filter)}")
    return ids


def add_retail_inventory(backend: str, vendor_id: str, item_id: str, quantity: int) -> bool:
    payload = {
        "vendorId": vendor_id,
        "itemId": item_id,
        "itemType": "retail",
        "quantity": quantity,
    }
    resp = SESSION.post(f"{backend}/inventory/add", json=payload, timeout=20)
    if resp.status_code == 200:
        return True
    print(f"Retail add failed for {item_id}: {resp.status_code} {resp.text}")
    return False


def set_produce_available(backend: str, vendor_id: str, item_id: str) -> bool:
    payload = {
        "vendorId": vendor_id,
        "itemId": item_id,
        "itemType": "produce",
        "isAvailable": "Y",
    }
    resp = SESSION.post(f"{backend}/inventory/add", json=payload, timeout=20)
    if resp.status_code == 200:
        return True
    print(f"Produce set available failed for {item_id}: {resp.status_code} {resp.text}")
    return False


def main():
    parser = argparse.ArgumentParser(description="Populate vendor inventory from university items")
    parser.add_argument("--backend", default=DEFAULT_BACKEND, help="Backend base URL (default: %(default)s)")
    parser.add_argument("--vendor", action="append", dest="vendor_ids", required=True, help="Vendor ID (can be provided multiple times)")
    parser.add_argument("--retail-qty", type=int, default=20, help="Quantity to add for each retail item (default: %(default)s)")
    parser.add_argument("--skip-produce", action="store_true", help="Skip produce availability updates")
    parser.add_argument("--skip-retail", action="store_true", help="Skip retail quantity updates")
    parser.add_argument("--retails-json", help="Path to Compass-exported Retail JSON/NDJSON for exact ObjectId matching")
    parser.add_argument("--produces-json", help="Path to Compass-exported Produce JSON/NDJSON for exact ObjectId matching")
    parser.add_argument("--uni-id", help="Optional uniId to filter JSON records and cross-check")
    args = parser.parse_args()

    backend = args.backend.rstrip("/")

    overall_added = 0
    overall_failed = 0

    for vendor_id in args.vendor_ids:
        print(f"\n=== Updating vendor {vendor_id} ===")
        try:
            uni_id = fetch_vendor_uni_id(backend, vendor_id)
            print(f"Vendor's uniId: {uni_id}")
        except Exception as e:
            print(f"Failed to fetch uniId for vendor {vendor_id}: {e}")
            overall_failed += 1
            continue

        # Retail
        if not args.skip_retail:
            try:
                api_retail_items = fetch_all_items_for_uni(backend, uni_id, "retail")
                print(f"Found {len(api_retail_items)} retail items (API) for uni {uni_id}")
                if args.retails_json:
                    json_ids = load_ids_from_json(args.retails_json, uni_filter=args.uni_id or uni_id)
                    api_ids = { (it.get("_id") or it.get("id")) for it in api_retail_items }
                    intersect_ids = list(api_ids.intersection(json_ids))
                    missing_in_api = list(json_ids.difference(api_ids))
                    extra_in_api = list(api_ids.difference(json_ids))
                    if missing_in_api:
                        print(f"⚠️ {len(missing_in_api)} retail IDs present in JSON but not returned by API (skipped). Example: {missing_in_api[:5]}")
                    if extra_in_api:
                        print(f"ℹ️ {len(extra_in_api)} retail IDs present in API but not in JSON (skipped to enforce matching). Example: {extra_in_api[:5]}")
                    retail_items = [ {"_id": _id} for _id in intersect_ids ]
                else:
                    retail_items = api_retail_items
            except Exception as e:
                print(f"Failed to fetch retail items for uni {uni_id}: {e}")
                retail_items = []

            for item in retail_items:
                item_id = item.get("_id") or item.get("id")
                if not item_id:
                    continue
                ok = add_retail_inventory(backend, vendor_id, item_id, args.retail_qty)
                if ok:
                    overall_added += 1
                else:
                    overall_failed += 1

        # Produce
        if not args.skip_produce:
            try:
                api_produce_items = fetch_all_items_for_uni(backend, uni_id, "produce")
                print(f"Found {len(api_produce_items)} produce items (API) for uni {uni_id}")
                if args.produces_json:
                    json_ids = load_ids_from_json(args.produces_json, uni_filter=args.uni_id or uni_id)
                    api_ids = { (it.get("_id") or it.get("id")) for it in api_produce_items }
                    intersect_ids = list(api_ids.intersection(json_ids))
                    missing_in_api = list(json_ids.difference(api_ids))
                    extra_in_api = list(api_ids.difference(json_ids))
                    if missing_in_api:
                        print(f"⚠️ {len(missing_in_api)} produce IDs present in JSON but not returned by API (skipped). Example: {missing_in_api[:5]}")
                    if extra_in_api:
                        print(f"ℹ️ {len(extra_in_api)} produce IDs present in API but not in JSON (skipped to enforce matching). Example: {extra_in_api[:5]}")
                    produce_items = [ {"_id": _id} for _id in intersect_ids ]
                else:
                    produce_items = api_produce_items
            except Exception as e:
                print(f"Failed to fetch produce items for uni {uni_id}: {e}")
                produce_items = []

            for item in produce_items:
                item_id = item.get("_id") or item.get("id")
                if not item_id:
                    continue
                ok = set_produce_available(backend, vendor_id, item_id)
                if ok:
                    overall_added += 1
                else:
                    overall_failed += 1

    print("\n=== Summary ===")
    print(f"Successful updates: {overall_added}")
    print(f"Failed updates:     {overall_failed}")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\nCancelled by user")
        sys.exit(1)
