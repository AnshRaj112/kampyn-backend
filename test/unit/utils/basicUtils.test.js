// Basic utility functions for testing
const basicUtils = {
  add: (a, b) => a + b,
  multiply: (a, b) => a * b,
  isEven: (num) => num % 2 === 0,
  capitalize: (str) => str.charAt(0).toUpperCase() + str.slice(1),
  formatCurrency: (amount) => `$${amount.toFixed(2)}`,
  validateEmail: (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
  generateId: () => Math.random().toString(36).substr(2, 9),
  calculateTax: (amount, rate = 0.1) => amount * rate,
  formatDate: (date) => new Date(date).toISOString().split('T')[0],
  isEmpty: (obj) => Object.keys(obj).length === 0
};

describe('Basic Utils', () => {
  describe('Math Operations', () => {
    test('should add two numbers correctly', () => {
      expect(basicUtils.add(2, 3)).toBe(5);
      expect(basicUtils.add(-1, 1)).toBe(0);
      expect(basicUtils.add(0, 0)).toBe(0);
    });

    test('should multiply two numbers correctly', () => {
      expect(basicUtils.multiply(3, 4)).toBe(12);
      expect(basicUtils.multiply(-2, 3)).toBe(-6);
      expect(basicUtils.multiply(0, 5)).toBe(0);
    });

    test('should check if number is even', () => {
      expect(basicUtils.isEven(4)).toBe(true);
      expect(basicUtils.isEven(7)).toBe(false);
      expect(basicUtils.isEven(0)).toBe(true);
    });
  });

  describe('String Operations', () => {
    test('should capitalize first letter', () => {
      expect(basicUtils.capitalize('hello')).toBe('Hello');
      expect(basicUtils.capitalize('world')).toBe('World');
      expect(basicUtils.capitalize('a')).toBe('A');
    });

    test('should format currency correctly', () => {
      expect(basicUtils.formatCurrency(10.5)).toBe('$10.50');
      expect(basicUtils.formatCurrency(0)).toBe('$0.00');
      expect(basicUtils.formatCurrency(100)).toBe('$100.00');
    });
  });

  describe('Validation Functions', () => {
    test('should validate email addresses', () => {
      expect(basicUtils.validateEmail('test@example.com')).toBe(true);
      expect(basicUtils.validateEmail('invalid-email')).toBe(false);
      expect(basicUtils.validateEmail('user@domain.co.uk')).toBe(true);
      expect(basicUtils.validateEmail('')).toBe(false);
    });

    test('should generate unique IDs', () => {
      const id1 = basicUtils.generateId();
      const id2 = basicUtils.generateId();
      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(typeof id1).toBe('string');
    });
  });

  describe('Business Logic', () => {
    test('should calculate tax correctly', () => {
      expect(basicUtils.calculateTax(100)).toBe(10);
      expect(basicUtils.calculateTax(100, 0.2)).toBe(20);
      expect(basicUtils.calculateTax(0)).toBe(0);
    });

    test('should format dates correctly', () => {
      const date = new Date('2023-12-25');
      expect(basicUtils.formatDate(date)).toBe('2023-12-25');
    });

    test('should check if object is empty', () => {
      expect(basicUtils.isEmpty({})).toBe(true);
      expect(basicUtils.isEmpty({ key: 'value' })).toBe(false);
    });
  });
});
