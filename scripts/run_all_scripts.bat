@echo off
echo ========================================
echo    KAMPYN Item Addition Scripts
echo ========================================
echo.

echo Installing dependencies...
pip install -r requirements.txt

echo.
echo ========================================
echo Starting Retail Items Addition...
echo ========================================
python add_retail_items.py

echo.
echo ========================================
echo Starting Produce Items Addition...
echo ========================================
python add_produce_items.py

echo.
echo ========================================
echo All scripts completed!
echo ========================================
pause
