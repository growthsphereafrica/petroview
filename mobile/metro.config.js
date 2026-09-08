// Metro config for the universal (web + iOS + Android) build.
// The mobile app is self-contained on purpose: EAS cloud builds upload only
// the `mobile/` directory, so shared logic lives inside `mobile/src/shared`.
const { getDefaultConfig } = require('expo/metro-config')
const path = require('path')

const projectRoot = __dirname

const config = getDefaultConfig(projectRoot)

// Resolve dependencies from the mobile node_modules only (flat lookup).
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  // Expo bundles some of its own dependencies (e.g. @expo/log-box) nested
  // under expo/node_modules. Without this path Metro cannot resolve them at
  // build time and every Android/iOS bundle fails.
  path.resolve(projectRoot, 'node_modules/expo/node_modules'),
]
config.resolver.disableHierarchicalLookup = true

module.exports = config