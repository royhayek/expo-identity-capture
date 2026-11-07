/** Unit tests of the pure parts (MRZ, OCR rows, the liveness challenge): no device, no native module */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  transform: {
    '^.+\\.tsx?$': ['babel-jest', { presets: [['@babel/preset-env', { targets: { node: 'current' } }], '@babel/preset-typescript'] }],
  },
  moduleNameMapper: {
    '^react-native-nitro-modules$': '<rootDir>/tests/stubs/nitro-modules.js',
    '^react-native-fast-opencv$': '<rootDir>/tests/stubs/fast-opencv.js',
  },
  globals: { __DEV__: false },
};
