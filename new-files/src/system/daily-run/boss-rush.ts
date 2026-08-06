import { globalScene } from "#app/global-scene";
import { speciesDataRegistry } from "#app/global-species-data-registry";
import { NON_LEGEND_PARADOX_POKEMON } from "#balance/special-species-groups";
import { IS_TEST, isDev } from "#constants/app-constants";
import { allMoves } from "#data/data-lists";
import type { PokemonForm, PokemonSpecies, PokemonSpeciesForm } from "#data/pokemon-species";
import { AbilityId } from "#enums/ability-id";
import { ModifierTier } from "#enums/modifier-tier";
import { MoveCategory } from "#enums/move-category";
import { MoveId } from "#enums/move-id";
import { Nature } from "#enums/nature";
import { SpeciesFormKey } from "#enums/species-form-key";
import { SpeciesId } from "#enums/species-id";
import type { EnemyPokemon } from "#field/pokemon";
import type { CustomModifierSettings } from "#modifiers/modifier-type";
import type { StarterMoveset } from "#types/save-data";
import { randSeedInt, randSeedItem } from "#utils/common";
import { getCurrentDailyRunMetadata } from "./daily-run-types";
import { generateVersionedSeededContent, type SeededRunCompatibility } from "./seeded-run-compatibility";

export enum BossRushVariant {
  NORMAL = "normal",
  HARD = "hard",
}

export const BOSS_RUSH_V1_ALGORITHM_VERSION = "SilverShadow-BossRush-v1";
export const BOSS_RUSH_ALGORITHM_VERSION = "SilverShadow-BossRush-v2";

export const BOSS_RUSH_CONFIG = Object.freeze({
  startingPartySize: 3,
  startingLevel: 100,
  bossLevel: 100,
  bossCount: 10,
  startingMoney: 10000,
  rewardOptionCount: 5,
  shopOptionCount: 5,
  minimumRewardTier: ModifierTier.GREAT,
  bossesCatchable: false,
  runningEnabled: false,
  /** Native health segments equal shield breakpoints plus one. */
  shieldBreakpoints: [1, 1, 1, 2, 2, 2, 3, 3, 3, 4] as const,
  enemyModifierCounts: [0, 0, 0, 1, 1, 1, 2, 2, 2, 3] as const,
  finalBossShieldBonus: 1,
  finalBossHpMultiplier: 1,
  preventDuplicateBaseSpecies: true,
  weakMovePowerThreshold: 60,
  minimumMiddleSingleStageBaseTotal: 450,
  minimumHighBossBaseTotal: 500,
  highIvs: 31,
  generationOffset: 0x42525348,
});

export interface BossRushVariantConfig {
  variant: BossRushVariant;
  displayName: "Boss Rush" | "Boss Rush (H)";
  compactDisplayName: "Boss Rush" | "Boss Rush (H)";
  generatorVersion: string;
  healBetweenBosses: boolean;
  catchingEnabled: false;
  runningEnabled: false;
  rewardMinimumTier: ModifierTier.GREAT;
  rewardOptionCount: 5;
  shopOptionCount: 5;
  startingMoney: 10000;
  shieldBreakpoints: typeof BOSS_RUSH_CONFIG.shieldBreakpoints;
}

export const BOSS_RUSH_VARIANTS: Readonly<Record<BossRushVariant, BossRushVariantConfig>> = Object.freeze({
  [BossRushVariant.NORMAL]: Object.freeze({
    variant: BossRushVariant.NORMAL,
    displayName: "Boss Rush",
    compactDisplayName: "Boss Rush",
    generatorVersion: BOSS_RUSH_ALGORITHM_VERSION,
    healBetweenBosses: true,
    catchingEnabled: false,
    runningEnabled: false,
    rewardMinimumTier: ModifierTier.GREAT,
    rewardOptionCount: 5,
    shopOptionCount: 5,
    startingMoney: 10000,
    shieldBreakpoints: BOSS_RUSH_CONFIG.shieldBreakpoints,
  }),
  [BossRushVariant.HARD]: Object.freeze({
    variant: BossRushVariant.HARD,
    displayName: "Boss Rush (H)",
    compactDisplayName: "Boss Rush (H)",
    generatorVersion: BOSS_RUSH_ALGORITHM_VERSION,
    healBetweenBosses: false,
    catchingEnabled: false,
    runningEnabled: false,
    rewardMinimumTier: ModifierTier.GREAT,
    rewardOptionCount: 5,
    shopOptionCount: 5,
    startingMoney: 10000,
    shieldBreakpoints: BOSS_RUSH_CONFIG.shieldBreakpoints,
  }),
});

