#!/usr/bin/env python3
"""
Setup script for KAMPYN Authentication Load Testing
Helps configure and run the load test with user input
"""

import os
import sys
import subprocess
import json
from pathlib import Path

def check_python_version():
    """Check if Python version is compatible"""
    if sys.version_info < (3, 8):
        print("❌ Python 3.8+ is required. Current version:", sys.version)
        return False
    print("✅ Python version:", sys.version)
    return True

def install_dependencies():
    """Install required Python packages"""
    print("\n📦 Installing dependencies...")
    try:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "requirements.txt"])
        print("✅ Dependencies installed successfully")
        return True
    except subprocess.CalledProcessError as e:
        print(f"❌ Failed to install dependencies: {e}")
        return False

def get_user_config():
    """Get configuration from user input"""
    print("\n🔧 Configuration Setup")
    print("=" * 50)
    
    config = {}
    
    # Server URL
    default_url = "https://bitesbay-backend.onrender.com"
    config['base_url'] = input(f"Enter server URL (default: {default_url}): ").strip() or default_url
    
    # MongoDB URI
    default_mongo = "mongodb+srv://anshraj112:Z8gVy6oJD5IWPfvQ@kiitbites.8zabl.mongodb.net/KIITBites"
    config['mongo_uri'] = input(f"Enter MongoDB URI (default: {default_mongo}): ").strip() or default_mongo
    
    # Number of users
    while True:
        try:
            num_users = input("Enter number of users to test (default: 1000): ").strip() or "1000"
            config['num_users'] = int(num_users)
            if config['num_users'] > 0:
                break
            else:
                print("❌ Number of users must be positive")
        except ValueError:
            print("❌ Please enter a valid number")
    
    # Max concurrent requests
    while True:
        try:
            max_concurrent = input("Enter max concurrent requests (default: 50): ").strip() or "50"
            config['max_concurrent'] = int(max_concurrent)
            if config['max_concurrent'] > 0:
                break
            else:
                print("❌ Max concurrent must be positive")
        except ValueError:
            print("❌ Please enter a valid number")
    
    # Test timeout
    while True:
        try:
            timeout = input("Enter test timeout in seconds (default: 60): ").strip() or "60"
            config['timeout'] = int(timeout)
            if config['timeout'] > 0:
                break
            else:
                print("❌ Timeout must be positive")
        except ValueError:
            print("❌ Please enter a valid number")
    
    return config

def update_config_file(config):
    """Update the config.py file with user settings"""
    config_content = f'''"""
Configuration file for KAMPYN Authentication Load Testing
"""

# Server Configuration
BASE_URL = "{config['base_url']}"
MONGO_URI = "{config['mongo_uri']}"

# Test Configuration
NUM_USERS = {config['num_users']}
MAX_CONCURRENT = {config['max_concurrent']}
TEST_TIMEOUT = {config['timeout']}

# Database Configuration
DB_ACCOUNTS = "Cluster_Accounts"
DB_USER = "Cluster_Users"
COLLECTION_USERS = "users"
COLLECTION_OTPS = "otps"

# API Endpoints
ENDPOINTS = {{
    'signup': '/api/user/auth/signup',
    'otp_verification': '/api/user/auth/otpverification',
    'login': '/api/user/auth/login',
    'forgot_password': '/api/user/auth/forgotpassword',
    'reset_password': '/api/user/auth/resetpassword',
}}

# Test Data Configuration
TEST_EMAIL_DOMAIN = "test.com"
TEST_PHONE_PREFIX = "98765"
SAMPLE_UNI_ID = "68320fd75c6f79ec179ad3bb"

# Logging Configuration
LOG_LEVEL = "INFO"
LOG_FILE = "load_test_auth.log"
LOG_FORMAT = '%(asctime)s - %(levelname)s - %(message)s'

# Performance Configuration
OTP_WAIT_TIME = 1
REQUEST_TIMEOUT = 30
RETRY_ATTEMPTS = 3

# Cleanup Configuration
CLEANUP_TEST_DATA = True
CLEANUP_EMAIL_PATTERN = r'^testuser\\d+@test\\.com$'
'''
    
    try:
        with open('config.py', 'w') as f:
            f.write(config_content)
        print("✅ Configuration file updated")
        return True
    except Exception as e:
        print(f"❌ Failed to update config file: {e}")
        return False

def test_connections(config):
    """Test connections to server and MongoDB"""
    
    # Test server connection
    try:
        import aiohttp
        import asyncio
        
        async def test_server():
            try:
                async with aiohttp.ClientSession() as session:
                    async with session.get(f"{config['base_url']}/api/user/auth/list", timeout=5) as response:
                        if response.status in [200, 404, 405]:  # Any response means server is reachable
                            return True
                        return False
            except Exception as e:
                print(f"Server connection error: {e}")
                return False
        
        server_ok = asyncio.run(test_server())
        if server_ok:
            print("✅ Server connection successful")
        else:
            print("❌ Server connection failed")
            return False
    except ImportError as e:
        print(f"❌ Required module not found: {e}")
        print("Please run 'pip install -r requirements.txt' first")
        return False
    except Exception as e:
        print(f"❌ Server connection test failed: {e}")
        return False
    
    # Test MongoDB connection
    try:
        import pymongo
        client = pymongo.MongoClient(config['mongo_uri'], serverSelectionTimeoutMS=5000)
        client.admin.command('ping')
        print("✅ MongoDB connection successful")
        client.close()
        return True
    except ImportError as e:
        print(f"❌ Required module not found: {e}")
        print("Please run 'pip install -r requirements.txt' first")
        return False
    except Exception as e:
        print(f"❌ MongoDB connection failed: {e}")
        return False

def run_load_test():
    """Run the load test"""
    print("\n🚀 Starting load test...")
    try:
        subprocess.run([sys.executable, "load_test_auth.py"])
    except KeyboardInterrupt:
        print("\n⏹️ Load test interrupted by user")
    except Exception as e:
        print(f"❌ Load test failed: {e}")

def main():
    """Main setup function"""
    print("KAMPYN Authentication Load Testing Setup")
    print("=" * 50)
    
    # Check Python version
    if not check_python_version():
        sys.exit(1)
    
    # Install dependencies FIRST
    if not install_dependencies():
        print("❌ Setup failed. Please install dependencies manually.")
        sys.exit(1)
    
    # Get user configuration
    config = get_user_config()
    
    # Update config file
    if not update_config_file(config):
        print("❌ Failed to update configuration")
        sys.exit(1)
    
    # Test connections AFTER dependencies are installed
    print("\n🔍 Testing connections...")
    if not test_connections(config):
        print("\n⚠️ Connection tests failed. Please check your configuration.")
        retry = input("Do you want to continue anyway? (y/n): ").lower().strip()
        if retry != 'y':
            sys.exit(1)
    
    # Show configuration summary
    print("\n📋 Configuration Summary:")
    print(f"  Server URL: {config['base_url']}")
    print(f"  MongoDB URI: {config['mongo_uri']}")
    print(f"  Number of Users: {config['num_users']}")
    print(f"  Max Concurrent: {config['max_concurrent']}")
    print(f"  Timeout: {config['timeout']} seconds")
    
    # Ask if user wants to run the test
    run_test = input("\nDo you want to run the load test now? (y/n): ").lower().strip()
    if run_test == 'y':
        run_load_test()
    else:
        print("\n✅ Setup complete! Run 'python load_test_auth.py' to start the test.")

if __name__ == "__main__":
    main()
