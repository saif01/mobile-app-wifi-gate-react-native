/**
 * Local Play Store bundle: run after `npx expo prebuild --platform android`.
 * Uses Android Studio JBR on Windows when the default JDK is unsupported (e.g. Java 25).
 */
const { spawnSync } = require("child_process");
const path = require("path");
const fs = require("fs");

const root = path.join(__dirname, "..");
const androidDir = path.join(root, "android");

function preferAndroidStudioJbr() {
  if (process.platform !== "win32") return;
  const jbr = path.join(
    process.env["ProgramFiles"] || "C:\\Program Files",
    "Android",
    "Android Studio",
    "jbr"
  );
  const javaExe = path.join(jbr, "bin", "java.exe");
  if (!fs.existsSync(javaExe)) return;
  const cur = process.env.JAVA_HOME || "";
  if (!cur || cur.includes("25")) {
    process.env.JAVA_HOME = jbr;
  }
}

function ensureAndroidSdk() {
  if (process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT) return;
  if (process.platform === "win32" && process.env.LOCALAPPDATA) {
    const sdk = path.join(process.env.LOCALAPPDATA, "Android", "Sdk");
    if (fs.existsSync(sdk)) process.env.ANDROID_HOME = sdk;
  } else if (process.env.HOME) {
    const sdk = path.join(process.env.HOME, "Library", "Android", "sdk");
    if (fs.existsSync(sdk)) process.env.ANDROID_HOME = sdk;
  }
}

preferAndroidStudioJbr();
ensureAndroidSdk();

if (!fs.existsSync(androidDir)) {
  console.error(
    "Missing android/ folder. Run: npx expo prebuild --platform android"
  );
  process.exit(1);
}

const isWin = process.platform === "win32";
const result = isWin
  ? spawnSync("cmd.exe", ["/c", "gradlew.bat", "bundleRelease"], {
      cwd: androidDir,
      stdio: "inherit",
      env: process.env,
    })
  : spawnSync("./gradlew", ["bundleRelease"], {
      cwd: androidDir,
      stdio: "inherit",
      env: process.env,
    });

process.exit(result.status === null ? 1 : result.status);
