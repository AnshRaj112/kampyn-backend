const request = require('supertest');
const app = require('../../index');
const autocannon = require('autocannon');

describe('API Performance Tests', () => {
  let server;
  const baseUrl = 'http://localhost:5001';

  beforeAll(async () => {
    // Server is already running in test environment
    // No need to start/stop server for performance tests
  });

  afterAll(async () => {
    // Cleanup if needed
  });

  describe('Response Time Tests', () => {
    it('should respond to health check within 100ms', async () => {
      const start = Date.now();
      
      const response = await request(app)
        .get('/api/health')
        .expect(200);
      
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(100);
      expect(response.body.status).toBe('OK');
    });

    it('should handle authentication endpoint within 200ms', async () => {
      const start = Date.now();
      
      const response = await request(app)
        .post('/api/auth/login')
        .send({
          identifier: 'test@example.com',
          password: 'password123'
        });
      
      const duration = Date.now() - start;
      
      // Should respond quickly even for invalid credentials
      expect(duration).toBeLessThan(200);
    });

    it('should handle order creation within 300ms', async () => {
      // Create test user and get token
      const userResponse = await request(app)
        .post('/api/auth/signup')
        .send({
          fullName: 'Test User',
          email: 'perf@example.com',
          phone: '1234567890',
          password: 'password123',
          gender: 'male',
          uniID: 'university_id'
        });

      const token = userResponse.body.token;

      const start = Date.now();
      
      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({
          items: [{ itemId: 'item1', name: 'Test Item', price: 10.99, quantity: 1 }],
          vendorId: '507f1f77bcf86cd799439011',
          orderType: 'dinein',
          totalAmount: 10.99
        });
      
      const duration = Date.now() - start;
      
      expect(duration).toBeLessThan(300);
    });
  });

  describe('Load Testing', () => {
    it('should handle 100 concurrent requests', async () => {
      const promises = [];
      
      for (let i = 0; i < 100; i++) {
        promises.push(
          request(app)
            .get('/api/health')
            .expect(200)
        );
      }
      
      const start = Date.now();
      await Promise.all(promises);
      const duration = Date.now() - start;
      
      console.log(`100 concurrent requests completed in ${duration}ms`);
      expect(duration).toBeLessThan(5000); // Should complete within 5 seconds
    });

    it('should handle 50 concurrent authentication requests', async () => {
      const promises = [];
      
      for (let i = 0; i < 50; i++) {
        promises.push(
          request(app)
            .post('/api/auth/login')
            .send({
              identifier: `user${i}@example.com`,
              password: 'password123'
            })
        );
      }
      
      const start = Date.now();
      const responses = await Promise.allSettled(promises);
      const duration = Date.now() - start;
      
      console.log(`50 concurrent auth requests completed in ${duration}ms`);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });

  describe('Memory Usage Tests', () => {
    it('should not leak memory during multiple requests', async () => {
      const initialMemory = process.memoryUsage();
      
      // Make 1000 requests
      for (let i = 0; i < 1000; i++) {
        await request(app).get('/api/health');
      }
      
      // Force garbage collection
      if (global.gc) {
        global.gc();
      }
      
      const finalMemory = process.memoryUsage();
      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      
      console.log(`Memory increase after 1000 requests: ${memoryIncrease} bytes`);
      
      // Memory increase should be reasonable (less than 50MB)
      expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
    });
  });

  describe('Database Performance', () => {
    it('should handle database queries efficiently', async () => {
      const start = Date.now();
      
      // Create multiple users to test database performance
      const promises = [];
      for (let i = 0; i < 10; i++) {
        promises.push(
          request(app)
            .post('/api/auth/signup')
            .send({
              fullName: `User ${i}`,
              email: `user${i}@example.com`,
              phone: `123456789${i}`,
              password: 'password123',
              gender: 'male',
              uniID: 'university_id'
            })
        );
      }
      
      await Promise.all(promises);
      const duration = Date.now() - start;
      
      console.log(`10 user creations completed in ${duration}ms`);
      expect(duration).toBeLessThan(2000); // Should complete within 2 seconds
    });
  });
});
