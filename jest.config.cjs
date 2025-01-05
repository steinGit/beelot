module.exports = {
  transform: {
    '^.+\\.js$': 'babel-jest', // Use Babel to transform JavaScript files
  },
  testEnvironment: 'jest-environment-jsdom', // Use jsdom for DOM testing
};
