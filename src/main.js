const { app, BrowserWindow, shell, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');

// Configure logging
autoUpdater.logger = log;
autoUpdater.logger.transports.file.level = 'info';
log.info('App starting...');

// Auto-updater flags
autoUpdater.autoDownload = true;
autoUpdater.autoInstallOnAppQuit = true;

function setupAutoUpdater() {
  autoUpdater.checkForUpdatesAndNotify();

  autoUpdater.on('update-available', () => {
    log.info('Update available.');
  });

  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded');
    dialog.showMessageBox({
      type: 'info',
      title: 'Cập nhật phần mềm',
      message: 'Phiên bản mới đã được tải về. Bạn có muốn khởi động lại để cập nhật ngay không?',
      buttons: ['Cập nhật ngay', 'Để sau']
    }).then((returnValue) => {
      if (returnValue.response === 0) {
        autoUpdater.quitAndInstall();
      }
    });
  });

  autoUpdater.on('error', (err) => {
    log.error('Error in auto-updater. ' + err);
  });
}

// Keep global references of the window objects to prevent garbage collection
let mainWindow;
let splashWindow;

const TARGET_URL = 'https://shsmart.shs.com.vn/';

function getAssetPath() {
  if (app.isPackaged) {
    // In production, assets are in resources/assets
    return path.join(process.resourcesPath, 'assets');
  } else {
    // In development, assets are in project_root/assets
    return path.join(__dirname, '../assets');
  }
}

function createSplashWindow() {
  splashWindow = new BrowserWindow({
    width: 374,
    height: 812,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    resizable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    },
    icon: path.join(getAssetPath(), 'icon.png')
  });

  splashWindow.loadFile(path.join(getAssetPath(), 'splash.html'));

  splashWindow.center();
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false, // Don't show until ready
    autoHideMenuBar: true, // Hide menu bar
    webPreferences: {
      nodeIntegration: false, // Security: disable node integration
      contextIsolation: true, // Security: enable context isolation
      sandbox: true,
      partition: 'persist:shsmart' // Explicitly persistent session
    },
    icon: path.join(getAssetPath(), 'icon.png')
  });

  // Load the target URL
  mainWindow.loadURL(TARGET_URL);

  // When main window finishes loading
  mainWindow.once('ready-to-show', async () => {
    // Wait for the splash delay to finish
    if (global.splashDelay) {
      await global.splashDelay;
    }

    // Show main window
    mainWindow.show();
    mainWindow.maximize();

    // Close splash window if it exists
    if (splashWindow) {
      splashWindow.close();
      splashWindow = null;
    }
  });

  // Optimize navigation handling
  setupNavigationHandlers(mainWindow);

  // Handle permissions (Notifications, etc.)
  const session = mainWindow.webContents.session;
  session.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents.getURL();
    const targetHost = new URL(TARGET_URL).host;

    // Check if the request comes from our trusted domain
    if (new URL(url).host === targetHost) {
      if (permission === 'notifications' || permission === 'fullscreen') {
        // Approve notifications and fullscreen automatically
        return callback(true);
      }
    }

    // Deny others by default or prompt (default is usually deny in Electron if not handled)
    callback(false);
  });
}

function setupNavigationHandlers(window) {
  // Prevent navigating to other domains within the main window
  window.webContents.on('will-navigate', (event, url) => {
    const parsedUrl = new URL(url);
    const targetHost = new URL(TARGET_URL).host;

    if (parsedUrl.host !== targetHost) {
      event.preventDefault();
      // Open external links in default system browser
      shell.openExternal(url);
    }
  });

  // Handle new window requests (target="_blank")
  window.webContents.setWindowOpenHandler(({ url }) => {
    const parsedUrl = new URL(url);
    const targetHost = new URL(TARGET_URL).host;

    if (parsedUrl.host === targetHost) {
      // Allow internal popups if necessary, or force them into the same window?
      // For a trading app, popups might be charts or details. define allowance.
      // Defaulting to allow native window creation for same domain
      return { action: 'allow' };
    } else {
      // Open external links in default system browser
      shell.openExternal(url);
      return { action: 'deny' };
    }
  });
}

app.whenReady().then(() => {
  // Use a global variable to share the promise
  global.splashDelay = new Promise(resolve => setTimeout(resolve, 1800));

  createSplashWindow();

  // Initialize Auto Updater
  if (app.isPackaged) {
    setupAutoUpdater();
  }

  // Create main window a bit later or immediately.
  // We start loading main window immediately so it's ready faster.
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
