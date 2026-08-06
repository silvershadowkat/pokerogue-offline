#!/usr/bin/env node

/** Add a safe, live General setting for instant shop/reward presentation. */

const fs = require("fs");
const path = require("path");

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exit(1);
}

function read(file) {
  if (!fs.existsSync(file)) fail(`Could not find ${file}`);
  return fs.readFileSync(file, "utf8").replace(/\r\n/g, "\n");
}

function write(file, source) {
  fs.writeFileSync(file, source, "utf8");
  console.log(`Written: ${file}`);
}

function replaceRequired(source, anchor, replacement, description) {
  const count = source.split(anchor).length - 1;
  if (count !== 1) fail(`Expected one ${description}, found ${count}.`);
  return source.replace(anchor, replacement);
}

const settingsPath = path.join("pokerogue-src", "src", "system", "settings", "settings.ts");
let settings = read(settingsPath);
if (!settings.includes('Shop_Animations: "SHOP_ANIMATIONS"')) {
  settings = replaceRequired(
    settings,
    '  Game_Speed: "GAME_SPEED",',
    '  Game_Speed: "GAME_SPEED",\n  Shop_Animations: "SHOP_ANIMATIONS",',
    "Shop Animations setting key anchor",
  );
  settings = replaceRequired(
    settings,
    `  {
    key: SettingKeys.HP_Bar_Speed,`,
    `  {
    key: SettingKeys.Shop_Animations,
    label: "Shop Animations",
    options: [
      { value: "On", label: "On" },
      { value: "Off", label: "Off" },
    ],
    default: 0,
    type: SettingType.GENERAL,
  },
  {
    key: SettingKeys.HP_Bar_Speed,`,
    "General setting row below Game Speed",
  );
  settings = replaceRequired(
    settings,
    `    case SettingKeys.Game_Speed:
      globalScene.gameSpeed = Number.parseFloat(Setting[index].options[value].value);
      break;`,
    `    case SettingKeys.Game_Speed:
      globalScene.gameSpeed = Number.parseFloat(Setting[index].options[value].value);
      break;
    case SettingKeys.Shop_Animations:
      activeOverrides.SHOP_ANIMATIONS_OVERRIDE = Setting[index].options[value].value === "On";
      break;`,
    "Shop Animations live setting case",
  );
  write(settingsPath, settings);
}

const overridesPath = path.join("pokerogue-src", "src", "overrides.ts");
let overrides = read(overridesPath);
if (!overrides.includes("SHOP_ANIMATIONS_OVERRIDE")) {
  overrides = replaceRequired(
    overrides,
    `  /** Sets reroll price to 0 */
  readonly WAIVE_ROLL_FEE_OVERRIDE: boolean = false;`,
    `  /** Sets reroll price to 0 */
  readonly WAIVE_ROLL_FEE_OVERRIDE: boolean = false;
  /** Preserve the normal reward/shop reveal animations. */
  readonly SHOP_ANIMATIONS_OVERRIDE: boolean = true;`,
    "Shop Animations runtime override",
  );
  write(overridesPath, overrides);
}

const phasePath = path.join("pokerogue-src", "src", "phases", "select-modifier-phase.ts");
let phase = read(phasePath);
if (!phase.includes("SHOP_ANIMATIONS_OVERRIDE === false")) {
  phase = replaceRequired(
    phase,
    `    globalScene.reroll = true;
    globalScene.phaseManager.unshiftNew(
      "SelectModifierPhase",`,
    `    const instantReroll = activeOverrides.SHOP_ANIMATIONS_OVERRIDE === false && !(globalThis as any).Switch;
    const instantNextRerollCount = this.rerollCount + 1;
    const instantNextModifierTiers = this.typeOptions
      .map(o => o.type?.tier)
      .filter(t => t !== undefined) as ModifierTier[];
    const instantModifierCount = this.getModifierCount();
    const instantUiHandler = globalScene.ui.getHandler() as ModifierSelectUiHandler;

    if (instantReroll && instantUiHandler.canReuseRewardOptions(instantModifierCount)) {
      globalScene.reroll = true;
      this.modifierTiers = instantNextModifierTiers;
      this.rerollCount = instantNextRerollCount;
      this.claimedRewardIndices.clear();
      clearPendingClaimAllReward();
      if (this.isCopy) {
        // A copied phase pins its old rewards for a deferred party/move
        // selection. A real reroll must release that copied configuration.
        this.isCopy = false;
        this.customModifierSettings = undefined;
      }
      regenerateModifierPoolThresholds(globalScene.getPlayerParty(), this.getPoolType(), this.rerollCount);
      this.typeOptions = this.getModifierTypeOptions(instantModifierCount);

      if (!activeOverrides.WAIVE_ROLL_FEE_OVERRIDE) {
        globalScene.money -= rerollCost;
        globalScene.updateMoneyText();
        globalScene.animateMoneyChanged(false);
      }

      instantUiHandler.reuseRewardOptions(this.typeOptions, this.getRerollCost(globalScene.lockModifierTiers));
      globalScene.reroll = false;
      audioManager.playSound("se/buy");
      return false;
    }

    globalScene.reroll = true;
    globalScene.phaseManager.unshiftNew(
      "SelectModifierPhase",`,
    "instant reroll reuse branch",
  );
  write(phasePath, phase);
}

