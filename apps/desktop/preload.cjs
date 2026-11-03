// Minimal, typed bridge between the sandboxed renderer and the main process.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  getServerUrl: () => ipcRenderer.invoke('server:get'),
  setServerUrl: (url) => ipcRenderer.invoke('server:set', url),
  getRefreshToken: () => ipcRenderer.invoke('token:get'),
  setRefreshToken: (t) => ipcRenderer.invoke('token:set', t),
  notify: (title, body) => ipcRenderer.invoke('notify', title, body),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  version: () => ipcRenderer.invoke('version'),
  checkForUpdates: () => ipcRenderer.invoke('update:check'),
});
