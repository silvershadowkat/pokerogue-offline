/** Offline casino coins only; never reads or writes game saves or seeded RNG. */
export const CASINO_STORAGE_KEY = "silvershadow.casino.slots.v1";
export const STARTING_COINS = 150;
export const MAX_COINS = 9_999_999;
export const SLOT_BETS = [1, 2, 3] as const;
export const SLOT_SYMBOLS = [
  { id: "oran", label: "Oran", frame: "oran_berry", payout: 8 },
  { id: "sitrus", label: "Sitrus", frame: "sitrus_berry", payout: 8 },
  { id: "poke", label: "Poke", frame: "pb", payout: 15 },
  { id: "great", label: "Great", frame: "gb", payout: 15 },
  { id: "ultra", label: "Ultra", frame: "ub", payout: 15 },
  { id: "candy", label: "Candy", frame: "rare_candy", payout: 100 },
  { id: "master", label: "Master", frame: "mb", payout: 300 },
] as const;
export type SlotSymbol = (typeof SLOT_SYMBOLS)[number]["id"];
export type SlotReels = [SlotSymbol, SlotSymbol, SlotSymbol];
/** Row-major: top, middle, bottom; each row contains left, center, right. */
export type SlotGrid = [SlotReels, SlotReels, SlotReels];
export interface PendingSpin {
  bet: number; offsets: number[]; slips: number[]; stops: (number | null)[];
}
export interface SlotWallet {
  version: 2; coins: number; lastReels: SlotReels | null;
  lastGrid: SlotGrid | null; lastBet: number; pending: PendingSpin | null;
}
export interface CasinoStorage { getItem(key: string): string | null; setItem(key: string, value: string): void }
// One position per reel in each line. Order unlocks center, horizontals, diagonals.
export const PAYLINES = [[1, 1, 1], [0, 0, 0], [2, 2, 2], [0, 1, 2], [2, 1, 0]] as const;
// Physical cyclic strips: adjacent visible rows always belong to the same reel.
export const REEL_STRIPS: readonly (readonly SlotSymbol[])[] = [
  ["oran","poke","sitrus","great","sitrus","candy","poke","sitrus","ultra","great","great","sitrus","poke","master","sitrus","sitrus","candy","great","poke","great","ultra"],
  ["poke","sitrus","oran","ultra","great","oran","poke","candy","sitrus","great","master","oran","poke","sitrus","ultra","oran","great","candy","sitrus","poke","oran"],
  ["sitrus","oran","great","poke","candy","sitrus","oran","ultra","poke","great","oran","master","sitrus","poke","candy","oran","great","sitrus","ultra","oran","poke"],
];
function validReels(value: unknown): value is SlotReels {
  return Array.isArray(value) && value.length === 3 && value.every(id => SLOT_SYMBOLS.some(s => s.id === id));
}
export function readSlotWallet(storage: CasinoStorage): SlotWallet {
  const raw = storage.getItem(CASINO_STORAGE_KEY);
  if (raw === null) return { version: 2, coins: STARTING_COINS, lastReels: null, lastGrid: null, lastBet: 1, pending: null };
  const value = JSON.parse(raw);
  // Early local previews used "gems". Reading does not modify that stored data.
  const coins = value?.coins ?? value?.gems;
  const grid = value?.lastGrid ?? null;
  const bet = value?.lastBet ?? 1;
  const pending = value?.pending ?? null;
  if (!value || ![1, 2].includes(value.version) || !Number.isSafeInteger(coins) || coins < 0 || coins > MAX_COINS
    || !(value.lastReels === null || validReels(value.lastReels))
    || !(grid === null || (Array.isArray(grid) && grid.length === 3 && grid.every(validReels)))
    || !(SLOT_BETS as readonly number[]).includes(bet)
    || (pending !== null && (value.version !== 2 || !validPending(pending)))) {
    throw new Error("Casino save is invalid or from a newer version. It has not been changed.");
  }
  return { version: 2, coins, lastReels: value.lastReels, lastGrid: grid, lastBet: bet, pending };
}
function validPending(value: PendingSpin): boolean {
  if (!value || !(SLOT_BETS as readonly number[]).includes(value.bet)) return false;
  if (!Array.isArray(value.offsets) || value.offsets.length !== 3 || !value.offsets.every((n, i) => Number.isInteger(n) && n >= 0 && n < REEL_STRIPS[i].length)) return false;
  if (!Array.isArray(value.slips) || value.slips.length !== 3 || !value.slips.every(n => Number.isInteger(n) && n >= 0 && n <= 2)) return false;
  if (!Array.isArray(value.stops) || value.stops.length !== 3) return false;
  let open = false;
  for (let i = 0; i < 3; i++) {
    const stop = value.stops[i];
    if (stop === null) open = true;
    else if (open || !Number.isInteger(stop) || stop < 0 || stop >= REEL_STRIPS[i].length) return false;
  }
  return open; // A fully stopped spin must already have been settled.
}
/** Fixed coins paid per winning line, not multiplied again by the total wager. */
export function linePayout(reels: SlotReels): number {
  // Oran is the left-to-right berry symbol: one pays 2, two pay 6,
  // and three receive their normal 8-coin triple payout (no double counting).
  if (reels[0] === "oran" && reels[1] !== "oran") return 2;
  if (reels[0] === "oran" && reels[1] === "oran" && reels[2] !== "oran") return 6;
  if (reels[0] !== reels[1]) return 0;
  return reels[1] === reels[2] ? SLOT_SYMBOLS.find(symbol => symbol.id === reels[0])!.payout : 0;
}
export function activeLineCount(bet: number): number {
  if (!(SLOT_BETS as readonly number[]).includes(bet)) throw new Error("Choose a 1, 2 or 3 coin bet.");
  return bet === 1 ? 1 : bet === 2 ? 3 : 5;
}
export function gridForStops(stops: readonly number[]): SlotGrid {
  return [0, 1, 2].map(row => REEL_STRIPS.map((strip, column) => {
    const index = ((stops[column] + row - 1) % strip.length + strip.length) % strip.length;
    return strip[index];
  }) as SlotReels) as SlotGrid;
}
export function evaluateGrid(grid: SlotGrid, bet: number) {
  const wins = PAYLINES.slice(0, activeLineCount(bet)).flatMap((rows, line) => {
    const reels = rows.map((row, column) => grid[row][column]) as SlotReels;
    const payout = linePayout(reels);
    return payout ? [{ line, payout, reels }] : [];
  });
  return { wins, payout: wins.reduce((sum, win) => sum + win.payout, 0) };
}
/** Independent of Phaser's seed and the base game's temporary Math.random overrides. */
export function casinoRandom(): number {
  const word = new Uint32Array(1);
  globalThis.crypto.getRandomValues(word);
  return word[0] / 0x100000000;
}
/** Debit once and save the initial reel positions/slips before any animation. */
export function beginSpin(storage: CasinoStorage, bet: number, random: () => number = casinoRandom) {
  const wallet = readSlotWallet(storage);
  if (wallet.pending) throw new Error("Finish the saved spin first.");
  const lines = activeLineCount(bet);
  if (bet > wallet.coins) throw new Error("Choose an affordable bet.");
  if (wallet.coins - bet + lines * 300 > MAX_COINS) throw new Error("Coin limit reached. Choose fewer lines.");
  const draw = (size: number) => {
    const value = random();
    if (!Number.isFinite(value) || value < 0 || value >= 1) throw new Error("Invalid casino random value.");
    return Math.floor(value * size);
  };
  const pending: PendingSpin = { bet, offsets: REEL_STRIPS.map(s => draw(s.length)), slips: [draw(3), draw(3), draw(3)], stops: [null, null, null] };
  const next: SlotWallet = { ...wallet, coins: wallet.coins - bet, lastBet: bet, pending };
  storage.setItem(CASINO_STORAGE_KEY, JSON.stringify(next));
  return next;
}
/** The button's actual reel position matters. Persist each stop; settle the
 * third stop and its payout in the SAME write, so reload cannot pay it twice. */
