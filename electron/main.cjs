const {
  app,
  BrowserWindow,
  ipcMain,
  session,
  desktopCapturer,
  safeStorage,
  shell,
  dialog,
  protocol,
  net,
  nativeImage,
} = require("electron");
const { pathToFileURL } = require("node:url");
const path = require("node:path");
const fs = require("node:fs/promises");
const { StreamEngine, validateConfig } = require("./engine.cjs");
const { ChatHub } = require("./chat.cjs");
const ffmpeg = require("ffmpeg-static").replace(
  "app.asar",
  "app.asar.unpacked",
);
let win,
  engine,
  selectedSource,
  hardware,
  closing = false;
const rendererRoot = path.resolve(__dirname, "../dist");
protocol.registerSchemesAsPrivileged([
  {
    scheme: "xtreem",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      stream: true,
    },
  },
]);
const trusted = (e) => {
  if (
    !win ||
    e.sender !== win.webContents ||
    e.senderFrame !== win.webContents.mainFrame ||
    e.senderFrame.origin !== "xtreem://studio"
  )
    throw Error("Untrusted request.");
};
function handle(name, fn) {
  ipcMain.handle(name, (e, ...args) => {
    trusted(e);
    return fn(...args);
  });
}
app.whenReady().then(async () => {
  const chat = new ChatHub();
  chat.on("event", (event) => {
    if (win && !win.isDestroyed()) win.webContents.send("chat:event", event);
  });
  handle("chat:connect", (input) => chat.connect(input));
  handle("chat:disconnect", (provider) => chat.disconnect(provider));
  app.on("before-quit", () => chat.close());
  protocol.handle("xtreem", (request) => {
    const url = new URL(request.url);
    if (url.hostname !== "studio")
      return new Response("Not found", { status: 404 });
    const relative =
      decodeURIComponent(url.pathname).replace(/^\/+/, "") || "index.html";
    const file = path.resolve(rendererRoot, relative);
    if (!file.startsWith(rendererRoot + path.sep))
      return new Response("Forbidden", { status: 403 });
    return net.fetch(pathToFileURL(file).toString());
  });
  engine = new StreamEngine(ffmpeg);
  const folder = path.join(app.getPath("videos"), "X-treem");
  await fs.mkdir(folder, { recursive: true });
  const settingsFile = path.join(
    app.getPath("userData"),
    "studio-settings.enc",
  );
  handle("settings:load", async () => {
    try {
      return JSON.parse(
        (await safeStorage.decryptStringAsync(await fs.readFile(settingsFile)))
          .result,
      );
    } catch {
      return null;
    }
  });
  handle("settings:save", async (data) => {
    if (!(await safeStorage.isAsyncEncryptionAvailable()))
      throw Error(
        "Windows secure storage is unavailable. Settings were not saved.",
      );
    const raw = JSON.stringify(data);
    if (raw.length > 4000000)
      throw Error("Settings are too large. Use a smaller background image.");
    await fs.writeFile(settingsFile, await safeStorage.encryptStringAsync(raw));
    return true;
  });
  handle("hardware", async () => {
    hardware = await engine.detect();
    return { encoders: hardware, gpu: app.getGPUFeatureStatus() };
  });
  handle("sources", async () => {
    const sources = await desktopCapturer.getSources({
      types: ["screen", "window"],
      thumbnailSize: { width: 320, height: 180 },
    });
    return sources.map((s) => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
    }));
  });
  handle("source:select", (id) => {
    selectedSource = id;
  });
  session.defaultSession.setDisplayMediaRequestHandler(
    async (request, callback) => {
      if (request.frame !== win.webContents.mainFrame) {
        callback({});
        return;
      }
      const sources = await desktopCapturer.getSources({
        types: ["screen", "window"],
      });
      const source = sources.find((s) => s.id === selectedSource);
      selectedSource = null;
      callback(source ? { video: source } : {});
    },
  );
  session.defaultSession.setPermissionRequestHandler(
    (wc, permission, callback) =>
      callback(
        wc === win?.webContents &&
          ["media", "display-capture", "speaker-selection"].includes(
            permission,
          ),
      ),
  );
  session.defaultSession.setPermissionCheckHandler(
    (wc, permission) =>
      wc === win?.webContents &&
      ["media", "display-capture", "speaker-selection"].includes(permission),
  );
  handle("stream:start", async (input) => {
    const c = validateConfig(input);
    hardware = hardware || (await engine.detect());
    const available = hardware.filter((e) => e.available).map((e) => e.name);
    c.encoder = c.encoder === "auto" ? available[0] : c.encoder;
    if (!available.includes(c.encoder))
      throw Error("This encoder is unavailable. Select Auto or Software.");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const paths = Object.fromEntries(
      c.orientations.map((o) => [o, path.join(folder, `${stamp}-${o}.mkv`)]),
    );
    engine.start(c, paths);
    return { encoder: c.encoder, paths: c.record ? paths : {} };
  });
  handle("stream:chunk", (o, b) => engine.write(o, b));
  handle("stream:stop", () => engine.stop());
  handle("recordings:open", () => shell.openPath(folder));
  handle("snapshot:save", async (orientation, data) => {
    if (
      !["landscape", "portrait"].includes(orientation) ||
      typeof data !== "string" ||
      data.length > 20 * 1024 * 1024 ||
      !/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(data)
    )
      throw Error("Invalid snapshot.");
    const image = nativeImage.createFromDataURL(data);
    const size = image.getSize();
    if (image.isEmpty() || size.width > 1920 || size.height > 1920)
      throw Error("Invalid snapshot size.");
    const { canceled, filePath } = await dialog.showSaveDialog(win, {
      title: "Save preview snapshot",
      defaultPath: path.join(
        app.getPath("pictures"),
        `X-treem-${orientation}-${Date.now()}.png`,
      ),
      filters: [{ name: "PNG image", extensions: ["png"] }],
    });
    if (canceled || !filePath) return null;
    await fs.writeFile(filePath, image.toPNG());
    return filePath;
  });
  engine.on("status", (s) => {
    if (win && !win.isDestroyed()) win.webContents.send("stream:status", s);
  });
  win = new BrowserWindow({
    width: 1500,
    height: 980,
    minWidth: 1100,
    minHeight: 760,
    backgroundColor: "#101218",
    title: "X-treem Studio",
    icon: path.join(__dirname, "../build/icon.png"),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("render-process-gone", () => {
    void engine.stop();
  });
  win.webContents.on("will-navigate", (e) => e.preventDefault());
  win.on("close", async (e) => {
    if (closing || !engine.jobs.size) return;
    e.preventDefault();
    const { response } = await dialog.showMessageBox(win, {
      type: "question",
      buttons: ["Keep streaming", "End session and close"],
      defaultId: 0,
      cancelId: 0,
      message: "End this streaming session?",
    });
    if (response === 1) {
      await engine.stop();
      closing = true;
      win.close();
    }
  });
  await win.loadURL("xtreem://studio/index.html");
});
app.on("window-all-closed", () => app.quit());