export function getBossRushVariant(): BossRushVariant {
  return getCurrentDailyRunMetadata()?.bossRushVariant ?? BossRushVariant.NORMAL;
}

export function getBossRushVariantConfig(variant = getBossRushVariant()): BossRushVariantConfig {
  return BOSS_RUSH_VARIANTS[variant] ?? BOSS_RUSH_VARIANTS[BossRushVariant.NORMAL];
}

export type BossRushEligibilityCategory =
  | "can-evolve"
  | "single-stage"
  | "final-stage"
  | "legendary"
  | "mythical"
  | "paradox"
  | "mega"
  | "primal"
  | "gigantamax";

export interface BossRushPokemonConfig {
  speciesId: SpeciesId;
  formIndex: number;
  abilityIndex: number;
  nature: Nature;
  moveset: StarterMoveset;
  ivs: number[];
  category: BossRushEligibilityCategory;
}

export interface BossRushBossConfig extends BossRushPokemonConfig {
  bossIndex: number;
  shieldBreakpoints: number;
  healthSegments: number;
  enemyModifierCount: number;
  finalBoss: boolean;
}

export interface BossRushManifest {
  version: string;
  variant: BossRushVariant;
  seed: string;
  starters: BossRushPokemonConfig[];
  bosses: BossRushBossConfig[];
}

interface FormCandidate {
  species: PokemonSpecies;
  formIndex: number;
  form: PokemonSpeciesForm;
  category: BossRushEligibilityCategory;
}

const MEGA_FORM_KEYS = new Set<string>([
  SpeciesFormKey.MEGA,
  SpeciesFormKey.MEGA_X,
  SpeciesFormKey.MEGA_Y,
  SpeciesFormKey.MEGA_Z,
  SpeciesFormKey.MEGA_ORIGINAL,
  SpeciesFormKey.MEGA_CURLY,
  SpeciesFormKey.MEGA_DROOPY,
  SpeciesFormKey.MEGA_STRETCHY,
]);

const GIGANTAMAX_FORM_KEYS = new Set<string>([
  SpeciesFormKey.GIGANTAMAX,
  SpeciesFormKey.GIGANTAMAX_SINGLE,
  SpeciesFormKey.GIGANTAMAX_RAPID,
]);

/** Kept only for exact replay of manifests created by the original generator. */
const V1_GENERATION_EXCLUSIONS = new Set<SpeciesId>([
  SpeciesId.DITTO,
  SpeciesId.SMEARGLE,
  SpeciesId.SHEDINJA,
  SpeciesId.UNOWN,
]);

const MOVE_EXCLUSIONS = new Set<MoveId>([
  MoveId.NONE,
  MoveId.STRUGGLE,
  MoveId.SKETCH,
  MoveId.SPLASH,
  MoveId.SELF_DESTRUCT,
  MoveId.EXPLOSION,
  MoveId.FINAL_GAMBIT,
  MoveId.MEMENTO,
]);

export function isBossRushMode(): boolean {
  return getCurrentDailyRunMetadata()?.mode === "boss-rush";
}

export function canStillEvolve(species: PokemonSpecies): boolean {
  return speciesDataRegistry.hasEvolutions(species.speciesId);
}

export function isFinalEvolution(species: PokemonSpecies): boolean {
  return speciesDataRegistry.hasPrevolution(species.speciesId) && !canStillEvolve(species);
}

export function isSingleStage(species: PokemonSpecies): boolean {
  return !speciesDataRegistry.hasPrevolution(species.speciesId) && !canStillEvolve(species);
}

export function isLegendary(species: PokemonSpecies): boolean {
  return species.legendary || species.subLegendary;
}

export function isMythical(species: PokemonSpecies): boolean {
  return species.mythical;
}

export function isParadox(species: PokemonSpecies): boolean {
  return NON_LEGEND_PARADOX_POKEMON.includes(species.speciesId);
}

export function isMegaForm(form?: PokemonForm): boolean {
  return !!form && MEGA_FORM_KEYS.has(form.formKey);
}

