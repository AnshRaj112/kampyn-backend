#!/usr/bin/env python3
"""
Script to add retail items for each university
Each type has different GST percentages
"""

import requests
import random
import json
from typing import List, Dict

# Configuration
BACKEND_URL = "http://localhost:5001"  # Change this to your backend URL
UNI_IDS = [
    "6831fc505c6f79ec179ad3a2",
    "68320e9f5c6f79ec179ad3b0", 
    "68320f915c6f79ec179ad3b5",
    "68320fd75c6f79ec179ad3bb"
]

# Images to use randomly
IMAGES = [
    "https://res.cloudinary.com/dt45pu5mx/image/upload/v1742974667/cld-sample-4.jpg",
    "https://res.cloudinary.com/dt45pu5mx/image/upload/v1742974666/samples/dessert-on-a-plate.jpg",
    "https://res.cloudinary.com/dt45pu5mx/image/upload/v1742974664/samples/breakfast.jpg",
    "https://res.cloudinary.com/dt45pu5mx/image/upload/v1742974656/samples/food/fish-vegetables.jpg",
    "https://res.cloudinary.com/dt45pu5mx/image/upload/v1742974656/samples/food/pot-mussels.jpg",
    "https://res.cloudinary.com/dt45pu5mx/image/upload/v1742974655/samples/food/dessert.jpg"
]

# Retail types and their GST percentages
RETAIL_TYPES = {
    "biscuits": {"gst": 18, "items": [
        "Oreo Chocolate Cookies", "Parle-G Glucose Biscuits", "Hide & Seek Chocolate",
        "Good Day Butter Cookies", "Sunfeast Dark Fantasy", "Bourbon Cream Biscuits",
        "Coconut Cookies", "Cashew Cookies", "Almond Cookies", "Butter Cookies",
        "Marie Gold Biscuits", "Digestive Biscuits", "Cream Crackers", "Salt Biscuits",
        "Chocolate Chip Cookies", "Vanilla Wafers", "Shortbread Cookies", "Ginger Snaps",
        "Peanut Butter Cookies", "Oatmeal Cookies"
    ]},
    "chips": {"gst": 12, "items": [
        "Lay's Classic Salted", "Kurkure Masala Munch", "Pringles Original",
        "Cheetos Cheese Balls", "Doritos Nacho Cheese", "Haldiram's Mixture",
        "Bikaji Namkeen", "Balaji Wafers", "Piknik Potato Chips", "Uncle Chips",
        "Lay's Magic Masala", "Kurkure Chilli Chatka", "Pringles Sour Cream",
        "Cheetos Flamin Hot", "Doritos Cool Ranch", "Haldiram's Aloo Bhujia",
        "Bikaji Moong Dal", "Balaji Tomato Chips", "Piknik Onion Rings", "Uncle Chips Masala"
    ]},
    "icecream": {"gst": 18, "items": [
        "Vanilla Ice Cream", "Chocolate Ice Cream", "Strawberry Ice Cream",
        "Butter Scotch", "Mango Ice Cream", "Pista Ice Cream", "Coffee Ice Cream",
        "Tutti Frutti", "Rocky Road", "Cookie Dough",
        "Mint Chocolate Chip", "Caramel Swirl", "Praline Ice Cream", "Rum Raisin",
        "Pineapple Ice Cream", "Orange Ice Cream", "Lemon Ice Cream", "Coconut Ice Cream",
        "Almond Fudge", "Peanut Butter Ice Cream"
    ]},
    "drinks": {"gst": 28, "items": [
        "Coca Cola", "Pepsi", "Sprite", "Fanta", "Thumbs Up", "Limca",
        "Mirinda", "7UP", "Mountain Dew", "Slice Mango",
        "Coca Cola Zero", "Pepsi Max", "Sprite Zero", "Fanta Grape", "Thumbs Up Charged",
        "Limca Lemon", "Mirinda Orange", "7UP Free", "Mountain Dew Code Red", "Slice Orange"
    ]},
    "snacks": {"gst": 12, "items": [
        "Popcorn", "Peanuts", "Cashews", "Almonds", "Pistachios", "Walnuts",
        "Mixed Nuts", "Roasted Chickpeas", "Sunflower Seeds", "Pumpkin Seeds",
        "Roasted Corn", "Dry Fruits Mix", "Chia Seeds", "Flax Seeds", "Sesame Seeds",
        "Macadamia Nuts", "Brazil Nuts", "Hazelnuts", "Pine Nuts", "Pecans"
    ]},
    "sweets": {"gst": 18, "items": [
        "Gulab Jamun", "Rasgulla", "Jalebi", "Ladoo", "Barfi", "Kheer",
        "Rasmalai", "Gajar Ka Halwa", "Moong Dal Halwa", "Besan Ladoo",
        "Gulab Jamun Mix", "Rasgulla Mix", "Jalebi Mix", "Ladoo Mix", "Barfi Mix",
        "Kheer Mix", "Rasmalai Mix", "Gajar Ka Halwa Mix", "Moong Dal Halwa Mix", "Besan Ladoo Mix"
    ]},
    "nescafe": {"gst": 18, "items": [
        "Nescafe Classic", "Nescafe Gold", "Nescafe 3in1", "Nescafe Cappuccino",
        "Nescafe Latte", "Nescafe Mocha", "Nescafe Americano", "Nescafe Espresso",
        "Nescafe Gold Blend", "Nescafe Gold Rich", "Nescafe Gold Smooth", "Nescafe Gold Mild",
        "Nescafe 3in1 Rich", "Nescafe 3in1 Smooth", "Nescafe 3in1 Mild", "Nescafe Cappuccino Rich",
        "Nescafe Cappuccino Smooth", "Nescafe Cappuccino Mild", "Nescafe Latte Rich", "Nescafe Latte Smooth"
    ]},
    "others": {"gst": 18, "items": [
        "Chocolate Bars", "Candies", "Gum", "Mints", "Toffees", "Lollipops",
        "Jelly Beans", "Marshmallows", "Caramels", "Fudge",
        "Dark Chocolate", "White Chocolate", "Milk Chocolate", "Chocolate Truffles", "Chocolate Pralines",
        "Hard Candies", "Soft Candies", "Sour Candies", "Fruit Candies", "Nut Candies"
    ]}
}

