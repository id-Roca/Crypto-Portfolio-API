export default {
  testEnvironment: 'node',
  transform: {},
  clearMocks: true,
  testMatch: ['**/tests/**/*.test.js'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],
  testTimeout: 30000,
  collectCoverageFrom: ['src/**/*.js', '!src/server.js', '!src/config/db.js'],
  coverageReporters: ['text', 'json-summary', 'lcov'],
};