const uiPath = path.join("pokerogue-src", "src", "ui", "handlers", "modifier-select-ui-handler.ts");
let ui = read(uiPath);
const reuseMethods = `  canReuseRewardOptions(rewardOptionCount: number): boolean {
    return this.active && this.options.length === rewardOptionCount;
  }

  /**
   * Rebind reward data to the existing Phaser objects on Switch rerolls.
   *
   * Shop rows, controls, cursor, and text canvases remain allocated. This is
   * intentionally synchronous so processInput can immediately restore the
   * existing callback after rerollModifiers returns false.
   */
  reuseRewardOptions(typeOptions: ModifierTypeOption[], rerollCost: number): void {
    if (!this.canReuseRewardOptions(typeOptions.length)) {
      throw new Error("Reward option reuse count mismatch");
    }

    for (let index = 0; index < typeOptions.length; index++) {
      this.options[index].reuse(typeOptions[index]);
    }

    this.rerollCost = rerollCost;
    this.updateCostText();
  }

  setRerollCost(rerollCost: number): void {
    this.rerollCost = rerollCost;
  }`;
if (!ui.includes("canReuseRewardOptions(rewardOptionCount")) {
  ui = replaceRequired(
    ui,
    `  setRerollCost(rerollCost: number): void {
    this.rerollCost = rerollCost;
  }`,
    reuseMethods,
    "modifier-select reusable reward methods",
  );
}

if (!ui.includes("const shopRevealDuration = activeOverrides.SHOP_ANIMATIONS_OVERRIDE")) {
  ui = replaceRequired(
    ui,
    `    /* Multiplies the appearance duration by the speed parameter so that it is always constant, and avoids "flashbangs" at game speed x5 */
    globalScene.showShopOverlay(750 * globalScene.gameSpeed);
    globalScene.updateAndShowText(750);`,
    `    /* Keep the normal overlay reveal when enabled; Off presents the completed shop immediately. */
    const shopRevealDuration = activeOverrides.SHOP_ANIMATIONS_OVERRIDE === false ? 0 : 750;
    globalScene.showShopOverlay(shopRevealDuration * globalScene.gameSpeed);
    globalScene.updateAndShowText(shopRevealDuration);`,
    "instant shop overlay duration",
  );
}

if (!ui.includes("shopAnimationsEnabled = activeOverrides.SHOP_ANIMATIONS_OVERRIDE")) {
  const instantShowBranch = `    const shopAnimationsEnabled = activeOverrides.SHOP_ANIMATIONS_OVERRIDE !== false;
    if (!shopAnimationsEnabled) {
      for (const option of this.options.concat(this.shopOptionsRows.flat())) {
        option.showImmediately();
      }

      if (partyHasHeldItem) {
        this.transferButtonContainer.setVisible(true).setAlpha(1);
      }
      this.rerollButtonContainer.setVisible(true).setAlpha(this.rerollCost < 0 ? 0.5 : 1);
      this.checkButtonContainer.setVisible(true).setAlpha(1);
      this.continueButtonContainer.setVisible(this.rerollCost < 0).setAlpha(1);
      this.lockRarityButtonContainer.setVisible(canLockRarities).setAlpha(this.rerollCost < 0 ? 0.5 : 1);

      const updateCursorTarget = () => {
        if (globalScene.shopCursorTarget === ShopCursorTarget.CHECK_TEAM) {
          this.setRowCursor(0);
          this.setCursor(2);
        } else if (
          globalScene.shopCursorTarget === ShopCursorTarget.SHOP
          && (!hasShop || this.shopOptionsRows.length === 0)
        ) {
          this.setRowCursor(ShopCursorTarget.REWARDS);
          this.setCursor(0);
        } else {
          this.setRowCursor(globalScene.shopCursorTarget);
          this.setCursor(0);
        }
      };

      updateCursorTarget();
      handleTutorial(Tutorial.SELECT_ITEM).then(res => {
        if (res) {
          updateCursorTarget();
        }
        this.awaitingActionInput = true;
        this.onActionInput = args[2];
      });
      return true;
    }

`;
  ui = replaceRequired(
    ui,
    `    // DO NOT REMOVE: Fixes bug which allows action input to be processed before the UI is shown,
    // causing errors if reroll is selected
    this.awaitingActionInput = false;

    const { promise: tweenPromise, resolve: tweenResolve } = Promise.withResolvers<void>();`,
    `    // DO NOT REMOVE: Fixes bug which allows action input to be processed before the UI is shown,
    // causing errors if reroll is selected
    this.awaitingActionInput = false;

${instantShowBranch}    const { promise: tweenPromise, resolve: tweenResolve } = Promise.withResolvers<void>();`,
    "instant modifier-select reveal branch",
  );
}

