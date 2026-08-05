import { globalScene } from "#app/global-scene";
import { Button } from "#enums/buttons";
import { TextStyle } from "#enums/text-style";
import { UiMode } from "#enums/ui-mode";
import {
  DAILY_SEED_KEYBOARD_ACTION_ROW,
  buildDailySeedKeyboardRows,
  moveDailySeedKeyboardCursor,
  nextDailySeedKeyboardPage,
  type DailySeedKeyboardAction,
  type DailySeedKeyboardKey,
  type DailySeedKeyboardPage,
  type DailySeedKeyboardPosition,
} from "#system/daily-run/daily-run-keyboard-model";
import { isInvisibleControlCharacter } from "#system/daily-run/daily-run-seed-utils";
import { addTextObject } from "#ui/text";
import { UiHandler } from "#ui/ui-handler";
import { addWindow } from "#ui/ui-theme";
import i18next from "i18next";

export interface DailySeedKeyboardConfig {
  initialValue?: string | undefined;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

const MAX_CHARACTERS = 128;
const GRID_COLUMN_WIDTH = 31;
const GRID_ROW_HEIGHT = 16;

/** Controller-first, game-native Text Seed naming screen. */
export class DailySeedKeyboardUiHandler extends UiHandler {
  private keyboardContainer!: Phaser.GameObjects.Container;
  private gridContainer!: Phaser.GameObjects.Container;
  private valueText!: Phaser.GameObjects.Text;
  private countText!: Phaser.GameObjects.Text;
  private pageText!: Phaser.GameObjects.Text;
  private statusText!: Phaser.GameObjects.Text;
  private cursorObject!: Phaser.GameObjects.Image;
  private config: DailySeedKeyboardConfig | undefined;
  private value = "";
  private page: DailySeedKeyboardPage = "lowercase";
  private position: DailySeedKeyboardPosition = { row: 0, column: 0 };
  private rows: DailySeedKeyboardKey[][] = [];

  constructor() {
    super(UiMode.DAILY_SEED_KEYBOARD);
  }

  public override setup(): void {
    this.keyboardContainer = globalScene.add.container(0, -globalScene.scaledCanvas.height).setVisible(false);
    this.getUi().add(this.keyboardContainer);

    const background = addWindow(4, 4, globalScene.scaledCanvas.width - 8, globalScene.scaledCanvas.height - 8)
      .setOrigin(0);
    const gridWindow = addWindow(8, 57, globalScene.scaledCanvas.width - 16, 94).setOrigin(0);
    const title = addTextObject(12, 10, i18next.t("menu:shadowDailyKeyboardTitle"), TextStyle.WINDOW);
    this.countText = addTextObject(globalScene.scaledCanvas.width - 12, 10, "", TextStyle.WINDOW).setOrigin(1, 0);
    this.valueText = addTextObject(12, 25, "", TextStyle.WINDOW, { maxLines: 2, lineSpacing: 2 });
    this.valueText.setWordWrapWidth(globalScene.scaledCanvas.width - 24);
    this.statusText = addTextObject(12, 47, "", TextStyle.WINDOW, { maxLines: 1 });
    this.pageText = addTextObject(globalScene.scaledCanvas.width / 2, 160, "", TextStyle.WINDOW).setOrigin(0.5, 0);
    this.gridContainer = globalScene.add.container(28, 67);

    this.keyboardContainer.add([
      background,
      gridWindow,
      title,
      this.countText,
      this.valueText,
      this.statusText,
      this.pageText,
      this.gridContainer,
    ]);
  }

  public override show(args: any[]): boolean {
    const config = args[0] as DailySeedKeyboardConfig | undefined;
    if (!config || typeof config.onConfirm !== "function" || typeof config.onCancel !== "function") {
      return false;
    }
    super.show(args);
    this.config = config;
    this.value = config.initialValue ?? "";
    this.page = "lowercase";
    this.position = { row: 0, column: 0 };
    this.statusText.setText(i18next.t("menu:shadowDailyKeyboardGridHelp"));
    this.keyboardContainer.setVisible(true);
    this.getUi().bringToTop(this.keyboardContainer);
    this.renderGrid();
    return true;
  }

  public override processInput(button: Button): boolean {
    let success = false;
    switch (button) {
      case Button.UP:
      case Button.DOWN:
      case Button.LEFT:
      case Button.RIGHT: {
        const direction = button === Button.UP
          ? "up"
          : button === Button.DOWN
            ? "down"
            : button === Button.LEFT
              ? "left"
              : "right";
        this.position = moveDailySeedKeyboardCursor(this.rows, this.position, direction);
        this.positionCursor();
        success = true;
        break;
      }
      case Button.ACTION:
        success = this.activateSelectedKey();
        break;
      case Button.CANCEL:
        if (this.value) {
          this.backspace();
        } else {
          this.config?.onCancel();
        }
        success = true;
        break;
      case Button.SUBMIT:
        success = this.confirmValue();
        break;
      case Button.CYCLE_SHINY:
        this.changePage(-1);
        success = true;
        break;
      case Button.CYCLE_FORM:
        this.changePage(1);
        success = true;
        break;
    }
    if (success) {
      this.getUi().playSelect();
    }
    return success;
  }

