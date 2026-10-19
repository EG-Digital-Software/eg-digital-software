// The app lives inside the web monorepo but is not one of its npm workspaces.
// Watch and resolve from this folder only, so Metro never picks up the web
// frontend's React (hoisted into the repo-root node_modules).
const path = require('path');
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.watchFolders = [__dirname];
config.resolver.nodeModulesPaths = [path.resolve(__dirname, 'node_modules')];

module.exports = config;