export function isPrimalForm(form?: PokemonForm): boolean {
  return form?.formKey === SpeciesFormKey.PRIMAL;
}

/** Regular Dynamax is a temporary battle state and has no persistent form. */
export function isDynamaxForm(_form?: PokemonForm): boolean {
  return false;
}

export function isGigantamaxForm(form?: PokemonForm): boolean {
  return !!form && GIGANTAMAX_FORM_KEYS.has(form.formKey);
}

export function isSafeBossRushTransformation(form?: PokemonForm): boolean {
  return !!form && !form.isUnobtainable && (isMegaForm(form) || isPrimalForm(form) || isGigantamaxForm(form));
}

function getForm(species: PokemonSpecies, formIndex: number): PokemonSpeciesForm {
  return species.forms[formIndex] ?? species;
}

function getTransformationCategory(form: PokemonForm): BossRushEligibilityCategory | undefined {
  if (isMegaForm(form)) {
    return "mega";
  }
  if (isPrimalForm(form)) {
    return "primal";
  }
  if (isGigantamaxForm(form)) {
    return "gigantamax";
  }
}

function getBaseCategory(species: PokemonSpecies): BossRushEligibilityCategory {
  if (isMythical(species)) {
    return "mythical";
  }
  if (isLegendary(species)) {
    return "legendary";
  }
  if (isParadox(species)) {
    return "paradox";
  }
  if (canStillEvolve(species)) {
    return "can-evolve";
  }
  if (isSingleStage(species)) {
    return "single-stage";
  }
  return "final-stage";
}

function baseCandidate(species: PokemonSpecies): FormCandidate {
  return { species, formIndex: 0, form: getForm(species, 0), category: getBaseCategory(species) };
}

function transformationCandidates(species: PokemonSpecies): FormCandidate[] {
  return species.forms.flatMap((form, formIndex) => {
    const category = getTransformationCategory(form);
    return category && isSafeBossRushTransformation(form) ? [{ species, formIndex, form, category }] : [];
  });
}

function isOrdinarySpecies(species: PokemonSpecies): boolean {
  return !isLegendary(species) && !isMythical(species) && !isParadox(species);
}

function availableSpecies(version: string): PokemonSpecies[] {
  return speciesDataRegistry
    .getAllSpecies()
    .filter(
      species =>
        !species.isTrainerForbidden()
        && (version !== BOSS_RUSH_V1_ALGORITHM_VERSION || !V1_GENERATION_EXCLUSIONS.has(species.speciesId)),
    );
}

function starterPool(speciesList: PokemonSpecies[], version: string): FormCandidate[] {
  return speciesList.flatMap(species => {
    const transformed = transformationCandidates(species).filter(
      candidate => version !== BOSS_RUSH_V1_ALGORITHM_VERSION || candidate.form.baseTotal >= 450,
    );
    const eligibleBase = !canStillEvolve(species) || isLegendary(species) || isMythical(species) || isParadox(species);
    const base = baseCandidate(species);
    const strongEnough = version !== BOSS_RUSH_V1_ALGORITHM_VERSION || base.form.baseTotal >= 450;
    return [...(eligibleBase && strongEnough ? [base] : []), ...transformed];
  });
}

export function isBossRushStarterEligible(
  speciesId: SpeciesId,
  formIndex = 0,
  version = BOSS_RUSH_ALGORITHM_VERSION,
): boolean {
  const species = speciesDataRegistry.getSpecies(speciesId);
  return starterPool(availableSpecies(version), version).some(
    candidate => candidate.species.speciesId === species.speciesId && candidate.formIndex === formIndex,
  );
}

function earlyBossPool(speciesList: PokemonSpecies[]): FormCandidate[] {
  return speciesList
    .filter(species => isOrdinarySpecies(species) && (canStillEvolve(species) || isSingleStage(species)))
    .map(baseCandidate);
}

function middleBossPool(speciesList: PokemonSpecies[]): FormCandidate[] {
  return speciesList
    .filter(
      species =>
        isOrdinarySpecies(species)
        && (isFinalEvolution(species)
          || (isSingleStage(species) && species.baseTotal >= BOSS_RUSH_CONFIG.minimumMiddleSingleStageBaseTotal)),
    )
    .map(baseCandidate);
}

