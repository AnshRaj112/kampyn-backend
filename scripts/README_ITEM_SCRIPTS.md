# Item Addition Scripts

This directory contains Python scripts to automatically add retail and produce items to the KAMPYN system for multiple universities.

## Scripts

### 1. `add_retail_items.py`
Adds retail items for each university with different GST percentages for each type.

**Features:**
- 8 different retail types (biscuits, chips, icecream, drinks, snacks, sweets, nescafe, others)
- **20 items per type** for maximum variety
- Different GST percentages for each type:
  - Biscuits: 18%
  - Chips: 12%
  - Icecream: 18%
  - Drinks: 28%
  - Snacks: 12%
  - Sweets: 18%
  - Nescafe: 18%
  - Others: 18%
- Unique HSN codes for each type
- **Whole number pricing** between ₹20-200 (no decimals)
- Clean item names without type labels
- Random image selection from provided Cloudinary URLs
- Random packable status

### 2. `add_produce_items.py`
Adds produce items for each university with GST percentages that can be the same across types.

**Features:**
- 8 different produce types (combos-veg, combos-nonveg, veg, shakes, juices, soups, non-veg, others)
- **20 items per type** for maximum variety
- GST percentages:
  - Food items (combos, veg, non-veg, soups): 5%
  - Beverages (shakes): 18%
  - Juices: 12%
  - Others: 18%
- Unique HSN codes for each type
- Appropriate units for each type (plate, glass, bowl, piece)
- **Whole number pricing** based on item type (no decimals)
- Clean item names without type labels
- Random image selection from provided Cloudinary URLs
- Packable status (66% chance of being packable)

## Universities Covered

The scripts will add items for these university IDs:
- `6831fc505c6f79ec179ad3a2`
- `68320e9f5c6f79ec179ad3b0`
- `68320f915c6f79ec179ad3b5`
- `68320fd75c6f79ec179ad3bb`

## Images Used

The scripts use these Cloudinary images randomly:
- `https://res.cloudinary.com/dt45pu5mx/image/upload/v1742974667/cld-sample-4.jpg`
- `https://res.cloudinary.com/dt45pu5mx/image/upload/v1742974666/samples/dessert-on-a-plate.jpg`
- `https://res.cloudinary.com/dt45pu5mx/image/upload/v1742974664/samples/breakfast.jpg`
- `https://res.cloudinary.com/dt45pu5mx/image/upload/v1742974656/samples/food/fish-vegetables.jpg`
- `https://res.cloudinary.com/dt45pu5mx/image/upload/v1742974656/samples/food/pot-mussels.jpg`
- `https://res.cloudinary.com/dt45pu5mx/image/upload/v1742974655/samples/food/dessert.jpg`

## Setup

1. Install Python dependencies:
   ```bash
   pip install -r requirements.txt
   ```

2. Update the `BACKEND_URL` in both scripts if your backend is not running on `http://localhost:5000`

## Usage

### Run Retail Items Script
```bash
python add_retail_items.py
```

### Run Produce Items Script
```bash
python add_produce_items.py
```

## What Each Script Does

1. **Complete Coverage**: Each university gets **all 20 items** of each type for maximum variety
2. **Tax Calculations**: Automatically calculates price excluding tax, SGST, and CGST
3. **HSN Codes**: Assigns appropriate HSN codes for each item type
4. **Pricing**: Generates realistic pricing based on item type
5. **Images**: Randomly assigns images from the provided Cloudinary URLs
6. **Packable Status**: Sets appropriate packable status for each item type

## Expected Output

Each script will:
- Show progress for each university
- Display items being added with their details
- Provide a summary of successful and failed additions
- Show final results with total counts

**Expected Results:**
- **Retail Items**: 8 types × 20 items per type per university × 4 universities = **640 retail items**
- **Produce Items**: 8 types × 20 items per type per university × 4 universities = **640 produce items**
- **Total**: **1,280 items** across all universities with complete coverage of all types

## Notes

- **Complete Coverage**: Each university gets all 20 items of each type for comprehensive testing
- **GST Consistency**: Retail items have different GST percentages per type, produce items can share GST percentages
- **Realistic Data**: Prices and item names are realistic for Indian food items
- **Safety**: Scripts ask for confirmation before proceeding
- **Error Handling**: Failed additions are logged and counted
- **Maximum Variety**: All universities will have identical item coverage for consistent testing

## Customization

You can modify:
- Item names in the `ITEMS` arrays
- GST percentages in the type definitions
- HSN codes in the `HSN_CODES` dictionaries
- Price ranges in the pricing logic
- Image URLs in the `IMAGES` array

## Update Vendor Inventory

Use `update_vendor_inventory.py` to populate a vendor's inventory from their university items.

- Retail: adds N quantity for each retail item (increments existing quantity)
- Produce: marks each item as available (isAvailable = 'Y')

### Usage
```bash
# Single vendor, default backend http://localhost:5001, add 20 qty for each retail item and set all produce to Y
python update_vendor_inventory.py --vendor <VENDOR_ID>

# Multiple vendors
python update_vendor_inventory.py --vendor <VENDOR_ID_1> --vendor <VENDOR_ID_2>

# Custom backend and custom retail quantity
python update_vendor_inventory.py --backend http://localhost:5001 --vendor <VENDOR_ID> --retail-qty 50

# Only retail or only produce
python update_vendor_inventory.py --vendor <VENDOR_ID> --skip-produce
python update_vendor_inventory.py --vendor <VENDOR_ID> --skip-retail
```

The script discovers the vendor's university via `GET /api/item/getvendors/:vendorId`, fetches all items for that university using `/api/item/retail/uni/:uniId` and `/api/item/produce/uni/:uniId`, then calls `/inventory/add` with appropriate bodies for each item.
