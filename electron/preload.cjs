const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('fluxivora', Object.freeze({
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (payload) => ipcRenderer.invoke('project:save', payload),
  openImage: () => ipcRenderer.invoke('image:open'),
  exportFile: (payload) => ipcRenderer.invoke('file:export', payload),
  readRecovery: () => ipcRenderer.invoke('recovery:read'),
  writeRecovery: (payload) => ipcRenderer.invoke('recovery:write', payload),
  clearRecovery: () => ipcRenderer.invoke('recovery:clear'),
  onPrepareClose: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = () => callback();
    ipcRenderer.on('app:prepare-close', listener);
    return () => ipcRenderer.removeListener('app:prepare-close', listener);
  },
  confirmClose: () => ipcRenderer.send('app:close-prepared')
}));
