const mongoose = require('mongoose');
const User = require('../../../models/account/User');

describe('User Model', () => {
  beforeAll(async () => {
    // Connect to test database
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGO_URL || 'mongodb://localhost:27017/test');
    }
  });

  beforeEach(async () => {
    await User.deleteMany({});
  });

  afterAll(async () => {
    await mongoose.connection.close();
  });

  describe('User Creation', () => {
    it('should create a user with valid data', async () => {
      const userData = {
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
        password: 'hashedpassword',
        gender: 'male',
        uniID: 'university_id'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser._id).toBeDefined();
      expect(savedUser.fullName).toBe(userData.fullName);
      expect(savedUser.email).toBe(userData.email);
      expect(savedUser.phone).toBe(userData.phone);
      expect(savedUser.gender).toBe(userData.gender);
      expect(savedUser.uniID).toBe(userData.uniID);
    });

    it('should require fullName field', async () => {
      const userData = {
        email: 'john@example.com',
        phone: '1234567890',
        password: 'hashedpassword',
        gender: 'male',
        uniID: 'university_id'
      };

      const user = new User(userData);
      await expect(user.save()).rejects.toThrow();
    });

    it('should require email field', async () => {
      const userData = {
        fullName: 'John Doe',
        phone: '1234567890',
        password: 'hashedpassword',
        gender: 'male',
        uniID: 'university_id'
      };

      const user = new User(userData);
      await expect(user.save()).rejects.toThrow();
    });

    it('should require unique email', async () => {
      const userData = {
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
        password: 'hashedpassword',
        gender: 'male',
        uniID: 'university_id'
      };

      await User.create(userData);
      
      const duplicateUser = new User(userData);
      await expect(duplicateUser.save()).rejects.toThrow();
    });

    it('should require unique phone', async () => {
      const userData = {
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
        password: 'hashedpassword',
        gender: 'male',
        uniID: 'university_id'
      };

      await User.create(userData);
      
      const duplicateUser = new User({
        ...userData,
        email: 'jane@example.com'
      });
      await expect(duplicateUser.save()).rejects.toThrow();
    });
  });

  describe('Email Validation', () => {
    it('should accept valid email formats', async () => {
      const validEmails = [
        'test@example.com',
        'user.name@domain.co.uk',
        'user+tag@example.org'
      ];

      for (const email of validEmails) {
        const userData = {
          fullName: 'Test User',
          email: email,
          phone: '1234567890',
          password: 'hashedpassword',
          gender: 'male',
          uniID: 'university_id'
        };

        const user = new User(userData);
        await expect(user.save()).resolves.toBeDefined();
        await User.deleteMany({});
      }
    });

    it('should reject invalid email formats', async () => {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user@.com'
      ];

      for (const email of invalidEmails) {
        const userData = {
          fullName: 'Test User',
          email: email,
          phone: '1234567890',
          password: 'hashedpassword',
          gender: 'male',
          uniID: 'university_id'
        };

        const user = new User(userData);
        await expect(user.save()).rejects.toThrow();
      }
    });
  });

  describe('Phone Validation', () => {
    it('should accept valid phone numbers', async () => {
      const validPhones = [
        '1234567890',
        '9876543210',
        '+1234567890',
        '+919876543210'
      ];

      for (const phone of validPhones) {
        const userData = {
          fullName: 'Test User',
          email: `test${phone}@example.com`,
          phone: phone,
          password: 'hashedpassword',
          gender: 'male',
          uniID: 'university_id'
        };

        const user = new User(userData);
        await expect(user.save()).resolves.toBeDefined();
        await User.deleteMany({});
      }
    });

    it('should reject invalid phone numbers', async () => {
      const invalidPhones = [
        '123',
        'abc1234567',
        '123-456-7890',
        ''
      ];

      for (const phone of invalidPhones) {
        const userData = {
          fullName: 'Test User',
          email: `test${phone}@example.com`,
          phone: phone,
          password: 'hashedpassword',
          gender: 'male',
          uniID: 'university_id'
        };

        const user = new User(userData);
        await expect(user.save()).rejects.toThrow();
      }
    });
  });

  describe('Gender Validation', () => {
    it('should accept valid gender values', async () => {
      const validGenders = ['male', 'female', 'other'];

      for (const gender of validGenders) {
        const userData = {
          fullName: 'Test User',
          email: `test${gender}@example.com`,
          phone: '1234567890',
          password: 'hashedpassword',
          gender: gender,
          uniID: 'university_id'
        };

        const user = new User(userData);
        await expect(user.save()).resolves.toBeDefined();
        await User.deleteMany({});
      }
    });

    it('should reject invalid gender values', async () => {
      const invalidGenders = ['invalid', 'M', 'F', ''];

      for (const gender of invalidGenders) {
        const userData = {
          fullName: 'Test User',
          email: `test${gender}@example.com`,
          phone: '1234567890',
          password: 'hashedpassword',
          gender: gender,
          uniID: 'university_id'
        };

        const user = new User(userData);
        await expect(user.save()).rejects.toThrow();
      }
    });
  });

  describe('Default Values', () => {
    it('should set default values for optional fields', async () => {
      const userData = {
        fullName: 'John Doe',
        email: 'john@example.com',
        phone: '1234567890',
        password: 'hashedpassword',
        gender: 'male',
        uniID: 'university_id'
      };

      const user = new User(userData);
      const savedUser = await user.save();

      expect(savedUser.isActive).toBe(true);
      expect(savedUser.createdAt).toBeDefined();
      expect(savedUser.updatedAt).toBeDefined();
    });
  });
});