function highBossPool(speciesList: PokemonSpecies[]): FormCandidate[] {
  return speciesList.flatMap(species => {
    const transformed = transformationCandidates(species).filter(
      candidate => candidate.form.baseTotal >= BOSS_RUSH_CONFIG.minimumHighBossBaseTotal,
    );
    const isHighBase = isLegendary(species) || isMythical(species) || isParadox(species);
    const base = baseCandidate(species);
    return [
      ...(isHighBase && base.form.baseTotal >= BOSS_RUSH_CONFIG.minimumHighBossBaseTotal ? [base] : []),
      ...transformed,
    ];
  });
}

function selectDistinctCandidate(pool: FormCandidate[], usedSpecies: Set<SpeciesId>, label: string): FormCandidate {
  const eligible = pool.filter(entry => !usedSpecies.has(entry.species.speciesId));
  if (eligible.length === 0) {
    const fallback = pool.find(entry => !usedSpecies.has(entry.species.speciesId));
    if (!fallback) {
      throw new Error(`Boss Rush ${label} pool has no unused valid species.`);
    }
    if (isDev || IS_TEST) {
      console.warn(`Boss Rush ${label} selection exhausted retries; using deterministic fallback.`);
    }
    usedSpecies.add(fallback.species.speciesId);
    return fallback;
  }
  const candidate = randSeedItem(eligible);
  usedSpecies.add(candidate.species.speciesId);
  return candidate;
}

function chooseAbilityIndex(form: PokemonSpeciesForm): number {
  const choices = [0, 1, 2].filter((index, position, all) => {
    const ability = form.getAbility(index);
    return ability !== AbilityId.NONE && all.findIndex(other => form.getAbility(other) === ability) === position;
  });
  return choices.length > 0 ? randSeedItem(choices) : 0;
}

function chooseNature(form: PokemonSpeciesForm): Nature {
  const attack = form.baseStats[1];
  const specialAttack = form.baseStats[3];
  const speed = form.baseStats[5];
  if (attack > specialAttack * 1.1) {
    return speed >= 95 && randSeedInt(2) === 0 ? Nature.JOLLY : Nature.ADAMANT;
  }
  if (specialAttack > attack * 1.1) {
    return speed >= 95 && randSeedInt(2) === 0 ? Nature.TIMID : Nature.MODEST;
  }
  return speed >= 95 ? (attack >= specialAttack ? Nature.JOLLY : Nature.TIMID) : Nature.HARDY;
}

function isDamagingMove(moveId: MoveId): boolean {
  const move = allMoves[moveId];
  return (
    !!move
    && move.category !== MoveCategory.STATUS
    && (move.power !== 0 || move.hasAttr("VariablePowerAttr") || move.hasAttr("FixedDamageAttr"))
  );
}

function isValuableLowPowerMove(moveId: MoveId): boolean {
  const move = allMoves[moveId];
  return (
    !!move
    && (move.priority > 0
      || move.chance >= 30
      || move.hasAttr("MultiHitAttr")
      || move.hasAttr("VariablePowerAttr")
      || move.hasAttr("FixedDamageAttr")
      || move.hasAttr("HitHealAttr"))
  );
}

export function getBossRushLegalMovePool(speciesId: SpeciesId, formIndex: number): MoveId[] {
  const species = speciesDataRegistry.getSpecies(speciesId);
  const formKey = species.forms[formIndex]?.formKey;
  const levelMoves = species
    .getLevelMoves(formKey)
    .filter(([level]) => level <= BOSS_RUSH_CONFIG.startingLevel)
    .map(([, moveId]) => moveId);
  const tms = species.getTms(formIndex);
  const supported = [...new Set([...levelMoves, ...tms])].filter(
    moveId => !!allMoves[moveId] && (!MOVE_EXCLUSIONS.has(moveId) || speciesId === SpeciesId.SMEARGLE),
  );
  // These species intentionally retain their native unusual mechanics. The
  // explicit fallbacks guard against incomplete form learnset data without
  // inventing moves or abilities.
  if (speciesId === SpeciesId.DITTO) {
    return [MoveId.TRANSFORM];
  }
  if (speciesId === SpeciesId.SMEARGLE && supported.includes(MoveId.SKETCH)) {
    return [MoveId.SKETCH];
  }
  if (speciesId === SpeciesId.UNOWN && supported.includes(MoveId.HIDDEN_POWER)) {
    return [MoveId.HIDDEN_POWER];
  }
  return supported;
}

