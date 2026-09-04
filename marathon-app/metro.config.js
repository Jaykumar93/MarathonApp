const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// @sentry/core's package.json "exports" map only lists ".", but its own
// esm/index.js re-exports from relative paths like "./tracing/errors.js" -
// with Metro's package-exports resolution on, those internal relative
// imports get resolved through the same restricted exports map and fail
// ("Unable to resolve './tracing/errors.js' from '@sentry/core'"). Falling
// back to Metro's classic resolution (Node modules, no exports map) avoids
// this - see https://github.com/getsentry/sentry-react-native/issues (metro
// + package exports).
config.resolver.unstable_enablePackageExports = false;

module.exports = config;
