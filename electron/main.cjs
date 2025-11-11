const { app, BrowserWindow, Tray, Menu, dialog, nativeImage } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");

let serverProcess;
let garlicPlayerProcess;
let mainWindow;
let tray;

// Configuration file to store Garlic Player path
const configPath = path.join(app.getPath("userData"), "config.json");

// Function to load config
function loadConfig() {
  try {
    if (fs.existsSync(configPath)) {
      const data = fs.readFileSync(configPath, "utf8");
      return JSON.parse(data);
    }
  } catch (error) {
    console.error("Error loading config:", error);
  }
  return {};
}

// Function to save config
function saveConfig(config) {
  try {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error("Error saving config:", error);
  }
}

// Function to find installed Garlic Player
function findGarlicPlayer() {
  const possiblePaths = [
    // Common installation paths for Windows (including bin subdirectory)
    "C:\\Program Files\\garlic-player\\bin\\garlic-player.exe",
    "C:\\Program Files\\Garlic Player\\bin\\garlic-player.exe",
    "C:\\Program Files\\garlic-player\\garlic-player.exe",
    "C:\\Program Files\\Garlic Player\\garlic-player.exe",
    "C:\\Program Files (x86)\\garlic-player\\bin\\garlic-player.exe",
    "C:\\Program Files (x86)\\Garlic Player\\bin\\garlic-player.exe",
    "C:\\Program Files (x86)\\garlic-player\\garlic-player.exe",
    "C:\\Program Files (x86)\\Garlic Player\\garlic-player.exe",
    "C:\\Program Files\\smil\\bin\\garlic-player.exe",
    "C:\\Program Files\\smil\\garlic-player.exe",
    "C:\\Program Files (x86)\\smil\\bin\\garlic-player.exe",
    "C:\\Program Files (x86)\\smil\\garlic-player.exe",
    path.join(os.homedir(), "AppData", "Local", "Garlic Player", "bin", "garlic-player.exe"),
    path.join(os.homedir(), "AppData", "Local", "Garlic Player", "garlic-player.exe"),
    path.join(os.homedir(), "AppData", "Local", "Programs", "Garlic Player", "bin", "garlic-player.exe"),
    path.join(os.homedir(), "AppData", "Local", "Programs", "Garlic Player", "garlic-player.exe"),
  ];

  // Check each possible path
  for (const garlicPath of possiblePaths) {
    if (fs.existsSync(garlicPath)) {
      console.log("Found Garlic Player at:", garlicPath);
      return garlicPath;
    }
  }

  return null;
}

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

    // Resolve after 3 seconds to ensure server is fully ready
    setTimeout(resolve, 3000);
  });
}

// Start Garlic Player executable
async function startGarlicPlayer() {
  console.log("Starting Garlic Player...");

  // Load config to check if we have a saved path
  const config = loadConfig();
  let garlicPlayerPath = config.garlicPlayerPath;

  // If no saved path, try to auto-detect
  if (!garlicPlayerPath || !fs.existsSync(garlicPlayerPath)) {
    console.log("No saved Garlic Player path, attempting auto-detection...");
    garlicPlayerPath = findGarlicPlayer();

    // If still not found, ask user to select manually
    if (!garlicPlayerPath) {
      console.log("Garlic Player not found automatically, prompting user...");

      const result = await dialog.showMessageBox(mainWindow, {
        type: "warning",
        title: "Garlic Player Not Found",
        message: "Garlic Player executable not found. Please install Garlic Player first or select the executable manually.",
        buttons: ["Select Manually", "Install First", "Cancel"],
        defaultId: 0,
      });

      if (result.response === 0) {
        // User chose to select manually
        const fileResult = await dialog.showOpenDialog(mainWindow, {
          title: "Select Garlic Player Executable",
          filters: [{ name: "Executable", extensions: ["exe"] }],
          properties: ["openFile"],
        });

        if (!fileResult.canceled && fileResult.filePaths.length > 0) {
          garlicPlayerPath = fileResult.filePaths[0];
        } else {
          throw new Error("User cancelled Garlic Player selection");
        }
      } else if (result.response === 1) {
        // User chose to install first
        await dialog.showMessageBox(mainWindow, {
          type: "info",
          title: "Install Garlic Player",
          message:
            "Please install Garlic Player first, then restart this application.",
          buttons: ["OK"],
        });
        app.quit();
        return;
      } else {
        // User cancelled
        throw new Error("Garlic Player path not configured");
      }
    }

    // Save the path for future use
    if (garlicPlayerPath) {
      config.garlicPlayerPath = garlicPlayerPath;
      saveConfig(config);
      console.log("Saved Garlic Player path to config:", garlicPlayerPath);
    }
  }

  console.log("Using Garlic Player path:", garlicPlayerPath);

  // Validate that the file exists and is not an installer
  const stats = fs.statSync(garlicPlayerPath);
  const fileSizeMB = stats.size / (1024 * 1024);

  // If file is too small (< 0.5MB), it's likely an installer/script, not the actual app
  // Note: Some lightweight launchers can be small (0.5-2MB)
  if (fileSizeMB < 0.5) {
    console.warn(
      `Warning: Garlic Player executable seems very small (${fileSizeMB.toFixed(2)}MB), might be an installer`
    );

    const result = await dialog.showMessageBox(mainWindow, {
      type: "warning",
      title: "Possible Installer Detected",
      message: `The selected file (${fileSizeMB.toFixed(2)}MB) appears to be very small. Are you sure this is the correct Garlic Player application?`,
      buttons: ["Select Different File", "Continue Anyway"],
      defaultId: 1, // Default to Continue Anyway
    });

    if (result.response === 0) {
      // Clear saved path and retry
      config.garlicPlayerPath = null;
      saveConfig(config);
      return startGarlicPlayer(); // Recursive call
    }
  }

  return new Promise((resolve, reject) => {
    // Start Garlic Player process
    garlicPlayerProcess = spawn(garlicPlayerPath, [], {
      stdio: "pipe",
      detached: false,
    });

    garlicPlayerProcess.stdout.on("data", (data) => {
      console.log(`Garlic Player: ${data}`);
    });

    garlicPlayerProcess.stderr.on("data", (data) => {
      console.error(`Garlic Player Error: ${data}`);
    });

    garlicPlayerProcess.on("error", (error) => {
      console.error("Failed to start Garlic Player:", error);
      reject(error);
    });

    garlicPlayerProcess.on("close", (code) => {
      console.log(`Garlic Player process exited with code ${code}`);
      app.quit();
    });

    resolve();
  });
}

