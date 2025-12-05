import { app, BrowserWindow } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Estructura de carpetas en build:
//
//  ├─ dist
//  │   └── index.html
//  ├─ dist-electron
//  │   ├── main.js
//  │   └── preload.mjs
//  └─ build
//      └── icon.ico
//
process.env.APP_ROOT = path.join(__dirname, "..");

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
export const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
export const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, "public")
  : RENDERER_DIST;

let win: BrowserWindow | null = null;

function createWindow() {
  win = new BrowserWindow({
    width: 1000,
    height: 700,
    title: "Retail Cash Manager",
    // Icono de la app (tanto en dev como en build)
    icon: path.join(process.env.APP_ROOT || __dirname, "build", "icon.ico"),
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
    },
  });

  // Mensaje de prueba al renderer
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", new Date().toLocaleString());
  });

  if (VITE_DEV_SERVER_URL) {
    // Modo desarrollo: Vite dev server
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    // Modo producción: HTML ya compilado
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}

// Cerrar app cuando se cierran todas las ventanas (menos en macOS)
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(createWindow);
