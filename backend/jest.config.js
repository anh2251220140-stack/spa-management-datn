module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 15000,
  maxWorkers: 1,
  clearMocks: true,
};
