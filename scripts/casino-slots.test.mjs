import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { CASINO_STORAGE_KEY, MAX_COINS, PAYLINES, REEL_STRIPS, SLOT_SYMBOLS,
  activeLineCount, beginSpin, evaluateGrid, gridForStops, linePayout, readSlotWallet, refillSlotWallet, stopSpinReel,
} from "../new-files/src/system/casino/slots.ts";
function storage(initial = null) {
  const values = new Map([["data", "original game save"], ["daily-seed-history", "original daily history"]]);
  if (initial !== null) values.set(CASINO_STORAGE_KEY, initial);
  const writes = [];
  return { values, writes, getItem: key => values.get(key) ?? null, setItem(key, value) { writes.push(key); values.set(key, value); } };
}
function wallet(coins, extra = {}) { return JSON.stringify({ version: 1, coins, lastReels: null, ...extra }); }
function finish(db, positions = [13, 10, 11]) { let stopped; positions.forEach((p, i) => { stopped = stopSpinReel(db, i, p); }); return stopped.result; }

test("all 343 line outcomes use sensible triples and left-to-right berry rewards", () => {
  assert.deepEqual(SLOT_SYMBOLS.map(s => s.payout), [8, 8, 15, 15, 15, 100, 300]);
  for (const a of SLOT_SYMBOLS) for (const b of SLOT_SYMBOLS) for (const c of SLOT_SYMBOLS) {
    const expected = a === b && b === c ? a.payout : a.id === "oran" ? (b.id === "oran" ? 6 : 2) : 0;
    assert.equal(linePayout([a.id, b.id, c.id]), expected);
  }
});
test("1/2/3 coins activate 1/3/5 lines and cumulative wins are not multiplied by the wager", () => {
  assert.deepEqual([1, 2, 3].map(activeLineCount), [1, 3, 5]);
  const grid = [["poke", "poke", "poke"], ["candy", "candy", "candy"], ["master", "master", "master"]];
  assert.equal(evaluateGrid(grid, 1).payout, 100);
  assert.equal(evaluateGrid(grid, 2).payout, 415);
  assert.equal(evaluateGrid(grid, 3).payout, 415);
  const diagonal = [["master", "poke", "great"], ["great", "master", "poke"], ["poke", "great", "master"]];
  assert.equal(evaluateGrid(diagonal, 1).payout, 0); assert.equal(evaluateGrid(diagonal, 2).payout, 0);
  assert.equal(evaluateGrid(diagonal, 3).payout, 300);
  assert.deepEqual(evaluateGrid(diagonal, 3).wins.map(w => w.line), [3]);
});
test("all 9261 physical stop combinations keep rows adjacent and payouts bounded", () => {
  for (let a = 0; a < 21; a++) for (let b = 0; b < 21; b++) for (let c = 0; c < 21; c++) {
    const grid = gridForStops([a, b, c]);
    assert.equal(grid[0][0], REEL_STRIPS[0][(a + 20) % 21]);
    for (const bet of [1, 2, 3]) {
      const { wins, payout } = evaluateGrid(grid, bet);
      assert.ok(payout <= activeLineCount(bet) * 300);
      assert.ok(wins.every(w => w.line < activeLineCount(bet)));
    }
  }
  assert.equal(PAYLINES.length, 5);
});
test("wager debits once, ordered stops persist, and third stop atomically pays only once", () => {
  const db = storage(); assert.equal(beginSpin(db, 1, () => 0).coins, 149);
  assert.throws(() => beginSpin(db, 1));
  stopSpinReel(db, 0, 13);
  assert.equal(readSlotWallet(db).pending.stops[0], 13);
  assert.throws(() => stopSpinReel(db, 0, 13));
  stopSpinReel(db, 1, 10);
  const final = stopSpinReel(db, 2, 11);
  assert.equal(final.result.payout, 300); assert.equal(final.wallet.coins, 449);
  assert.equal(readSlotWallet(db).pending, null); assert.throws(() => stopSpinReel(db, 2, 11));
  assert.deepEqual(db.writes, Array(4).fill(CASINO_STORAGE_KEY));
  assert.equal(db.values.get("data"), "original game save");
  assert.equal(db.values.get("daily-seed-history"), "original daily history");
});
test("timing changes the result; saved slips are bounded and cannot reroll on resume", () => {
  const a = storage(), b = storage(); beginSpin(a, 1, () => 0); beginSpin(b, 1, () => 0);
  assert.equal(finish(a).payout, 300); assert.equal(finish(b, [1, 1, 2]).payout, 0);
  const slipped = storage(); beginSpin(slipped, 1, () => 0.99);
  assert.deepEqual(readSlotWallet(slipped).pending.slips, [2, 2, 2]);
  stopSpinReel(slipped, 0, 11);
  const resumed = storage(slipped.values.get(CASINO_STORAGE_KEY));
  assert.equal(readSlotWallet(resumed).coins, 149);
  assert.deepEqual(readSlotWallet(resumed).pending.stops, [13, null, null]);
  assert.deepEqual(readSlotWallet(resumed).pending.slips, [2, 2, 2]);
  stopSpinReel(resumed, 1, 8); assert.equal(stopSpinReel(resumed, 2, 9).result.payout, 300);
});
test("early gem and coin previews migrate without discarding balance", () => {
  for (const balance of [{ gems: 777 }, { coins: 777 }]) {
    const db = storage(JSON.stringify({ version: 1, ...balance, lastReels: null }));
    assert.equal(readSlotWallet(db).coins, 777); assert.equal(db.writes.length, 0);
    beginSpin(db, 1, () => 0); assert.equal(finish(db).wallet.coins, 1076);
    assert.equal(JSON.parse(db.values.get(CASINO_STORAGE_KEY)).version, 2);
  }
});
test("invalid wagers, unaffordable bets, bad randomness and wallet limits do not write", () => {
  for (const bet of [0, -1, 4, 1.5, NaN, Infinity]) {
    const db = storage(); assert.throws(() => beginSpin(db, bet, () => 0)); assert.equal(db.writes.length, 0);
  }
  const poor = storage(wallet(1)); assert.throws(() => beginSpin(poor, 2)); assert.equal(poor.writes.length, 0);
  for (const value of [-0.1, 1, NaN, Infinity]) {
    const db = storage(); assert.throws(() => beginSpin(db, 1, () => value)); assert.equal(db.writes.length, 0);
  }
  const full = storage(wallet(MAX_COINS)); assert.throws(() => beginSpin(full, 1)); assert.equal(full.writes.length, 0);
});
test("corrupt and future saves remain intact", () => {
  for (const raw of ["", "garbage", "null", wallet(-1), wallet(1.5), wallet(150, { version: 3 }),
    wallet(150, { lastReels: ["bad", "bad", "bad"] }), wallet(150, { lastGrid: [[]] }), wallet(150, { lastBet: 5 }),
    wallet(150, { version: 2, pending: { bet: 1, offsets: [0,0,0], slips: [0,0,0], stops: [null,3,null] } })]) {
    const db = storage(raw); assert.throws(() => readSlotWallet(db)); assert.equal(db.values.get(CASINO_STORAGE_KEY), raw);
    assert.equal(db.writes.length, 0);
  }
});
test("failed writes preserve paid pending spins; refill cannot bypass a pending wager", () => {
  const db = storage(wallet(1)); beginSpin(db, 1, () => 0); assert.throws(() => refillSlotWallet(db));
  const set = db.setItem; db.setItem = () => { throw new Error("quota"); };
  assert.throws(() => stopSpinReel(db, 0, 13), /quota/);
  assert.deepEqual(readSlotWallet(db).pending.stops, [null,null,null]);
  db.setItem = set;
  stopSpinReel(db, 0, 13); stopSpinReel(db, 1, 10);
  const beforeSettlement = db.values.get(CASINO_STORAGE_KEY);
  db.setItem = () => { throw new Error("quota"); };
  assert.throws(() => stopSpinReel(db, 2, 11), /quota/);
  assert.equal(db.values.get(CASINO_STORAGE_KEY), beforeSettlement);
  const resumed = storage(beforeSettlement);
  assert.equal(stopSpinReel(resumed, 2, 11).wallet.coins, 300);
  assert.throws(() => stopSpinReel(resumed, 2, 11));
  const zero = storage(wallet(0)); assert.equal(refillSlotWallet(zero).coins, 150); assert.throws(() => refillSlotWallet(zero));
});
test("casino patch remains Android-only and never consumes overridable game randomness", () => {
  const script = readFileSync(new URL("./apply-patches.sh", import.meta.url), "utf8");
  assert.ok(script.indexOf('apply_patch "casino-slots.js"') > script.indexOf('# --- Android only'));
  assert.ok(script.indexOf('apply_patch "casino-slots.js"') < script.indexOf('# --- Switch only'));
  const previous = Math.random; Math.random = () => { throw new Error("Game RNG must not be consumed"); };
  try { assert.equal(beginSpin(storage(), 1).coins, 149); } finally { Math.random = previous; }
});
