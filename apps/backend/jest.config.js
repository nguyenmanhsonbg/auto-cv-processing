module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  moduleNameMapper: {
    '^@anthropic-ai/claude-agent-sdk$': '<rootDir>/src/test/mocks/claude-agent-sdk.ts',
  },
  testEnvironment: 'node',
};
