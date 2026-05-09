const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('grimoire', {
  platform: process.platform,
  isElectron: true,
});
