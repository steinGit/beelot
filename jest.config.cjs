module.exports = {
  transform: {
    '^.+\\.js$': 'babel-jest', // Use Babel to transform JavaScript files
  },
  testEnvironment: 'jest-environment-jsdom', // Use jsdom for DOM testing
  collectCoverageFrom: [
    'assets/js/**/*.js',
  ],
  coverageThreshold: {
    global: {
      statements: 58,
      branches: 48,
      functions: 64,
      lines: 58,
    },
    './assets/js/charts.js': {
      statements: 57,
      branches: 45,
      functions: 55,
      lines: 57,
    },
    './assets/js/main.js': {
      statements: 32,
      branches: 21,
      functions: 30,
      lines: 32,
    },
    './assets/js/plotUpdater.js': {
      statements: 55,
      branches: 43,
      functions: 69,
      lines: 55,
    },
    './assets/js/settings.js': {
      statements: 80,
      branches: 67,
      functions: 80,
      lines: 80,
    },
  },
};
