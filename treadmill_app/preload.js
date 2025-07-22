const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  listSerialPorts: () => ipcRenderer.invoke('list-serial-ports'),
  openSerialPort: (port, baudRate) => ipcRenderer.invoke('open-serial-port', port, baudRate),
  closeSerialPort: () => ipcRenderer.invoke('close-serial-port'),
  onSerialData: (callback) => ipcRenderer.on('serial-data', (event, data) => callback(data)),
  sendSerialData: (data) => ipcRenderer.invoke('send-serial-data', data),
}); 