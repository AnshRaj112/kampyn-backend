const { calculateOrderTotal, generateOrderNumber, validateOrderItems, formatOrderStatus } = require('../../utils/orderUtils');

describe('Order Utils', () => {
  describe('calculateOrderTotal', () => {
    it('should calculate total correctly for single item', () => {
      const items = [
        { price: 10.99, quantity: 2 }
      ];
      
      const total = calculateOrderTotal(items);
      expect(total).toBe(21.98);
    });

    it('should calculate total correctly for multiple items', () => {
      const items = [
        { price: 10.99, quantity: 2 },
        { price: 5.50, quantity: 1 },
        { price: 3.25, quantity: 3 }
      ];
      
      const total = calculateOrderTotal(items);
      expect(total).toBe(21.98 + 5.50 + 9.75);
    });

    it('should handle zero quantity items', () => {
      const items = [
        { price: 10.99, quantity: 0 },
        { price: 5.50, quantity: 1 }
      ];
      
      const total = calculateOrderTotal(items);
      expect(total).toBe(5.50);
    });

    it('should return 0 for empty items array', () => {
      const total = calculateOrderTotal([]);
      expect(total).toBe(0);
    });

    it('should handle decimal prices correctly', () => {
      const items = [
        { price: 9.99, quantity: 1 },
        { price: 0.01, quantity: 1 }
      ];
      
      const total = calculateOrderTotal(items);
      expect(total).toBe(10.00);
    });
  });

  describe('generateOrderNumber', () => {
    it('should generate order number with correct format', () => {
      const orderNumber = generateOrderNumber();
      
      expect(orderNumber).toMatch(/^ORD-\d{6}$/);
    });

    it('should generate unique order numbers', () => {
      const orderNumbers = new Set();
      
      for (let i = 0; i < 100; i++) {
        orderNumbers.add(generateOrderNumber());
      }
      
      expect(orderNumbers.size).toBe(100);
    });

    it('should include timestamp in order number', () => {
      const before = Date.now();
      const orderNumber = generateOrderNumber();
      const after = Date.now();
      
      const timestamp = orderNumber.split('-')[1];
      const orderTime = parseInt(timestamp, 10);
      
      expect(orderTime).toBeGreaterThanOrEqual(before);
      expect(orderTime).toBeLessThanOrEqual(after);
    });
  });

  describe('validateOrderItems', () => {
    it('should return true for valid items', () => {
      const items = [
        { itemId: 'item1', name: 'Burger', price: 10.99, quantity: 2 },
        { itemId: 'item2', name: 'Pizza', price: 15.99, quantity: 1 }
      ];
      
      const isValid = validateOrderItems(items);
      expect(isValid).toBe(true);
    });

    it('should return false for items without required fields', () => {
      const items = [
        { name: 'Burger', price: 10.99, quantity: 2 }, // missing itemId
        { itemId: 'item2', price: 15.99, quantity: 1 }  // missing name
      ];
      
      const isValid = validateOrderItems(items);
      expect(isValid).toBe(false);
    });

    it('should return false for items with invalid price', () => {
      const items = [
        { itemId: 'item1', name: 'Burger', price: -10.99, quantity: 2 },
        { itemId: 'item2', name: 'Pizza', price: 15.99, quantity: 1 }
      ];
      
      const isValid = validateOrderItems(items);
      expect(isValid).toBe(false);
    });

    it('should return false for items with invalid quantity', () => {
      const items = [
        { itemId: 'item1', name: 'Burger', price: 10.99, quantity: 0 },
        { itemId: 'item2', name: 'Pizza', price: 15.99, quantity: -1 }
      ];
      
      const isValid = validateOrderItems(items);
      expect(isValid).toBe(false);
    });

    it('should return false for empty items array', () => {
      const isValid = validateOrderItems([]);
      expect(isValid).toBe(false);
    });
  });

  describe('formatOrderStatus', () => {
    it('should format status correctly', () => {
      expect(formatOrderStatus('pending')).toBe('Pending');
      expect(formatOrderStatus('preparing')).toBe('Preparing');
      expect(formatOrderStatus('ready')).toBe('Ready');
      expect(formatOrderStatus('completed')).toBe('Completed');
      expect(formatOrderStatus('cancelled')).toBe('Cancelled');
    });

    it('should handle unknown status', () => {
      expect(formatOrderStatus('unknown')).toBe('Unknown');
    });

    it('should handle null/undefined status', () => {
      expect(formatOrderStatus(null)).toBe('Unknown');
      expect(formatOrderStatus(undefined)).toBe('Unknown');
    });
  });
});
