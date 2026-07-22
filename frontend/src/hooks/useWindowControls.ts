import { useState, useEffect } from "react";

export function useWindowControls() {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // Initial state check
    if (window.electronAPI?.isMaximized) {
      window.electronAPI.isMaximized().then(setIsMaximized).catch(console.error);
    }

    // Subscribe to maximize/restore event updates
    if (window.electronAPI?.onMaximizedChange) {
      const unsubscribe = window.electronAPI.onMaximizedChange((maximized: boolean) => {
        setIsMaximized(maximized);
      });
      return unsubscribe;
    }
  }, []);

  const minimize = () => {
    window.electronAPI?.minimize();
  };

  const maximize = () => {
    window.electronAPI?.maximize();
  };

  const restore = () => {
    window.electronAPI?.unmaximize();
  };

  const close = () => {
    window.electronAPI?.close();
  };

  const showSystemMenu = (clientX: number, clientY: number) => {
    window.electronAPI?.showSystemMenu(clientX, clientY);
  };

  return {
    isMaximized,
    minimize,
    maximize,
    restore,
    close,
    showSystemMenu,
    isElectron: !!window.electronAPI?.isElectron,
    platform: window.electronAPI?.platform || "web"
  };
}