export function stopSpinReel(storage: CasinoStorage, reel: number, position: number) {
  const wallet = readSlotWallet(storage);
  const pending = wallet.pending;
  if (!pending || reel !== pending.stops.findIndex(n => n === null)) throw new Error("Stop reels from left to right.");
  if (!Number.isFinite(position) || position < 0 || position > Number.MAX_SAFE_INTEGER - 3) throw new Error("Invalid reel position.");
  const target = Math.ceil(position) + pending.slips[reel];
  const stops = [...pending.stops];
  stops[reel] = target % REEL_STRIPS[reel].length;
  if (reel < 2) {
    const next: SlotWallet = { ...wallet, pending: { ...pending, stops } };
    storage.setItem(CASINO_STORAGE_KEY, JSON.stringify(next));
    return { wallet: next, target, result: null };
  }
  const grid = gridForStops(stops as number[]);
  const { wins, payout } = evaluateGrid(grid, pending.bet);
  if (wallet.coins + payout > MAX_COINS) throw new Error("Coin limit reached; saved spin is unchanged.");
  const next: SlotWallet = { ...wallet, coins: wallet.coins + payout, pending: null, lastReels: grid[1], lastGrid: grid };
  storage.setItem(CASINO_STORAGE_KEY, JSON.stringify(next));
  return { wallet: next, target, result: { wallet: next, grid, bet: pending.bet, wins, payout } };
}
export function refillSlotWallet(storage: CasinoStorage): SlotWallet {
  const wallet = readSlotWallet(storage);
  if (wallet.pending) throw new Error("Finish the saved spin before refilling.");
  if (wallet.coins !== 0) throw new Error("Free refill is available when your coins reach zero.");
  const next = { ...wallet, coins: STARTING_COINS };
  storage.setItem(CASINO_STORAGE_KEY, JSON.stringify(next));
  return next;
}
