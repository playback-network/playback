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
    '**/pidusage/**'
  ],
  mac: {
    category: 'public.app-category.productivity',
    hardenedRuntime: true,
    entitlements: 'entitlements.mac.plist',
    entitlementsInherit: 'entitlements.mac.inherit.plist',
    gatekeeperAssess: false,
    sign: false,
    // identity: 'Fabian Weber (2GPXPUFF8U)',
    icon: 'src/assets/logo.icns'
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
    if (!shouldNotarize) {
      console.log('🛑 skipping notarization bc ENABLE_NOTARIZE != 1');
      return;
    }
    
    const appPath = path.join(ctx.appOutDir, 'Playback.app');
    const appZipPath = path.join(ctx.appOutDir, 'Playback.zip');

    console.log(`📦 zipping app for notarization...`);
    execSync(`ditto -c -k --sequesterRsrc --keepParent "${appPath}" "${appZipPath}"`);

    console.log('📦 submitting zip to notarization (this may take a few minutes)...');
    execSync(
      `xcrun notarytool submit "${appZipPath}" --apple-id "${process.env.APPLE_ID}" --password "${process.env.APPLE_APP_SPECIFIC_PASSWORD}" --team-id "${process.env.APPLE_TEAM_ID}" --wait 
      `,
      { stdio: 'inherit' }
    );
   console.log('✅ notarization complete!');
  },
};
