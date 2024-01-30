if (typeof bun !== 'undefined') {
  Object.defineProperty(jest, 'mock', {
    value: bun.mock.module,
    writable: true,
  });

  // global.jest.mock in test file now works
  Object.defineProperty(global.jest, 'mock', {
    value: bun.mock.module,
    writable: true,
  });

  // window.jest.mock in test file now works
  Object.defineProperty(window.jest, 'mock', {
    value: bun.mock.module,
    writable: true,
  });
}
