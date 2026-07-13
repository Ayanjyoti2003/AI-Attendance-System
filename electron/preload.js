const { contextBridge } = require("electron");

// Expose a safe, minimal API to the renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  isElectron: true,
});
