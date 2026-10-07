"""Prepare the existing, patched Android game checkout for a local MAIN build.

The reference APK supplies only the public OAuth client configuration. No native
code, manifest, saves, credentials, or packaged web code are reused from it.
"""
import argparse
import json
from pathlib import Path
import re
import shutil
import subprocess
import zipfile

p = argparse.ArgumentParser(description=__doc__)
p.add_argument("phase", choices=["web", "native", "assets"])
p.add_argument("--reference-apk", type=Path)
p.add_argument("--assets", type=Path)
args = p.parse_args()
root = Path(__file__).resolve().parent.parent
game = root / "pokerogue-src"
lock = json.loads((root / "configs/android/upstream-lock.json").read_text(encoding="utf8"))
silver = (root / "configs/release-version.txt").read_text(encoding="utf8").strip()
head = subprocess.check_output(["git", "-C", str(game), "rev-parse", "HEAD"], text=True, timeout=15).strip()
assert head == lock["gameCommit"], "Game checkout does not match reviewed Android lock"
assert json.loads((game / "package.json").read_text(encoding="utf8"))["version"] == lock["gameVersion"]

if args.phase == "web":
    assert args.reference_apk and args.reference_apk.is_file(), "Main reference APK required for OAuth configuration"
    with zipfile.ZipFile(args.reference_apk) as apk:
        previous = json.loads(apk.read("assets/capacitor.config.json"))
    assert previous["appId"] == "com.silvershadow.pkr", "Reference must be the main app"
    client = previous["plugins"]["SocialLogin"]["google"]["webClientId"]
    assert re.fullmatch(r"[\w-]+\.apps\.googleusercontent\.com", client), "Missing valid OAuth client ID"
    config = (root / "configs/android/capacitor/capacitor.config.json").read_text(encoding="utf8").replace("GOOGLE_WEB_CLIENT_ID_PLACEHOLDER", client)
    (game / "capacitor.config.json").write_text(config, encoding="utf8")
    backup = game / "src/system/offline/google-drive-backup.ts"
    backup.write_text(backup.read_text(encoding="utf8").replace("GOOGLE_WEB_CLIENT_ID_PLACEHOLDER", client), encoding="utf8")
    title = game / "src/ui/handlers/title-ui-handler.ts"
    text = title.read_text(encoding="utf8").replace("SILVERSHADOW_VERSION_PLACEHOLDER", silver).replace("BUILD_NUMBER_PLACEHOLDER", str(lock["buildNumber"]))
    text = re.sub(r'const OFFLINE_BUILD_NUMBER = "[^"]+";', f'const OFFLINE_BUILD_NUMBER = "{lock["buildNumber"]}";', text)
    text = re.sub(r'SilverShadow v[^"|]+ \| Build #[^"]+', f'SilverShadow v{silver} | Build #{lock["buildNumber"]}', text)
    assert "PLACEHOLDER" not in text
    title.write_text(text, encoding="utf8")
    (game / "dist").mkdir(exist_ok=True)

elif args.phase == "assets":
    assert args.assets and args.assets.is_dir(), "Matching official asset checkout required"
    # Vite app mode omits large public assets. Copy the reviewed cache, then the
    # fork's patched public files so custom controls/seed archive take precedence.
    for source in [args.assets, game / "assets"]:
        if source.is_dir():
            shutil.copytree(source, game / "dist", dirs_exist_ok=True,
                ignore=shutil.ignore_patterns(".git", ".github", "LICENSES", ".gitignore", "README.md"))
    shutil.copy2(root / "work/generated/daily-seeds.json", game / "dist/daily-seeds.json")

elif args.phase == "native":
    from PIL import Image
    android = game / "android"
    gradle = android / "app/build.gradle"
    text = gradle.read_text(encoding="utf8")
    text = re.sub(r"versionCode \d+", f'versionCode {lock["versionCode"]}', text)
    name = f'{lock["gameVersion"]}.{lock["buildNumber"]}-{silver}'
    text = re.sub(r'versionName "[^"]+"', f'versionName "{name}"', text)
    assert 'applicationId "com.silvershadow.pkr"' in text
    if "androidx.webkit:webkit" not in text:
        text = text.replace("dependencies {", 'dependencies {\n    implementation "androidx.webkit:webkit:1.14.0"', 1)
    gradle.write_text(text, encoding="utf8")
    dest = android / "app/src/main/java/com/silvershadow/pkr/MainActivity.java"
    shutil.copy2(root / "configs/android/java/MainActivity.java", dest)
    manifest = android / "app/src/main/AndroidManifest.xml"
    text = manifest.read_text(encoding="utf8")
    text = text.replace('@mipmap/ic_launcher"', '@mipmap/silvershadow_launcher"').replace('@mipmap/ic_launcher_round"', '@mipmap/silvershadow_launcher_round"')
    for permission in ["WRITE_EXTERNAL_STORAGE", "READ_EXTERNAL_STORAGE"]:
        if permission not in text:
            text = text.replace("<application", f'<uses-permission android:name="android.permission.{permission}" />\n    <application', 1)
    manifest.write_text(text, encoding="utf8")
    res = android / "app/src/main/res"
    # cap sync does not update labels after cap add; keep the main name exact.
    strings = res / "values/strings.xml"
    labels = strings.read_text(encoding="utf8")
    for label in ["app_name", "title_activity_main"]:
        labels = re.sub(rf'(<string name="{label}">)[^<]*(</string>)',
            r'\g<1>PokéRogue SilverShadow\g<2>', labels)
    strings.write_text(labels, encoding="utf8")
    icon = Image.open(root / "configs/android/icon-main.png").convert("RGBA")
    for density, size, canvas, safe in [("mdpi",48,108,66),("hdpi",72,162,99),("xhdpi",96,216,132),("xxhdpi",144,324,198),("xxxhdpi",192,432,264)]:
        folder = res / f"mipmap-{density}"
        folder.mkdir(exist_ok=True)
        small = icon.resize((size,size), Image.Resampling.LANCZOS)
        fg = Image.new("RGBA", (canvas,canvas))
        fg.paste(icon.resize((safe,safe), Image.Resampling.LANCZOS), ((canvas-safe)//2, (canvas-safe)//2))
        for prefix in ["silvershadow_launcher", "ic_launcher"]:
            small.save(folder / f"{prefix}.png")
            small.save(folder / f"{prefix}_round.png")
            fg.save(folder / f"{prefix}_foreground.png")
    adaptive = res / "mipmap-anydpi-v26"
    adaptive.mkdir(exist_ok=True)
    for prefix in ["silvershadow_launcher", "ic_launcher"]:
        xml = f'<?xml version="1.0" encoding="utf-8"?><adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android"><background android:drawable="@android:color/black"/><foreground android:drawable="@mipmap/{prefix}_foreground"/></adaptive-icon>'
        for suffix in ["", "_round"]:
            (adaptive / f"{prefix}{suffix}.xml").write_text(xml, encoding="utf8")
    print(f"Main native version {name} ({lock['versionCode']})")
print(f"Prepared Android {args.phase}")
