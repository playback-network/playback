const path = require('path');
const fs = require('fs')
const { execSync } = require('child_process');
require('dotenv').config();

module.exports = {
  appId: 'com.playback.app',
  productName: 'Playback',
  directories: {
    output: 'release',
    buildResources: 'assets',
  },
  files: [
    'dist/**/*',
    'node_modules/better-sqlite3/**/*',
    'node_modules/aws-sdk/**/*',
    'node_modules/amazon-cognito-identity-js/**/*',
    'node_modules/axios/**/*',
    'node_modules/screenshot-desktop/**/*',
    'node_modules/undici/**/*',
    'node_modules/async-limiter/**/*',
    'node_modules/pidusage/**/*',
    'node_modules/electron-log/**/*',
    'node_modules/electron-updater/**/*',
    'package.json'
  ],
  asarUnpack: [
    '**/better-sqlite3/**',
    '**/pidusage/**'
  ],
  mac: {
    category: 'public.app-category.productivity',
    hardenedRuntime: true,
    entitlements: 'entitlements.mac.plist',
    entitlementsInherit: 'entitlements.mac.inherit.plist',
    gatekeeperAssess: false,
    identity: 'Fabian Weber (2GPXPUFF8U)',
    icon: 'src/assets/logo.icns',
    notarize: false,
  },
  dmg: {
    sign: false
  },
  extraResources: [
    {
      from: '.env.production',
      to: '.env.production'
    },
    {
      from: 'dist/bin',
      to: 'bin'
    }
  ],
  publish: [
    {
      provider: 's3',
      bucket: 'playback-updater',
      region: 'eu-north-1',
      path: 'updates'
      //acl: 'public-read'
    }
  ],
  afterSign: async (ctx) => {
    const appPath = path.join(ctx.appOutDir, 'Playback.app');
    const binDir = path.join(appPath, 'Contents', 'Resources', 'bin');
    if (fs.existsSync(binDir)) {
      const binFiles = fs.readdirSync(binDir);
      for (const file of binFiles) {
        const binPath = path.join(binDir, file);
        if (fs.statSync(binPath).isFile()) {
          console.log(`🔏 signing binary: ${binPath}`);
          execSync(`codesign --force --timestamp --options runtime --entitlements entitlements.mac.inherit.plist --sign "Developer ID Application: Fabian Weber (2GPXPUFF8U)" "${binPath}"`);
        }
      }
    }

    // 2. re-sign entire app bundle (VERY IMPORTANT)
    console.log(`🔏 re-signing full app bundle: ${appPath}`);
    execSync(`codesign --deep --force --timestamp --options runtime --entitlements entitlements.mac.plist --sign "Developer ID Application: Fabian Weber (2GPXPUFF8U)" "${appPath}"`);

    const appZipPath = path.join(ctx.appOutDir, 'Playback.zip');
    console.log(`📦 zipping app for notarization...`);
    execSync(`ditto -c -k --sequesterRsrc --keepParent "${appPath}" "${appZipPath}"`);

    console.log('📦 submitting zip to notarization (this may take a few minutes)...');
    execSync(
      `xcrun notarytool submit "${appZipPath}" --apple-id "${process.env.APPLE_ID}" --password "${process.env.APPLE_APP_SPECIFIC_PASSWORD}" --team-id "${process.env.APPLE_TEAM_ID}" --wait 
      `,
      { stdio: 'inherit' }
    );
 
  },
};
