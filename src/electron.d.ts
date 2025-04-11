   // src/electron.d.ts
   interface ElectronAPI {
    ipc: {
      send: (channel: string, ...args: any[]) => void;
      on: (channel: string, listener: (...args: any[]) => void) => () => void;
      once: (channel: string, listener: (...args: any[]) => void) => void;
      invoke: (channel: string, ...args: any[]) => Promise<any>;
    };
    auth: {
      signIn: (username: string, password: string) => Promise<{ message: string }>;
      signUp: (username: string, password: string, email: string) => Promise<{ message: string }>;
      signOut: () => Promise<void>;
      confirmSignUp: (username: string, code: string) => Promise<string>;
      getStatus: () => Promise<any>;
    };
    db: {
      getRedactedCount: () => Promise<number>;
      getSessionStats: () => Promise<any>;
    };
    system: {
      getAppVersion: () => Promise<string>;
      onUpdateAvailable: (callback: (info: any) => void) => () => void;
      onUpdateDownloaded: (callback: (info: any) => void) => () => void;
    };
    stats: {
      onPointsUpdate: (callback: (points: number) => void) => () => void;
    };
  }

  interface Window {
    electron: ElectronAPI;
  }

