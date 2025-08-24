#!/bin/bash

echo "========================================"
echo "GST Number Addition Script for BitesBay"
echo "========================================"
echo

# Check if Python is installed
if ! command -v python3 &> /dev/null; then
    if ! command -v python &> /dev/null; then
        echo "❌ Python is not installed"
        echo "Please install Python 3.7+ and try again"
        exit 1
    else
        PYTHON_CMD="python"
    fi
else
    PYTHON_CMD="python3"
fi

echo "🔧 Installing/checking Python dependencies..."
$PYTHON_CMD -m pip install -r requirements.txt

if [ $? -ne 0 ]; then
    echo "❌ Failed to install dependencies"
    exit 1
fi

echo
echo "🚀 Running GST implementation script..."
echo

# Run the Python script
$PYTHON_CMD add_gst_numbers.py

echo
echo "========================================"
echo "Script execution completed"
echo "========================================"
