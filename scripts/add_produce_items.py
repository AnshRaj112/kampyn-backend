#!/usr/bin/env python3
"""
Script to add produce items for each university
GST percentages can be the same across types for produce items
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

# Produce types and their GST percentages (can be same across types)
PRODUCE_TYPES = {
    "combos-veg": {"gst": 5, "items": [
        "Veg Thali Combo", "Veg Biryani Combo", "Veg Fried Rice Combo",
        "Veg Noodles Combo", "Veg Burger Combo", "Veg Pizza Combo",
        "Veg Sandwich Combo", "Veg Wrap Combo", "Veg Pasta Combo", "Veg Roll Combo",
        "Veg Meals Combo", "Veg Curry Combo", "Veg Rice Combo", "Veg Roti Combo", "Veg Dal Combo",
        "Veg Sabzi Combo", "Veg Paratha Combo", "Veg Dosa Combo", "Veg Idli Combo", "Veg Upma Combo"
    ]},
    "combos-nonveg": {"gst": 5, "items": [
        "Chicken Thali Combo", "Chicken Biryani Combo", "Chicken Fried Rice Combo",
        "Chicken Noodles Combo", "Chicken Burger Combo", "Chicken Pizza Combo",
        "Fish Curry Combo", "Mutton Curry Combo", "Egg Curry Combo", "Seafood Combo",
        "Chicken Meals Combo", "Chicken Curry Combo", "Chicken Rice Combo", "Chicken Roti Combo", "Chicken Dal Combo",
        "Fish Meals Combo", "Mutton Meals Combo", "Egg Meals Combo", "Seafood Meals Combo", "Mixed Non-Veg Combo"
    ]},
    "veg": {"gst": 5, "items": [
        "Paneer Butter Masala", "Dal Makhani", "Aloo Gobi", "Baingan Bharta",
        "Mushroom Masala", "Mixed Vegetables", "Palak Paneer", "Chana Masala",
        "Rajma Masala", "Kadai Vegetables",
        "Paneer Tikka", "Dal Tadka", "Aloo Paratha", "Baingan Masala", "Mushroom Curry",
        "Mixed Veg Curry", "Palak Dal", "Chana Curry", "Rajma Curry", "Kadai Paneer"
    ]},
    "shakes": {"gst": 18, "items": [
        "Chocolate Shake", "Vanilla Shake", "Strawberry Shake", "Mango Shake",
        "Oreo Shake", "KitKat Shake", "Butterscotch Shake", "Coffee Shake",
        "Banana Shake", "Pineapple Shake",
        "Caramel Shake", "Nutella Shake", "Blueberry Shake", "Raspberry Shake", "Peach Shake",
        "Apple Shake", "Grape Shake", "Watermelon Shake", "Coconut Shake", "Almond Shake"
    ]},
    "juices": {"gst": 12, "items": [
        "Orange Juice", "Apple Juice", "Grape Juice", "Pineapple Juice",
        "Mango Juice", "Watermelon Juice", "Pomegranate Juice", "Cranberry Juice",
        "Lemonade", "Lime Soda",
        "Carrot Juice", "Beetroot Juice", "Cucumber Juice", "Celery Juice", "Spinach Juice",
        "Kale Juice", "Ginger Juice", "Turmeric Juice", "Aloe Vera Juice", "Mixed Fruit Juice"
    ]},
    "soups": {"gst": 5, "items": [
        "Tomato Soup", "Veg Clear Soup", "Chicken Soup", "Mushroom Soup",
        "Corn Soup", "Mixed Vegetable Soup", "Hot & Sour Soup", "Manchow Soup",
        "Sweet Corn Soup", "Lentil Soup",
        "Carrot Soup", "Broccoli Soup", "Cauliflower Soup", "Spinach Soup", "Pea Soup",
        "Onion Soup", "Garlic Soup", "Ginger Soup", "Coriander Soup", "Mixed Herb Soup"
    ]},
    "non-veg": {"gst": 5, "items": [
        "Butter Chicken", "Chicken Tikka", "Fish Curry", "Mutton Curry",
        "Chicken Biryani", "Fish Fry", "Chicken 65", "Chicken Manchurian",
        "Chicken Fried Rice", "Chicken Noodles",
        "Chicken Curry", "Chicken Masala", "Fish Masala", "Mutton Masala", "Chicken Roast",
        "Fish Roast", "Mutton Roast", "Chicken Grill", "Fish Grill", "Mutton Grill"
    ]},
    "others": {"gst": 18, "items": [
        "French Fries", "Onion Rings", "Mozzarella Sticks", "Chicken Wings",
        "Spring Rolls", "Samosa", "Vada Pav", "Dosa", "Idli", "Upma",
        "Potato Wedges", "Cheese Balls", "Chicken Nuggets", "Fish Fingers", "Veg Cutlet",
        "Paneer Tikka", "Mushroom Tikka", "Aloo Tikki", "Mixed Pakora", "Bread Pakora"
    ]}
}

# HSN codes for produce items (different for each type)
HSN_CODES = {
    "combos-veg": "21069099",
    "combos-nonveg": "21069099",
    "veg": "21069099",
    "shakes": "22029000",
    "juices": "20090000",
    "soups": "21041000",
    "non-veg": "21069099",
    "others": "21069099"
}

# Units for different types
UNITS = {
    "combos-veg": "plate",
    "combos-nonveg": "plate", 
    "veg": "plate",
    "shakes": "glass",
    "juices": "glass",
    "soups": "bowl",
    "non-veg": "plate",
    "others": "piece"
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

def add_produce_item(item_data: Dict) -> bool:
    """Add a produce item to the backend"""
    try:
        url = f"{BACKEND_URL}/api/item/produce"
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

def generate_produce_items():
    """Generate and add produce items for each university"""
    total_added = 0
    total_failed = 0
    
    print("🚀 Starting to add produce items...")
    print("=" * 60)
    
    for uni_id in UNI_IDS:
        print(f"\n🏫 Adding items for University: {uni_id}")
        print("-" * 40)
        
        uni_added = 0
        uni_failed = 0
        
        for item_type, type_data in PRODUCE_TYPES.items():
            gst_percentage = type_data["gst"]
            hsn_code = HSN_CODES[item_type]
            unit = UNITS[item_type]
            
            print(f"\n🍽️  Type: {item_type} (GST: {gst_percentage}%, HSN: {hsn_code}, Unit: {unit})")
            
            # Get items for this type
            items = type_data["items"]
            
            # Select all 20 items for this university (no random selection)
            selected_items = items[:20]  # All 20 items per type per uni
            
            for item_name in selected_items:
                # Generate random price based on type (no decimals)
                if item_type in ["combos-veg", "combos-nonveg"]:
                    price_including_tax = random.randint(80, 200)
                elif item_type in ["shakes", "juices"]:
                    price_including_tax = random.randint(40, 120)
                elif item_type in ["soups"]:
                    price_including_tax = random.randint(30, 80)
                else:
                    price_including_tax = random.randint(50, 150)
                
                # Calculate tax details
                tax_details = calculate_tax_details(price_including_tax, gst_percentage)
                
                # Random image
                image = random.choice(IMAGES)
                
                # Packable is usually true for produce items
                packable = random.choice([True, True, False])  # 66% chance of being packable
                
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
                    "packable": packable,
                    "unit": unit
                }
                
                if add_produce_item(item_data):
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
    print("🍽️  Produce Items Addition Script")
    print("=" * 60)
    
    # Confirm before proceeding
    response = input("Do you want to proceed with adding produce items? (y/N): ")
    if response.lower() in ['y', 'yes']:
        generate_produce_items()
    else:
        print("❌ Operation cancelled")