function removeWeakFiller(movePool: MoveId[]): MoveId[] {
  return movePool.filter(moveId => {
    const move = allMoves[moveId];
    if (
      !isDamagingMove(moveId)
      || move.power >= BOSS_RUSH_CONFIG.weakMovePowerThreshold
      || isValuableLowPowerMove(moveId)
    ) {
      return true;
    }
    return !movePool.some(otherId => {
      const other = allMoves[otherId];
      return (
        otherId !== moveId
        && isDamagingMove(otherId)
        && other.type === move.type
        && other.category === move.category
        && other.power >= BOSS_RUSH_CONFIG.weakMovePowerThreshold
        && (other.accuracy || 100) >= Math.max(move.accuracy || 100, 80)
      );
    });
  });
}

export function isBossRushWeakFillerMove(moveId: MoveId, legalPool: MoveId[]): boolean {
  return !removeWeakFiller(legalPool).includes(moveId);
}

function statusMoveScore(moveId: MoveId): number {
  const move = allMoves[moveId];
  let score = 25;
  if (move.hasAttr("HealAttr")) {
    score += 60;
  }
  const setup = move.getAttrs("StatStageChangeAttr").some(attr => attr.selfTarget && attr.stages > 0);
  if (setup) {
    score += 55;
  }
  if (move.hasAttr("StatusEffectAttr")) {
    score += 35;
  }
  if (move.hasAttr("WeatherChangeAttr")) {
    score += 5;
  }
  return score + randSeedInt(10);
}

function damagingMoveScore(moveId: MoveId, form: PokemonSpeciesForm): number {
  const move = allMoves[moveId];
  const types = new Set<number>([form.type1, form.type2].filter(type => type != null));
  const rawPower = move.power > 1 ? move.power : move.hasAttr("VariablePowerAttr") ? 80 : 65;
  let score = (rawPower * Math.max(move.accuracy || 100, 50)) / 100;
  if (types.has(move.type)) {
    score += 45;
  } else {
    score += 12;
  }
  const preferredCategory = form.baseStats[1] >= form.baseStats[3] ? MoveCategory.PHYSICAL : MoveCategory.SPECIAL;
  if (move.category === preferredCategory) {
    score += 28;
  } else if (Math.min(form.baseStats[1], form.baseStats[3]) * 1.25 < Math.max(form.baseStats[1], form.baseStats[3])) {
    score -= 18;
  }
  score += Math.max(move.priority, 0) * 12;
  score += Math.min(move.chance, 40) / 4;
  if (move.hasAttr("HitHealAttr")) {
    score += 20;
  }
  if (move.hasAttr("RechargeAttr") || move.isChargingMove()) {
    score -= 22;
  }
  if (move.hasAttr("SacrificialAttr") || move.hasAttr("SacrificialAttrOnHit")) {
    score -= 500;
  }
  return score + randSeedInt(12);
}

function moveScore(moveId: MoveId, form: PokemonSpeciesForm): number {
  return allMoves[moveId].category === MoveCategory.STATUS ? statusMoveScore(moveId) : damagingMoveScore(moveId, form);
}

function hasUnusedDamageType(damaging: Array<{ moveId: MoveId }>, selected: MoveId[]): boolean {
  return damaging.some(
    other =>
      !selected.includes(other.moveId)
      && !selected.some(id => isDamagingMove(id) && allMoves[id].type === allMoves[other.moveId].type),
  );
}

function addDiverseMoves(
  scored: Array<{ moveId: MoveId }>,
  damaging: Array<{ moveId: MoveId }>,
  selected: MoveId[],
  add: (entry?: { moveId: MoveId }) => void,
): void {
  let statusCount = 0;
  for (const entry of scored) {
    if (selected.length >= 4) {
      break;
    }
    const move = allMoves[entry.moveId];
    if (move.category === MoveCategory.STATUS && statusCount >= 1) {
      continue;
    }
    if (isDamagingMove(entry.moveId)) {
      const duplicateType = selected.some(id => isDamagingMove(id) && allMoves[id].type === move.type);
      if (duplicateType && hasUnusedDamageType(damaging, selected)) {
        continue;
      }
    } else {
      statusCount++;
    }
    add(entry);
  }
}

