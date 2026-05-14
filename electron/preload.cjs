const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('grimoire', {
  platform: process.platform,
  isElectron: true,
  getVersion:         ()      => ipcRenderer.invoke('get-version'),
  checkForUpdate:     ()      => ipcRenderer.invoke('check-for-update'),
  downloadAndInstall: (asset) => ipcRenderer.invoke('download-and-install', asset),
  openExternal:       (url)   => ipcRenderer.invoke('open-external', url),
  onDownloadProgress: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('update-download-progress', listener);
    return () => ipcRenderer.removeListener('update-download-progress', listener);
  },
});