  public override clear(): void {
    super.clear();
    this.keyboardContainer.setVisible(false);
    this.config = undefined;
  }

  private renderGrid(): void {
    this.gridContainer.removeAll(true);
    this.rows = buildDailySeedKeyboardRows(this.page);
    this.position.row = Math.min(this.position.row, this.rows.length - 1);
    this.position.column = Math.min(this.position.column, this.rows[this.position.row].length - 1);
    this.rows.forEach((row, rowIndex) => {
      row.forEach((key, columnIndex) => {
        if (key.kind === "spacer") {
          return;
        }
        const x = columnIndex * GRID_COLUMN_WIDTH;
        const y = rowIndex * GRID_ROW_HEIGHT;
        const keyText = addTextObject(x, y, this.keyLabel(key), TextStyle.WINDOW).setOrigin(0.5, 0);
        const touchTarget = globalScene.add.rectangle(x, y + 6, GRID_COLUMN_WIDTH - 2, GRID_ROW_HEIGHT - 2, 0, 0)
          .setInteractive({ useHandCursor: true })
          .on("pointerover", () => {
            this.position = { row: rowIndex, column: columnIndex };
            this.positionCursor();
          })
          .on("pointerup", () => {
            this.position = { row: rowIndex, column: columnIndex };
            this.positionCursor();
            if (this.activateSelectedKey()) {
              this.getUi().playSelect();
            }
          });
        this.gridContainer.add([touchTarget, keyText]);
      });
    });
    this.cursorObject = globalScene.add.image(0, 0, "cursor").setScale(0.8);
    this.gridContainer.add(this.cursorObject);
    this.positionCursor();
    this.updateStatus();
  }

  private keyLabel(key: DailySeedKeyboardKey): string {
    if (key.kind === "character") {
      return key.value === " " ? i18next.t("menu:shadowDailyKeyboardSpaceShort") : key.value;
    }
    if (key.kind === "spacer") {
      return "";
    }
    const labels: Record<DailySeedKeyboardAction, string> = {
      backspace: "shadowDailyKeyboardBackspaceShort",
      clear: "shadowDailyKeyboardClearShort",
      page: "shadowDailyKeyboardPageShort",
      confirm: "shadowDailyKeyboardConfirmShort",
      cancel: "shadowDailyKeyboardCancelShort",
    };
    return i18next.t(`menu:${labels[key.action]}`);
  }

  private positionCursor(): void {
    this.cursorObject?.setPosition(
      this.position.column * GRID_COLUMN_WIDTH - 11,
      this.position.row * GRID_ROW_HEIGHT + 5,
    );
  }

  private activateSelectedKey(): boolean {
    const key = this.rows[this.position.row]?.[this.position.column];
    if (!key) {
      return false;
    }
    if (key.kind === "spacer") {
      return false;
    }
    if (key.kind === "character") {
      if (Array.from(this.value).length >= MAX_CHARACTERS) {
        this.setStatus(i18next.t("menu:shadowDailyKeyboardTooLong", { max: MAX_CHARACTERS }));
        return false;
      }
      this.value += key.value;
      this.setStatus("");
      this.updateStatus();
      return true;
    }
    switch (key.action) {
      case "backspace":
        this.backspace();
        return true;
      case "clear":
        this.value = "";
        this.setStatus("");
        this.updateStatus();
        return true;
      case "page":
        this.changePage(1);
        return true;
      case "confirm":
        return this.confirmValue();
      case "cancel":
        this.backspace();
        return true;
    }
  }

  private backspace(): void {
    const characters = Array.from(this.value);
    characters.pop();
    this.value = characters.join("");
    this.setStatus("");
    this.updateStatus();
  }

  private changePage(direction: -1 | 1): void {
    this.page = nextDailySeedKeyboardPage(this.page, direction);
    this.position = { row: DAILY_SEED_KEYBOARD_ACTION_ROW, column: 0 };
    this.renderGrid();
  }

  private confirmValue(): boolean {
    const value = this.value.trim();
    if (!value) {
      this.setStatus(i18next.t("menu:shadowDailyEmptyTextSeed"));
      return false;
    }
    if (isInvisibleControlCharacter(value)) {
      this.setStatus(i18next.t("menu:shadowDailyKeyboardControlCharacters"));
      return false;
    }
    try {
      this.config?.onConfirm(value);
      return true;
    } catch (error) {
      this.setStatus(error instanceof Error ? error.message : i18next.t("menu:shadowDailyUnknownError"));
      return false;
    }
  }

  private updateStatus(): void {
    const characters = Array.from(this.value);
    const visibleValue = characters.length > 76 ? `…${characters.slice(-76).join("")}` : this.value;
    this.countText.setText(`${characters.length}/${MAX_CHARACTERS}`);
    this.valueText.setText(visibleValue || i18next.t("menu:shadowDailyKeyboardEmpty"));
    this.pageText.setText(i18next.t(`menu:shadowDailyKeyboardPage${this.page}`));
    if (!this.statusText.text) {
      this.statusText.setText(i18next.t("menu:shadowDailyKeyboardGridHelp"));
    }
  }

  private setStatus(message: string): void {
    this.statusText.setText(message || i18next.t("menu:shadowDailyKeyboardGridHelp"));
  }
}
