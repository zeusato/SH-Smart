const { app, BrowserWindow, shell, dialog, ipcMain, Tray, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { autoUpdater } = require('electron-updater');
const log = require('electron-log');
const aiService = require('./services/AIService');
const APP_SECRET = "shsmart-secret-ai-key-salt"; // Simple obfuscation

// Disable Hardware Acceleration for Transparent Window
app.disableHardwareAcceleration();

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
let settingsWindow = null;
let tray = null;
let widgetWindow = null;
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

function createWidgetWindow() {
  const { screen } = require('electron');
  const primaryDisplay = screen.getPrimaryDisplay();
  const { width, height } = primaryDisplay.workAreaSize;

  // Initial dimensions (Compact: 125 * 5 + padding ~ 650)
  const initialW = 660;
  const initialH = 80;

  widgetWindow = new BrowserWindow({
    width: initialW,
    height: initialH,
    x: width - initialW - 30, // Bottom Right with padding
    y: height - initialH - 20,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  widgetWindow.loadFile(path.join(__dirname, 'widget/index.html'));

  widgetWindow.on('closed', () => {
    widgetWindow = null;
  });
}

// ... (createSplashWindow) ...

// Widget IPCs
ipcMain.handle('get-widget-config', () => {
  return config;
});

ipcMain.on('toggle-widget', (event, shouldEnable) => {
  config.widgetEnable = shouldEnable;
  saveConfig();

  if (shouldEnable) {
    if (!widgetWindow) createWidgetWindow();
    if (mainWindow) mainWindow.webContents.send('widget-enabled');
  } else {
    if (widgetWindow) widgetWindow.close();
  }
});

// Handle External Close Request (Right Click)
ipcMain.on('request-close-widget', () => {
  // Debug: Confirm receipt
  const { dialog } = require('electron');
  // dialog.showMessageBox({ message: "Debug: Close Request Received" }); 
  // Commenting out dialog, just using console Log for now to avoid blocking if user doesn't see it?
  // No, user said "ko chạy". I need to be sure.
  // I will use console.log first. Terminal is visible to me.
  console.log('DEBUG: request-close-widget received in MAIN');

  config.widgetEnable = false;
  saveConfig();
  if (widgetWindow) {
    widgetWindow.close();
  }
  // Sync Settings Window if open
  if (settingsWindow) {
    settingsWindow.webContents.send('sync-widget-state', false);
  }
});

// Handle Open Symbol Request (Click)
ipcMain.on('request-open-symbol', async (event, symbol) => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();

    // Flow: F9 -> Wait -> Type Symbol -> Enter
    // 1. Press F9
    mainWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'F9' });
    mainWindow.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'F9' });

    // 2. Wait for Search Bar (500ms)
    setTimeout(() => {
      // 3. Type Symbol
      mainWindow.webContents.insertText(symbol);

      // 4. Wait & Enter
      setTimeout(() => {
        mainWindow.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' });
        mainWindow.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' });
      }, 300);
    }, 500);
  }
});

ipcMain.on('update-widget-watchlist', (event, list) => {
  config.watchlist = list;
  saveConfig();
  if (mainWindow) {
    mainWindow.webContents.send('watchlist-changed', list);
  }
});

// Relay Data: Preload -> Widget
ipcMain.on('price-update-data', (event, data) => {
  if (widgetWindow) {
    widgetWindow.webContents.send('update-prices', data);
  }
});

