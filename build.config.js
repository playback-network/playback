// build.config.js
const path = require('path');

module.exports = {
  appId: 'com.playback.app',
  productName: 'Playback',
  directories: {
    output: 'release',
    buildResources: 'assets',
  },
  files: [
    'dist/**/*',
    'node_modules/**/*',
    'package.json'
  ],
  asarUnpack: ['**/better-sqlite3/**'],
  mac: {
    target: 'dmg',
    category: 'public.app-category.productivity',
    hardenedRuntime: true,
    entitlements: 'entitlements.mac.plist',
    gatekeeperAssess: false,
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
  ]
};
