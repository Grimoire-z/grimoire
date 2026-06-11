const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('grimoire', {
  platform: process.platform,
  isElectron: true,
  getVersion:                ()    => ipcRenderer.invoke('get-version'),
  checkForUpdate:            ()    => ipcRenderer.invoke('check-for-update'),
  downloadAndInstall:        (asset) => ipcRenderer.invoke('download-and-install', asset),
  openExternal:              (url) => ipcRenderer.invoke('open-external', url),
  importMonsterFrom5etools:  (url)  => ipcRenderer.invoke('import-monster-from-5etools', url),
  importMonsterFromJson:     (text) => ipcRenderer.invoke('import-monster-from-json', text),
  refreshCharacterFromDdb:   (url)  => ipcRenderer.invoke('refresh-character-from-ddb', url),
  writeSnapshot:             (json) => ipcRenderer.invoke('write-snapshot', json),
  listSnapshots:             ()     => ipcRenderer.invoke('list-snapshots'),
  readSnapshot:              (name) => ipcRenderer.invoke('read-snapshot', name),
  onDownloadProgress: (cb) => {
    const listener = (_e, data) => cb(data);
    ipcRenderer.on('update-download-progress', listener);
    return () => ipcRenderer.removeListener('update-download-progress', listener);
  },
});
