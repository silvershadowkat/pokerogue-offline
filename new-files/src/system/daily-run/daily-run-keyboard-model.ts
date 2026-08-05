export type DailySeedKeyboardPage = "lowercase" | "uppercase" | "numbers" | "symbols";
export type DailySeedKeyboardAction = "backspace" | "clear" | "page" | "confirm" | "cancel";

export interface DailySeedKeyboardCharacterKey {
  kind: "character";
  value: string;
}

export interface DailySeedKeyboardActionKey {
  kind: "action";
  action: DailySeedKeyboardAction;
}

export type DailySeedKeyboardKey = DailySeedKeyboardCharacterKey | DailySeedKeyboardActionKey;

export interface DailySeedKeyboardPosition {
  row: number;
  column: number;
}

/** Nine columns mirrors the classic monster-catching naming screens and fits the 320px game canvas. */
export const DAILY_SEED_KEYBOARD_COLUMNS = 9;
export const DAILY_SEED_KEYBOARD_PAGES: DailySeedKeyboardPage[] = ["lowercase", "uppercase", "numbers", "symbols"];

const pageCharacters: Record<DailySeedKeyboardPage, string[]> = {
  lowercase: Array.from("abcdefghijklmnopqrstuvwxyz"),
  uppercase: Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
  numbers: Array.from("0123456789"),
  // Every printable ASCII punctuation character is available. This includes
  // +, / and = used by standard Base64 seeds, even though canonical seeds are
  // now selected from Previous Seed instead of entered manually.
  symbols: [
    " ", "!", '"', "#", "$", "%", "&", "'", "(", ")", "*", "+", ",", "-", ".", "/",
    ":", ";", "<", "=", ">", "?", "@", "[", "\\", "]", "^", "_", "`", "{", "|", "}", "~",
  ],
};

const actions: DailySeedKeyboardAction[] = ["backspace", "clear", "page", "confirm", "cancel"];

export function buildDailySeedKeyboardRows(page: DailySeedKeyboardPage): DailySeedKeyboardKey[][] {
  const keys: DailySeedKeyboardKey[] = [
    ...pageCharacters[page].map(value => ({ kind: "character" as const, value })),
    ...actions.map(action => ({ kind: "action" as const, action })),
  ];
  const rows: DailySeedKeyboardKey[][] = [];
  for (let index = 0; index < keys.length; index += DAILY_SEED_KEYBOARD_COLUMNS) {
    rows.push(keys.slice(index, index + DAILY_SEED_KEYBOARD_COLUMNS));
  }
  return rows;
}

export function moveDailySeedKeyboardCursor(
  rows: DailySeedKeyboardKey[][],
  position: DailySeedKeyboardPosition,
  direction: "up" | "down" | "left" | "right",
): DailySeedKeyboardPosition {
  if (rows.length === 0) {
    return { row: 0, column: 0 };
  }
  const row = Math.max(0, Math.min(rows.length - 1, position.row));
  const currentLength = Math.max(1, rows[row].length);
  const column = Math.max(0, Math.min(currentLength - 1, position.column));
  if (direction === "left" || direction === "right") {
    return {
      row,
      column: (column + (direction === "left" ? -1 : 1) + currentLength) % currentLength,
    };
  }
  const nextRow = (row + (direction === "up" ? -1 : 1) + rows.length) % rows.length;
  return { row: nextRow, column: Math.min(column, rows[nextRow].length - 1) };
}

export function nextDailySeedKeyboardPage(
  page: DailySeedKeyboardPage,
  direction: -1 | 1 = 1,
): DailySeedKeyboardPage {
  const index = DAILY_SEED_KEYBOARD_PAGES.indexOf(page);
  return DAILY_SEED_KEYBOARD_PAGES[
    (index + direction + DAILY_SEED_KEYBOARD_PAGES.length) % DAILY_SEED_KEYBOARD_PAGES.length
  ];
}
