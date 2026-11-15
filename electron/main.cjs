// OpenCourse desktop shell (Electron).
//
// The same React app that Capacitor wraps for Android is loaded here in a
// desktop window. Nothing in src/ is desktop-specific, so whatever you build
// and test on your computer is exactly what ships to your phone with
// `npm run android`.
//
// Modes:
//   npm run desktop:dev   -> loads the Vite dev server (hot reload)
//   npm run desktop       -> builds, then loads dist/ through the app:// scheme
//   npm run desktop:dist  -> packages an installer into release/

const { app, BrowserWindow, protocol, net, shell, session, Menu } = require("electron");
const path = require("node:path");
const fs = require("node:fs");
const { pathToFileURL } = require("node:url");

const DEV_URL = process.env.OPENCOURSE_DEV_URL || "";
const DIST_DIR = path.join(__dirname, "..", "dist");

// Serve the built app from a custom, stable origin (app://opencourse).
// A fixed origin keeps localStorage (progress, notes, problem sets) across
// launches, and unlike file:// it lets fetch() load the bundled course JSON,
// PDFs and the Pyodide runtime.
const SCHEME = "app";
const HOST = "opencourse";
protocol.registerSchemesAsPrivileged([
  {
    scheme: SCHEME,
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true },
  },
]);

const MIME = {
  ".wasm": "application/wasm",
  ".mjs": "text/javascript",
  ".js": "text/javascript",
  ".json": "application/json",
  ".vtt": "text/vtt",
  ".webvtt": "text/vtt",
  ".srt": "text/plain; charset=utf-8",
  ".py": "text/plain; charset=utf-8",
};

function registerAppProtocol() {
  protocol.handle(SCHEME, async (request) => {
    const { pathname } = new URL(request.url);
    let rel = decodeURIComponent(pathname);
    if (rel === "/" || rel === "") rel = "/index.html";
    const file = path.normalize(path.join(DIST_DIR, rel));
    // Never serve anything outside dist/.
    if (!file.startsWith(DIST_DIR + path.sep)) return new Response("Forbidden", { status: 403 });
    if (!fs.existsSync(file)) return new Response("Not found", { status: 404 });
    const res = await net.fetch(pathToFileURL(file).toString());
    const type = MIME[path.extname(file).toLowerCase()];
    if (!type) return res;
    const headers = new Headers(res.headers);
    headers.set("Content-Type", type);
    return new Response(res.body, { status: res.status, headers });
  });
}

// YouTube refuses to play embeds that arrive without a web Referer (it shows
// "Error 153"). Give embed requests the same kind of referer a website would.
function fixYouTubeReferer() {
  const filter = { urls: ["https://*.youtube.com/*", "https://*.youtube-nocookie.com/*", "https://*.ytimg.com/*"] };
  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (details, cb) => {
    const headers = details.requestHeaders;
    if (!headers.Referer || !/^https?:/i.test(headers.Referer)) headers.Referer = "https://opencourse.local/";
    cb({ requestHeaders: headers });
  });
}

function isAppUrl(url) {
  return url.startsWith(`${SCHEME}://${HOST}/`) || (DEV_URL && url.startsWith(DEV_URL));
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 360,
    minHeight: 560,
    backgroundColor: "#0f1013",
    title: "OpenCourse",
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  // Links with target=_blank / window.open: web links go to the system
  // browser; bundled files (PDFs, code) open in their own app window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url) && !isAppUrl(url)) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    if (isAppUrl(url)) {
      return {
        action: "allow",
        overrideBrowserWindowOptions: { autoHideMenuBar: true, backgroundColor: "#0f1013" },
      };
    }
    return { action: "deny" };
  });

  // Never let the main window navigate away from the app itself.
  win.webContents.on("will-navigate", (e, url) => {
    if (isAppUrl(url)) return;
    e.preventDefault();
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
  });

  win.loadURL(DEV_URL || `${SCHEME}://${HOST}/index.html`);
  if (DEV_URL) win.webContents.openDevTools({ mode: "detach" });
  return win;
}

function buildMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac ? [{ role: "appMenu" }] : []),
    { role: "fileMenu" },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        {
          label: "Phone-size window",
          accelerator: "CmdOrCtrl+Shift+P",
          click: (_item, win) => win && win.setSize(412, 860),
        },
        {
          label: "Desktop-size window",
          accelerator: "CmdOrCtrl+Shift+D",
          click: (_item, win) => win && win.setSize(1280, 860),
        },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// Only one copy of the app at a time (a second launch focuses the first).
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(() => {
    if (!DEV_URL && !fs.existsSync(path.join(DIST_DIR, "index.html"))) {
      console.error("dist/ not found. Run `npm run build` first (or use `npm run desktop`).");
    }
    registerAppProtocol();
    fixYouTubeReferer();
    buildMenu();
    createWindow();
    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
}
