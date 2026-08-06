export type DailySeedKeyboardPage = "lowercase" | "uppercase" | "numbersSymbols";
export type DailySeedKeyboardAction = "backspace" | "clear" | "page" | "confirm";

export interface DailySeedKeyboardCharacterKey {
  kind: "character";
  value: string;
}

export interface DailySeedKeyboardActionKey {
  kind: "action";
  action: DailySeedKeyboardAction;
}

export interface DailySeedKeyboardSpacerKey {
  kind: "spacer";
}

export type DailySeedKeyboardKey =
  | DailySeedKeyboardCharacterKey
  | DailySeedKeyboardActionKey
  | DailySeedKeyboardSpacerKey;

export interface DailySeedKeyboardPosition {
  row: number;
  column: number;
}

/** Nine columns mirrors the classic monster-catching naming screens and fits the 320px game canvas. */
export const DAILY_SEED_KEYBOARD_COLUMNS = 9;
export const DAILY_SEED_KEYBOARD_PAGES: DailySeedKeyboardPage[] = ["lowercase", "uppercase", "numbersSymbols"];
export const DAILY_SEED_KEYBOARD_CHARACTER_ROWS = 3;
export const DAILY_SEED_KEYBOARD_ACTION_ROW = DAILY_SEED_KEYBOARD_CHARACTER_ROWS;

const pageCharacters: Record<DailySeedKeyboardPage, string[]> = {
  lowercase: Array.from("abcdefghijklmnopqrstuvwxyz"),
  uppercase: Array.from("ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
  // Standard canonical seeds are Base64, so these are the only punctuation
  // characters that belong on the combined number/symbol page.
  numbersSymbols: Array.from("0123456789+/="),
};

const actionColumns: Partial<Record<number, DailySeedKeyboardAction>> = {
  0: "page",
  2: "backspace",
  4: "clear",
  8: "confirm",
};

export function buildDailySeedKeyboardRows(page: DailySeedKeyboardPage): DailySeedKeyboardKey[][] {
  const keys: DailySeedKeyboardKey[] = pageCharacters[page].map(value => ({ kind: "character", value }));
  const characterKeyCount = DAILY_SEED_KEYBOARD_CHARACTER_ROWS * DAILY_SEED_KEYBOARD_COLUMNS;
  while (keys.length < characterKeyCount) {
    keys.push({ kind: "spacer" });
  }
  const rows: DailySeedKeyboardKey[][] = [];
  for (let index = 0; index < characterKeyCount; index += DAILY_SEED_KEYBOARD_COLUMNS) {
    rows.push(keys.slice(index, index + DAILY_SEED_KEYBOARD_COLUMNS));
  }
  rows.push(Array.from({ length: DAILY_SEED_KEYBOARD_COLUMNS }, (_, column) => {
    const action = actionColumns[column];
    return action == null ? { kind: "spacer" as const } : { kind: "action" as const, action };
  }));
  return rows;
}

function isSelectable(key: DailySeedKeyboardKey | undefined): boolean {
  return key != null && key.kind !== "spacer";
}

function nearestSelectableColumn(row: DailySeedKeyboardKey[], preferredColumn: number): number | undefined {
  if (isSelectable(row[preferredColumn])) {
    return preferredColumn;
  }
  for (let distance = 1; distance < DAILY_SEED_KEYBOARD_COLUMNS; distance++) {
    const left = preferredColumn - distance;
    const right = preferredColumn + distance;
    if (left >= 0 && isSelectable(row[left])) {
      return left;
    }
    if (right < row.length && isSelectable(row[right])) {
      return right;
    }
  }
  return undefined;
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
    const step = direction === "left" ? -1 : 1;
    for (let distance = 1; distance <= currentLength; distance++) {
      const nextColumn = (column + step * distance + currentLength) % currentLength;
      if (isSelectable(rows[row][nextColumn])) {
        return { row, column: nextColumn };
      }
    }
    return { row, column };
  }
  const step = direction === "up" ? -1 : 1;
  for (let distance = 1; distance <= rows.length; distance++) {
    const nextRow = (row + step * distance + rows.length) % rows.length;
    const nextColumn = nearestSelectableColumn(rows[nextRow], column);
    if (nextColumn != null) {
      return { row: nextRow, column: nextColumn };
    }
  }
  return { row, column };
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
