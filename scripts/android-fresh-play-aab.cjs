/**
 * Deep clean + ensure Play upload keystore + bundleRelease.
 * For safety, this refuses to generate a brand-new upload keystore unless you
 * explicitly opt in with WIFIGATE_ALLOW_NEW_UPLOAD_KEY=1. Creating a fresh key
 * for an existing Play app will cause "signed with the wrong key" rejections.
 */
const { spawnSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const androidDir = path.join(root, "android");
const propsPath = path.join(androidDir, "keystore.properties");
const notePath = path.join(androidDir, ".play-signing-passwords.txt");
const allowNewUploadKey = process.env.WIFIGATE_ALLOW_NEW_UPLOAD_KEY === "1";

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
    env: process.env,
    ...opts,
  });
  if (r.status !== 0) process.exit(r.status ?? 1);
}

run(process.execPath, [path.join(__dirname, "android-deep-clean.cjs")]);

const hasProps = fs.existsSync(propsPath);
const jksPath = path.join(androidDir, "app", "upload-keystore.jks");
const hasJks = fs.existsSync(jksPath);

if (hasJks && !hasProps) {
  console.error(
    "Found android/app/upload-keystore.jks but missing android/keystore.properties.\n" +
      "Copy playstore-keystore.properties.example to android/keystore.properties and fill in passwords (UTF-8, no BOM)."
  );
  process.exit(1);
}
if (!hasJks && hasProps) {
  console.error(
    "android/keystore.properties exists but the .jks file is missing under android/app/.\n" +
      "Restore upload-keystore.jks or run create-play-keystore.ps1 with new passwords."
  );
  process.exit(1);
}

if (!hasProps && !hasJks) {
  if (!allowNewUploadKey) {
    console.error(
      "Missing Play signing files: android/keystore.properties and android/app/upload-keystore.jks.\n" +
        "For an EXISTING Play app, restore the original upload keystore instead of generating a new one.\n" +
        "Only generate a fresh upload key for a truly new Play app by re-running with:\n" +
        "  $env:WIFIGATE_ALLOW_NEW_UPLOAD_KEY='1'; npm run android:bundle:release:fresh"
    );
    process.exit(1);
  }
  const storePass = crypto.randomBytes(16).toString("base64url") + "Aa1!";
  const keyPass = crypto.randomBytes(16).toString("base64url") + "Bb2!";
  const ps1 = path.join(__dirname, "create-play-keystore.ps1");
  run("powershell.exe", [
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    ps1,
    "-StorePassword",
    storePass,
    "-KeyPassword",
    keyPass,
  ]);
  fs.writeFileSync(
    notePath,
    [
      "SAVE THESE PASSWORDS. Without the .jks + passwords you cannot ship updates.",
      "",
      `Store password: ${storePass}`,
      `Key password: ${keyPass}`,
      "",
      "Keystore: android/app/upload-keystore.jks",
      "",
    ].join("\n"),
    "utf8"
  );
  console.log(
    "\nCreated upload keystore for a NEW Play app only. Passwords saved to android/.play-signing-passwords.txt\n"
  );
}

run(process.execPath, [path.join(__dirname, "android-bundle-release.cjs")]);
console.log("\nAAB: android/app/build/outputs/bundle/release/app-release.aab\n");
