echo KAMPYN Authentication Load Testing Setup
echo ===========================================
echo.

REM Check if Python is installed
python --version >nul 2>&1
if errorlevel 1 (
    echo Error: Python is not installed or not in PATH
    echo Please install Python 3.8+ and try again
    pause
    exit /b 1
)

echo Python found. Starting setup...
echo.

REM Run the setup script
python setup_load_test.py

echo.
echo Setup complete!
pause
