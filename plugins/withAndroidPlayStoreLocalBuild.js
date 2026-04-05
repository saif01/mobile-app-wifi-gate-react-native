const fs = require("fs");
const path = require("path");
const {
  withDangerousMod,
  withGradleProperties,
  withAppBuildGradle,
} = require("@expo/config-plugins");

function upsertGradleProperty(modResults, key, value) {
  const idx = modResults.findIndex(
    (p) => p.type === "property" && p.key === key
  );
  const entry = { type: "property", key, value };
  if (idx >= 0) modResults[idx] = entry;
  else {
    modResults.push({ type: "empty" });
    modResults.push(entry);
  }
}

function withAndroidLocalProperties(config) {
  return withDangerousMod(config, [
    "android",
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const androidDir = path.join(projectRoot, "android");
      let sdk =
        process.env.ANDROID_HOME ||
        process.env.ANDROID_SDK_ROOT ||
        (process.platform === "win32" && process.env.LOCALAPPDATA
          ? path.join(process.env.LOCALAPPDATA, "Android", "Sdk")
          : path.join(process.env.HOME || "", "Library/Android/sdk"));
      if (sdk && fs.existsSync(sdk)) {
        fs.mkdirSync(androidDir, { recursive: true });
        const escaped = sdk.replace(/\\/g, "/");
        fs.writeFileSync(
          path.join(androidDir, "local.properties"),
          `sdk.dir=${escaped}\n`
        );
      }
      return cfg;
    },
  ]);
}

function withPlayReleaseSigningGradle(config) {
  return withAppBuildGradle(config, (cfg) => {
    let contents = cfg.modResults.contents;

    const propsBlock =
      "def keystorePlayProperties = new java.util.Properties()\n" +
      "def keystorePlayFile = rootProject.file(\"keystore.properties\")\n" +
      "if (keystorePlayFile.exists()) {\n" +
      "    keystorePlayProperties.load(new java.io.FileInputStream(keystorePlayFile))\n" +
      "}\n\n";

    contents = contents.replace(
      /\ndef keystorePlayProperties = new java\.util\.Properties\(\)\ndef keystorePlayFile = rootProject\.file\("keystore\.properties"\)\nif \(keystorePlayFile\.exists\(\)\) \{\n    keystorePlayProperties\.load\(new java\.io\.FileInputStream\(keystorePlayFile\)\)\n\}\n/,
      "\n"
    );

    const anchor = "    signingConfigs {\n        debug {";
    if (!contents.includes(anchor)) {
      cfg.modResults.contents = contents;
      return cfg;
    }

    const androidIdx = contents.indexOf("\nandroid {");
    if (androidIdx !== -1 && !contents.includes("keystorePlayFile = rootProject")) {
      contents =
        contents.slice(0, androidIdx + 1) +
        propsBlock +
        contents.slice(androidIdx + 1);
    } else if (!contents.includes("keystorePlayFile = rootProject")) {
      const androidIdx2 = contents.indexOf("android {");
      if (androidIdx2 !== -1) {
        contents =
          contents.slice(0, androidIdx2) +
          propsBlock +
          contents.slice(androidIdx2);
      }
    }

    contents = contents.replace(
      `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
    }`,
      `    signingConfigs {
        debug {
            storeFile file('debug.keystore')
            storePassword 'android'
            keyAlias 'androiddebugkey'
            keyPassword 'android'
        }
        release {
            if (keystorePlayFile.exists()) {
                storeFile file(keystorePlayProperties['storeFile'])
                storePassword keystorePlayProperties['storePassword']
                keyAlias keystorePlayProperties['keyAlias']
                keyPassword keystorePlayProperties['keyPassword']
            }
        }
    }`
    );

    contents = contents.replace(
      /signingConfig keystorePlayFile\.exists\(\) \? signingConfigs\.release : signingConfigs\.debug\n(            def enableShrinkResources)/,
      "signingConfig keystorePlayFile.exists() ? signingConfigs.release : signingConfigs.debug\n$1"
    );

    contents = contents.replace(
      /signingConfig signingConfigs\.debug\n(            def enableShrinkResources)/,
      "signingConfig keystorePlayFile.exists() ? signingConfigs.release : signingConfigs.debug\n$1"
    );

    const whenReadyBlock =
      "\n\ngradle.taskGraph.whenReady { graph ->\n" +
      "    def wantsReleaseBinary = graph.allTasks.any { t ->\n" +
      "        t.name == \"bundleRelease\" || t.name == \"assembleRelease\"\n" +
      "    }\n" +
      "    if (wantsReleaseBinary && !keystorePlayFile.exists()) {\n" +
      "        throw new GradleException(\"WiFiGate Play: missing android/keystore.properties. Put your upload .jks in android/app/, then npm run android:bundle:release:fresh or powershell -File scripts/create-play-keystore.ps1\")\n" +
      "    }\n" +
      "}\n";

    if (!contents.includes("gradle.taskGraph.whenReady")) {
      contents = contents.replace(
        /\}\r?\n\r?\n\/\/ Apply static values from `gradle\.properties`/,
        "}" + whenReadyBlock + "\n// Apply static values from `gradle.properties`"
      );
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

function withLocalGradleJvmAndJbr(config) {
  return withGradleProperties(config, (cfg) => {
    upsertGradleProperty(
      cfg.modResults,
      "org.gradle.jvmargs",
      "-Xmx4096m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError"
    );

    if (process.platform === "win32") {
      const jbr = path.join(
        process.env["ProgramFiles"] || "C:\\Program Files",
        "Android",
        "Android Studio",
        "jbr"
      );
      const javaExe = path.join(jbr, "bin", "java.exe");
      if (fs.existsSync(javaExe)) {
        upsertGradleProperty(
          cfg.modResults,
          "org.gradle.java.home",
          jbr.replace(/\\/g, "/")
        );
      }
    }
    return cfg;
  });
}

module.exports = function withAndroidPlayStoreLocalBuild(config) {
  config = withAndroidLocalProperties(config);
  config = withLocalGradleJvmAndJbr(config);
  config = withPlayReleaseSigningGradle(config);
  return config;
};
