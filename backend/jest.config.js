module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/auth.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 15000,
  maxWorkers: 1,
  clearMocks: true,
};
