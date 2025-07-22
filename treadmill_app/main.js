const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

let mainWindow;
let serialPort;
let parser;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 800,
    height: 800, // Augmenté pour afficher la console série
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });
  mainWindow.loadFile('index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async function () {
  if (serialPort) {
    await new Promise((resolve) => {
      serialPort.close((err) => {
        serialPort = null;
        resolve();
      });
    });
  }
  app.quit();
});

// IPC handlers
ipcMain.handle('list-serial-ports', async () => {
  return await SerialPort.list();
});

ipcMain.handle('open-serial-port', async (event, portPath, baudRate) => {
  if (serialPort) {
    await new Promise((resolve) => {
      serialPort.close((err) => {
        serialPort = null;
        resolve();
      });
    });
  }
  try {
    serialPort = new SerialPort({ path: portPath, baudRate: baudRate || 115200 });
    parser = serialPort.pipe(new ReadlineParser({ delimiter: '\n' }));
    parser.on('data', (data) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('serial-data', data.trim());
      }
    });
    serialPort.on('error', (err) => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('serial-data', `Erreur port série: ${err.message}`);
      }
    });
  } catch (err) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('serial-data', `Erreur ouverture port: ${err.message}`);
    }
    throw err;
  }
});

ipcMain.handle('close-serial-port', async () => {
  if (serialPort) {
    await new Promise((resolve) => {
      serialPort.close((err) => {
        serialPort = null;
        resolve();
      });
    });
  }
});

ipcMain.handle('send-serial-data', async (event, data) => {
  if (serialPort && serialPort.isOpen) {
    serialPort.write(data, (err) => {
      if (err) {
        mainWindow.webContents.send('serial-data', `Erreur envoi: ${err.message}`);
      }
    });
  }
}); 