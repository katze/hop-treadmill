const {app, BrowserWindow, ipcMain, screen} = require('electron');
const path = require('path');
const {setupSerial, onSerialMessage, setSerialInterval} = require('./serial');
const csv = require('./csv');
const {loadConfig, saveConfig} = require('./config');

let mainWindow = null;

function createWindows() {
  const displays = screen.getAllDisplays();
  let smallDisplay, largeDisplay;// Trier par surface
  const sorted = displays.slice()
    .sort((a, b) => (a.size.width * a.size.height * (a.scaleFactor ** 2)) - (b.size.width * b.size.height * (b.scaleFactor ** 2)));
  if (app.isPackaged && displays.length > 1) {
    smallDisplay = sorted[0];
    largeDisplay = sorted[sorted.length - 1];
  } else {
    smallDisplay = largeDisplay = displays[sorted.length - 1];
  }

  // Fenêtre Petit écran
  mainWindow = new BrowserWindow({
    x: smallDisplay.bounds.x,
    y: smallDisplay.bounds.y,
    width: app.isPackaged ? (displays.length > 1 ? smallDisplay.size.width : Math.floor(smallDisplay.size.width / 2)) : 1280,
    height: app.isPackaged ? smallDisplay.size.height : 800,
    useContentSize: true,
    fullscreen: app.isPackaged && displays.length > 1,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  mainWindow.setMenuBarVisibility(false);

  if (app.isPackaged) {
    mainWindow.loadFile(path.resolve(__dirname, '../public/index.html'));
  } else {
    mainWindow.loadURL('http://localhost:5173/index.html');
  }


  // Fenêtre Grand écran
  let grandScreenWindow = new BrowserWindow({
    x: largeDisplay.bounds.x + (displays.length > 1 ? 0 : Math.floor(largeDisplay.size.width / 2)),
    y: largeDisplay.bounds.y,
    width: displays.length > 1 ? largeDisplay.size.width : Math.floor(largeDisplay.size.width / 2),
    height: largeDisplay.size.height,
    useContentSize: true,
    fullscreen: displays.length > 1,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });
  grandScreenWindow.setMenuBarVisibility(false);
  if (app.isPackaged) {
    grandScreenWindow.loadFile(path.resolve(__dirname, '../public/grand_ecran.html'));
  } else {
    grandScreenWindow.loadURL('http://localhost:5173/grand_ecran.html');
  }
}

app.whenReady().then(() => {
  // Initialiser le fichier CSV au démarrage
  csv.ensureCsvFileExists();

  ipcMain.handle('get-config', () => loadConfig());
  ipcMain.handle('set-config', (event, newConfig) => {
    saveConfig(newConfig);
    return true;
  });
  // CSV handlers
  ipcMain.handle('get-csv-data', async () => {
    return await csv.getCsvData();
  });
  ipcMain.handle('save-session-row', async (event, sessionData) => {
    return await csv.saveSessionRow(sessionData);
  });
  setupSerial().then();
  onSerialMessage((msg) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('serial-message', msg);
    }
  });
  createWindows();
  // Relay messages from renderer to serial port
  ipcMain.on('serial-set-interval', (event, ms) => {
    setSerialInterval(ms);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
}); 