// Create system tray icon for background control
function createTray() {
  try {
    // Try to use icon from public folder, or create empty icon
    let trayIcon;
    const isDev = !app.isPackaged;

    let trayIconPath;
    if (isDev) {
      trayIconPath = path.join(__dirname, "..", "public", "icon.ico");
    } else {
      trayIconPath = path.join(process.resourcesPath, "app", "public", "icon.ico");
    }

    // Check if icon exists
    if (fs.existsSync(trayIconPath)) {
      console.log("Using tray icon from:", trayIconPath);
      trayIcon = nativeImage.createFromPath(trayIconPath);
    } else {
      console.log("Tray icon not found, creating default icon");
      // Create a simple empty icon (16x16 transparent)
      // This will show as a small icon in the system tray
      trayIcon = nativeImage.createEmpty();
    }

    // Create tray with icon (or empty icon)
    tray = new Tray(trayIcon);

    const contextMenu = Menu.buildFromTemplate([
      {
        label: "Garlic Player API Client",
        enabled: false,
      },
      { type: "separator" },
      {
        label: "Open Controller",
        click: () => {
          if (mainWindow) {
            mainWindow.show();
            mainWindow.focus();
          } else {
            createWindow();
            mainWindow.show();
          }
        },
      },
      {
        label: "Change Garlic Player Path",
        click: async () => {
          const config = loadConfig();
          config.garlicPlayerPath = null;
          saveConfig(config);

          const result = await dialog.showMessageBox(mainWindow, {
            type: "info",
            title: "Path Reset",
            message:
              "Garlic Player path has been reset. Please restart the application to select a new path.",
            buttons: ["Restart Now", "Restart Later"],
          });

          if (result.response === 0) {
            app.relaunch();
            app.quit();
          }
        },
      },
      {
        label: "Restart Garlic Player",
        click: async () => {
          if (garlicPlayerProcess) {
            garlicPlayerProcess.kill();
            // Wait a bit before restarting
            setTimeout(async () => {
              try {
                await startGarlicPlayer();
              } catch (error) {
                console.error("Failed to restart Garlic Player:", error);
              }
            }, 1000);
          }
        },
      },
      { type: "separator" },
      {
        label: "Quit",
        click: () => {
          app.quit();
        },
      },
    ]);

    tray.setToolTip("Garlic Player API Client");
    tray.setContextMenu(contextMenu);

    // Double click to show controller
    tray.on("double-click", () => {
      if (mainWindow) {
        mainWindow.show();
        mainWindow.focus();
      }
    });

    console.log("System tray created successfully");
  } catch (error) {
    console.error("Failed to create tray:", error);
  }
}

function createWindow() {
  // Create a hidden window that runs in background
  // The window won't be shown unless explicitly requested
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false, // Don't show window by default
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  // Load the app from localhost
  mainWindow.loadURL("http://localhost:3005");

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
    // Step 1: Start the Express server in background
    await startServer();
    console.log("Server started successfully");

    // Step 2: Create hidden window (for maintaining server context)
    createWindow();

    // Step 3: Create system tray icon for background control
    createTray();

    // Step 4: Launch Garlic Player as the primary visible app
    await startGarlicPlayer();
    console.log("Garlic Player started successfully");
  } catch (error) {
    console.error("Failed to start application:", error);
    app.quit();
  }
});

// Quit when all windows are closed
app.on("window-all-closed", () => {
  // Don't quit the app when all windows are closed
  // Keep running in background with system tray
  // User can quit from the tray menu
  console.log("All windows closed, running in background with system tray");
});

app.on("activate", () => {
  // On macOS, recreate window if needed
  if (mainWindow === null) {
    createWindow();
  }
});

// Cleanup on exit - kill all child processes
app.on("before-quit", () => {
  console.log("Cleaning up processes...");

  if (garlicPlayerProcess) {
    console.log("Killing Garlic Player process...");
    garlicPlayerProcess.kill();
  }

  if (serverProcess) {
    console.log("Killing server process...");
    serverProcess.kill();
  }
});
