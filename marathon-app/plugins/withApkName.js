const { withAppBuildGradle } = require("@expo/config-plugins");

/**
 * Android's default Gradle output for a release build is a generic
 * app-release.apk, and the actual download link EAS hands back names the
 * file after the build's own id (what read as "random" - it's not an app
 * config value at all, it's Gradle's own default naming). This renames
 * every build variant's output artifact after the app itself instead, so
 * a downloaded/sideloaded file reads as "Stryde-1.0.0.apk", not a UUID.
 */
module.exports = function withApkName(config) {
  return withAppBuildGradle(config, (config) => {
    if (config.modResults.language !== "groovy") {
      throw new Error("withApkName only supports Groovy build.gradle files");
    }
    const snippet = `
android {
    applicationVariants.all { variant ->
        variant.outputs.all { output ->
            output.outputFileName = "Stryde-\${variant.versionName}-\${variant.name}.apk"
        }
    }
}
`;
    config.modResults.contents += snippet;
    return config;
  });
};
