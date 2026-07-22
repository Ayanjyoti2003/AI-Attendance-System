export {};

declare global {
  interface Window {
    electronAPI?: {
      platform: string;
      isElectron: boolean;
      minimize: () => void;
      maximize: () => void;
      unmaximize: () => void;
      close: () => void;
      isMaximized: () => Promise<boolean>;
      showSystemMenu: (x: number, y: number) => void;
      onMaximizedChange: (callback: (isMaximized: boolean) => void) => () => void;
    };
  }
}
