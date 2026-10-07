#!/usr/bin/env node
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "../../..");
if (!fs.existsSync("pokerogue-src/src/enums/ui-mode.ts")) throw new Error("Run patches from the wrapper root.");
function edit(file, marker, anchor, replacement) {
  const target = path.join("pokerogue-src", file);
  const text = fs.readFileSync(target, "utf8").replace(/\r\n/g, "\n");
  if (text.includes(marker)) return;
  if (text.split(anchor).length !== 2) throw new Error(`Casino anchor missing or ambiguous: ${file} / ${anchor}`);
  fs.writeFileSync(target, text.replace(anchor, replacement));
}
for (const file of ["src/system/casino/slots.ts", "src/ui/handlers/casino-slots-ui-handler.ts"]) {
  const target = path.join("pokerogue-src", file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, "new-files", file), target);
}
// Append after existing custom modes, preserving every previous positional enum/handler index.
edit("src/enums/ui-mode.ts", "CASINO_SLOTS,", "  UPDATE_AVAILABLE,", "  UPDATE_AVAILABLE,\n  CASINO_SLOTS,");
edit("src/ui/ui.ts", 'import { CasinoSlotsUiHandler }', 'import { EggGachaUiHandler } from "#ui/egg-gacha-ui-handler";', 'import { EggGachaUiHandler } from "#ui/egg-gacha-ui-handler";\nimport { CasinoSlotsUiHandler } from "#ui/casino-slots-ui-handler";');
edit("src/ui/ui.ts", "new CasinoSlotsUiHandler()", "      new UpdateAvailableUiHandler(),", "      new UpdateAvailableUiHandler(),\n      new CasinoSlotsUiHandler(),");
edit("src/ui/ui.ts", "UiMode.CASINO_SLOTS,", "  UiMode.UPDATE_AVAILABLE,", "  UiMode.UPDATE_AVAILABLE,\n  UiMode.CASINO_SLOTS,");
const gacha = "src/ui/handlers/egg-gacha-ui-handler.ts";
edit(gacha, "16 + 672 * this.scale", "16 + 576 * this.scale", "16 + 672 * this.scale");
edit(gacha, '${pullOptionsText}\\nCasino', '${pullOptionsText}\\n${i18next.t("menu:cancel")}', '${pullOptionsText}\\nCasino\\n${i18next.t("menu:cancel")}');
edit(gacha, "this.cursor < 6", "this.cursor < 5", "this.cursor < 6");
edit(gacha, "// SilverShadow casino entry", "    const ui = this.getUi();\n    const voucher = EggGachaUiHandler.cursorToVoucher(cursor);", "    // SilverShadow casino entry: voucher rows 0-4 retain their original meanings.\n    const ui = this.getUi();\n    if (cursor === 5) {\n      void ui.setOverlayMode(UiMode.CASINO_SLOTS);\n      return true;\n    }\n    const voucher = EggGachaUiHandler.cursorToVoucher(cursor);");
edit(gacha, "cursor > 6", "cursor > 5", "cursor > 6");
console.log("Installed offline Casino Slots.");

// The game's headless fixture predates stroked paylines. Extend only its no-op
// graphics surface; real rendering is checked with the actual Phaser preview.
const mock = path.join("pokerogue-src", "test/mocks/mocks-container/mock-graphics.ts");
if (fs.existsSync(mock)) {
  let source = fs.readFileSync(mock, "utf8");
  for (const method of ["clear", "lineStyle", "moveTo", "lineTo", "strokePath"]) {
    if (!source.includes(`${method}(`)) {
      const end = source.lastIndexOf("\n}");
      if (end < 0) throw new Error("Graphics mock class anchor changed");
      source = source.slice(0, end) + `\n  ${method}(..._args: unknown[]): this { return this; }\n` + source.slice(end);
    }
  }
  fs.writeFileSync(mock, source);
}
