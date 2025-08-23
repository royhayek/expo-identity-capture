const { getDefaultConfig } = require("@expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "..");

const config = getDefaultConfig(projectRoot);

// Watch the package source outside the app folder
config.watchFolders = [workspaceRoot];

// Always resolve dependencies from the repo root first
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

// Avoid Metro walking up and pulling duplicate RN copies
config.resolver.disableHierarchicalLookup = true;

// Better symlink support
config.server = {
  ...config.server,
  unstable_enableSymlinks: true,
};

module.exports = config;
