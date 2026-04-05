/**
 * Remove Android build outputs without running `gradlew clean` (avoids CMake/native clean failures on RN).
 */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const androidDir = path.join(root, "android");

function rm(p) {
  if (fs.existsSync(p)) {
    fs.rmSync(p, { recursive: true, force: true });
    console.log("Removed:", p);
  }
}

const androidOutputs = [
  path.join(androidDir, "app", "build"),
  path.join(androidDir, "build"),
  path.join(androidDir, "app", ".cxx"),
];

for (const p of androidOutputs) rm(p);

const nmBuilds = [
  ["react-native-reanimated", "android", "build"],
  ["react-native-worklets", "android", "build"],
  ["react-native-webview", "android", "build"],
  ["react-native-screens", "android", "build"],
  ["react-native-svg", "android", "build"],
  ["react-native-safe-area-context", "android", "build"],
  ["@react-native-async-storage", "async-storage", "android", "build"],
  ["@react-native-community", "netinfo", "android", "build"],
  ["expo-modules-core", "android", "build"],
  ["expo", "android", "build"],
  ["expo-constants", "android", "build"],
];

for (const parts of nmBuilds) {
  rm(path.join(root, "node_modules", ...parts));
}

console.log("Android deep clean done (no gradlew clean).");
