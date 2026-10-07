import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { checkForUpdates } from "../new-files/android/update-check-api.ts";

test("main update discovery uses our APK versions, filters prereleases/dev and sees same-version rebuilds", async () => {
  const release = (name, extras = {}) => ({ tag_name: "v2.0.0", draft: false, prerelease: false,
    body: "<!-- changelog:start -->Fix saves<!-- changelog:end -->", assets: [{ name }], ...extras });
  const main = (v, b) => `PokeRogueSilverShadow-v${v}-2.0.0-build${b}.apk`;
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async url => {
    assert.match(url, /^https:\/\/api.github.com\/repos\/silvershadowkat\/pokerogue-offline\/releases/);
    return new Response(JSON.stringify([
      release(main("1.12.0.10", 73)), release(main("1.12.0.10", 74)),
      release(main("1.12.0.11", 75)), release(main("1.12.0.11", 76)),
      release(main("1.12.1.0", 80), { prerelease: true }),
      release(main("1.12.1.1", 81), { draft: true }),
      release("PokeRogueSilverShadow-v1.12.0.12-2.0.0-build80-dev.apk"),
      release("PokeRogueOffline.apk"),
    ]));
  };
  try {
    const updates = await checkForUpdates("1.12.0.10", 73);
    assert.deepEqual(updates.map(x => [x.version, x.buildNumber]), [["1.12.0.10", 74], ["1.12.0.11", 76]]);
    assert.equal(updates[0].changelog, "Fix saves");
    assert.deepEqual(await checkForUpdates("1.12.0.11", 76), []);
  } finally { globalThis.fetch = oldFetch; }
});

const shim = readFileSync(new URL("../patches/android/node/android-trigger-axis-fix.js", import.meta.url), "utf8")
  .match(/\(function \(\) \{[\s\S]*?\}\)\(\);/)[0];
function device(axes, platform = "android") {
  const pad = { axes, buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    index: 0, id: "test pad", timestamp: 8, mapping: "standard", connected: true };
  const nav = { getGamepads: () => [pad, null] };
  const ctx = { window: { navigator: nav, Capacitor: { getPlatform: () => platform } } };
  vm.runInNewContext(shim, ctx);
  return { pad, get: () => nav.getGamepads()[0], nav };
}
test("Android trigger axes press/release without changing sticks or other buttons", () => {
  const d = device([0, 0, 0, 0, -1, -1]);
  d.get();
  d.pad.axes[4] = 1;
  assert.equal(d.get().buttons[6].value, 1);
  assert.equal(d.get().buttons[7].value, 0);
  d.pad.axes[4] = -1; d.pad.axes[5] = 1;
  assert.equal(d.get().buttons[6].value, 0);
  assert.equal(d.get().buttons[7].value, 1);
  assert.equal(d.get().axes, d.pad.axes);
  assert.equal(d.get().timestamp, 8);
  assert.equal(d.nav.getGamepads()[1], null);
});
test("combined-axis and native analog triggers work; other platforms stay untouched", () => {
  const d = device([0, 0, 0, 0, 0]); d.get();
  d.pad.axes[4] = -1; assert.equal(d.get().buttons[6].pressed, true);
  d.pad.axes[4] = 1; assert.equal(d.get().buttons[7].pressed, true);
  const standard = device([0, 0, 0, 0]);
  standard.pad.buttons[6].value = 0.75;
  assert.equal(standard.get().buttons[6].value, 1);
  standard.pad.buttons[6].value = 0;
  assert.equal(standard.get().buttons[6].value, 0);
  const web = device([0, 0, 0, 0], "web");
  assert.equal(web.get(), web.pad);
});
