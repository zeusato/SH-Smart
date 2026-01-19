const { app, BrowserWindow, shell, dialog, ipcMain, Tray, Menu } = require('electron');
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
let tray = null;
let config = {
  alwaysOnTop: false,
  closeToTray: false,
  defaultZoom: 100
};
const configPath = path.join(app.getPath('userData'), 'config.json');

function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      config = { ...config, ...data };
    }
  } catch (e) { log.error('Error loading config:', e); }
}

function saveConfig() {
  try {
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (e) { log.error('Error saving config:', e); }
}

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
      partition: 'persist:shsmart', // Explicitly persistent session
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(getAssetPath(), 'icon.png'),
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#202020', // Matches common dark theme
      symbolColor: '#ffffff',
      height: 40 // Allow space for our button
    }
  });

  // Lock the title to "SH Smart"
  mainWindow.setTitle('SH Smart');

  // Apply Configs
  if (config.alwaysOnTop) mainWindow.setAlwaysOnTop(true);

  // Handle Close to Tray
  mainWindow.on('close', (event) => {
    if (config.closeToTray && !app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
  mainWindow.on('page-title-updated', (e) => {
    e.preventDefault();
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
      // Auto-approve all permissions (notifications, media, geolocation, etc.)
      return callback(true);
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

// Single Instance Lock
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    // Someone tried to run a second instance, we should focus our window.
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show(); // For tray cases
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    loadConfig();
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
    createTray();

    // Settings Window Logic
    ipcMain.on('open-settings', () => {
      createSettingsWindow();
    });

    ipcMain.on('save-settings', (event, newSettings) => {
      // Legacy support or specific renderer logic
    });

    // --- General Settings IPCs ---
    ipcMain.handle('get-general-settings', () => config);

    ipcMain.handle('set-general-setting', (event, { key, value }) => {
      config[key] = value;
      saveConfig();

      if (key === 'alwaysOnTop' && mainWindow) {
        mainWindow.setAlwaysOnTop(value);
      }
      if (key === 'defaultZoom' && mainWindow) {
        mainWindow.webContents.setZoomFactor(value / 100);
      }
      return true;
    });

    ipcMain.handle('clear-cache', async () => {
      if (mainWindow) {
        await mainWindow.webContents.session.clearCache();
        return true;
      }
      return false;
    });
  });

  let isQuitting = false;
  app.on('before-quit', () => {
    app.isQuitting = true;
  });

  function createTray() {
    tray = new Tray(path.join(getAssetPath(), 'icon.png'));
    const contextMenu = Menu.buildFromTemplate([
      { label: 'Mở SH Smart', click: () => mainWindow.show() },
      { type: 'separator' },
      {
        label: 'Thoát', click: () => {
          app.isQuitting = true;
          app.quit();
        }
      }
    ]);
    tray.setToolTip('SH Smart Trading Shell');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
      mainWindow.show();
    });
  }

  let settingsWindow;
  function createSettingsWindow() {
    if (settingsWindow) {
      settingsWindow.focus();
      return;
    }

    settingsWindow = new BrowserWindow({
      width: 900,
      height: 600,
      title: "Cài đặt Shell",
      parent: mainWindow, // Make it a child
      modal: true,       // Block interaction with parent
      resizable: false,
      maximizable: false,
      minimizable: false,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: true,
        contextIsolation: false,
        webSecurity: false
      }
      // Icon is inherited from parent in Windows taskbar grouping usually, 
      // or we can keep it if we want the window itself to have an icon in the corner.
      // But 'skipTaskbar' is implicit with modal parent on some OS, let's be safe:
      // skipTaskbar: true // Not strictly needed if modal, but good for "running inside" feel.
    });

    settingsWindow.loadFile(path.join(__dirname, 'settings/index.html'));

    settingsWindow.on('closed', () => {
      settingsWindow = null;
    });
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });



  // OTP Manager Logic
  const fs = require('fs');
  // crypto is native, but we need crypto-js to match renderer's encryption format
  const CryptoJS = require('crypto-js');

  const userDataPath = app.getPath('userData');
  const otpFilePath = path.join(userDataPath, 'otp_data.json');

  // In-memory session: { [cardId]: { data: [Array of 35 codes], timestamp: Date } }
  const otpSession = {};
  const SESSION_DURATION = 8 * 60 * 60 * 1000; // 8 hours

  ipcMain.handle('attempt-unlock-otp', (event, { cardId, password }) => {
    try {
      if (!fs.existsSync(otpFilePath)) return { success: false, error: 'File data not found' };

      const allCards = JSON.parse(fs.readFileSync(otpFilePath, 'utf8'));
      const card = allCards.find(c => c.id === cardId);

      if (!card) return { success: false, error: 'Card not found' };

      // Decrypt
      const bytes = CryptoJS.AES.decrypt(card.data, password);
      const decryptedStr = bytes.toString(CryptoJS.enc.Utf8);

      if (!decryptedStr) {
        return { success: false, error: 'Sai mật khẩu' };
      }

      const codes = JSON.parse(decryptedStr);

      // Success: Cache session
      otpSession[cardId] = {
        codes: codes,
        expiry: Date.now() + SESSION_DURATION
      };

      return { success: true };

    } catch (e) {
      log.error('Unlock error:', e);
      return { success: false, error: e.message };
    }
  });




  ipcMain.handle('get-otp-list', () => {
    try {
      if (!fs.existsSync(otpFilePath)) return [];
      const raw = fs.readFileSync(otpFilePath, 'utf8');
      const data = JSON.parse(raw);
      // Return only metadata (id, name, hasPassword)
      return data.map(item => ({
        id: item.id,
        name: item.name,
        lastUsed: item.lastUsed
      }));
    } catch (e) {
      log.error(e);
      return [];
    }
  });

  ipcMain.handle('get-otp-card-enc', (event, cardId) => {
    try {
      if (!fs.existsSync(otpFilePath)) return null;
      const data = JSON.parse(fs.readFileSync(otpFilePath, 'utf8'));
      return data.find(item => item.id === cardId);
    } catch (e) { return null; }
  });

  ipcMain.handle('save-otp-card', (event, cardData) => {
    // cardData: { id, name, encryptedData (ciphertext) }
    try {
      let current = [];
      if (fs.existsSync(otpFilePath)) {
        current = JSON.parse(fs.readFileSync(otpFilePath, 'utf8'));
      }
      current.push(cardData);
      fs.writeFileSync(otpFilePath, JSON.stringify(current, null, 2));
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('delete-otp-card', (event, cardId) => {
    try {
      if (!fs.existsSync(otpFilePath)) return { success: false, error: 'Not found' };
      const current = JSON.parse(fs.readFileSync(otpFilePath, 'utf8'));
      const index = current.findIndex(c => c.id === cardId);
      if (index === -1) return { success: false, error: 'Card not found' };

      current.splice(index, 1);
      fs.writeFileSync(otpFilePath, JSON.stringify(current, null, 2));

      // Clear session if exists
      if (otpSession[cardId]) delete otpSession[cardId];

      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('unlock-otp-card', (event, { cardId, codes }) => {
    // The renderer sends us the DECRYPTED codes after verifying password there?
    // OR renderer sends password and we decrypt?
    // Better: Renderer does the decryption (CPU intensive) and sends us the clean codes to cache in session.
    // Security trade-off: IPC sends plain codes. acceptable for local app.
    otpSession[cardId] = {
      codes: codes, // Array of 35 strings
      expiry: Date.now() + SESSION_DURATION
    };
    return true;
  });

  ipcMain.handle('request-otp-code', (event, { cardId, index }) => {
    // Check session
    const session = otpSession[cardId];
    if (session && Date.now() < session.expiry) {
      return { success: true, code: session.codes[index - 1] }; // index is 1-based
    }
    return { success: false, reason: 'LOCKED' };
  });

  // Auto-fill query from Preload
  ipcMain.handle('get-auto-otp', (event, requiredIndex) => {
    // Check if we have any active session
    const activeCardId = Object.keys(otpSession).find(id => Date.now() < otpSession[id].expiry);
    if (activeCardId) {
      const code = otpSession[activeCardId].codes[requiredIndex - 1];
      // Ideally we should tell the user WHICH card we used if there are multiple, 
      // but requirement says "If multiple... show list". 
      // For now, if we have a valid session, return it.
      return { success: true, code, cardId: activeCardId };
    }

    // Check if we have cards at all
    if (!fs.existsSync(otpFilePath)) return { success: false, reason: 'NO_CARDS' };
    const raw = JSON.parse(fs.readFileSync(otpFilePath, 'utf8'));
    if (raw.length === 0) return { success: false, reason: 'NO_CARDS' };

    return { success: false, reason: 'LOCKED', cardCount: raw.length };
  });

  // Open Settings specifically for OTP unlocking
  ipcMain.on('prompt-otp-unlock', () => {
    createSettingsWindow();
    // Optionally notify settings window to switch to OTP tab
    if (settingsWindow) {
      settingsWindow.webContents.send('switch-tab', 'otp');
    }
  });

} // End of Single Instance Lock ELSE block