function buildStrongMoveset(candidate: FormCandidate): StarterMoveset {
  const legalPool = getBossRushLegalMovePool(candidate.species.speciesId, candidate.formIndex);
  const preferredPool = removeWeakFiller(legalPool);
  const pool = preferredPool.length > 0 ? preferredPool : legalPool;
  const scored = pool
    .map(moveId => ({ moveId, score: moveScore(moveId, candidate.form) }))
    .sort((a, b) => b.score - a.score || a.moveId - b.moveId);
  const damaging = scored.filter(entry => isDamagingMove(entry.moveId));
  const selected: MoveId[] = [];

  const add = (entry?: { moveId: MoveId }): void => {
    if (entry && !selected.includes(entry.moveId) && selected.length < 4) {
      selected.push(entry.moveId);
    }
  };
  const types = new Set<number>([candidate.form.type1, candidate.form.type2].filter(type => type != null));
  add(damaging.find(entry => types.has(allMoves[entry.moveId].type)));
  add(damaging.find(entry => !types.has(allMoves[entry.moveId].type)) ?? damaging[1]);
  addDiverseMoves(scored, damaging, selected, add);
  for (const entry of scored) {
    add(entry);
  }
  return selected.slice(0, 4) as StarterMoveset;
}

function buildPokemonConfig(candidate: FormCandidate): BossRushPokemonConfig {
  return {
    speciesId: candidate.species.speciesId,
    formIndex: candidate.formIndex,
    abilityIndex: chooseAbilityIndex(candidate.form),
    nature: chooseNature(candidate.form),
    moveset: buildStrongMoveset(candidate),
    ivs: new Array(6).fill(BOSS_RUSH_CONFIG.highIvs),
    category: candidate.category,
  };
}

function buildManifest(seed: string, version: string, variant: BossRushVariant): BossRushManifest {
  const speciesList = availableSpecies(version);
  const starterCandidates = starterPool(speciesList, version);
  const earlyCandidates = earlyBossPool(speciesList);
  const middleCandidates = middleBossPool(speciesList);
  const highCandidates = highBossPool(speciesList);
  const usedStarters = new Set<SpeciesId>();
  const starters = Array.from({ length: BOSS_RUSH_CONFIG.startingPartySize }, (_, index) =>
    buildPokemonConfig(selectDistinctCandidate(starterCandidates, usedStarters, `starter ${index + 1}`)),
  );
  const usedBosses = new Set<SpeciesId>(usedStarters);
  const bosses = Array.from({ length: BOSS_RUSH_CONFIG.bossCount }, (_, index) => {
    const pool = index < 3 ? earlyCandidates : index < 6 ? middleCandidates : highCandidates;
    const candidate = selectDistinctCandidate(pool, usedBosses, `boss ${index + 1}`);
    const shieldBreakpoints = BOSS_RUSH_CONFIG.shieldBreakpoints[index];
    return {
      ...buildPokemonConfig(candidate),
      bossIndex: index + 1,
      shieldBreakpoints,
      healthSegments: shieldBreakpoints + 1,
      enemyModifierCount: BOSS_RUSH_CONFIG.enemyModifierCounts[index],
      finalBoss: index === BOSS_RUSH_CONFIG.bossCount - 1,
    } satisfies BossRushBossConfig;
  });
  return { version, variant, seed, starters, bosses };
}

function generateBossRushManifestVersion(seed: string, version: string, variant: BossRushVariant): BossRushManifest {
  let manifest: BossRushManifest | undefined;
  globalScene.executeWithSeedOffset(
    () => {
      manifest = buildManifest(seed, version, variant);
    },
    BOSS_RUSH_CONFIG.generationOffset,
    version === BOSS_RUSH_V1_ALGORITHM_VERSION ? seed : `${seed}|${variant}`,
  );
  if (!manifest) {
    throw new Error("Boss Rush generation did not produce a manifest.");
  }
  logBossRushManifest(manifest);
  return manifest;
}

export function generateBossRushManifest(
  seed: string,
  variant = BossRushVariant.NORMAL,
  version = BOSS_RUSH_ALGORITHM_VERSION,
): BossRushManifest {
  const compatibility: SeededRunCompatibility = {
    schemaVersion: 1,
    generatorId: "boss-rush",
    generatorVersion: version,
    variant,
  };
  return generateVersionedSeededContent(seed, compatibility, {
    [BOSS_RUSH_V1_ALGORITHM_VERSION]: canonicalSeed =>
      generateBossRushManifestVersion(canonicalSeed, BOSS_RUSH_V1_ALGORITHM_VERSION, BossRushVariant.NORMAL),
    [BOSS_RUSH_ALGORITHM_VERSION]: (canonicalSeed, saved) =>
      generateBossRushManifestVersion(canonicalSeed, BOSS_RUSH_ALGORITHM_VERSION, saved.variant as BossRushVariant),
  });
}

