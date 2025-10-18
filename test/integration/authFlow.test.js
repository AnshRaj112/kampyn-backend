const request = require('supertest');
const app = require('../../index');
const User = require('../../models/users/User');
const bcrypt = require('bcryptjs');

describe('Authentication Flow Integration Tests', () => {
  beforeEach(async () => {
    await User.deleteMany({});
  });

  describe('Complete User Registration and Login Flow', () => {
    it('should complete full registration and login flow', async () => {
      // Step 1: Register a new user
      const userData = {
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
        password: 'password123',
        gender: 'male',
        uniID: 'university_id'
      };

      const registrationResponse = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(201);

      expect(registrationResponse.body.success).toBe(true);
      expect(registrationResponse.body.user).toBeDefined();
      expect(registrationResponse.body.token).toBeDefined();

      const { token } = registrationResponse.body;

      // Step 2: Verify user can access protected route
      const checkResponse = await request(app)
        .get('/api/auth/check')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(checkResponse.body.success).toBe(true);
      expect(checkResponse.body.user.email).toBe(userData.email);

      // Step 3: Login with the same credentials
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          identifier: userData.email,
          password: userData.password
        })
        .expect(200);

      expect(loginResponse.body.success).toBe(true);
      expect(loginResponse.body.user.email).toBe(userData.email);
      expect(loginResponse.body.token).toBeDefined();

      // Step 4: Verify both tokens work
      const newToken = loginResponse.body.token;
      const newCheckResponse = await request(app)
        .get('/api/auth/check')
        .set('Authorization', `Bearer ${newToken}`)
        .expect(200);

      expect(newCheckResponse.body.success).toBe(true);
    });

    it('should handle login with phone number', async () => {
      // Register user
      const userData = {
        fullName: 'Jane Doe',
        email: 'jane@example.com',
        phone: '9876543210',
        password: 'password123',
        gender: 'female',
        uniID: 'university_id'
      };

      await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(201);

      // Login with phone
      const loginResponse = await request(app)
        .post('/api/auth/login')
        .send({
          identifier: userData.phone,
          password: userData.password
        })
        .expect(200);

      expect(loginResponse.body.success).toBe(true);
      expect(loginResponse.body.user.phone).toBe(userData.phone);
    });

    it('should prevent duplicate registrations', async () => {
      const userData = {
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
        password: 'password123',
        gender: 'male',
        uniID: 'university_id'
      };

      // First registration should succeed
      await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(201);

      // Second registration with same email should fail
      const duplicateResponse = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(400);

      expect(duplicateResponse.body.success).toBe(false);
      expect(duplicateResponse.body.message).toContain('already exists');
    });

    it('should handle invalid login attempts', async () => {
      const userData = {
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
        password: 'password123',
        gender: 'male',
        uniID: 'university_id'
      };

      // Register user
      await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(201);

      // Try login with wrong password
      const wrongPasswordResponse = await request(app)
        .post('/api/auth/login')
        .send({
          identifier: userData.email,
          password: 'wrongpassword'
        })
        .expect(401);

      expect(wrongPasswordResponse.body.success).toBe(false);

      // Try login with non-existent email
      const wrongEmailResponse = await request(app)
        .post('/api/auth/login')
        .send({
          identifier: 'nonexistent@example.com',
          password: userData.password
        })
        .expect(401);

      expect(wrongEmailResponse.body.success).toBe(false);
    });
  });

  describe('Token Validation and Expiration', () => {
    it('should validate tokens correctly', async () => {
      const userData = {
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
        password: 'password123',
        gender: 'male',
        uniID: 'university_id'
      };

      const registrationResponse = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(201);

      const { token } = registrationResponse.body;

      // Valid token should work
      await request(app)
        .get('/api/auth/check')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Invalid token should fail
      await request(app)
        .get('/api/auth/check')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      // Missing token should fail
      await request(app)
        .get('/api/auth/check')
        .expect(401);
    });
  });

  describe('Password Security', () => {
    it('should hash passwords securely', async () => {
      const userData = {
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
        password: 'password123',
        gender: 'male',
        uniID: 'university_id'
      };

      await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(201);

      // Check that password is hashed in database
      const user = await User.findOne({ email: userData.email });
      expect(user.password).not.toBe(userData.password);
      expect(user.password.length).toBeGreaterThan(20); // bcrypt hash length
    });

    it('should verify passwords correctly', async () => {
      const userData = {
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
        password: 'password123',
        gender: 'male',
        uniID: 'university_id'
      };

      await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(201);

      // Login should work with correct password
      await request(app)
        .post('/api/auth/login')
        .send({
          identifier: userData.email,
          password: userData.password
        })
        .expect(200);

      // Login should fail with wrong password
      await request(app)
        .post('/api/auth/login')
        .send({
          identifier: userData.email,
          password: 'wrongpassword'
        })
        .expect(401);
    });
  });
});
