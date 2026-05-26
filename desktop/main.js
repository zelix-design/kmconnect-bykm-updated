// FinFlow Desktop — Electron main process
//
// Loads the deployed Vercel URL by default (zero-build releases).
// You can switch to LOAD_LOCAL=true to ship a fully offline desktop build
// that bundles ../frontend/build/index.html.

const { app, BrowserWindow, shell, Menu } = require("electron");
const path = require("path");

const APP_URL = process.env.FINFLOW_URL || "https://finflow-by-km-updated-2-mp4p.vercel.app";
const LOAD_LOCAL = process.env.LOAD_LOCAL === "true";

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: "#fff7ed",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    icon: path.join(__dirname, "icons", process.platform === "darwin" ? "icon.icns" : "icon.png"),
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  if (LOAD_LOCAL) {
    win.loadFile(path.join(__dirname, "..", "frontend", "build", "index.html"));
  } else {
    win.loadURL(APP_URL);
  }

  win.once("ready-to-show", () => win.show());

  // Open external links (auth pop-ups, PDF, GitHub etc.) in the user's browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  win.webContents.on("will-navigate", (event, navUrl) => {
    const u = new URL(navUrl);
    const current = new URL(LOAD_LOCAL ? "file://" : APP_URL);
    if (u.host !== current.host && u.protocol !== "file:") {
      event.preventDefault();
      shell.openExternal(navUrl);
    }
  });
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [{
          label: app.name,
          submenu: [
            { role: "about" },
            { type: "separator" },
            { role: "services" },
            { type: "separator" },
            { role: "hide" }, { role: "hideOthers" }, { role: "unhide" },
            { type: "separator" },
            { role: "quit" },
          ],
        }]
      : []),
    {
      label: "File",
      submenu: [isMac ? { role: "close" } : { role: "quit" }],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" }, { role: "redo" }, { type: "separator" },
        { role: "cut" }, { role: "copy" }, { role: "paste" },
        { role: "selectAll" },
      ],
    },
    {
      label: "View",
      submenu: [
        { role: "reload" }, { role: "forceReload" }, { type: "separator" },
        { role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    {
      label: "Window",
      submenu: [{ role: "minimize" }, { role: "zoom" }, { role: "close" }],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
