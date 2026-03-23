const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withAndroidXCoreDowngrade(config) {
  return withProjectBuildGradle(config, (config) => {
    // Append resolution strategy to force an older version of androidx.core
    // This bypasses the AGP 8.9.1 / API 36 crash caused by androidx.core:1.17.0
    config.modResults.contents = config.modResults.contents + `
allprojects {
    configurations.all {
        resolutionStrategy {
            force 'androidx.core:core:1.15.0'
            force 'androidx.core:core-ktx:1.15.0'
        }
    }
}
`;
    return config;
  });
};