export function cloneBossRushManifest(manifest?: BossRushManifest): BossRushManifest | undefined {
  if (!manifest) {
    return;
  }
  return {
    ...manifest,
    starters: manifest.starters.map(starter => ({
      ...starter,
      moveset: [...starter.moveset] as StarterMoveset,
      ivs: [...starter.ivs],
    })),
    bosses: manifest.bosses.map(boss => ({
      ...boss,
      moveset: [...boss.moveset] as StarterMoveset,
      ivs: [...boss.ivs],
    })),
  };
}

function currentManifest(): BossRushManifest | undefined {
  const metadata = getCurrentDailyRunMetadata();
  if (metadata?.mode !== "boss-rush") {
    return;
  }
  return (
    metadata.bossRushManifest
    ?? generateBossRushManifest(
      metadata.canonicalSeed,
      metadata.bossRushVariant ?? BossRushVariant.NORMAL,
      metadata.seededRunCompatibility?.generatorVersion ?? metadata.algorithmVersion ?? BOSS_RUSH_V1_ALGORITHM_VERSION,
    )
  );
}

export function getBossRushStarterConfigs(): BossRushPokemonConfig[] {
  return cloneBossRushManifest(currentManifest())?.starters ?? [];
}

export function getBossRushBossConfig(
  waveIndex = globalScene.currentBattle?.waveIndex ?? 0,
): BossRushBossConfig | undefined {
  return cloneBossRushManifest(currentManifest())?.bosses[waveIndex - 1];
}

export function getBossRushRewardSettings(): CustomModifierSettings {
  const config = getBossRushVariantConfig();
  return {
    guaranteedModifierTiers: new Array(config.rewardOptionCount).fill(config.rewardMinimumTier),
    fillRemaining: false,
    allowLuckUpgrades: true,
  };
}

export function applyBossRushEnemyConfig(pokemon: EnemyPokemon): void {
  const config = getBossRushBossConfig();
  if (!config) {
    return;
  }
  pokemon.formIndex = config.formIndex;
  pokemon.abilityIndex = config.abilityIndex;
  pokemon.ivs = [...config.ivs];
  pokemon.setNature(config.nature);
  pokemon.tryPopulateMoveset(config.moveset, true);
  pokemon.setBoss(true, config.healthSegments);
  if (isDev && !IS_TEST) {
    console.info(
      "Boss Rush player held modifiers",
      globalScene
        .findModifiers(modifier => "pokemonId" in modifier)
        .map(modifier => ({
          modifier: modifier.type.id,
          pokemonId: "pokemonId" in modifier ? modifier.pokemonId : undefined,
          stackCount: modifier.stackCount,
        })),
    );
  }
}

export function logBossRushRewards(tiers: readonly ModifierTier[]): void {
  if (isDev && !IS_TEST) {
    console.info("Boss Rush rewards", {
      wave: globalScene.currentBattle?.waveIndex,
      tiers: tiers.map(tier => ModifierTier[tier]),
    });
  }
}

function logBossRushManifest(manifest: BossRushManifest): void {
  if (!isDev || IS_TEST) {
    return;
  }
  const describe = (config: BossRushPokemonConfig) => ({
    species: SpeciesId[config.speciesId],
    formIndex: config.formIndex,
    category: config.category,
    moves: config.moveset.map(move => MoveId[move]),
  });
  console.info("Boss Rush generated", {
    seed: manifest.seed,
    starters: manifest.starters.map(describe),
    bosses: manifest.bosses.map(boss => ({
      ...describe(boss),
      bossIndex: boss.bossIndex,
      shieldBreakpoints: boss.shieldBreakpoints,
      modifiers: boss.enemyModifierCount,
      finalBossBonus: boss.finalBoss
        ? { shields: BOSS_RUSH_CONFIG.finalBossShieldBonus, hpMultiplier: BOSS_RUSH_CONFIG.finalBossHpMultiplier }
        : undefined,
    })),
  });
}
