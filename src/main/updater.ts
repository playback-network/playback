import { autoUpdater } from 'electron-updater';
import log from 'electron-log';

let updaterInitialized = false;

autoUpdater.logger = log;
log.transports.file.level = 'info';

export function checkForUpdates(intervalMs = 6 * 60 * 60 * 1000) {
    if (!updaterInitialized) {
        autoUpdater.logger = log;
        log.transports.file.level = 'info';
        console.log('BUCKET_NAME:', process.env.BUCKET_NAME);
        autoUpdater.on('checking-for-update', () => log.info('🔍 Checking for update...'));
        autoUpdater.on('update-available', (info) => log.info('⬆️ Update available:', info));
        autoUpdater.on('update-not-available', (info) => log.info('✅ No update available:', info));
        autoUpdater.on('error', (err) => log.error('❌ Update error:', err));
        autoUpdater.on('download-progress', (progress) => log.info('📥 Downloading update...', progress));
        autoUpdater.on('update-downloaded', () => {
          log.info('✅ Update downloaded. Will install on quit.');
          autoUpdater.quitAndInstall();
        });
    
        updaterInitialized = true;
      }
    autoUpdater.checkForUpdates();

    setInterval(() => {
        log.info('update:loop-tick');
        autoUpdater.checkForUpdates();
    }, intervalMs);
}
