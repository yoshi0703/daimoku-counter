const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

if (!config.resolver.assetExts.includes("bin")) {
  config.resolver.assetExts.push("bin");
}

module.exports = config;
