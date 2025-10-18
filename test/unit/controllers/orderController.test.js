const request = require('supertest');
const app = require('../../../index');
const Order = require('../../../models/order/Order');
const User = require('../../../models/account/User');
const Vendor = require('../../../models/account/Vendor');
const jwt = require('jsonwebtoken');

describe('Order Controller', () => {
  let userToken, vendorToken, testUser, testVendor;

  beforeEach(async () => {
    // Clear collections
    await Order.deleteMany({});
    await User.deleteMany({});
    await Vendor.deleteMany({});

    // Create test user
    testUser = await User.create({
      fullName: 'John Doe',
      email: 'john@example.com',
      phone: '1234567890',
      password: 'hashedpassword',
      gender: 'male',
      uniID: 'university_id'
    });

    // Create test vendor
    testVendor = await Vendor.create({
      fullName: 'Vendor Name',
      email: 'vendor@example.com',
      phone: '9876543210',
      password: 'hashedpassword',
      businessName: 'Test Restaurant',
      businessType: 'restaurant'
    });

    // Create tokens
    userToken = jwt.sign(
      { userId: testUser._id, email: testUser.email },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );

    vendorToken = jwt.sign(
      { userId: testVendor._id, email: testVendor.email },
      process.env.JWT_SECRET || 'test-secret',
      { expiresIn: '1h' }
    );
  });

  describe('POST /api/orders', () => {
    it('should create a new order successfully', async () => {
      const orderData = {
        items: [
          {
            itemId: 'item1',
            name: 'Burger',
            price: 10.99,
            quantity: 2
          }
        ],
        vendorId: testVendor._id,
        orderType: 'dinein',
        totalAmount: 21.98
      };

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send(orderData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.order).toBeDefined();
      expect(response.body.order.userId).toBe(testUser._id.toString());
      expect(response.body.order.vendorId).toBe(testVendor._id.toString());
      expect(response.body.order.status).toBe('pending');
    });

    it('should return 400 for missing required fields', async () => {
      const orderData = {
        items: []
      };

      const response = await request(app)
        .post('/api/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .send(orderData)
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 401 for unauthorized request', async () => {
      const orderData = {
        items: [{ itemId: 'item1', name: 'Burger', price: 10.99, quantity: 1 }],
        vendorId: testVendor._id,
        orderType: 'dinein',
        totalAmount: 10.99
      };

      const response = await request(app)
        .post('/api/orders')
        .send(orderData)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/orders', () => {
    beforeEach(async () => {
      // Create test orders
      await Order.create([
        {
          userId: testUser._id,
          vendorId: testVendor._id,
          items: [{ itemId: 'item1', name: 'Burger', price: 10.99, quantity: 1 }],
          totalAmount: 10.99,
          status: 'pending',
          orderType: 'dinein'
        },
        {
          userId: testUser._id,
          vendorId: testVendor._id,
          items: [{ itemId: 'item2', name: 'Pizza', price: 15.99, quantity: 1 }],
          totalAmount: 15.99,
          status: 'completed',
          orderType: 'delivery'
        }
      ]);
    });

    it('should get user orders successfully', async () => {
      const response = await request(app)
        .get('/api/orders')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.orders).toHaveLength(2);
    });

    it('should filter orders by status', async () => {
      const response = await request(app)
        .get('/api/orders?status=pending')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.orders).toHaveLength(1);
      expect(response.body.orders[0].status).toBe('pending');
    });

    it('should return 401 for unauthorized request', async () => {
      const response = await request(app)
        .get('/api/orders')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /api/orders/:orderId', () => {
    let testOrder;

    beforeEach(async () => {
      testOrder = await Order.create({
        userId: testUser._id,
        vendorId: testVendor._id,
        items: [{ itemId: 'item1', name: 'Burger', price: 10.99, quantity: 1 }],
        totalAmount: 10.99,
        status: 'pending',
        orderType: 'dinein'
      });
    });

    it('should get order by ID successfully', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.order).toBeDefined();
      expect(response.body.order._id).toBe(testOrder._id.toString());
    });

    it('should return 404 for non-existent order', async () => {
      const fakeId = '507f1f77bcf86cd799439011';
      const response = await request(app)
        .get(`/api/orders/${fakeId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should return 401 for unauthorized request', async () => {
      const response = await request(app)
        .get(`/api/orders/${testOrder._id}`)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  describe('PUT /api/orders/:orderId/status', () => {
    let testOrder;

    beforeEach(async () => {
      testOrder = await Order.create({
        userId: testUser._id,
        vendorId: testVendor._id,
        items: [{ itemId: 'item1', name: 'Burger', price: 10.99, quantity: 1 }],
        totalAmount: 10.99,
        status: 'pending',
        orderType: 'dinein'
      });
    });

    it('should update order status successfully', async () => {
      const response = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ status: 'preparing' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.order.status).toBe('preparing');
    });

    it('should return 400 for invalid status', async () => {
      const response = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .set('Authorization', `Bearer ${vendorToken}`)
        .send({ status: 'invalid-status' })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 401 for unauthorized request', async () => {
      const response = await request(app)
        .put(`/api/orders/${testOrder._id}/status`)
        .send({ status: 'preparing' })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});
