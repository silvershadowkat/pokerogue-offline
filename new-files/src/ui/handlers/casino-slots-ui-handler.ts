import { globalScene } from "#app/global-scene";
import { Button } from "#enums/buttons";
import { TextStyle } from "#enums/text-style";
import { UiMode } from "#enums/ui-mode";
import { activeLineCount, beginSpin, gridForStops, PAYLINES, readSlotWallet, refillSlotWallet, REEL_STRIPS, SLOT_BETS, SLOT_SYMBOLS, stopSpinReel } from "#system/casino/slots";
import type { SlotGrid, SlotWallet } from "#system/casino/slots";
import { addTextObject } from "#ui/text";
import { UiHandler } from "#ui/ui-handler";
import { addWindow } from "#ui/ui-theme";

/** One Game Corner-inspired machine, with PokeRogue art and an isolated wallet. */
export class CasinoSlotsUiHandler extends UiHandler {
  private panel: Phaser.GameObjects.Container;
  private balance: Phaser.GameObjects.Text;
  private message: Phaser.GameObjects.Text;
  private lineLabel: Phaser.GameObjects.Text;
  private lines: Phaser.GameObjects.Graphics;
  private buttons: Phaser.GameObjects.Text[] = [];
  private cells: Phaser.GameObjects.Sprite[][] = [];
  private timer: Phaser.Time.TimerEvent | null = null;
  private wallet: SlotWallet | null = null;
  private betIndex = 0;
  private result: NonNullable<ReturnType<typeof stopSpinReel>["result"]> | null = null;
  private stopped = 0;
  private nextInputAt = 0;
  private winningLines: number[] = [];
  private motion: { position: number; from: number; target: number; started: number; duration: number; done: boolean }[] = [];

  constructor() { super(UiMode.CASINO_SLOTS); }

