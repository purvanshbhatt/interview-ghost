const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.join(__dirname, '..');
const mobileDir = path.join(repoRoot, 'mobile');
const iosDir = path.join(mobileDir, 'ios');

test('mobile/app.json defines Ghost branding, bundle IDs, and iOS microphone/audio background permissions', () => {
  const appJsonPath = path.join(mobileDir, 'app.json');
  assert.ok(fs.existsSync(appJsonPath), 'mobile/app.json must exist');

  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  assert.ok(appJson.expo, 'expo configuration must exist');
  assert.equal(appJson.expo.name, 'Ghost');
  assert.equal(appJson.expo.slug, 'ghost-interview-copilot');
  assert.equal(appJson.expo.scheme, 'ghost');

  // iOS configuration
  assert.ok(appJson.expo.ios, 'expo.ios must exist');
  assert.equal(appJson.expo.ios.bundleIdentifier, 'com.ghost.interviewhelper');
  assert.equal(appJson.expo.ios.supportsTablet, true);
  assert.ok(appJson.expo.ios.infoPlist, 'expo.ios.infoPlist must exist');
  assert.equal(
    appJson.expo.ios.infoPlist.NSMicrophoneUsageDescription,
    'Ghost requires microphone access for real-time interview transcription'
  );
  assert.deepEqual(appJson.expo.ios.infoPlist.UIBackgroundModes, ['audio']);

  // Android package configuration
  assert.ok(appJson.expo.android, 'expo.android must exist');
  assert.equal(appJson.expo.android.package, 'com.ghost.interviewhelper');
});

test('mobile/ios native directory contains required files and build assets', () => {
  const requiredFiles = [
    '.xcode.env',
    'Podfile',
    'Ghost/AppDelegate.h',
    'Ghost/AppDelegate.mm',
    'Ghost/Ghost-Bridging-Header.h',
    'Ghost/main.m',
    'Ghost/Info.plist',
    'Ghost/SplashScreen.storyboard',
    'Ghost/Supporting/Expo.plist',
    'Ghost/Images.xcassets/AppIcon.appiconset/Contents.json',
    'Ghost/Images.xcassets/SplashScreen.imageset/Contents.json',
    'Ghost.xcodeproj/project.pbxproj',
    'Ghost.xcodeproj/xcshareddata/xcschemes/Ghost.xcscheme',
    'Ghost.xcworkspace/contents.xcworkspacedata'
  ];

  for (const file of requiredFiles) {
    const filePath = path.join(iosDir, file);
    assert.ok(fs.existsSync(filePath), `Required iOS native file missing: mobile/ios/${file}`);
  }
});

test('mobile/ios/Podfile specifies iOS 15.1+, Expo autolinking, and Hermes engine', () => {
  const podfilePath = path.join(iosDir, 'Podfile');
  const podfileContent = fs.readFileSync(podfilePath, 'utf8');

  assert.match(podfileContent, /platform\s+:ios,\s*['"]15\.1['"]/);
  assert.match(podfileContent, /target\s+['"]Ghost['"]\s+do/);
  assert.match(podfileContent, /use_expo_modules!/);
  assert.match(podfileContent, /use_native_modules!/);
  assert.match(podfileContent, /:hermes_enabled\s*=>\s*true/);
  assert.match(podfileContent, /use_frameworks!\s*:linkage\s*=>\s*:static/);
  assert.match(podfileContent, /react_native_post_install/);
});

test('mobile/ios/Ghost/Info.plist contains microphone permission, background audio, and Ghost bundle id', () => {
  const plistPath = path.join(iosDir, 'Ghost/Info.plist');
  const plistContent = fs.readFileSync(plistPath, 'utf8');

  assert.match(plistContent, /<key>CFBundleDisplayName<\/key>\s*<string>Ghost<\/string>/);
  assert.match(plistContent, /<key>CFBundleIdentifier<\/key>\s*<string>com\.ghost\.interviewhelper<\/string>/);
  assert.match(plistContent, /<key>NSMicrophoneUsageDescription<\/key>\s*<string>Ghost requires microphone access for real-time interview transcription<\/string>/);
  assert.match(plistContent, /<key>UIBackgroundModes<\/key>\s*<array>\s*<string>audio<\/string>\s*<\/array>/);
  assert.match(plistContent, /<key>UILaunchStoryboardName<\/key>\s*<string>SplashScreen<\/string>/);
});

test('mobile/ios/Ghost/AppDelegate.h and AppDelegate.mm implement Expo app delegate and React Native bridge', () => {
  const headerPath = path.join(iosDir, 'Ghost/AppDelegate.h');
  const mmPath = path.join(iosDir, 'Ghost/AppDelegate.mm');

  const headerContent = fs.readFileSync(headerPath, 'utf8');
  assert.match(headerContent, /#import\s+<Expo\/Expo\.h>/);
  assert.match(headerContent, /@interface\s+AppDelegate\s*:\s*EXAppDelegateWrapper/);

  const mmContent = fs.readFileSync(mmPath, 'utf8');
  assert.match(mmContent, /#import\s+"AppDelegate\.h"/);
  assert.match(mmContent, /self\.moduleName\s*=\s*@"main"/);
  assert.match(mmContent, /\[RCTLinkingManager\s+application:application\s+openURL:url/);
});

test('mobile/ios/Ghost.xcodeproj/project.pbxproj is valid PBX project targeting iOS 15.1 and com.ghost.interviewhelper', () => {
  const pbxPath = path.join(iosDir, 'Ghost.xcodeproj/project.pbxproj');
  const pbxContent = fs.readFileSync(pbxPath, 'utf8');

  assert.match(pbxContent, /archiveVersion = 1;/);
  assert.match(pbxContent, /objectVersion = 54;/);
  assert.match(pbxContent, /PRODUCT_NAME = Ghost;/);
  assert.match(pbxContent, /PRODUCT_BUNDLE_IDENTIFIER = "com\.ghost\.interviewhelper";/);
  assert.match(pbxContent, /IPHONEOS_DEPLOYMENT_TARGET = 15\.1;/);
  assert.match(pbxContent, /INFOPLIST_FILE = Ghost\/Info\.plist;/);
  assert.match(pbxContent, /SWIFT_OBJC_BRIDGING_HEADER = "Ghost\/Ghost-Bridging-Header\.h";/);
  assert.match(pbxContent, /AppDelegate\.mm in Sources/);
  assert.match(pbxContent, /main\.m in Sources/);
  assert.match(pbxContent, /SplashScreen\.storyboard in Resources/);
  assert.match(pbxContent, /Images\.xcassets in Resources/);
  assert.match(pbxContent, /Expo\.plist in Resources/);
});

test('mobile/ios/Ghost/Supporting/Expo.plist configures SDK 54 updates', () => {
  const expoPlistPath = path.join(iosDir, 'Ghost/Supporting/Expo.plist');
  const expoPlistContent = fs.readFileSync(expoPlistPath, 'utf8');

  assert.match(expoPlistContent, /<key>EXUpdatesSDKVersion<\/key>\s*<string>54\.0\.0<\/string>/);
  assert.match(expoPlistContent, /<key>EXUpdatesEnabled<\/key>\s*<true\/>/);
});

test('mobile/ios/.xcode.env defines NODE_BINARY resolution', () => {
  const envPath = path.join(iosDir, '.xcode.env');
  const envContent = fs.readFileSync(envPath, 'utf8');

  assert.match(envContent, /export NODE_BINARY=/);
});
