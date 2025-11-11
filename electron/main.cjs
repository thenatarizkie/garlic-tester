const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

let serverProcess;
let mainWindow;

// Start the Express server
function startServer() {
  return new Promise((resolve, reject) => {
    console.log("Starting Express server...");

    // Determine the correct path to server.js
    // In development: __dirname is electron/
    // In production: __dirname is resources/app.asar/electron/ or resources/app/electron/
    const isDev = !app.isPackaged;
    const serverPath = isDev
      ? path.join(__dirname, "..", "server.js")
      : path.join(process.resourcesPath, "app", "server.js");

    console.log("Server path:", serverPath);
    console.log("Is Development:", isDev);
    console.log("Resources path:", process.resourcesPath);

    // Start server process
    serverProcess = spawn("node", [serverPath], {
      stdio: "pipe",
      env: { ...process.env, NODE_ENV: "production" },
    });

    serverProcess.stdout.on("data", (data) => {
      console.log(`Server: ${data}`);
      // Check if server is ready
      if (data.toString().includes("Server running")) {
        resolve();
      }
    });

    serverProcess.stderr.on("data", (data) => {
      console.error(`Server Error: ${data}`);
    });

    serverProcess.on("error", (error) => {
      console.error("Failed to start server:", error);
      reject(error);
    });

    serverProcess.on("close", (code) => {
      console.log(`Server process exited with code ${code}`);
    });

    // Resolve after 2 seconds even if we don't see the message
    setTimeout(resolve, 2000);
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load the app from localhost
  mainWindow.loadURL("http://localhost:3005");

  // Open DevTools for debugging (uncomment if needed)
  // mainWindow.webContents.openDevTools();

  // Handle loading errors
  mainWindow.webContents.on(
    "did-fail-load",
    (event, errorCode, errorDescription) => {
      console.error("Failed to load:", errorCode, errorDescription);
    }
  );

  mainWindow.on("closed", function () {
    mainWindow = null;
  });
}

// Initialize the app
app.whenReady().then(async () => {
  try {
    await startServer();
    console.log("Server started successfully");
    createWindow();
  } catch (error) {
    console.error("Failed to start server:", error);
    app.quit();
  }
});

// Quit when all windows are closed
app.on("window-all-closed", () => {
  // Kill the server process
  if (serverProcess) {
    serverProcess.kill();
  }

  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

// Cleanup on exit
app.on("before-quit", () => {
  if (serverProcess) {
    serverProcess.kill();
  }
});