  setup(): void {
    this.panel = globalScene.add.container(0, -globalScene.scaledCanvas.height).setVisible(false);
    this.getUi().add(this.panel);
    this.panel.add(globalScene.add.rectangle(0, 0, 320, 180, 0x342d40).setOrigin(0));
    for (const [x, y, w, h] of [[0, 0, 202, 23], [202, 0, 118, 23], [0, 23, 99, 115], [99, 23, 221, 115], [0, 138, 320, 42]]) {
      this.panel.add(addWindow(x, y, w, h).setOrigin(0));
    }
    this.text(9, 4, "CASINO / SLOTS", 72, "#f4dc83");
    this.balance = this.text(209, 5, "", 57, "#f4dc83");
    ["Bet", "Spin", "Refill", "Back"].forEach((label, index) => {
      const y = 35 + index * 24;
      this.buttons.push(this.text(8, y, label, 60));
      this.hit(49.5, y + 8.5, 89, 21, () => {
        if (!this.isCurrent()) return;
        this.setCursor(index);
        // Back preserves a paid spin so it can resume without another wager.
        this.processInput(index === 3 ? Button.CANCEL : Button.ACTION);
      });
    });
    this.lineLabel = this.text(112, 25, "", 44, "#f4dc83");
    this.panel.add(globalScene.add.rectangle(112, 36, 196, 66, 0xf6d641).setOrigin(0));
    for (let column = 0; column < 3; column++) {
      this.panel.add(globalScene.add.rectangle(116 + column * 64, 38, 60, 62, 0xf1f0e6).setOrigin(0));
    }
    this.lines = globalScene.make.graphics({ x: 0, y: 0 }, false);
    this.panel.add(this.lines);
    for (let row = 0; row < 4; row++) {
      this.cells[row] = [];
      for (let column = 0; column < 3; column++) {
        const sprite = globalScene.add.sprite(146 + column * 64, 48 + row * 21, "items", SLOT_SYMBOLS[(row + column) % 7].frame).setScale(0.65);
        this.panel.add(sprite);
        this.cells[row].push(sprite);
        if (row === 3) sprite.setVisible(false);
      }
    }
    this.hit(210, 69, 192, 64, () => { if (this.isCurrent() && this.timer) this.stopReel(); });
    SLOT_SYMBOLS.forEach((symbol, index) => {
      const x = 115 + (index % 4) * 49;
      const y = 111 + Math.floor(index / 4) * 17;
      this.panel.add(globalScene.add.sprite(x + 1, y, "items", symbol.frame).setScale(0.5));
      this.text(x + 10, y - 4, String(symbol.payout), 44);
    });
    this.message = this.text(9, 144, "", 51);
    this.message.setWordWrapWidth(1790);
  }
  private hit(x: number, y: number, width: number, height: number, action: () => void): void {
    const hit = globalScene.add.container(x, y).setSize(width, height).setInteractive();
    hit.on("pointerdown", action);
    this.panel.add(hit);
  }
  private text(x: number, y: number, value: string, size: number, color = "#ffffff"): Phaser.GameObjects.Text {
    const text = addTextObject(x, y, value, TextStyle.WINDOW, { fontSize: `${size}px`, color }).setOrigin(0);
    this.panel.add(text);
    return text;
  }
  override show(args: any[]): boolean {
    super.show(args);
    this.getUi().bringToTop(this.panel);
    this.panel.setVisible(true);
    this.cursor = 1;
    this.winningLines = [];
    try {
      this.wallet = readSlotWallet(localStorage);
      this.betIndex = SLOT_BETS.indexOf(this.wallet.lastBet as 1 | 2 | 3);
      this.displayGrid(this.wallet.lastGrid ?? gridForStops([1, 3, 5]));
      this.instructions();
      if (this.wallet.pending) this.resumeSpin();
    } catch {
      this.wallet = null;
      this.message.setText("Casino save unavailable. Existing data is unchanged.\nBack to return; reopen to retry.");
    }
    this.refresh();
    return true;
  }
  private instructions(): void {
    this.message.setText("1 coin: middle row. 2: all rows. 3: rows + diagonals.\nTriples pay the shown coins per line. Left berries pay 2 / 6.");
  }
  private isCurrent(): boolean { return this.active && this.getUi().getMode() === UiMode.CASINO_SLOTS; }
  private refresh(): void {
    // The result is already saved, but don't reveal winnings in the balance early.
    const coins = this.result ? this.result.wallet.coins - this.result.payout : this.wallet?.coins;
    this.balance.setText(`Coins: ${coins?.toLocaleString("en-US") ?? "--"}`);
    const bet = SLOT_BETS[this.betIndex];
    this.lineLabel.setText(`${activeLineCount(bet)} ACTIVE ${bet === 1 ? "LINE" : "LINES"} / ${bet} ${bet === 1 ? "COIN" : "COINS"}`);
    const labels = [`Bet: < ${bet} >`, this.timer ? (this.stopped < 3 ? `Stop ${this.stopped + 1}/3` : "Stopping...") : "Spin", "Free refill", "Back"];
    this.buttons.forEach((button, index) => {
      button.setText(`${this.cursor === index ? "> " : "  "}${labels[index]}`);
      button.setColor(index === this.cursor ? "#f4dc83" : index === 2 && this.wallet?.coins !== 0 ? "#a29ba9" : "#ffffff");
    });
    this.lines.clear();
    PAYLINES.slice(0, activeLineCount(bet)).forEach((rows, index) => {
      this.lines.lineStyle(this.winningLines.includes(index) ? 3 : 1, this.winningLines.includes(index) ? 0x159b66 : 0xdb9b30, 0.8);
      this.lines.beginPath();
      this.lines.moveTo(116, 48 + rows[0] * 21);
      this.lines.lineTo(146, 48 + rows[0] * 21);
      this.lines.lineTo(210, 48 + rows[1] * 21);
      this.lines.lineTo(274, 48 + rows[2] * 21);
      this.lines.lineTo(304, 48 + rows[2] * 21);
      this.lines.strokePath();
    });
    this.cells.forEach((row, index) => row.forEach(cell => cell.setAlpha(bet === 1 && index !== 1 ? 0.22 : 1)));
  }
  private displayGrid(grid: SlotGrid): void {
    grid.forEach((row, r) => row.forEach((id, c) => this.cells[r][c]
      .setFrame(SLOT_SYMBOLS.find(s => s.id === id)!.frame).setPosition(146 + c * 64, 48 + r * 21).setCrop().setVisible(true)));
    this.cells[3].forEach(cell => cell.setVisible(false));
  }
  private renderReel(column: number, position: number): void {
    const strip = REEL_STRIPS[column];
    const center = Math.floor(position);
    const fraction = position - center;
    for (let row = 0; row < 4; row++) {
      const id = strip[((center + row - 1) % strip.length + strip.length) % strip.length];
      const cell = this.cells[row][column];
      const y = 48 + row * 21 - fraction * 21;
      cell.setFrame(SLOT_SYMBOLS.find(s => s.id === id)!.frame).setPosition(146 + column * 64, y);
      // Crop each sprite to the physical reel window, including the fourth
      // symbol entering from below. No global masks or layout-dependent clips.
      const height = cell.frame.realHeight;
      const top = Math.max(0, (38 - (y - height * 0.65 / 2)) / 0.65);
      const bottom = Math.max(0, ((y + height * 0.65 / 2) - 100) / 0.65);
      cell.setVisible(top + bottom < height);
      cell.setCrop(0, top, cell.frame.realWidth, Math.max(0, height - top - bottom));
      cell.setAlpha(this.betIndex === 0 && (y < 58.5 || y > 79.5) ? 0.22 : 1);
    }
  }
  private finishSpin(): void {
    this.timer?.remove(false);
    this.timer = null;
    if (this.result) {
      this.nextInputAt = globalScene.time.now + 250;
      this.displayGrid(this.result.grid);
      const { payout, bet, wins } = this.result;
      this.winningLines = wins.map(win => win.line);
      const net = payout - bet;
      this.message.setText(payout
        ? `${wins.some(win => win.payout === 300) ? "JACKPOT! " : ""}${wins.length} winning ${wins.length === 1 ? "line" : "lines"}. Payout: ${payout.toLocaleString("en-US")} coins.\nNet: ${net >= 0 ? "+" : ""}${net} coins. Green lines won. Confirm to play again.`
        : `No match on an active line. Bet: ${bet} ${bet === 1 ? "coin" : "coins"}.\n${this.wallet?.coins === 0 ? "Select Free refill for 150 coins." : "Left / Right: change bet. Confirm: play again."}`);
      this.result = null;
    }
    this.refresh();
  }
  private stopReel(): void {
    if (!this.timer || this.stopped >= 3 || globalScene.time.now < this.nextInputAt) return;
    const reel = this.motion[this.stopped];
    try {
      const stopped = stopSpinReel(localStorage, this.stopped, reel.position);
      this.wallet = stopped.wallet;
      this.result = stopped.result;
      this.nextInputAt = globalScene.time.now + 150;
      reel.from = reel.position;
      reel.target = stopped.target;
      reel.started = globalScene.time.now;
      reel.duration = Math.max(60, (stopped.target - reel.position) * 70);
      this.stopped++;
      this.refresh();
    } catch {
      this.message.setText("Could not save this reel stop. Try Confirm again.\nYour paid spin is still saved; no extra coins were charged.");
      this.getUi().playError();
    }
  }
  private startSpin(): void {
    if (globalScene.time.now < this.nextInputAt) return;
    try {
      this.wallet = beginSpin(localStorage, SLOT_BETS[this.betIndex]);
      this.resumeSpin();
    } catch (error) {
      this.result = null;
      this.message.setText(`${error instanceof Error ? error.message : "Could not save this spin."}\nNo spin was started.`);
      this.getUi().playError();
    }
  }
  private resumeSpin(): void {
    const pending = this.wallet!.pending!;
    this.result = null;
    this.stopped = pending.stops.findIndex(stop => stop === null);
    this.winningLines = [];
    this.nextInputAt = globalScene.time.now + 150;
    this.message.setText("A / Confirm or tap: stop reels from left to right.\nBack pauses this spin. Reopen to resume without paying again.");
    this.motion = pending.offsets.map((offset, column) => {
      const position = pending.stops[column] ?? offset;
      return { position, from: position, target: position, started: 0, duration: 0, done: pending.stops[column] !== null };
    });
    let lastTime = globalScene.time.now;
    this.timer = globalScene.time.addEvent({ delay: 16, loop: true, callback: () => {
      if (!this.active) return;
      const now = globalScene.time.now;
      const delta = Math.min(80, now - lastTime);
      lastTime = now;
      this.motion.forEach((reel, column) => {
        if (reel.duration) {
          const progress = Math.min(1, (now - reel.started) / reel.duration);
          reel.position = reel.from + (reel.target - reel.from) * progress;
          reel.done = progress === 1;
        } else if (!reel.done) reel.position += delta / 70;
        this.renderReel(column, reel.position);
      });
      if (this.motion.every(reel => reel.done)) this.finishSpin();
    } });
    this.refresh();
  }
  processInput(button: Button): boolean {
    if (!this.isCurrent()) return false;
    if (button === Button.CANCEL) { void this.getUi().revertMode(); return true; }
    if (this.timer) { if (button === Button.ACTION) this.stopReel(); return true; }
    switch (button) {
      case Button.UP: this.setCursor((this.cursor + 3) % 4); break;
      case Button.DOWN: this.setCursor((this.cursor + 1) % 4); break;
      case Button.LEFT: this.betIndex = Math.max(0, this.betIndex - 1); this.winningLines = []; this.instructions(); break;
      case Button.RIGHT: this.betIndex = Math.min(2, this.betIndex + 1); this.winningLines = []; this.instructions(); break;
      case Button.ACTION:
        if (this.cursor === 3) { void this.getUi().revertMode(); return true; }
        if (!this.wallet) return true;
        if (this.cursor === 0) { this.betIndex = (this.betIndex + 1) % 3; this.winningLines = []; this.instructions(); }
        else if (this.cursor === 1) this.startSpin();
        else {
          try { this.wallet = refillSlotWallet(localStorage); this.message.setText("150 free coins added. Enjoy!\nCasino coins cannot be exchanged for game items."); }
          catch (error) { this.message.setText(error instanceof Error ? error.message : "Could not save refill."); }
        }
        break;
      default: return false;
    }
    this.refresh();
    this.getUi().playSelect();
    return true;
  }
  override setCursor(cursor: number): boolean { const changed = super.setCursor(cursor); this.refresh(); return changed; }
  override clear(): void {
    // Unfinished spins remain in their own save, with their wager already paid.
    this.timer?.remove(false); this.timer = null; this.result = null;
    super.clear(); this.panel.setVisible(false);
  }
  override destroy(): void { this.timer?.remove(false); this.timer = null; this.panel.destroy(); }
}
