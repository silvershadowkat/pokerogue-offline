import { globalScene } from "#app/global-scene";
import { ModifierTier } from "#enums/modifier-tier";
import type { PlayerPokemon } from "#field/pokemon";
import {
  AddPokeballModifierType,
  getModifierTypeFuncById,
  getPlayerModifierTypeOptions,
  type ModifierType,
  ModifierTypeOption,
  PokemonAllMovePpRestoreModifierType,
  PokemonHpRestoreModifierType,
  PokemonModifierType,
  PokemonPpRestoreModifierType,
  PokemonStatusHealModifierType,
} from "#modifiers/modifier-type";
import { BOSS_RUSH_CONFIG, BossRushVariant, getBossRushVariant, getBossRushVariantConfig } from "./boss-rush";
import { getCurrentDailyRunMetadata } from "./daily-run-types";

/** Metadata gaps and mode-wide systems that cannot function in a ten-boss run. */
const ALWAYS_IRRELEVANT_IDS = new Set([
  "POKEBALL",
  "GREAT_BALL",
  "ULTRA_BALL",
  "ROGUE_BALL",
  "MASTER_BALL",
  "GOLDEN_POKEBALL",
  "SILVER_POKEBALL",
  "LURE",
  "SUPER_LURE",
  "MAX_LURE",
  "MAP",
  "IV_SCANNER",
  "RARE_CANDY",
  "EXP_CHARM",
  "SUPER_EXP_CHARM",
  "GOLDEN_EXP_CHARM",
  "EXP_SHARE",
  "EXP_BALANCE",
  "CANDY_JAR",
]);

const WEAK_LEVEL_100_RECOVERY_IDS = new Set(["POTION", "SUPER_POTION", "ETHER", "ELIXIR", "REVIVE"]);

function isRecoveryType(type: ModifierType): boolean {
  return (
    type instanceof PokemonHpRestoreModifierType
    || type instanceof PokemonStatusHealModifierType
    || type instanceof PokemonPpRestoreModifierType
    || type instanceof PokemonAllMovePpRestoreModifierType
    || type.id === "SACRED_ASH"
  );
}

function canAffectParty(type: ModifierType, party: PlayerPokemon[]): boolean {
  if (type instanceof PokemonPpRestoreModifierType || type instanceof PokemonAllMovePpRestoreModifierType) {
    return party.some(pokemon => pokemon.getMoveset().some(move => move.ppUsed > 0));
  }
  if (type instanceof PokemonModifierType && typeof type.selectFilter === "function") {
    return party.some(pokemon => !type.selectFilter?.(pokemon));
  }
  return true;
}

/** Shared reward/shop predicate; class metadata is preferred over the documented ID exceptions above. */
export function isBossRushModifierTypeUseful(
  type: ModifierType,
  party: PlayerPokemon[],
  variant = getBossRushVariant(),
): boolean {
  if (
    type.tier < ModifierTier.GREAT
    || type instanceof AddPokeballModifierType
    || ALWAYS_IRRELEVANT_IDS.has(type.id)
    || type.id?.includes("VOUCHER")
  ) {
    return false;
  }
  if (variant === BossRushVariant.NORMAL && isRecoveryType(type)) {
    return false;
  }
  if (variant === BossRushVariant.HARD && WEAK_LEVEL_100_RECOVERY_IDS.has(type.id)) {
    return false;
  }
  return canAffectParty(type, party);
}

function generateUsefulOptions(
  party: PlayerPokemon[],
  variant: BossRushVariant,
  count: number,
  excludeRecovery = false,
): ModifierTypeOption[] {
  const distinct: ModifierTypeOption[] = [];
  const duplicates: ModifierTypeOption[] = [];
  for (let attempt = 0; attempt < 300 && distinct.length < count; attempt++) {
    const option = getPlayerModifierTypeOptions(1, party, undefined, {
      guaranteedModifierTiers: [ModifierTier.GREAT],
      fillRemaining: false,
      allowLuckUpgrades: true,
    })[0];
    if (
      !option
      || !isBossRushModifierTypeUseful(option.type, party, variant)
      || (excludeRecovery && isRecoveryType(option.type))
    ) {
      continue;
    }
    if (distinct.some(existing => existing.type.id === option.type.id || existing.type.group === option.type.group)) {
      duplicates.push(option);
    } else {
      distinct.push(option);
    }
  }
  while (distinct.length < count && duplicates.length > 0) {
    distinct.push(duplicates.shift()!);
  }
  if (distinct.length !== count) {
    throw new Error(`Boss Rush could generate only ${distinct.length} of ${count} useful item choices.`);
  }
  return distinct;
}

export function getBossRushRewardOptions(party: PlayerPokemon[]): ModifierTypeOption[] {
  const config = getBossRushVariantConfig();
  return generateUsefulOptions(party, config.variant, config.rewardOptionCount);
}

function fixedShopOption(
  id: "MAX_POTION" | "FULL_RESTORE" | "MAX_REVIVE" | "FULL_HEAL" | "MAX_ETHER" | "MAX_ELIXIR",
  cost: number,
): ModifierTypeOption {
  const type = getModifierTypeFuncById(id)();
  type.id = id;
  type.setTier(ModifierTier.GREAT);
  return new ModifierTypeOption(type, 0, cost);
}

/** Exactly five stable purchases; called independently by the UI and purchase phase. */
export function getBossRushShopOptions(
  party: PlayerPokemon[],
  waveIndex: number,
  baseCost: number,
): ModifierTypeOption[] {
  if (waveIndex >= BOSS_RUSH_CONFIG.bossCount) {
    return [];
  }
  const config = getBossRushVariantConfig();
  let options: ModifierTypeOption[] = [];
  globalScene.executeWithSeedOffset(
    () => {
      options = generateUsefulOptions(party, config.variant, config.shopOptionCount, true);
      if (config.variant === BossRushVariant.HARD) {
        const recovery = [
          fixedShopOption("FULL_RESTORE", baseCost * 2.25),
          fixedShopOption("MAX_REVIVE", baseCost * 2.75),
          fixedShopOption("MAX_ELIXIR", baseCost * 2.5),
          fixedShopOption("MAX_POTION", baseCost * 1.5),
          fixedShopOption("FULL_HEAL", baseCost),
          fixedShopOption("MAX_ETHER", baseCost),
        ].filter(option => isBossRushModifierTypeUseful(option.type, party, config.variant));
        const recoveryToOffer = recovery.slice(0, 2);
        options.splice(options.length - recoveryToOffer.length, recoveryToOffer.length, ...recoveryToOffer);
      }
      options.forEach(option => {
        if (!option.cost) {
          option.cost = Math.round(baseCost * Math.max(1, 2 ** (option.type.tier - ModifierTier.GREAT)));
        }
      });
    },
    BOSS_RUSH_CONFIG.generationOffset + 0x53484f50 + waveIndex,
    `${getCurrentDailyRunMetadata()?.canonicalSeed ?? globalScene.seed}|${config.variant}|shop`,
  );
  return options;
}
