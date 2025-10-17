# GST Number Addition Scripts

This directory contains scripts to add GST numbers to universities and vendors in the KAMPYN database.

## Files

- `add_gst_numbers.py` - Main Python script
- `requirements.txt` - Python dependencies
- `run_gst_script.bat` - Windows batch file
- `run_gst_script.sh` - Unix/Linux/Mac shell script
- `README.md` - This file

## Prerequisites

1. **Python 3.7 or higher** installed on your system
2. **MongoDB** running and accessible
3. **Network access** to your MongoDB instance

## Quick Start

### Windows Users
1. Double-click `run_gst_script.bat`
2. The script will automatically install dependencies and run

### Unix/Linux/Mac Users
1. Make the shell script executable:
   ```bash
   chmod +x run_gst_script.sh
   ```
2. Run the script:
   ```bash
   ./run_gst_script.sh
   ```

### Manual Execution
1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Run the script:
   ```bash
   python add_gst_numbers.py
   ```

## Configuration

### Environment Variables

Set the following environment variable before running the script:

```bash
# Windows
set MONGODB_URI=mongodb://localhost:27017

# Unix/Linux/Mac
export MONGODB_URI=mongodb://localhost:27017
```

### Database Name

By default, the script uses the database name `bitesbay`. If your database has a different name, edit the `DATABASE_NAME` variable in `add_gst_numbers.py`.

## What the Script Does

### 1. Adds GST Numbers to Universities
- Generates fake GST numbers in the format: `2 digits + 10 alphanumeric + 1 digit + 1 letter`
- Example: `27ABCDE1234F1Z5`
- Updates all universities that don't already have GST numbers

### 2. Updates Vendor Schema
- Adds `gstNumber` field (set to `null` by default)
- Adds `useUniGstNumber` field (set to `true` by default)
- This allows vendors to optionally use their own GST number or the university's

### 3. Verification
- Counts universities with GST numbers
- Counts vendors with GST fields
- Shows sample GST numbers for verification

## Sample Output

```
🚀 Starting GST implementation script...
📅 Started at: 2024-12-19 14:30:00

✅ Successfully connected to MongoDB

🔧 Starting GST number addition to universities...
📚 Found 5 universities
✅ Added GST number 27ABCDE1234F1Z5 to KIIT University
✅ Added GST number 19FGHIJ5678K9L2 to IIT Bombay
⏭️ University MIT already has GST number: 33MNOPQ9012R3S4
✅ Added GST number 11TUVWX3456Y7Z8 to Delhi University
✅ Added GST number 06ABCDE7890F1G9 to IIT Kanpur

📊 Universities Summary:
✅ Updated: 4 universities
⏭️ Skipped: 1 universities (already had GST numbers)
🎯 Total processed: 5 universities

🔧 Updating vendor schema...
🏪 Found 25 vendors
✅ Updated vendor Vendor A with new fields: {'gstNumber': None, 'useUniGstNumber': True}
✅ Updated vendor Vendor B with new fields: {'gstNumber': None, 'useUniGstNumber': True}
...

📊 Vendor Schema Update Summary:
✅ Updated: 25 vendors
🎯 Total processed: 25 vendors

🔍 Verifying GST numbers...
📚 Universities with GST numbers: 5/5
🏪 Vendors with GST fields: 25/25

📋 Sample GST Numbers:
   KIIT University: 27ABCDE1234F1Z5
   IIT Bombay: 19FGHIJ5678K9L2
   MIT: 33MNOPQ9012R3S4

🎉 GST implementation completed!
📅 Completed at: 2024-12-19 14:30:45

📋 Implementation Summary:
1. ✅ Universities updated: Yes
2. ✅ Vendors updated: Yes
3. ✅ Verification passed: Yes

🔧 Next steps:
1. Restart your KAMPYN application to load the new models
2. Test invoice generation with the new GST functionality
3. Verify that invoices now include detailed GST breakdown
4. Check that vendor GST preferences are working correctly

🔌 MongoDB connection closed
```

## Troubleshooting

### Common Issues

1. **Connection Failed**
   - Check if MongoDB is running
   - Verify the connection string in `MONGODB_URI`
   - Ensure network access to MongoDB

2. **Permission Denied**
   - Make sure you have write access to the database
   - Check if the MongoDB user has update permissions

3. **Python Not Found**
   - Install Python 3.7+ from [python.org](https://python.org)
   - Add Python to your system PATH

4. **Dependencies Installation Failed**
   - Try upgrading pip: `pip install --upgrade pip`
   - Check your internet connection
   - Try using a virtual environment

### Manual Database Check

You can manually verify the changes in MongoDB:

```javascript
// Check universities with GST numbers
db.unis.find({gstNumber: {$exists: true}})

// Check vendors with GST fields
db.vendors.find({
  $and: [
    {gstNumber: {$exists: true}},
    {useUniGstNumber: {$exists: true}}
  ]
})
```

## After Running the Script

1. **Restart your KAMPYN application** to load the new models
2. **Test invoice generation** to ensure GST functionality works
3. **Verify invoices** include all GST information
4. **Check vendor preferences** are working correctly

## Security Notes

- The script generates **fake GST numbers** for testing purposes
- In production, replace these with **real, valid GST numbers**
- Ensure proper access controls to your MongoDB instance
- Consider using environment variables for sensitive configuration

## Support

If you encounter issues:

1. Check the error messages in the script output
2. Verify your MongoDB connection and permissions
3. Ensure all prerequisites are met
4. Check the troubleshooting section above

---

**Note**: This script modifies your database schema. Always backup your data before running it in production.
