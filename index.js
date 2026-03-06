const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const https = require("https");

const RESTART_DELAY = 2000;

const platformMap = {
  linux: "tct-linux",
  win32: "tct-windows.exe",
  darwin: "tct-macos"
};

const binaryName = platformMap[process.platform] || "tct-linux";
const programPath = path.join(__dirname, binaryName);

const DOWNLOAD_URL =
  `https://github.com/i-tct/tct/releases/latest/download/${binaryName}`;

function downloadBinary(url = DOWNLOAD_URL) {
  return new Promise((resolve, reject) => {

    // If file exists and isn't empty, skip download
    if (fs.existsSync(programPath)) {
      const stats = fs.statSync(programPath);

      if (stats.size > 100000) {
        return resolve();
      }

      console.log("Binary is corrupted. Re-downloading...");
      fs.unlinkSync(programPath);
    }

    console.log("Downloading binary...");

    https.get(url, (res) => {

      // Follow GitHub redirects
      if (res.statusCode === 301 || res.statusCode === 302) {
        return downloadBinary(res.headers.location)
          .then(resolve)
          .catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`Download failed: ${res.statusCode}`));
      }

      const file = fs.createWriteStream(programPath);

      res.pipe(file);

      file.on("finish", () => {
        file.close(() => {

          try {
            if (process.platform !== "win32") {
              fs.chmodSync(programPath, 0o755);
            }
          } catch {}

          console.log("Binary downloaded successfully.");
          resolve();
        });
      });

      file.on("error", (err) => {
        fs.unlink(programPath, () => reject(err));
      });

    }).on("error", reject);

  });
}

let child = null;

function start() {

  try {
    if (process.platform !== "win32") {
      fs.chmodSync(programPath, 0o755);
    }
  } catch {}

  console.log("Starting TCT...");

  child = spawn(programPath, [], {
    stdio: "inherit"
  });

  child.on("close", (code) => {
    console.log(`Process exited with code ${code}`);
    restart();
  });

  child.on("error", (err) => {
    console.error("Failed to start:", err);
    restart();
  });
}

function restart() {
  console.log(`Restarting in ${RESTART_DELAY / 1000}s...\n`);
  setTimeout(start, RESTART_DELAY);
}

async function main() {

  try {
    await downloadBinary();
    start();
  } catch (err) {
    console.error("Startup failed:", err);
    process.exit(1);
  }

}

function shutdown() {

  console.log("\nShutting down...");

  if (child) {
    child.kill("SIGTERM");
  }

  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

main();
