const jwt = require('jsonwebtoken');
const { generateToken, verifyToken, hashPassword, comparePassword } = require('../../../utils/authUtils');

describe('Auth Utils', () => {
  const testSecret = 'test-secret';
  const testUser = {
    _id: '507f1f77bcf86cd799439011',
    email: 'test@example.com'
  };

  describe('generateToken', () => {
    it('should generate a valid JWT token', () => {
      const token = generateToken(testUser, testSecret);
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      
      // Verify the token can be decoded
      const decoded = jwt.verify(token, testSecret);
      expect(decoded.userId).toBe(testUser._id);
      expect(decoded.email).toBe(testUser.email);
    });

    it('should generate token with custom expiration', () => {
      const token = generateToken(testUser, testSecret, '1h');
      const decoded = jwt.verify(token, testSecret);
      
      expect(decoded).toBeDefined();
      expect(decoded.exp).toBeDefined();
    });
  });

  describe('verifyToken', () => {
    it('should verify a valid token', () => {
      const token = generateToken(testUser, testSecret);
      const decoded = verifyToken(token, testSecret);
      
      expect(decoded).toBeDefined();
      expect(decoded.userId).toBe(testUser._id);
      expect(decoded.email).toBe(testUser.email);
    });

    it('should return null for invalid token', () => {
      const invalidToken = 'invalid.token.here';
      const decoded = verifyToken(invalidToken, testSecret);
      
      expect(decoded).toBeNull();
    });

    it('should return null for expired token', () => {
      const expiredToken = jwt.sign(
        { userId: testUser._id, email: testUser.email },
        testSecret,
        { expiresIn: '-1h' }
      );
      
      const decoded = verifyToken(expiredToken, testSecret);
      expect(decoded).toBeNull();
    });
  });

  describe('hashPassword', () => {
    it('should hash password successfully', async () => {
      const password = 'testpassword123';
      const hashedPassword = await hashPassword(password);
      
      expect(hashedPassword).toBeDefined();
      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword.length).toBeGreaterThan(0);
    });

    it('should generate different hashes for same password', async () => {
      const password = 'testpassword123';
      const hash1 = await hashPassword(password);
      const hash2 = await hashPassword(password);
      
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('comparePassword', () => {
    it('should return true for correct password', async () => {
      const password = 'testpassword123';
      const hashedPassword = await hashPassword(password);
      
      const isValid = await comparePassword(password, hashedPassword);
      expect(isValid).toBe(true);
    });

    it('should return false for incorrect password', async () => {
      const password = 'testpassword123';
      const wrongPassword = 'wrongpassword';
      const hashedPassword = await hashPassword(password);
      
      const isValid = await comparePassword(wrongPassword, hashedPassword);
      expect(isValid).toBe(false);
    });

    it('should return false for empty password', async () => {
      const password = 'testpassword123';
      const hashedPassword = await hashPassword(password);
      
      const isValid = await comparePassword('', hashedPassword);
      expect(isValid).toBe(false);
    });
  });
});
