param(
    [Parameter(Mandatory)][string]$ReferenceApk,
    [Parameter(Mandatory)][string]$AssetsDirectory,
    [Parameter(Mandatory)][string]$Python,
    [Parameter(Mandatory)][string]$OutputDirectory,
    [string]$KeyStore = "$env:USERPROFILE\pokerogue-debug.keystore",
    [string]$JavaHome = "$env:LOCALAPPDATA\SilverShadow\Toolchains\temurin21\jdk-21.0.12.1+1",
    [string]$AndroidSdk = "$env:LOCALAPPDATA\Android\Sdk",
    [string]$GitBash = 'C:\Program Files\Git\bin\bash.exe'
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$game = Join-Path $root 'pokerogue-src'
$lock = Get-Content (Join-Path $root 'configs/android/upstream-lock.json') -Raw | ConvertFrom-Json
$silver = (Get-Content (Join-Path $root 'configs/release-version.txt') -Raw).Trim()
$logs = Join-Path $root 'work/generated/android-build-logs'
New-Item -ItemType Directory -Force -Path $logs,$OutputDirectory | Out-Null
$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $AndroidSdk
$env:VITE_BYPASS_LOGIN = '1'
$env:NODE_OPTIONS = '--max-old-space-size=3072'
$java = Join-Path $JavaHome 'bin/java.exe'
$node = (Get-Command node).Source

# Every external command is sequential, bounded, logged and below normal
# priority. Kill only this command's tree on timeout. Gradle uses no daemon.
function Run([string]$Name, [string]$Exe, [string[]]$Arguments, [string]$Directory = $root, [int]$TimeoutSeconds = 180) {
    $info = [System.Diagnostics.ProcessStartInfo]::new()
    $info.FileName = $Exe
    $info.WorkingDirectory = $Directory
    $info.UseShellExecute = $false
    $info.CreateNoWindow = $true
    $info.RedirectStandardOutput = $true
    $info.RedirectStandardError = $true
    foreach ($argument in $Arguments) { $info.ArgumentList.Add($argument) }
    $proc = [System.Diagnostics.Process]::new()
    $proc.StartInfo = $info
    $null = $proc.Start()
    try {
        $proc.PriorityClass = 'BelowNormal'
        $stdout = $proc.StandardOutput.ReadToEndAsync()
        $stderr = $proc.StandardError.ReadToEndAsync()
        Write-Host "$Name PID=$($proc.Id)"
        if (!$proc.WaitForExit($TimeoutSeconds * 1000)) {
            $proc.Kill($true)
            $proc.WaitForExit()
            throw "$Name timed out"
        }
        $stdout.Result | Set-Content (Join-Path $logs "$Name.log")
        $stderr.Result | Set-Content (Join-Path $logs "$Name.err")
        if ($proc.ExitCode -ne 0) { throw "$Name failed; inspect $logs\$Name.err" }
    } finally {
        if (!$proc.HasExited) { $proc.Kill($true); $proc.WaitForExit() }
        $proc.Dispose()
    }
}

if (!(Test-Path "$game/node_modules")) { throw 'Prepare the pinned game checkout and dependencies first; see docs/ANDROID_LOCAL_BUILD.md.' }
if ((& git -C $game rev-parse HEAD) -ne $lock.gameCommit) { throw 'Game source does not match the reviewed upstream lock.' }
if ((& git -C "$game/locales" rev-parse HEAD) -ne $lock.localesCommit) { throw 'Locale source does not match the reviewed upstream lock.' }
$parts = $lock.gameVersion.Split('.')
$expectedCode = [long]$parts[1] * 100000000 + [long]$parts[2] * 1000000 + [long]$parts[3] * 10000 + $lock.buildNumber
if ($lock.buildNumber -lt 0 -or $lock.buildNumber -gt 9999 -or $expectedCode -ne $lock.versionCode) { throw 'Invalid Android version arithmetic in upstream lock.' }
if (!(Test-Path "$game/src/system/casino/slots.ts")) { throw 'Apply the Android patches to the pinned source first.' }
Run 'signing-preflight' (Join-Path $JavaHome 'bin/keytool.exe') @('-list','-v','-keystore',$KeyStore,'-storepass','android','-alias','androiddebugkey')
$certificate = (Get-Content "$logs/signing-preflight.log" -Raw).Replace(':','').ToLowerInvariant()
if (!$certificate.Contains($lock.mainSigningCertificateSha256)) { throw 'Signing key does not match the installed main app.' }
$buildTools = Join-Path $AndroidSdk 'build-tools/36.0.0'
Run 'reference-manifest' (Join-Path $buildTools 'aapt.exe') @('dump','badging',$ReferenceApk)
$referenceManifest = Get-Content "$logs/reference-manifest.log" -Raw
if (!$referenceManifest.Contains("name='com.silvershadow.pkr'")) { throw 'Reference APK is not the main app.' }
if ($referenceManifest -notmatch "versionCode='(\d+)'" -or $lock.versionCode -le [long]$Matches[1]) { throw 'New code must exceed the reference main APK version.' }
Run 'slots-tests' $node @('--test','scripts/casino-slots.test.mjs','scripts/android-upstream.test.mjs')
Run 'prepare-web' $Python @('scripts/prepare-android-local.py','web','--reference-apk',$ReferenceApk)
Run 'typecheck' $node @('node_modules/typescript/bin/tsc','--noEmit','--pretty','false') $game
Run 'web-build' $node @('node_modules/vite/bin/vite.js','build','--mode','app') $game 240
Run 'post-build' $GitBash @('scripts/apply-post-build-patches.sh','android')
Run 'assets' $Python @('scripts/prepare-android-local.py','assets','--assets',$AssetsDirectory)
Run 'daily-archive' $node @('scripts/validate-embedded-daily-archive.mjs')
if (!(Test-Path "$game/android")) { Run 'capacitor-add' $node @('node_modules/@capacitor/cli/bin/capacitor','add','android') $game }
else { Run 'capacitor-sync' $node @('node_modules/@capacitor/cli/bin/capacitor','sync','android') $game }
Run 'prepare-native' $Python @('scripts/prepare-android-local.py','native')
Run 'keyboard' $node @('../patches/android/node/android-manifest-keyboard-fix.js') $game
Run 'native-build' $java @('-Dorg.gradle.appname=gradlew','-classpath','gradle/wrapper/gradle-wrapper.jar','org.gradle.wrapper.GradleWrapperMain','assembleRelease','--no-daemon','--max-workers=2','-Dorg.gradle.parallel=false','-Dorg.gradle.jvmargs=-Xmx2048m','-Pkotlin.compiler.execution.strategy=in-process','--console=plain') "$game/android" 1200
$unsigned = Join-Path $game 'android/app/build/outputs/apk/release/app-release-unsigned.apk'
$aligned = Join-Path $root 'work/generated/android-main-aligned.apk'
$apk = Join-Path $OutputDirectory "PokeRogueSilverShadow-v$($lock.gameVersion)-$silver-build$($lock.buildNumber).apk"
if (Test-Path $apk) { throw 'Final APK already exists; choose a new output directory.' }
Run 'align' (Join-Path $buildTools 'zipalign.exe') @('-f','-P','16','4',$unsigned,$aligned)
Run 'sign' $java @('-jar',"$buildTools/lib/apksigner.jar",'sign','--v4-signing-enabled','false','--ks',$KeyStore,'--ks-key-alias','androiddebugkey','--ks-pass','pass:android','--key-pass','pass:android','--out',$apk,$aligned)
Run 'verify-signature' $java @('-jar',"$buildTools/lib/apksigner.jar",'verify','--print-certs',$apk)
Run 'verify-alignment' (Join-Path $buildTools 'zipalign.exe') @('-c','-P','16','4',$apk)
Run 'verify-manifest' (Join-Path $buildTools 'aapt.exe') @('dump','badging',$apk)
$manifest = Get-Content "$logs/verify-manifest.log" -Raw
if (!$manifest.Contains("name='com.silvershadow.pkr'") -or !$manifest.Contains("versionCode='$($lock.versionCode)'")) { throw 'Final main manifest verification failed' }
$signer = Get-Content "$logs/verify-signature.log" -Raw
if (!$signer.Contains($lock.mainSigningCertificateSha256)) { throw 'Final signature verification failed' }
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $apk).Hash.ToLowerInvariant()
"$hash  $(Split-Path $apk -Leaf)" | Set-Content "$apk.sha256"
Write-Host "Verified main APK: $apk"
