const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("studio", {
  load: () => ipcRenderer.invoke("settings:load"),
  save: (c) => ipcRenderer.invoke("settings:save", c),
  hardware: () => ipcRenderer.invoke("hardware"),
  sources: () => ipcRenderer.invoke("sources"),
  selectSource: (id) => ipcRenderer.invoke("source:select", id),
  start: (c) => ipcRenderer.invoke("stream:start", c),
  chunk: (o, b) => ipcRenderer.invoke("stream:chunk", o, b),
  stop: () => ipcRenderer.invoke("stream:stop"),
  recordings: () => ipcRenderer.invoke("recordings:open"),
  chatConnect: (c) => ipcRenderer.invoke("chat:connect", c),
  chatDisconnect: (p) => ipcRenderer.invoke("chat:disconnect", p),
  onChat: (fn) => {
    const h = (_, e) => fn(e);
    ipcRenderer.on("chat:event", h);
    return () => ipcRenderer.removeListener("chat:event", h);
  },
  onStatus: (fn) => {
    const handler = (_, s) => fn(s);
    ipcRenderer.on("stream:status", handler);
    return () => ipcRenderer.removeListener("stream:status", handler);
  },
});
