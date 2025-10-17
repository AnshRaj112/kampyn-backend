@echo off
echo ========================================
echo GST Number Addition Script for KAMPYN
echo ========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Python is not installed or not in PATH
    echo Please install Python 3.7+ and try again
    pause
    exit /b 1
)

REM Check if requirements are installed
echo 🔧 Installing/checking Python dependencies...
pip install -r requirements.txt

if errorlevel 1 (
    echo ❌ Failed to install dependencies
    pause
    exit /b 1
)

echo.
echo 🚀 Running GST implementation script...
echo.

REM Run the Python script
python add_gst_numbers.py

echo.
echo ========================================
echo Script execution completed
echo ========================================
pause
