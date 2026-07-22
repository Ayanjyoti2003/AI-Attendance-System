const { contextBridge, ipcRenderer } = require("electron");

// Expose a safe, minimal API to the renderer process
contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  isElectron: true,
  minimize: () => ipcRenderer.send("window-minimize"),
  maximize: () => ipcRenderer.send("window-maximize"),
  unmaximize: () => ipcRenderer.send("window-unmaximize"),
  close: () => ipcRenderer.send("window-close"),
  isMaximized: () => ipcRenderer.invoke("window-is-maximized"),
  showSystemMenu: (x, y) => ipcRenderer.send("window-system-menu", { x, y }),
  onMaximizedChange: (callback) => {
    const listener = (event, isMaximized) => callback(isMaximized);
    ipcRenderer.on("window-maximized-change", listener);
    return () => ipcRenderer.removeListener("window-maximized-change", listener);
  }
});
