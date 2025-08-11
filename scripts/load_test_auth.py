#!/usr/bin/env python3
"""
KAMPYN Authentication Load Testing Script
Tests signup and login for 10,000 users in a single minute
Includes OTP verification from MongoDB and comprehensive API testing
"""

import asyncio
import aiohttp
import pymongo
import time
import json
import random
import string
import hashlib
import logging
from datetime import datetime, timedelta
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, List, Optional, Tuple
import statistics

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.FileHandler('load_test_auth.log'),
        logging.StreamHandler()
    ]
)
logger = logging.getLogger(__name__)

class KAMPYNLoadTester:
    def __init__(self, base_url: str = "https://bitesbay-backend.onrender.com", mongo_uri: str = "mongodb+srv://anshraj112:Z8gVy6oJD5IWPfvQ@kiitbites.8zabl.mongodb.net/KIITBites"):
        self.base_url = base_url
        self.mongo_uri = mongo_uri
        self.session = None
        self.mongo_client = None
        self.results = {
            'signup': {'success': 0, 'failed': 0, 'times': []},
            'otp_verification': {'success': 0, 'failed': 0, 'times': []},
            'login': {'success': 0, 'failed': 0, 'times': []},
            'forgot_password': {'success': 0, 'failed': 0, 'times': []},
            'reset_password': {'success': 0, 'failed': 0, 'times': []}
        }
        self.test_users = []
        self.start_time = None
        
    async def setup(self):
        """Initialize connections"""
        self.session = aiohttp.ClientSession()
        self.mongo_client = pymongo.MongoClient(self.mongo_uri)
        logger.info("Connections established")
        
    async def cleanup(self):
        """Clean up connections"""
        if self.session:
            await self.session.close()
        if self.mongo_client:
            self.mongo_client.close()
        logger.info("Connections closed")

    def generate_test_user(self, index: int) -> Dict:
        """Generate test user data"""
        return {
            'fullName': f'Test User {index}',
            'email': f'testuser{index}@test.com',
            'phone': f'98765{index:05d}',
            'password': f'Password{index}!',
            'gender': random.choice(['male', 'female']),
            'uniID': '68320fd75c6f79ec179ad3bb'  # Sample university ID
        }

    def generate_phone_number(self) -> str:
        """Generate unique phone number"""
        return f'98765{random.randint(10000, 99999)}'

    async def get_otp_from_mongodb(self, email: str) -> Optional[str]:
        """Read OTP from MongoDB"""
        try:
            db = self.mongo_client['Cluster_Users']  # OTPs are in Cluster_Users
            otp_collection = db['otps']
            
            # Find the most recent OTP for the email
            otp_record = otp_collection.find_one(
                {'email': email},
                sort=[('createdAt', -1)]
            )
            
            if otp_record:
                return otp_record.get('otp')
            return None
        except Exception as e:
            logger.error(f"Error reading OTP from MongoDB: {e}")
            return None

    async def test_signup(self, user_data: Dict) -> Tuple[bool, float, Optional[str]]:
        """Test user signup"""
        start_time = time.time()
        try:
            url = f"{self.base_url}/api/user/auth/signup"
            async with self.session.post(url, json=user_data) as response:
                end_time = time.time()
                duration = end_time - start_time
                
                if response.status == 201:
                    data = await response.json()
                    token = data.get('token')
                    logger.info(f"Signup successful for {user_data['email']}")
                    return True, duration, token
                else:
                    error_data = await response.text()
                    logger.warning(f"Signup failed for {user_data['email']}: {response.status} - {error_data}")
                    return False, duration, None
        except Exception as e:
            end_time = time.time()
            duration = end_time - start_time
            logger.error(f"Signup error for {user_data['email']}: {e}")
            return False, duration, None

    async def test_otp_verification(self, email: str, otp: str) -> Tuple[bool, float]:
        """Test OTP verification"""
        start_time = time.time()
        try:
            url = f"{self.base_url}/api/user/auth/otpverification"
            data = {'email': email, 'otp': otp}
            
            async with self.session.post(url, json=data) as response:
                end_time = time.time()
                duration = end_time - start_time
                
                if response.status == 200:
                    logger.info(f"OTP verification successful for {email}")
                    return True, duration
                else:
                    error_data = await response.text()
                    logger.warning(f"OTP verification failed for {email}: {response.status} - {error_data}")
                    return False, duration
        except Exception as e:
            end_time = time.time()
            duration = end_time - start_time
            logger.error(f"OTP verification error for {email}: {e}")
            return False, duration

    async def test_login(self, identifier: str, password: str) -> Tuple[bool, float, Optional[str]]:
        """Test user login"""
        start_time = time.time()
        try:
            url = f"{self.base_url}/api/user/auth/login"
            data = {'identifier': identifier, 'password': password}
            
            async with self.session.post(url, json=data) as response:
                end_time = time.time()
                duration = end_time - start_time
                
                if response.status == 200:
                    data = await response.json()
                    token = data.get('token')
                    logger.info(f"Login successful for {identifier}")
                    return True, duration, token
                else:
                    error_data = await response.text()
                    logger.warning(f"Login failed for {identifier}: {response.status} - {error_data}")
                    return False, duration, None
        except Exception as e:
            end_time = time.time()
            duration = end_time - start_time
            logger.error(f"Login error for {identifier}: {e}")
            return False, duration, None

    async def test_forgot_password(self, identifier: str) -> Tuple[bool, float]:
        """Test forgot password"""
        start_time = time.time()
        try:
            url = f"{self.base_url}/api/user/auth/forgotpassword"
            data = {'identifier': identifier}
            
            async with self.session.post(url, json=data) as response:
                end_time = time.time()
                duration = end_time - start_time
                
                if response.status == 200:
                    logger.info(f"Forgot password successful for {identifier}")
                    return True, duration
                else:
                    error_data = await response.text()
                    logger.warning(f"Forgot password failed for {identifier}: {response.status} - {error_data}")
                    return False, duration
        except Exception as e:
            end_time = time.time()
            duration = end_time - start_time
            logger.error(f"Forgot password error for {identifier}: {e}")
            return False, duration

    async def test_reset_password(self, email: str, otp: str, new_password: str) -> Tuple[bool, float]:
        """Test reset password"""
        start_time = time.time()
        try:
            url = f"{self.base_url}/api/user/auth/resetpassword"
            data = {
                'email': email,
                'otp': otp,
                'newPassword': new_password
            }
            
            async with self.session.post(url, json=data) as response:
                end_time = time.time()
                duration = end_time - start_time
                
                if response.status == 200:
                    logger.info(f"Reset password successful for {email}")
                    return True, duration
                else:
                    error_data = await response.text()
                    logger.warning(f"Reset password failed for {email}: {response.status} - {error_data}")
                    return False, duration
        except Exception as e:
            end_time = time.time()
            duration = end_time - start_time
            logger.error(f"Reset password error for {email}: {e}")
            return False, duration

    async def test_user_workflow(self, user_index: int) -> Dict:
        """Test complete user workflow: signup -> OTP verification -> login"""
        user_data = self.generate_test_user(user_index)
        workflow_result = {
            'user_index': user_index,
            'email': user_data['email'],
            'phone': user_data['phone'],
            'signup_success': False,
            'otp_verification_success': False,
            'login_success': False,
            'forgot_password_success': False,
            'reset_password_success': False,
            'total_time': 0
        }
        
        workflow_start = time.time()
        
        # Step 1: Signup
        signup_success, signup_time, token = await self.test_signup(user_data)
        workflow_result['signup_success'] = signup_success
        self.results['signup']['times'].append(signup_time)
        
        if signup_success:
            self.results['signup']['success'] += 1
            
            # Step 2: Get OTP from MongoDB
            await asyncio.sleep(1)  # Wait for OTP to be saved
            otp = await self.get_otp_from_mongodb(user_data['email'])
            
            if otp:
                # Step 3: OTP Verification
                otp_success, otp_time = await self.test_otp_verification(user_data['email'], otp)
                workflow_result['otp_verification_success'] = otp_success
                self.results['otp_verification']['times'].append(otp_time)
                
                if otp_success:
                    self.results['otp_verification']['success'] += 1
                    
                    # Step 4: Login
                    login_success, login_time, login_token = await self.test_login(
                        user_data['email'], user_data['password']
                    )
                    workflow_result['login_success'] = login_success
                    self.results['login']['times'].append(login_time)
                    
                    if login_success:
                        self.results['login']['success'] += 1
                        
                        # Step 5: Test forgot password
                        forgot_success, forgot_time = await self.test_forgot_password(user_data['email'])
                        workflow_result['forgot_password_success'] = forgot_success
                        self.results['forgot_password']['times'].append(forgot_time)
                        
                        if forgot_success:
                            self.results['forgot_password']['success'] += 1
                            
                            # Step 6: Get reset OTP and test reset password
                            await asyncio.sleep(1)
                            reset_otp = await self.get_otp_from_mongodb(user_data['email'])
                            
                            if reset_otp:
                                new_password = f'NewPassword{user_index}!'
                                reset_success, reset_time = await self.test_reset_password(
                                    user_data['email'], reset_otp, new_password
                                )
                                workflow_result['reset_password_success'] = reset_success
                                self.results['reset_password']['times'].append(reset_time)
                                
                                if reset_success:
                                    self.results['reset_password']['success'] += 1
                                else:
                                    self.results['reset_password']['failed'] += 1
                            else:
                                self.results['reset_password']['failed'] += 1
                        else:
                            self.results['forgot_password']['failed'] += 1
                    else:
                        self.results['login']['failed'] += 1
                else:
                    self.results['otp_verification']['failed'] += 1
            else:
                self.results['otp_verification']['failed'] += 1
        else:
            self.results['signup']['failed'] += 1
            
        # Update failed counts for incomplete workflows
        if not workflow_result['otp_verification_success']:
            self.results['otp_verification']['failed'] += 1
        if not workflow_result['login_success']:
            self.results['login']['failed'] += 1
        if not workflow_result['forgot_password_success']:
            self.results['forgot_password']['failed'] += 1
        if not workflow_result['reset_password_success']:
            self.results['reset_password']['failed'] += 1
            
        workflow_result['total_time'] = time.time() - workflow_start
        return workflow_result

    async def run_load_test(self, num_users: int = 10000, max_concurrent: int = 100):
        """Run the load test with specified number of users"""
        logger.info(f"Starting load test for {num_users} users with max {max_concurrent} concurrent requests")
        self.start_time = time.time()
        
        # Create semaphore to limit concurrent requests
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def limited_workflow(user_index):
            async with semaphore:
                return await self.test_user_workflow(user_index)
        
        # Create tasks for all users
        tasks = [limited_workflow(i) for i in range(num_users)]
        
        # Execute all tasks concurrently
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # Process results
        successful_workflows = 0
        for result in results:
            if isinstance(result, dict) and result.get('login_success'):
                successful_workflows += 1
            elif isinstance(result, Exception):
                logger.error(f"Task failed with exception: {result}")
        
        total_time = time.time() - self.start_time
        logger.info(f"Load test completed in {total_time:.2f} seconds")
        logger.info(f"Successful complete workflows: {successful_workflows}/{num_users}")
        
        return results

    def print_results(self):
        """Print detailed test results"""
        total_time = time.time() - self.start_time if self.start_time else 0
        
        print("\n" + "="*80)
        print("KAMPYN Authentication Load Test Results")
        print("="*80)
        print(f"Total Test Duration: {total_time:.2f} seconds")
        print(f"Average Requests per Second: {sum(len(v['times']) for v in self.results.values()) / total_time:.2f}")
        
        for test_type, data in self.results.items():
            if data['times']:
                avg_time = statistics.mean(data['times'])
                min_time = min(data['times'])
                max_time = max(data['times'])
                p95_time = statistics.quantiles(data['times'], n=20)[18] if len(data['times']) > 1 else avg_time
                
                print(f"\n{test_type.upper().replace('_', ' ')}:")
                print(f"  Success: {data['success']}")
                print(f"  Failed: {data['failed']}")
                print(f"  Success Rate: {data['success']/(data['success']+data['failed'])*100:.2f}%")
                print(f"  Average Response Time: {avg_time:.3f}s")
                print(f"  Min Response Time: {min_time:.3f}s")
                print(f"  Max Response Time: {max_time:.3f}s")
                print(f"  95th Percentile: {p95_time:.3f}s")
        
        print("\n" + "="*80)

    async def cleanup_test_data(self):
        """Clean up test data from database"""
        try:
            # Clean up test users
            db_accounts = self.mongo_client['Cluster_Accounts']
            user_collection = db_accounts['users']
            
            # Delete test users
            result = user_collection.delete_many({
                'email': {'$regex': r'^testuser\d+@test\.com$'}
            })
            logger.info(f"Cleaned up {result.deleted_count} test users")
            
            # Clean up test OTPs
            db_user = self.mongo_client['Cluster_Users']
            otp_collection = db_user['otps']
            
            result = otp_collection.delete_many({
                'email': {'$regex': r'^testuser\d+@test\.com$'}
            })
            logger.info(f"Cleaned up {result.deleted_count} test OTPs")
            
        except Exception as e:
            logger.error(f"Error cleaning up test data: {e}")

async def main():
    """Main function to run the load test"""
    # Configuration
    BASE_URL = "https://bitesbay-backend.onrender.com"  # Change to your server URL
    MONGO_URI = "mongodb+srv://anshraj112:Z8gVy6oJD5IWPfvQ@kiitbites.8zabl.mongodb.net/KIITBites"  # Your MongoDB URI from .env
    NUM_USERS = 10000
    MAX_CONCURRENT = 100
    
    # Create load tester instance
    tester = KAMPYNLoadTester(BASE_URL, MONGO_URI)
    
    try:
        # Setup connections
        await tester.setup()
        
        # Run load test
        results = await tester.run_load_test(NUM_USERS, MAX_CONCURRENT)
        
        # Print results
        tester.print_results()
        
        # Optional: Clean up test data
        cleanup = input("\nDo you want to clean up test data? (y/n): ").lower().strip()
        if cleanup == 'y':
            await tester.cleanup_test_data()
        
    except KeyboardInterrupt:
        logger.info("Load test interrupted by user")
    except Exception as e:
        logger.error(f"Load test failed: {e}")
    finally:
        await tester.cleanup()

if __name__ == "__main__":
    # Run the load test
    asyncio.run(main())
