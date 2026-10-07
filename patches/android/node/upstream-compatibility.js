#!/usr/bin/env node
// Android-only adaptation of upstream prerelease/build-number update fixes.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../../..");
const target = path.join(root, "pokerogue-src");
fs.copyFileSync(path.join(root, "new-files/android/update-check-api.ts"),
  path.join(target, "src/system/offline/update-check-api.ts"));
const title = path.join(target, "src/ui/handlers/title-ui-handler.ts");
let source = fs.readFileSync(title, "utf8");
const oldCall = "checkForUpdates(SILVERSHADOW_VERSION)";
const newCall = "checkForUpdates(version, Number.parseInt(OFFLINE_BUILD_NUMBER, 10) || 0)";
if (!source.includes(oldCall) && !source.includes(newCall)) throw new Error("Update checker anchor changed");
source = source.replace(oldCall, newCall);
fs.writeFileSync(title, source);
console.log("Applied Android upstream update compatibility");
