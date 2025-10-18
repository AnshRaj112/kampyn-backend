const request = require('supertest');
const app = require('../../index');
const User = require('../../models/users/User');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

describe('Auth Controller', () => {
  beforeEach(async () => {
    // Clear users collection before each test
    await User.deleteMany({});
  });

  describe('POST /api/auth/signup', () => {
    it('should create a new user successfully', async () => {
      const userData = {
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
        password: 'password123',
        gender: 'male',
        uniID: 'university_id'
      };

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe(userData.email);
      expect(response.body.user.password).toBeUndefined(); // Password should not be returned
      expect(response.body.token).toBeDefined();
    });

    it('should return 400 if email already exists', async () => {
      const userData = {
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
        password: 'password123',
        gender: 'male',
        uniID: 'university_id'
      };

      // Create first user
      await request(app)
        .post('/api/auth/signup')
        .send(userData);

      // Try to create user with same email
      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('already exists');
    });

    it('should return 400 for invalid email format', async () => {
      const userData = {
        fullName: 'John Doe',
        email: 'invalid-email',
        phone: '1234567890',
        password: 'password123',
        gender: 'male',
        uniID: 'university_id'
      };

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for weak password', async () => {
      const userData = {
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
        password: '123',
        gender: 'male',
        uniID: 'university_id'
      };

      const response = await request(app)
        .post('/api/auth/signup')
        .send(userData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      // Create a test user
      const hashedPassword = await bcrypt.hash('password123', 10);
      await User.create({
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
        password: hashedPassword,
        gender: 'male',
        uniID: 'university_id'
      });
    });

    it('should login successfully with email', async () => {
      const loginData = {
        identifier: 'john@example.com',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.token).toBeDefined();
    });

    it('should login successfully with phone', async () => {
      const loginData = {
        identifier: '1234567890',
        password: 'password123'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.token).toBeDefined();
    });

    it('should return 401 for invalid credentials', async () => {
      const loginData = {
        identifier: 'john@example.com',
        password: 'wrongpassword'
      };

      const response = await request(app)
        .post('/api/auth/login')
        .send(loginData)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Invalid credentials');
    });

    it('should return 400 for missing fields', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/auth/check', () => {
    it('should return user data for valid token', async () => {
      // Create a test user
      const hashedPassword = await bcrypt.hash('password123', 10);
      const user = await User.create({
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
        password: hashedPassword,
        gender: 'male',
        uniID: 'university_id'
      });

      const token = jwt.sign(
        { userId: user._id, email: user.email },
        process.env.JWT_SECRET || 'test-secret',
        { expiresIn: '1h' }
      );

      const response = await request(app)
        .get('/api/auth/check')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.user).toBeDefined();
      expect(response.body.user.email).toBe(user.email);
    });

    it('should return 401 for invalid token', async () => {
      const response = await request(app)
        .get('/api/auth/check')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);

      expect(response.body.success).toBe(false);
    });

    it('should return 401 for missing token', async () => {
      const response = await request(app)
        .get('/api/auth/check')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});
