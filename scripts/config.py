"""
Configuration file for KAMPYN Authentication Load Testing
"""

# Server Configuration
BASE_URL = "https://bitesbay-backend.onrender.com"
MONGO_URI = "mongodb+srv://anshraj112:Z8gVy6oJD5IWPfvQ@kiitbites.8zabl.mongodb.net/KIITBites"

# Test Configuration
NUM_USERS = 2000
MAX_CONCURRENT = 100
TEST_TIMEOUT = 60

# Database Configuration
DB_ACCOUNTS = "Cluster_Accounts"
DB_USER = "Cluster_Users"
COLLECTION_USERS = "users"
COLLECTION_OTPS = "otps"

# API Endpoints
ENDPOINTS = {
    'signup': '/api/user/auth/signup',
    'otp_verification': '/api/user/auth/otpverification',
    'login': '/api/user/auth/login',
    'forgot_password': '/api/user/auth/forgotpassword',
    'reset_password': '/api/user/auth/resetpassword',
}

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
CLEANUP_EMAIL_PATTERN = r'^testuser\d+@test\.com$'