if (!ui.includes("private claimedBackground?: Phaser.GameObjects.Rectangle")) {
  ui = replaceRequired(
    ui,
    `  private itemText: Phaser.GameObjects.Text;
  private itemCostText: Phaser.GameObjects.Text;`,
    `  private itemText: Phaser.GameObjects.Text;
  private itemCostText: Phaser.GameObjects.Text;
  private claimedBackground?: Phaser.GameObjects.Rectangle;
  private claimedText?: Phaser.GameObjects.Text;`,
    "ModifierOption reusable claimed fields",
  );
}

if (!ui.includes("reuse(modifierTypeOption: ModifierTypeOption): void")) {
  const claimedAnchor = `  markClaimed(): void {
    this.item.setTint(0x666666);
    this.itemText.setTint(0x777777);
    this.pb?.setTint(0x555555);

    const claimedBackground = globalScene.add.rectangle(
      0,
      62,
      96,
      18,
      0x000000,
      0.9,
    );
    claimedBackground.setStrokeStyle(2, 0xff3030, 1);
    this.add(claimedBackground);

    const claimedText = addTextObject(
      0,
      56,
      "CLAIMED",
      TextStyle.PARTY_RED,
      {
        align: "center",
      },
    );
    claimedText.setOrigin(0.5, 0);
    this.add(claimedText);
  }`;
  const reusableClaimedCard = `  reuse(modifierTypeOption: ModifierTypeOption): void {
    this.modifierTypeOption = modifierTypeOption;
    this.item.setTexture("items", modifierTypeOption.type?.iconImage);
    this.item.clearTint();

    this.itemText.setText(modifierTypeOption.type?.name ?? "");
    this.itemText.clearTint();
    if (modifierTypeOption.type?.tier) {
      this.itemText.setTint(getModifierTierTextTint(modifierTypeOption.type.tier));
    }

    this.claimedBackground?.setVisible(false);
    this.claimedText?.setVisible(false);
  }

  markClaimed(): void {
    this.item.setTint(0x666666);
    this.itemText.setTint(0x777777);
    this.pb?.setTint(0x555555);

    if (!this.claimedBackground) {
      this.claimedBackground = globalScene.add.rectangle(0, 62, 96, 18, 0x000000, 0.9);
      this.claimedBackground.setStrokeStyle(2, 0xff3030, 1);
      this.add(this.claimedBackground);
    }
    this.claimedBackground.setVisible(true);

    if (!this.claimedText) {
      this.claimedText = addTextObject(0, 56, "CLAIMED", TextStyle.PARTY_RED, {
        align: "center",
      });
      this.claimedText.setOrigin(0.5, 0);
      this.add(this.claimedText);
    }
    this.claimedText.setVisible(true);
  }`;
  ui = replaceRequired(ui, claimedAnchor, reusableClaimedCard, "ModifierOption reusable claimed card");
}

if (!ui.includes("showImmediately(): void")) {
  ui = replaceRequired(
    ui,
    `  markClaimed(): void {`,
    `  /** Reveal the final option state without scheduling any timers or tweens. */
  showImmediately(): void {
    this.pb?.setVisible(false);
    this.pbTint?.setVisible(false);
    this.itemTint?.setVisible(false);
    this.itemContainer.setScale(2).setAlpha(1);
    this.itemText.setPosition(this.itemText.x, 25).setAlpha(1);
    this.itemCostText?.setPosition(this.itemCostText.x, 35).setAlpha(1);
  }

  markClaimed(): void {`,
    "ModifierOption immediate reveal method",
  );
}

write(uiPath, ui);
console.log("Shop Animations setting and safe instant reward path applied.");
