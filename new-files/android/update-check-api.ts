/** Android release discovery. Adapted from Scoooom's prerelease/build fixes.
 * Read SilverShadow's main APK names, because our release tags identify the
 * wrapper version, not the game version. Never offer another fork or a dev APK.
 */
const RELEASES_URL = "https://api.github.com/repos/silvershadowkat/pokerogue-offline/releases?per_page=100";
const ASSET_PATTERN = /^PokeRogueSilverShadow-v(\d+\.\d+\.\d+(?:\.\d+)?)-(\d+\.\d+\.\d+)-build(\d+)\.apk$/;

export interface ReleaseInfo {
  version: string;
  buildNumber: number;
  tagName: string;
  changelog: string;
}
interface GhRelease {
  tag_name: string;
  draft: boolean;
  prerelease: boolean;
  body: string | null;
  assets?: { name: string }[];
}
function compare(a: string, b: string): number {
  if (![a, b].every(v => /^\d+\.\d+\.\d+(?:\.\d+)?$/.test(v))) {
    throw new Error("Invalid game version in update checker");
  }
  const aa = a.split(".").map(Number), bb = b.split(".").map(Number);
  for (let i = 0; i < 4; i++) {
    const delta = (aa[i] ?? 0) - (bb[i] ?? 0);
    if (delta) return Math.sign(delta);
  }
  return 0;
}
function changelog(body: string | null): string {
  const text = (body ?? "").replace(/\r\n/g, "\n");
  const marked = text.match(/<!-- changelog:start -->([\s\S]*?)<!-- changelog:end -->/);
  return (marked?.[1]?.trim() || text.split("\n")
    .filter(line => !/changelog:(start|end)|PokeRogueSilverShadow.*\.apk/.test(line))
    .join("\n").trim()) || "No changelog available for this version.";
}
export async function checkForUpdates(installedVersion: string, installedBuildNumber = 0): Promise<ReleaseInfo[]> {
  compare(installedVersion, installedVersion);
  const byVersion = new Map<string, ReleaseInfo>();
  let url: string | undefined = RELEASES_URL;
  const visited = new Set<string>();
  while (url && !visited.has(url) && visited.size < 20) {
    visited.add(url);
    const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!response.ok) break;
    const releases = await response.json() as GhRelease[];
    for (const release of releases) {
      if (release.draft || release.prerelease) continue;
      for (const asset of release.assets ?? []) {
        const match = asset.name.match(ASSET_PATTERN);
        if (!match) continue;
        const [, version, , build] = match;
        const buildNumber = Number(build);
        if (!Number.isSafeInteger(buildNumber) || buildNumber > 9999) continue;
        const newer = compare(version, installedVersion);
        if (newer < 0 || (newer === 0 && buildNumber <= installedBuildNumber)) continue;
        if ((byVersion.get(version)?.buildNumber ?? -1) < buildNumber) {
          byVersion.set(version, { version, buildNumber, tagName: release.tag_name, changelog: changelog(release.body) });
        }
      }
    }
    const next = response.headers.get("Link")?.match(/<([^>]+)>;\s*rel="next"/)?.[1];
    // Pagination stays on this repository; never follow an arbitrary remote URL.
    url = next?.startsWith(RELEASES_URL.split("?")[0] + "?") ? next : undefined;
  }
  return [...byVersion.values()].sort((a, b) => compare(a.version, b.version));
}
