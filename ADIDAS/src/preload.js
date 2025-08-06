const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  // Config
  getConfig: () => ipcRenderer.invoke('get-config'),
  setConfig: (config) => ipcRenderer.invoke('set-config', config),

  // Serial communication
  onSerialMessage: (callback) => ipcRenderer.on('serial-message', (event, msg) => callback(msg)),
  setSerialInterval: (ms) => ipcRenderer.send('serial-set-interval', ms),

  // CSV data
  getCsvData: () => ipcRenderer.invoke('get-csv-data'),
  saveSessionRow: (sessionData) => ipcRenderer.invoke('save-session-row', sessionData),
}); 