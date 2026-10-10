const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cameraApp', Object.freeze({
  setKey: key => ipcRenderer.invoke('key:set', key),
  clearKey: () => ipcRenderer.invoke('key:clear'),
  token: () => ipcRenderer.invoke('token:create'),
  system: () => ipcRenderer.invoke('system:status'),
  startVirtual: () => ipcRenderer.invoke('virtual:start'),
  stopVirtual: () => ipcRenderer.invoke('virtual:stop'),
  sendFrame: bytes => ipcRenderer.invoke('virtual:frame', bytes)
}));
