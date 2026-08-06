import { globalScene } from "#app/global-scene";
import { ModifierTier } from "#enums/modifier-tier";
import type { PlayerPokemon } from "#field/pokemon";
import {
  AddPokeballModifierType,
  getModifierTypeFuncById,
  getPartyLuckValue,
  getPlayerModifierTypeOptions,
  type ModifierType,
  ModifierTypeOption,
  PokemonAllMovePpRestoreModifierType,
  PokemonHpRestoreModifierType,
  PokemonModifierType,
  PokemonPpRestoreModifierType,
  PokemonStatusHealModifierType,
} from "#modifiers/modifier-type";
import { randSeedInt } from "#utils/common";
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
  "EXP_CHARM",
  "SUPER_EXP_CHARM",
  "GOLDEN_EXP_CHARM",
  "EXP_SHARE",
  "EXP_BALANCE",
  "CANDY_JAR",
]);

const WEAK_LEVEL_100_RECOVERY_IDS = new Set(["POTION", "SUPER_POTION", "ETHER", "ELIXIR", "REVIVE"]);

const HARD_RECOVERY_SHOP_IDS = [
  "HYPER_POTION",
  "MAX_POTION",
  "FULL_RESTORE",
  "MAX_REVIVE",
  "MAX_ELIXIR",
  "MAX_ETHER",
  "FULL_HEAL",
] as const;

export function getBossRushFixedShopItemIds(variant: BossRushVariant, waveIndex: number): string[] {
  if (variant === BossRushVariant.NORMAL) {
    return ["RARE_CANDY"];
  }
  const offset = (Math.max(1, waveIndex) - 1) % HARD_RECOVERY_SHOP_IDS.length;
  return Array.from(
    { length: 3 },
    (_, index) => HARD_RECOVERY_SHOP_IDS[(offset + index) % HARD_RECOVERY_SHOP_IDS.length],
  );
}

function applyBossRushRewardTierBonus(
  option: ModifierTypeOption,
  party: PlayerPokemon[],
  attempts: number,
): ModifierTypeOption {
  let upgraded = option;
  const upgradeOdds = Math.floor(128 / ((getPartyLuckValue(party) + 4) / 4));
  for (let attempt = 0; attempt < attempts && upgraded.type.tier < ModifierTier.MASTER; attempt++) {
    if (randSeedInt(upgradeOdds) >= 4) {
      continue;
    }
    const nextTier = (upgraded.type.tier + 1) as ModifierTier;
    const replacement = getPlayerModifierTypeOptions(1, party, undefined, {
      guaranteedModifierTiers: [nextTier],
      fillRemaining: false,
      allowLuckUpgrades: false,
    })[0];
    if (replacement) {
      replacement.upgradeCount = upgraded.upgradeCount + 1;
      upgraded = replacement;
    }
  }
  return upgraded;
}

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
  context: "reward" | "shop" = "reward",
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
  // A Hard shop may sell recovery before it is immediately usable; damage,
  // status, fainting, and PP consumption can all occur in the next battle.
  if (context === "shop" && variant === BossRushVariant.HARD && isRecoveryType(type)) {
    return true;
  }
  return canAffectParty(type, party);
}

function generateUsefulOptions(
  party: PlayerPokemon[],
  variant: BossRushVariant,
  count: number,
  excludeRecovery = false,
  excludedIds: ReadonlySet<string> = new Set(),
  rewardTierUpAttempts = 0,
): ModifierTypeOption[] {
  const distinct: ModifierTypeOption[] = [];
  const duplicates: ModifierTypeOption[] = [];
  for (let attempt = 0; attempt < 300 && distinct.length < count; attempt++) {
    const generated = getPlayerModifierTypeOptions(1, party, undefined, {
      guaranteedModifierTiers: [ModifierTier.GREAT],
      fillRemaining: false,
      allowLuckUpgrades: true,
    })[0];
    const option = generated ? applyBossRushRewardTierBonus(generated, party, rewardTierUpAttempts) : undefined;
    if (
      !option
      || !isBossRushModifierTypeUseful(option.type, party, variant)
      || (excludeRecovery && isRecoveryType(option.type))
      || excludedIds.has(option.type.id)
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
  return generateUsefulOptions(
    party,
    config.variant,
    config.rewardOptionCount,
    false,
    undefined,
    config.rewardTierUpAttempts,
  );
}

function fixedShopOption(
  id:
    | "RARE_CANDY"
    | "HYPER_POTION"
    | "MAX_POTION"
    | "FULL_RESTORE"
    | "MAX_REVIVE"
    | "FULL_HEAL"
    | "MAX_ETHER"
    | "MAX_ELIXIR",
  cost: number,
): ModifierTypeOption {
  const type = getModifierTypeFuncById(id)();
  type.id = id;
  type.setTier(ModifierTier.GREAT);
  return new ModifierTypeOption(type, 0, cost);
}

/** Exactly five purchases generated once and retained by SelectModifierPhase. */
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
      const seededUpgradeCount = config.variant === BossRushVariant.HARD ? 1 : config.shopOptionCount - 1;
      const seededUpgrades = generateUsefulOptions(
        party,
        config.variant,
        seededUpgradeCount,
        true,
        new Set(["RARE_CANDY"]),
      );
      // Rare Candy is the fixed first slot in both variants. Rarer Candy stays
      // in the seeded upgrade pool and is never forced.
      options = [fixedShopOption("RARE_CANDY", baseCost * 1.5), ...seededUpgrades];
      if (config.variant === BossRushVariant.HARD) {
        const costMultipliers: Record<(typeof HARD_RECOVERY_SHOP_IDS)[number], number> = {
          HYPER_POTION: 1,
          MAX_POTION: 1.5,
          FULL_RESTORE: 2.25,
          MAX_REVIVE: 2.75,
          MAX_ELIXIR: 2.5,
          MAX_ETHER: 1.25,
          FULL_HEAL: 1,
        };
        for (const id of getBossRushFixedShopItemIds(config.variant, waveIndex)) {
          const recoveryId = id as (typeof HARD_RECOVERY_SHOP_IDS)[number];
          options.push(fixedShopOption(recoveryId, baseCost * costMultipliers[recoveryId]));
        }
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
