// TEMPORARILY REVERTED from getSentryExpoConfig - the production Android
// build that shipped with it installed to a blank screen on a real device,
// and this swap (changing how the bundle itself is built/debug-id-tagged)
// is the one change in that build never verified against an actual native
// bundle, only the web preview. Reverting to isolate whether this is the
// cause before debugging the Sentry/Metro integration further - source-map
// upload is back to non-functional until this is re-enabled and confirmed
// safe.
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
