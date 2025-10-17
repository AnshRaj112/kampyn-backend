#!/usr/bin/env python3
"""
GST Number Addition Script for KAMPYN
This script adds fake GST numbers to universities and vendors in the database.
"""

import os
import sys
import random
import string
from pymongo import MongoClient
from datetime import datetime

# Configuration
MONGODB_URI = os.getenv('MONGODB_URI', 'mongodb://localhost:27017')
DATABASE_NAME = 'bitesbay'  # Adjust if your database name is different

def generate_fake_gst_number():
    """Generate a fake GST number in the format: 2 digits + 10 alphanumeric + 1 digit + 1 letter"""
    # State codes (first 2 digits)
    state_codes = [
        '01', '02', '03', '04', '05', '06', '07', '08', '09', '10',
        '11', '12', '13', '14', '15', '16', '17', '18', '19', '20',
        '21', '22', '23', '24', '25', '26', '27', '28', '29', '30',
        '31', '32', '33', '34', '35', '36', '37'
    ]
    
    # Generate random components
    state_code = random.choice(state_codes)
    pan_part = ''.join(random.choices(string.ascii_uppercase + string.digits, k=10))
    number_part = str(random.randint(100, 999))
    check_letter = random.choice(string.ascii_uppercase)
    
    return f"{state_code}{pan_part}{number_part}{check_letter}"

def connect_to_mongodb():
    """Connect to MongoDB and return client and database objects"""
    try:
        client = MongoClient(MONGODB_URI)
        # Test the connection
        client.admin.command('ping')
        print("✅ Successfully connected to MongoDB")
        
        # Get the database
        db = client[DATABASE_NAME]
        return client, db
    except Exception as e:
        print(f"❌ Failed to connect to MongoDB: {e}")
        sys.exit(1)

def add_gst_numbers_to_universities(db):
    """Add GST numbers to universities"""
    print("\n🔧 Starting GST number addition to universities...")
    
    try:
        # Get the universities collection
        unis_collection = db.unis
        
        # Find all universities
        universities = list(unis_collection.find({}))
        print(f"📚 Found {len(universities)} universities")
        
        updated_count = 0
        skipped_count = 0
        
        for uni in universities:
            try:
                # Check if GST number already exists
                if uni.get('gstNumber'):
                    print(f"⏭️ University {uni.get('fullName', 'Unknown')} already has GST number: {uni['gstNumber']}")
                    skipped_count += 1
                    continue
                
                # Generate fake GST number
                fake_gst_number = generate_fake_gst_number()
                
                # Update university with GST number
                result = unis_collection.update_one(
                    {'_id': uni['_id']},
                    {'$set': {'gstNumber': fake_gst_number}}
                )
                
                if result.modified_count > 0:
                    print(f"✅ Added GST number {fake_gst_number} to {uni.get('fullName', 'Unknown')}")
                    updated_count += 1
                else:
                    print(f"⚠️ No changes made to {uni.get('fullName', 'Unknown')}")
                    
            except Exception as e:
                print(f"❌ Error updating university {uni.get('fullName', 'Unknown')}: {e}")
        
        print(f"\n📊 Universities Summary:")
        print(f"✅ Updated: {updated_count} universities")
        print(f"⏭️ Skipped: {skipped_count} universities (already had GST numbers)")
        print(f"🎯 Total processed: {len(universities)} universities")
        
        return updated_count > 0
        
    except Exception as e:
        print(f"❌ Error in add_gst_numbers_to_universities: {e}")
        return False

