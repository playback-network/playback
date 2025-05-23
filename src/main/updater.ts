import { autoUpdater } from 'electron-updater';
import { dialog } from 'electron';
import log from 'electron-log';

let updaterInitialized = false;

autoUpdater.logger = log;
log.transports.file.level = 'info';

export function checkForUpdates(intervalMs = 2 * 60 * 60 * 1000) {
    if (updaterInitialized) return;
    updaterInitialized = true;

    autoUpdater.logger = log;
    log.transports.file.level = 'info';

    autoUpdater.on('checking-for-update', () => log.info('🔍 Checking for update...'));
    autoUpdater.on('update-available', (info) => log.info('⬆️ Update available:', info));
    autoUpdater.on('update-not-available', (info) => log.info('✅ No update available:', info));
    autoUpdater.on('error', (err) => {
      log.error('❌ Update error:', err);
      // optional: retry after 10 min
      setTimeout(() => {
          log.info('🔁 Retrying update check after error...');
          autoUpdater.checkForUpdatesAndNotify();
      }, 10 * 60 * 1000);
    });
    autoUpdater.on('download-progress', (progress) => {
      log.info('📥 Downloading update...', progress)
    });

    autoUpdater.on('update-downloaded', () => {
      log.info('✅ Update downloaded. Will install on quit.');
      const result = dialog.showMessageBoxSync({
              type: 'info',
              buttons: ['Restart Now', 'Later'],
              title: 'Update Ready',
              message: 'A new version has been downloaded. Restart the app to apply the updates.',
          });
      if (result === 0) { // "Restart Now"
          autoUpdater.quitAndInstall();
      } else {
          log.info('🕒 User chose to update later.');
      }
    });      
    
    autoUpdater.checkForUpdatesAndNotify();

    setInterval(() => {
        log.info('update:loop-tick');
        autoUpdater.checkForUpdatesAndNotify();
    }, intervalMs);
}
