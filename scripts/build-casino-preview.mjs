/** Build a self-contained, offline preview of the actual slots handler. No server, account or upload. */
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

const [gameArg, assetsArg, outputArg] = process.argv.slice(2);
if (!gameArg || !assetsArg || !outputArg) throw new Error("Usage: node scripts/build-casino-preview.mjs <patched-game-source> <assets-directory> <output.html>");
const game = path.resolve(gameArg);
const assets = path.resolve(assetsArg);
const output = path.resolve(outputArg);
const gameRequire = createRequire(path.join(game, "package.json"));
const { build } = createRequire(gameRequire.resolve("vite/package.json"))("esbuild");
const dataUrl = async (file, mime) => `data:${mime};base64,${(await readFile(path.join(assets, file))).toString("base64")}`;
const atlas = JSON.parse(await readFile(path.join(assets, "images/items.json"), "utf8"));
const source = `
import Phaser from "phaser";
import i18next from "i18next";
import { initGlobalScene } from "#app/global-scene";
import { CasinoSlotsUiHandler } from "#ui/casino-slots-ui-handler";
import { UiMode } from "#enums/ui-mode";
import { Button } from "#enums/buttons";
globalThis.Phaser = Phaser;
const atlas = ${JSON.stringify({ frames: atlas.textures[0].frames })};
class PreviewScene extends Phaser.Scene {
  preload() {
    this.load.atlas("items", ${JSON.stringify(await dataUrl("images/items.png", "image/png"))}, atlas);
    this.load.image("window_1", ${JSON.stringify(await dataUrl("images/ui/windows/window_1.png", "image/png"))});
  }
  create() {
    this.scaledCanvas = { width: 320, height: 180 };
    this.uiTheme = 0; this.windowType = 1;
    this.ui = this.add.container(0, 1080).setScale(6);
    let mode = UiMode.CASINO_SLOTS;
    Object.assign(this.ui, {
      getMode: () => mode,
      playSelect: () => {}, playError: () => {},
      revertMode: async () => {
        this.handler.clear(); mode = UiMode.EGG_GACHA;
        document.querySelector("#reopen").hidden = false;
        return true;
      }
    });
    initGlobalScene(this);
    this.handler = new CasinoSlotsUiHandler(); this.handler.setup(); this.handler.show([]);
    const held = new Set();
    document.addEventListener("keyup", event => held.delete(event.key));
    window.addEventListener("blur", () => held.clear());
    document.addEventListener("keydown", event => {
      const button = { ArrowUp: Button.UP, ArrowDown: Button.DOWN, ArrowLeft: Button.LEFT, ArrowRight: Button.RIGHT,
        Enter: Button.ACTION, " ": Button.ACTION, z: Button.ACTION, Escape: Button.CANCEL, x: Button.CANCEL }[event.key];
      if (button !== undefined) {
        event.preventDefault();
        if (event.repeat || held.has(event.key)) return;
        held.add(event.key); this.handler.processInput(button);
      }
    });
    document.querySelector("#reopen").onclick = () => {
      mode = UiMode.CASINO_SLOTS; this.handler.show([]); document.querySelector("#reopen").hidden = true;
    };
    globalThis.slotsPreview = { scene: this, handler: this.handler, Button };
  }
}
(async () => {
  const font = new FontFace("emerald", ${JSON.stringify(`url(${await dataUrl("fonts/pokemon-emerald-pro.ttf", "font/ttf")})`)});
  document.fonts.add(await font.load());
  await i18next.init({ lng: "en", resources: {} });
  new Phaser.Game({ type: Phaser.AUTO, width: 1920, height: 1080, parent: "game", pixelArt: true,
    backgroundColor: "#342d40", scale: { mode: Phaser.Scale.FIT, autoCenter: Phaser.Scale.CENTER_BOTH },
    audio: { noAudio: true }, scene: PreviewScene });
})();
`;
const result = await build({
  stdin: { contents: source, resolveDir: game, loader: "ts", sourcefile: "casino-preview.ts" },
  bundle: true, write: false, format: "iife", platform: "browser", minify: true,
  tsconfig: path.join(game, "tsconfig.json"), logLevel: "silent",
  plugins: [{ name: "preview-scene-adapter", setup(build) {
    // The actual window helper only uses this registry for legacy theme changes.
    // Avoid importing the full battle scene into the standalone UI fixture.
    build.onResolve({ filter: /^#app\/scene-base$/ }, () => ({ path: "scene-base", namespace: "preview" }));
    build.onLoad({ filter: /.*/, namespace: "preview" }, () => ({ contents: "export const legacyCompatibleImages = [];", loader: "js" }));
  } }],
});
const script = result.outputFiles[0].text.replace(/<\/script/gi, "<\\/script");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SilverShadow Casino Slots</title>
<style>html,body{margin:0;height:100%;background:#17131e;color:#e9e1ed;font:14px system-ui}body{display:flex;flex-direction:column}header{padding:12px 20px;display:flex;gap:20px;align-items:center}header span{opacity:.7}#game{flex:1;min-height:0;position:relative}canvas{image-rendering:pixelated}button{background:#f4dc83;color:#211b2a;padding:8px 16px;border:0;border-radius:4px;cursor:pointer}</style>
<header><b>SilverShadow Casino Slots</b><span>Offline preview · Arrow keys + Enter · Touch the menu to play</span><button id="reopen" hidden>Open slots</button></header><div id="game"></div>
<script>${script}</script></html>`);
console.log(`Built offline slots preview: ${output}`);
