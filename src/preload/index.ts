import { contextBridge, ipcRenderer } from 'electron';

// Define API object to expose to the renderer
contextBridge.exposeInMainWorld('electron', {
  // Core IPC functions
  ipc: {
    send: (channel: string, ...args: any[]) => {
      ipcRenderer.send(channel, ...args);
    },
    on: (channel: string, listener: (...args: any[]) => void) => {
      ipcRenderer.on(channel, (_, ...args) => listener(...args));
      return () => ipcRenderer.removeListener(channel, listener);
    },
    once: (channel: string, listener: (...args: any[]) => void) => {
      ipcRenderer.once(channel, (_, ...args) => listener(...args));
    },
    invoke: (channel: string, ...args: any[]): Promise<any> => {
      return ipcRenderer.invoke(channel, ...args);
    }
  },
  
  // Auth related functions
  auth: {
    signUp: (username: string, password: string, email: string) => 
      ipcRenderer.invoke('auth:signUp', { username, password, email }),
    
    signIn: (username: string, password: string) => 
      ipcRenderer.invoke('auth:signIn', { username, password }),
    
    signOut: () => 
      ipcRenderer.invoke('auth:signOut'),
    
    confirmSignUp: (username: string, code: string) => 
      ipcRenderer.invoke('auth:confirmSignUp', { username, code }),
    
    getStatus: () => 
      ipcRenderer.invoke('auth:getStatus')
  },
  
  // Database related functions
  db: {
    getRedactedCount: () => 
      ipcRenderer.invoke('db:getRedactedCount'),
    
    getSessionStats: () => 
      ipcRenderer.invoke('db:getSessionStats')
  },
  
  // System related functions
  system: {
    getAppVersion: () => 
      ipcRenderer.invoke('system:getAppVersion'),
    
    onUpdateAvailable: (callback: (info: any) => void) => {
      const listener = (_: any, info: any) => callback(info);
      ipcRenderer.on('system:updateAvailable', listener);
      return () => ipcRenderer.removeListener('system:updateAvailable', listener);
    },
    
    onUpdateDownloaded: (callback: (info: any) => void) => {
      const listener = (_: any, info: any) => callback(info);
      ipcRenderer.on('system:updateDownloaded', listener);
      return () => ipcRenderer.removeListener('system:updateDownloaded', listener);
    }
  },
  
  // App stats and points
  stats: {
    onPointsUpdate: (callback: (points: number) => void) => {
      const listener = (_: any, points: number) => callback(points);
      ipcRenderer.on('stats:pointsUpdate', listener);
      return () => ipcRenderer.removeListener('stats:pointsUpdate', listener);
    }
  }
});
