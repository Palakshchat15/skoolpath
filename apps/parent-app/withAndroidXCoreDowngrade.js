const { withProjectBuildGradle } = require('@expo/config-plugins');

module.exports = function withAndroidXCoreDowngrade(config) {
  return withProjectBuildGradle(config, (config) => {
    // Inject resolution strategy to force an older version of androidx.core
    // This bypasses the startup crash caused by androidx.core:1.15.2+ on SDK 53
    if (!config.modResults.contents.includes('androidx.core:core:1.15.0')) {
      config.modResults.contents = config.modResults.contents.replace(
        /allprojects\s*{/,
        `allprojects {
    configurations.all {
        resolutionStrategy {
            force 'androidx.core:core:1.15.0'
            force 'androidx.core:core-ktx:1.15.0'
        }
    }
`
      );
    }
    return config;
  });
};
