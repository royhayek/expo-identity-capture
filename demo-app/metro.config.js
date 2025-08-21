const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

// Add the parent directory to the watchFolders so Metro can find our package
config.watchFolders = [
  path.resolve(__dirname, '..'),
];

// Configure the resolver to handle the local package
config.resolver.nodeModulesPaths = [
  path.resolve(__dirname, 'node_modules'),
  path.resolve(__dirname, '..', 'node_modules'),
];

module.exports = config;