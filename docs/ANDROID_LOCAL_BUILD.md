# Local Android main builds

`configs/android/upstream-lock.json` pins the reviewed game, assets, locales,
offline-fork review revision, main build number and expected signing certificate.
Only Android uses this lock. Other platform recipes and nx.js pins are unchanged.

Build locally with PowerShell 7, Node 24, pnpm 10.33.2, Python with Pillow,
Temurin JDK 21, Android SDK 36/build-tools 36.0.0, and Git Bash. The installed
Android Studio JBR on this PC is Java 17 and cannot compile the pinned Capacitor
plugins. The local Temurin download was verified against Adoptium's SHA-256.

GitHub Actions are disabled for the repository. Do not dispatch the historical
workflow recipes, enable Actions, or upload Actions artifacts. The local runner
uses a native release build, one command at a time, two Gradle workers, a 2 GiB
Java heap, no persistent daemon, and a timeout for each command. Logs stay in
`work/generated/android-build-logs`. There is no dev build option.

## Source preparation

Use the canonical wrapper checkout. `pokerogue-src` is generated build input;
never reset an existing dirty checkout to prepare a build. Preserve old generated
changes before deliberately replacing it with a fresh pinned source tree.

1. Check out official game commit `e4e9b5383be7c9e171d32a9daaea2658d475c521` in
   `pokerogue-src`, with matching assets and locales from the lock. Do not update
   submodules to their remote heads independently of the game revision.
2. In that game directory, install dependencies with `pnpm install --frozen-lockfile
   --ignore-scripts`, then add these exact native packages with `--save-exact
   --ignore-scripts`: `@capacitor/core@8.4.1`, `@capacitor/cli@8.4.1`,
   `@capacitor/android@8.4.1`, `@capacitor/app@8.1.1`,
   `@capacitor/filesystem@8.1.2`, `@capacitor/haptics@8.0.2`,
   `@capacitor/share@8.0.1`, `@capacitor/status-bar@8.0.2`,
   `@capgo/capacitor-social-login@8.3.33`.
3. From the wrapper root run `node scripts/sync-daily-seed-archive.mjs`, then
   `bash scripts/apply-patches.sh android` on the fresh source.
4. Run the save/daily/editor regressions before packaging. `scripts/android-upstream.test.mjs`
   tests the Android-specific release API; the shared upstream release API fixture
   describes the other platforms' API and is not the Android fixture.

## Package

Run `scripts/build-android-local.ps1` with:

- `-ReferenceApk`: a known main APK, used only to retain its public Google OAuth
  client ID. Native implementation and web content are rebuilt from source.
- `-AssetsDirectory`: the complete asset checkout at the lock's asset commit.
- `-Python`: Python executable with Pillow.
- `-OutputDirectory`: a local release/output directory.
- Optionally `-JavaHome`, `-AndroidSdk`, `-GitBash`, `-KeyStore`.

On this PC the main keystore is `C:\Users\plim\pokerogue-debug.keystore`, alias
`androiddebugkey`. Never regenerate it or commit it. Its SHA-256 matches the Nova's
installed main app and is recorded in the lock. No private keys or OAuth access
tokens belong in the repository.

The runner verifies the input source and signing key, checks TypeScript, builds
the web and native app, packages matching assets plus custom touch art/daily data,
aligns/signs the APK, verifies package/version/signature/alignment, and writes a
SHA-256 sidecar. It does not install, uninstall, clear app storage, publish, or
start a development server.

The October build is `1.12.0.11.74-2.0.0`, versionCode `1200110074`. Nova previously
had `1.12.0.10.73-2.0.0`, versionCode `1200100073`. Future build numbers must remain
within 0–9999 and the computed code must exceed the installed one. Recheck the
device before the next release; do not infer it from a stale local APK filename.