# HSN codes for retail items (different for each type)
HSN_CODES = {
    "biscuits": "19053100",
    "chips": "20052000", 
    "icecream": "21050000",
    "drinks": "22021000",
    "snacks": "20081100",
    "sweets": "17049000",
    "nescafe": "21011100",
    "others": "17049000"
}

def calculate_tax_details(price_including_tax: float, gst_percentage: float) -> Dict:
    """Calculate tax details"""
    price_excluding_tax = price_including_tax / (1 + gst_percentage / 100)
    sgst_percentage = gst_percentage / 2
    cgst_percentage = gst_percentage / 2
    
    return {
        "priceExcludingTax": round(price_excluding_tax, 2),
        "sgstPercentage": round(sgst_percentage, 2),
        "cgstPercentage": round(cgst_percentage, 2)
    }

def add_retail_item(item_data: Dict) -> bool:
    """Add a retail item to the backend"""
    try:
        url = f"{BACKEND_URL}/api/item/retail"
        response = requests.post(url, json=item_data)
        
        if response.status_code == 201 or response.status_code == 200:
            print(f"✅ Added: {item_data['name']} - ₹{item_data['price']}")
            return True
        else:
            print(f"❌ Failed to add {item_data['name']}: {response.status_code} - {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ Error adding {item_data['name']}: {str(e)}")
        return False

def generate_retail_items():
    """Generate and add retail items for each university"""
    total_added = 0
    total_failed = 0
    
    print("🚀 Starting to add retail items...")
    print("=" * 60)
    
    for uni_id in UNI_IDS:
        print(f"\n🏫 Adding items for University: {uni_id}")
        print("-" * 40)
        
        uni_added = 0
        uni_failed = 0
        
        for item_type, type_data in RETAIL_TYPES.items():
            gst_percentage = type_data["gst"]
            hsn_code = HSN_CODES[item_type]
            
            print(f"\n📦 Type: {item_type} (GST: {gst_percentage}%, HSN: {hsn_code})")
            
            # Get items for this type
            items = type_data["items"]
            
            # Select all 20 items for this university (no random selection)
            selected_items = items[:20]  # All 20 items per type per uni
            
            for item_name in selected_items:
                # Generate random price between 20-200 (no decimals)
                price_including_tax = random.randint(20, 200)
                
                # Calculate tax details
                tax_details = calculate_tax_details(price_including_tax, gst_percentage)
                
                # Random image
                image = random.choice(IMAGES)
                
                # Random packable status
                packable = random.choice([True, False])
                
                item_data = {
                    "name": item_name,  # Remove type label
                    "type": item_type,
                    "price": price_including_tax,
                    "priceExcludingTax": tax_details["priceExcludingTax"],
                    "hsnCode": hsn_code,
                    "gstPercentage": gst_percentage,
                    "sgstPercentage": tax_details["sgstPercentage"],
                    "cgstPercentage": tax_details["cgstPercentage"],
                    "image": image,
                    "uniId": uni_id,
                    "packable": packable
                }
                
                if add_retail_item(item_data):
                    uni_added += 1
                    total_added += 1
                else:
                    uni_failed += 1
                    total_failed += 1
        
        print(f"\n📊 University {uni_id}: {uni_added} added, {uni_failed} failed")
    
    print("\n" + "=" * 60)
    print(f"🎉 FINAL RESULTS: {total_added} items added, {total_failed} failed")
    print("=" * 60)

if __name__ == "__main__":
    print("🛍️  Retail Items Addition Script")
    print("=" * 60)
    
    # Confirm before proceeding
    response = input("Do you want to proceed with adding retail items? (y/N): ")
    if response.lower() in ['y', 'yes']:
        generate_retail_items()
    else:
        print("❌ Operation cancelled")
