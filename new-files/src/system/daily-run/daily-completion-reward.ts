import { globalScene } from "#app/global-scene";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { Egg } from "#data/egg";
import { DexAttr } from "#enums/dex-attr";
import { EggSourceType } from "#enums/egg-source-types";
import type { SpeciesId } from "#enums/species-id";
import { VariantTier } from "#enums/variant-tier";
import i18next from "i18next";
import { sha256 } from "./daily-run-seed-utils";
import { getCurrentDailyRunMetadata, getDailyRunCompletionKey } from "./daily-run-types";

export interface DailyCompletionSpeciesState {
  speciesId: SpeciesId;
  caughtAttr: bigint;
  hasVariants: boolean;
}

export interface DailyCompletionEggSpec {
  species: SpeciesId;
  isShiny: boolean;
  variantTier: VariantTier;
}

const SHINY_VARIANT_MASKS = [
  DexAttr.SHINY | DexAttr.DEFAULT_VARIANT,
  DexAttr.SHINY | DexAttr.VARIANT_2,
  DexAttr.SHINY | DexAttr.VARIANT_3,
] as const;

function deterministicIndex(identity: string, count: number): number {
  const digest = sha256(new TextEncoder().encode(`${identity}|daily-completion-eggs`));
  return new DataView(digest.buffer, digest.byteOffset, digest.byteLength).getUint32(0, false) % count;
}

function isMissingSupportedShiny(state: DailyCompletionSpeciesState): boolean {
  const masks = state.hasVariants ? SHINY_VARIANT_MASKS : SHINY_VARIANT_MASKS.slice(0, 1);
  return masks.some(mask => (state.caughtAttr & mask) !== mask);
}

/** Prefer a locked starter; once every starter is unlocked, target a missing supported shiny tier. */
export function selectDailyCompletionRewardSpecies(
  states: DailyCompletionSpeciesState[],
  identity: string,
  queuedSpecies: ReadonlySet<SpeciesId> = new Set(),
): SpeciesId | undefined {
  const locked = states.filter(state => state.caughtAttr === 0n);
  const missingShiny = states.filter(state => state.caughtAttr !== 0n && isMissingSupportedShiny(state));
  const candidates = locked.length > 0 ? locked : missingShiny.length > 0 ? missingShiny : states;
  if (candidates.length === 0) {
    return;
  }
  // Rare and epic shiny eggs are normalized back to the standard shiny by the
  // engine when a species has no supported variant data. Prefer a species with
  // all three game-supported shiny tiers so the quartet never contains three
  // visually identical standard shinies while such a candidate exists.
  const variantCapable = candidates.filter(state => state.hasVariants);
  const supportedCandidates = variantCapable.length > 0 ? variantCapable : candidates;
  const notAlreadyQueued = supportedCandidates.filter(state => !queuedSpecies.has(state.speciesId));
  const pool = notAlreadyQueued.length > 0 ? notAlreadyQueued : supportedCandidates;
  return pool[deterministicIndex(identity, pool.length)].speciesId;
}

export function getDailyCompletionEggSpecs(species: SpeciesId): DailyCompletionEggSpec[] {
  return [
    { species, isShiny: false, variantTier: VariantTier.STANDARD },
    { species, isShiny: true, variantTier: VariantTier.STANDARD },
    { species, isShiny: true, variantTier: VariantTier.RARE },
    { species, isShiny: true, variantTier: VariantTier.EPIC },
  ];
}

/** Add the four eggs before PostGameOverPhase persists system data. */
export function awardDailyCompletionEggQuartet(): SpeciesId | undefined {
  const metadata = getCurrentDailyRunMetadata();
  const identity = getDailyRunCompletionKey(globalScene.seed, metadata);
  const states = speciesDataRegistry.getAllStarters().map(speciesId => {
    const species = speciesDataRegistry.getSpecies(speciesId);
    return {
      speciesId,
      caughtAttr: globalScene.gameData.dexData[speciesId]?.caughtAttr ?? 0n,
      hasVariants: species.hasVariants(),
    };
  });
  const queuedSpecies = new Set(globalScene.gameData.eggs.map(egg => egg.species));
  const species = selectDailyCompletionRewardSpecies(states, identity, queuedSpecies);
  if (species == null) {
    return;
  }
  for (const spec of getDailyCompletionEggSpecs(species)) {
    new Egg({
      ...spec,
      sourceType: EggSourceType.EVENT,
      eggDescriptor: i18next.t("egg:shadowDailyCompletionReward"),
    }).addEggToGameData();
  }
  return species;
}
