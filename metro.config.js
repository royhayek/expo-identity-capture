const {getDefaultConfig, mergeConfig} = require('@react-native/metro-config');

const defaultConfig = getDefaultConfig(__dirname);

const config = {
  resolver: {
    // Add resolver to handle missing modules
    resolverMainFields: ['react-native', 'browser', 'main'],
    platforms: ['ios', 'android', 'native', 'web'],
    alias: {
      // Polyfill for problematic modules
      'whatwg-url-without-unicode': require.resolve('whatwg-url-without-unicode/lib/index.js'),
    },
  },
};

module.exports = mergeConfig(defaultConfig, config);