ipcMain.on('resize-widget', (event, { width, height }) => {
  if (widgetWindow && !widgetWindow.isDestroyed()) {
    try {
      const newWidth = Math.max(width, 100);
      const newHeight = Math.max(height, 50);
      widgetWindow.setContentSize(Math.ceil(newWidth), Math.ceil(newHeight));

      // Optional: Keep it anchored to bottom-right when resizing?
      // For now, standard resize is fine.
    } catch (e) { }
  }
});

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
    ipcMain.handle('get-app-version', () => app.getVersion());
    ipcMain.handle('get-general-settings', () => config);

    ipcMain.on('focus-settings', () => {
      if (settingsWindow) {
        settingsWindow.show(); // Ensure visible
        settingsWindow.focus(); // Force focus
      }
    });

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

    // --- AI IPCs ---
    ipcMain.handle('get-ai-config', () => {
      // Return decrypted key for settings view
      let decrypted = '';
      if (config.aiApiKey) {
        try {
          const bytes = CryptoJS.AES.decrypt(config.aiApiKey, APP_SECRET);
          decrypted = bytes.toString(CryptoJS.enc.Utf8);
        } catch (e) { }
      }
      return { apiKey: decrypted };
    });

    ipcMain.handle('set-ai-key', (event, rawKey) => {
      if (!rawKey) {
        delete config.aiApiKey;
      } else {
        const encrypted = CryptoJS.AES.encrypt(rawKey, APP_SECRET).toString();
        config.aiApiKey = encrypted;
        // Init AI Service immediately
        aiService.init(rawKey);
        aiService.checkConnection(); // Verify immediately
      }
      saveConfig();
      return true;
    });

    ipcMain.handle('ai-chat-request', async (event, { message, type, contextData }) => {
      // Init if needed (e.g. startup)
      if (!aiService.model && config.aiApiKey) {
        try {
          const bytes = CryptoJS.AES.decrypt(config.aiApiKey, APP_SECRET);
          const decrypted = bytes.toString(CryptoJS.enc.Utf8);
          aiService.init(decrypted);
        } catch (e) { }
      }

      if (type === 'technical') {
        return await aiService.analyzeStock(contextData.symbol, contextData);
      } else {
        return await aiService.chatFreeStyle(message);
      }
    });

    ipcMain.handle('get-ai-icon', async () => {
      try {
        // Adjust path depending on where main.js is running. 
        // In dev: src/main.js -> public/AI.png is valid via ../public
        // In prod: resources/app/public/AI.png 
        const iconPath = path.join(__dirname, '../public/AI.png');
        if (fs.existsSync(iconPath)) {
          return fs.readFileSync(iconPath).toString('base64');
        } else {
          console.warn("AI Icon not found at:", iconPath);
        }
      } catch (e) {
        console.error('Failed to load AI icon in Main:', e);
      }
      return null;
    });

    ipcMain.handle('get-chat-history', () => {
      return aiService.history;
    });

    ipcMain.handle('ai-clear-history', () => {
      aiService.clearHistory();
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

  // Allow Renderer to cache the unlocked codes after validating password
  ipcMain.handle('unlock-otp-card', (event, { cardId, codes }) => {
    otpSession[cardId] = {
      codes: codes,
      expiry: Date.now() + SESSION_DURATION
    };
    return { success: true };
  });

  ipcMain.handle('attempt-unlock-otp', (event, { cardId, password }) => {
    try {
      if (!fs.existsSync(otpFilePath)) return { success: false, error: 'File data not found' };

      const allCards = JSON.parse(fs.readFileSync(otpFilePath, 'utf8'));
      const card = allCards.find(c => c.id === cardId);

      if (!card) return { success: false, error: 'Card not found' };

      // Decrypt
      let decryptedStr;
      try {
        const bytes = CryptoJS.AES.decrypt(card.data, password);
        decryptedStr = bytes.toString(CryptoJS.enc.Utf8);
      } catch (e) {
        // Malformed UTF-8 data usually means wrong password
        return { success: false, error: 'Sai mật khẩu' };
      }

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



  ipcMain.handle('get-app-icon', () => {
    try {
      const iconPath = path.join(getAssetPath(), 'icon.png');
      if (fs.existsSync(iconPath)) {
        return fs.readFileSync(iconPath).toString('base64');
      }
    } catch (e) {
      log.error('Error loading icon:', e);
    }
    return null;
  });

} // End of Single Instance Lock ELSE block






