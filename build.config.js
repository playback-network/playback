const path = require('path');
const fs = require('fs')
const { execSync } = require('child_process');
require('dotenv').config();

const shouldNotarize = process.env.ENABLE_NOTARIZE === '1';
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
    '**/pidusage/**',
    '**/preload/**'
  ],
  mac: {
    category: 'public.app-category.productivity',
    hardenedRuntime: true,
    entitlements: 'entitlements.mac.plist',
    entitlementsInherit: 'entitlements.mac.inherit.plist',
    gatekeeperAssess: false,
    sign: false,
    // identity: 'Fabian Weber (2GPXPUFF8U)',
    icon: 'src/assets/PlaybackIcon.icns',
    notarize: false,
  },
  dmg: {
    sign: true
  },
  extraResources: [
    {
      from: '.env.production',
      to: '.env.production'
    },
    {
      from: 'dist/bin',
      to: 'bin'
    },
    { from: 'dist/assets',
       to: 'assets' 
    },
    {
      from: 'dist/preload',
      to: 'preload'
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
    if (!shouldNotarize) {
      console.log('🛑 skipping notarization bc ENABLE_NOTARIZE != 1');
      return;
    }
    const dmgPath = path.join(__dirname, 'release', 'Playback-1.0.0-arm64.dmg');
    console.log(`📡 submitting .dmg to notarization...`);
    execSync(
      `xcrun notarytool submit "${dmgPath}" --apple-id "${process.env.APPLE_ID}" --password "${process.env.APPLE_APP_SPECIFIC_PASSWORD}" --team-id "${process.env.APPLE_TEAM_ID}" --wait --force`,
      { stdio: 'inherit' }
    );

    console.log('✅ notarization complete! Stapling...');
    execSync(`xcrun stapler staple "${dmgPath}"`, { stdio: 'inherit' });
    console.log('✅ stapling complete!');
  },
};
