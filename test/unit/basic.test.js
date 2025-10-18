// Basic test suite to ensure testing infrastructure works
describe('Basic Test Suite', () => {
  test('should pass basic math test', () => {
    expect(2 + 2).toBe(4);
  });

  test('should pass string test', () => {
    expect('hello').toContain('lo');
  });

  test('should pass array test', () => {
    const arr = [1, 2, 3];
    expect(arr).toHaveLength(3);
    expect(arr).toContain(2);
  });

  test('should pass object test', () => {
    const obj = { name: 'test', value: 42 };
    expect(obj).toHaveProperty('name');
    expect(obj.value).toBe(42);
  });

  test('should pass async test', async () => {
    const promise = Promise.resolve('async value');
    await expect(promise).resolves.toBe('async value');
  });
});