def update_vendor_schema(db):
    """Update vendor schema with GST-related fields"""
    print("\n🔧 Updating vendor schema...")
    
    try:
        # Get the vendors collection
        vendors_collection = db.vendors
        
        # Find all vendors
        vendors = list(vendors_collection.find({}))
        print(f"🏪 Found {len(vendors)} vendors")
        
        updated_count = 0
        
        for vendor in vendors:
            try:
                update_fields = {}
                
                # Add gstNumber field if it doesn't exist
                if 'gstNumber' not in vendor:
                    update_fields['gstNumber'] = None
                
                # Add useUniGstNumber field if it doesn't exist
                if 'useUniGstNumber' not in vendor:
                    update_fields['useUniGstNumber'] = True  # Default to using university GST
                
                if update_fields:
                    result = vendors_collection.update_one(
                        {'_id': vendor['_id']},
                        {'$set': update_fields}
                    )
                    
                    if result.modified_count > 0:
                        print(f"✅ Updated vendor {vendor.get('fullName', 'Unknown')} with new fields: {update_fields}")
                        updated_count += 1
                    else:
                        print(f"⚠️ No changes made to vendor {vendor.get('fullName', 'Unknown')}")
                
            except Exception as e:
                print(f"❌ Error updating vendor {vendor.get('fullName', 'Unknown')}: {e}")
        
        print(f"\n📊 Vendor Schema Update Summary:")
        print(f"✅ Updated: {updated_count} vendors")
        print(f"🎯 Total processed: {len(vendors)} vendors")
        
        return updated_count > 0
        
    except Exception as e:
        print(f"❌ Error in update_vendor_schema: {e}")
        return False

def verify_gst_numbers(db):
    """Verify that GST numbers are properly set"""
    print("\n🔍 Verifying GST numbers...")
    
    try:
        # Check universities
        unis_collection = db.unis
        universities_with_gst = unis_collection.count_documents({'gstNumber': {'$exists': True, '$ne': None}})
        total_universities = unis_collection.count_documents({})
        
        print(f"📚 Universities with GST numbers: {universities_with_gst}/{total_universities}")
        
        # Check vendors
        vendors_collection = db.vendors
        vendors_with_gst_fields = vendors_collection.count_documents({
            '$and': [
                {'gstNumber': {'$exists': True}},
                {'useUniGstNumber': {'$exists': True}}
            ]
        })
        total_vendors = vendors_collection.count_documents({})
        
        print(f"🏪 Vendors with GST fields: {vendors_with_gst_fields}/{total_vendors}")
        
        # Show sample GST numbers
        print("\n📋 Sample GST Numbers:")
        sample_unis = list(unis_collection.find({'gstNumber': {'$exists': True, '$ne': None}}).limit(3))
        for uni in sample_unis:
            print(f"   {uni.get('fullName', 'Unknown')}: {uni['gstNumber']}")
        
        return universities_with_gst > 0
        
    except Exception as e:
        print(f"❌ Error in verify_gst_numbers: {e}")
        return False

def main():
    """Main function"""
    print("🚀 Starting GST implementation script...")
    print(f"📅 Started at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    
    try:
        # Connect to MongoDB
        client, db = connect_to_mongodb()
        
        # Add GST numbers to universities
        unis_updated = add_gst_numbers_to_universities(db)
        
        # Update vendor schema
        vendors_updated = update_vendor_schema(db)
        
        # Verify the implementation
        verification_success = verify_gst_numbers(db)
        
        print("\n🎉 GST implementation completed!")
        print(f"📅 Completed at: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
        
        print("\n📋 Implementation Summary:")
        print(f"1. ✅ Universities updated: {'Yes' if unis_updated else 'No'}")
        print(f"2. ✅ Vendors updated: {'Yes' if vendors_updated else 'No'}")
        print(f"3. ✅ Verification passed: {'Yes' if verification_success else 'No'}")
        
        if verification_success:
            print("\n🔧 Next steps:")
            print("1. Restart your KAMPYN application to load the new models")
            print("2. Test invoice generation with the new GST functionality")
            print("3. Verify that invoices now include detailed GST breakdown")
            print("4. Check that vendor GST preferences are working correctly")
        else:
            print("\n⚠️ Some issues were encountered. Please check the logs above.")
        
        # Close MongoDB connection
        client.close()
        print("\n🔌 MongoDB connection closed")
        
    except KeyboardInterrupt:
        print("\n\n⏹️ Script interrupted by user")
        sys.exit(1)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
