const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 360,
    height: 480,
    alwaysOnTop: true,
    transparent: true,
    frame: false,
    resizable: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  win.loadFile(path.join(__dirname, 'renderer.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {});
