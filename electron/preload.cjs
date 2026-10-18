const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('fluxivora', Object.freeze({
  openProject: () => ipcRenderer.invoke('project:open'),
  saveProject: (payload) => ipcRenderer.invoke('project:save', payload),
  openImage: () => ipcRenderer.invoke('image:open'),
  exportFile: (payload) => ipcRenderer.invoke('file:export', payload),
  beginVideoRender: (payload) => ipcRenderer.invoke('video:begin-render', payload),
  writeVideoFrame: (payload) => ipcRenderer.invoke('video:write-frame', payload),
  writeVideoAudio: (payload) => ipcRenderer.invoke('video:write-audio', payload),
  finishVideoRender: (payload) => ipcRenderer.invoke('video:finish-render', payload),
  cancelVideoRender: (payload) => ipcRenderer.invoke('video:cancel-render', payload),
  chooseVideoProxyDirectory: () => ipcRenderer.invoke('video:choose-proxy-directory'),
  decodeAudioForSync: (file) => {
    let sourcePath = '';
    try { sourcePath = webUtils.getPathForFile(file); } catch (_) {}
    if (!sourcePath) return Promise.reject(new Error('Selecteer een videobestand dat op schijf staat; dit item heeft geen lokaal bronpad.'));
    return ipcRenderer.invoke('video:decode-audio-for-sync', { sourcePath });
  },
  createVideoProxyForFile: (file, options = {}) => {
    let sourcePath = '';
    try { sourcePath = webUtils.getPathForFile(file); } catch (_) {}
    if (!sourcePath) return Promise.reject(new Error('Selecteer een videobestand dat op schijf staat; dit item heeft geen lokaal bronpad.'));
    return ipcRenderer.invoke('video:create-proxy', {
      ...options,
      sourcePath,
      sourceName: typeof options.sourceName === 'string' ? options.sourceName : file.name
    });
  },
  cancelVideoProxy: (payload) => ipcRenderer.invoke('video:cancel-proxy', payload),
  readVideoProxyChunk: (payload) => ipcRenderer.invoke('video:read-proxy-chunk', payload),
  releaseVideoProxyRead: (payload) => ipcRenderer.invoke('video:release-proxy-read', payload),
  onVideoProxyProgress: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('video:proxy-progress', listener);
    return () => ipcRenderer.removeListener('video:proxy-progress', listener);
  },
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
