# KAMPYN Authentication Load Testing Script

This script performs comprehensive load testing for the KAMPYN authentication system, testing signup and login for 10,000 users with OTP verification from MongoDB.

## Features

- **High-Performance Testing**: Tests 10,000 users with configurable concurrency
- **Complete Workflow Testing**: Signup → OTP Verification → Login → Forgot Password → Reset Password
- **MongoDB Integration**: Reads OTPs directly from MongoDB Compass
- **Comprehensive Metrics**: Response times, success rates, percentiles
- **Async/Await**: Uses Python asyncio for high concurrency
- **Detailed Logging**: Complete test logs and error tracking
- **Data Cleanup**: Optional cleanup of test data

## Prerequisites

1. **Python 3.8+** installed
2. **KAMPYN Backend** running on the configured URL
3. **MongoDB** running and accessible
4. **Required Python packages** (install via `pip install -r requirements.txt`)

## Installation

1. Navigate to the scripts directory:
```bash
cd bitesbay-backend/scripts
```

2. Install dependencies:
```bash
pip install -r requirements.txt
```

## Configuration

Edit `config.py` to customize test parameters:

```python
# Server Configuration
BASE_URL = "http://localhost:3000"  # Your server URL
MONGO_URI = "mongodb://localhost:27017"  # Your MongoDB URI

# Test Configuration
NUM_USERS = 10000  # Number of users to test
MAX_CONCURRENT = 100  # Maximum concurrent requests
```

## Usage

### Basic Usage

Run the load test with default settings:

```bash
python load_test_auth.py
```

### Custom Configuration

Modify the configuration in `config.py` or edit the main function in `load_test_auth.py`:

```python
# In main() function
BASE_URL = "https://your-production-server.com"
MONGO_URI = "mongodb://your-mongodb-server:27017"
NUM_USERS = 5000  # Test with fewer users
MAX_CONCURRENT = 50  # Reduce concurrency
```

### Running Different Test Scenarios

1. **Quick Test** (100 users):
```python
NUM_USERS = 100
MAX_CONCURRENT = 10
```

2. **Stress Test** (50,000 users):
```python
NUM_USERS = 50000
MAX_CONCURRENT = 200
```

3. **Production Load Test**:
```python
BASE_URL = "https://your-production-server.com"
NUM_USERS = 10000
MAX_CONCURRENT = 100
```

## Test Workflow

The script tests the complete authentication workflow:

1. **User Signup**: Creates new user account
2. **OTP Generation**: Waits for OTP to be saved in MongoDB
3. **OTP Verification**: Reads OTP from MongoDB and verifies
4. **User Login**: Tests login with verified account
5. **Forgot Password**: Tests password reset request
6. **Reset Password**: Tests password reset with new OTP

## Output

### Console Output
```
================================================================================
KAMPYN Authentication Load Test Results
================================================================================
Total Test Duration: 45.23 seconds
Average Requests per Second: 221.12

SIGNUP:
  Success: 9987
  Failed: 13
  Success Rate: 99.87%
  Average Response Time: 0.234s
  Min Response Time: 0.123s
  Max Response Time: 1.456s
  95th Percentile: 0.567s

OTP VERIFICATION:
  Success: 9980
  Failed: 20
  Success Rate: 99.80%
  Average Response Time: 0.189s
  Min Response Time: 0.098s
  Max Response Time: 0.987s
  95th Percentile: 0.423s

LOGIN:
  Success: 9975
  Failed: 25
  Success Rate: 99.75%
  Average Response Time: 0.156s
  Min Response Time: 0.087s
  Max Response Time: 0.765s
  95th Percentile: 0.345s
```

### Log Files
- `load_test_auth.log`: Detailed test logs
- Console output: Real-time progress and results

## Performance Metrics

The script provides comprehensive performance metrics:

- **Response Times**: Average, min, max, 95th percentile
- **Success Rates**: Percentage of successful operations
- **Throughput**: Requests per second
- **Error Analysis**: Detailed error logging
- **Concurrency Performance**: How the system handles multiple requests

## Database Integration

### MongoDB Collections Used

1. **Cluster_Accounts.users**: User accounts
2. **Cluster_Users.otps**: OTP records

### OTP Reading Process

1. User signup generates OTP
2. Script waits for OTP to be saved in MongoDB
3. Script reads OTP from `Cluster_Users.otps` collection
4. OTP is used for verification

### Data Cleanup

After testing, the script can clean up test data:

```python
# Automatically cleans up test users and OTPs
await tester.cleanup_test_data()
```

## Troubleshooting

### Common Issues

1. **Connection Errors**:
   - Check if backend server is running
   - Verify MongoDB connection
   - Check firewall settings

2. **OTP Not Found**:
   - Verify MongoDB collection names
   - Check OTP expiration settings
   - Increase OTP_WAIT_TIME in config

3. **High Failure Rate**:
   - Reduce MAX_CONCURRENT
   - Check server resources
   - Verify API endpoints

4. **Memory Issues**:
   - Reduce NUM_USERS
   - Increase system memory
   - Use smaller batch sizes

### Debug Mode

Enable detailed logging by modifying the logging level:

```python
logging.basicConfig(level=logging.DEBUG)
```

## API Endpoints Tested

- `POST /api/user/auth/signup`
- `POST /api/user/auth/otpverification`
- `POST /api/user/auth/login`
- `POST /api/user/auth/forgotpassword`
- `POST /api/user/auth/resetpassword`

## Security Considerations

1. **Test Data**: Uses test email domains and phone numbers
2. **Isolation**: Test data is separate from production
3. **Cleanup**: Optional cleanup prevents test data accumulation
4. **Rate Limiting**: Respects server rate limits

## Performance Recommendations

1. **Server Optimization**:
   - Enable connection pooling
   - Optimize database queries
   - Use caching for OTP verification

2. **Load Testing Best Practices**:
   - Start with small numbers
   - Gradually increase load
   - Monitor server resources
   - Test in staging environment first

## Support

For issues or questions:
1. Check the log files for detailed error messages
2. Verify configuration settings
3. Ensure all prerequisites are met
4. Test with smaller user counts first

## License

This script is part of the KAMPYN project and follows the same licensing terms.
