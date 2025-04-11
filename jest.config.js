module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: ['**/__tests__/**/*.test.ts', '**/test/**/*.test.ts'],
  setupFiles: ["./src/main/__tests__/setup.ts"],
  moduleFileExtensions: ['ts', 'js'],
}; 