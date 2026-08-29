const android = require('@react-native-community/cli-platform-android');

const pkg = require('./package.json');
const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

const ignoredDependencies = {};
for (const dep of Object.keys(allDeps)) {
  if (dep === 'expo' || dep.startsWith('expo-') || dep.startsWith('@expo/')) {
    ignoredDependencies[dep] = {
      platforms: {
        android: null,
        ios: null,
      },
    };
  }
}

module.exports = {
  commands: [...android.commands],
  platforms: {
    android: {
      npmPackageName: '@react-native-community/cli-platform-android',
      projectConfig: android.projectConfig,
      dependencyConfig: android.dependencyConfig,
    },
  },
  project: {
    android: {
      sourceDir: './android',
      appName: 'app',
      packageName: 'com.cue.interviewhelper',
    },
  },
  dependencies: ignoredDependencies,
};
