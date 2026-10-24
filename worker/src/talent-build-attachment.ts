import { TALENT_ATTACHMENT_CLASSES, TALENT_SNAPSHOT_REVISION } from './talent-build-contract';

/** The saved value is a small snapshot-bound code; no fetch, profile or URL survives validation. */
export function talentBuildAttachment(input: unknown, siteHost = 'olympus.roachcouncil.com'): { code: string; className?: string; level?: number; points?: number } | null {
  if (input === undefined || input === null || input === '') return { code: '' };
  if (typeof input !== 'string' || input.length > 512) return null;
  let code = input.trim(), urlClass: string | undefined;
  if (code === '') return { code: '' };
  if (code.startsWith('https://')) {
    // A trusted caller still must supply a canonical host, not an origin, path, credential or URL alias.
    if (typeof siteHost !== 'string' || !siteHost || siteHost.length > 253) return null;
    let origin: URL;
    try { origin = new URL('https://' + siteHost); } catch { return null; }
    if (origin.host !== siteHost || origin.origin !== 'https://' + siteHost || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) return null;
    let url: URL;
    try { url = new URL(code); } catch { return null; }
    if (url.origin !== 'https://' + siteHost || url.username || url.password || url.pathname !== '/' || url.search) return null;
    const fragment = /^#\/talents\/([a-z]+)\/([^/]+)$/.exec(url.hash);
    if (!fragment) return null;
    urlClass = fragment[1];
    try { code = decodeURIComponent(fragment[2]!); } catch { return null; }
    // Reject URL-normalized spellings, encoded fragments and surplus syntax. The actual calculator emits this form.
    if (input.trim() !== origin.origin + '/#/talents/' + urlClass + '/' + code) return null;
  }
  const match = /^ot1\.([a-f0-9]{12})\.([a-z]+)\.([1-6][0-9])\.([0-9]+)$/.exec(code);
  if (!match || match[1] !== TALENT_SNAPSHOT_REVISION || code.length > 256 || urlClass && urlClass !== match[2]) return null;
  const className = match[2]!, level = Number(match[3]), rows = Object.hasOwn(TALENT_ATTACHMENT_CLASSES, className) ? TALENT_ATTACHMENT_CLASSES[className] : null;
  if (!rows || level > 60 || match[4]!.length !== rows.length) return null;
  const ranks = Array.from(match[4]!, Number);
  if (rows.some((row, index) => ranks[index]! > row[0]!)) return null;
  const points = ranks.reduce((sum, value) => sum + value, 0);
  if (points > level - 9) return null;
  for (let index = 0; index < rows.length; index++) {
    if (!ranks[index]) continue;
    const row = rows[index]!;
    const lower = rows.reduce((sum, other, j) => sum + (other[2] === row[2] && other[1]! < row[1]! ? ranks[j]! : 0), 0);
    if (lower < 5 * (row[1]! - 1)) return null;
    if (row[3]! >= 0 && ranks[row[3]!] !== rows[row[3]!]![0]) return null;
  }
  return { code, className, level, points };
}

export const TALENT_BUILD_COLLECTION_LIMITS = Object.freeze({ version: 1, characters: 3, builds: 6, levels: Object.freeze([30, 60]), bytes: 2048 });
export interface ApplicationTalentCharacter { character: string; class: string; build30: string; build60: string }
export interface ApplicationTalentBuilds { version: 1; characters: ApplicationTalentCharacter[] }
export interface SharedApplicationTalentBuild { character: string; class: string; level: 30 | 60; code: string }
export type TalentCharacterParser = (input: unknown) => { name: string; key: string } | { error: string };
interface TalentCollectionContext { character: string | null; className: string; siteHost?: string; previous?: unknown }

/** Only exact own stored old codes can survive unrelated edits; they remain opaque, never current calculator proof. */
export function unchangedHistoricalTalentBuild(input: unknown, previous: unknown, className: string, level?: 30 | 60): string | null {
  if (typeof input !== 'string' || input !== previous || input.length > 256) return null;
  const match = /^ot1\.([a-f0-9]{12})\.(warrior|paladin|hunter|rogue|priest|shaman|mage|warlock|druid)\.([1-5][0-9]|60)\.[0-5]+$/.exec(input);
  return match && match[1] !== TALENT_SNAPSHOT_REVISION && match[2] === className && (level === undefined || Number(match[3]) === level) ? input : null;
}

function closedData(input: unknown, allowed: readonly string[]): Record<string, unknown> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input) || Object.getOwnPropertySymbols(input).length) return null;
  const descriptors = Object.getOwnPropertyDescriptors(input);
  if (Object.entries(descriptors).some(([key, value]) => !allowed.includes(key) || !Object.hasOwn(value, 'value'))) return null;
  return Object.fromEntries(Object.entries(descriptors).map(([key, value]) => [key, value.value]));
}

function collectionRows(input: unknown, context: TalentCollectionContext, parseCharacter: TalentCharacterParser): (ApplicationTalentCharacter & { key: string })[] | null {
  const envelope = closedData(input, ['version', 'characters']);
  if (!envelope || envelope.version !== 1 || !Array.isArray(envelope.characters) || envelope.characters.length > TALENT_BUILD_COLLECTION_LIMITS.characters) return null;
  const rows: (ApplicationTalentCharacter & { key: string })[] = [], seen = new Set<string>();
  for (const value of envelope.characters) {
    const row = closedData(value, ['character', 'class', 'build30', 'build60']);
    if (!row || typeof row.character !== 'string' || row.character.length > 40 || /[\u0000-\u001f\u007f]/.test(row.character) || typeof row.class !== 'string' || !Object.hasOwn(TALENT_ATTACHMENT_CLASSES, row.class)) return null;
    const name = parseCharacter(row.character);
    if ('error' in name || seen.has(name.key)) return null;
    const build30 = row.build30 === undefined ? '' : row.build30, build60 = row.build60 === undefined ? '' : row.build60;
    if (typeof build30 !== 'string' || typeof build60 !== 'string' || build30.length > 512 || build60.length > 512 || !build30 && !build60) return null;
    if (!rows.length && (name.name !== context.character || row.class !== context.className)) return null;
    seen.add(name.key); rows.push({ character: name.name, class: row.class, build30, build60, key: name.key });
  }
  return rows;
}

/** A maximum of three explicitly declared application characters, each with optional level30/60 builds. */
export function applicationTalentBuilds(input: unknown, context: TalentCollectionContext, parseCharacter: TalentCharacterParser): ApplicationTalentBuilds | null {
  const empty: ApplicationTalentBuilds = { version: 1, characters: [] };
  const selected = input === undefined ? context.previous ?? empty : input === null ? empty : input;
  const rows = collectionRows(selected, context, parseCharacter);
  if (!rows) return null;
  const previous = context.previous === undefined ? [] : collectionRows(context.previous, context, parseCharacter) ?? [];
  const characters: ApplicationTalentCharacter[] = [];
  for (const row of rows) {
    const prior = previous.find(value => value.key === row.key && value.class === row.class);
    const result: ApplicationTalentCharacter = { character: row.character, class: row.class, build30: '', build60: '' };
    for (const level of [30, 60] as const) {
      const key = level === 30 ? 'build30' : 'build60', raw = row[key];
      if (!raw) continue;
      const current = talentBuildAttachment(raw, context.siteHost);
      if (current?.code && current.className === row.class && current.level === level) result[key] = current.code;
      else {
        const retained = unchangedHistoricalTalentBuild(raw, prior?.[key], row.class, level);
        if (!retained) return null;
        result[key] = retained;
      }
    }
    characters.push(result);
  }
  const result: ApplicationTalentBuilds = { version: 1, characters };
  return new TextEncoder().encode(JSON.stringify(result)).byteLength <= TALENT_BUILD_COLLECTION_LIMITS.bytes ? result : null;
}

/** Board callers supply only the separate consent flag and this collection, never the general answers object. */
export function sharedApplicationTalentBuilds(input: unknown, consent: unknown, context: Omit<TalentCollectionContext, 'previous'>, parseCharacter: TalentCharacterParser): SharedApplicationTalentBuild[] {
  if (consent !== true) return [];
  const value = applicationTalentBuilds(input, { character: context.character, className: context.className, siteHost: context.siteHost }, parseCharacter);
  if (!value) return [];
  return value.characters.flatMap(character => ([30, 60] as const).flatMap(level => {
    const code = level === 30 ? character.build30 : character.build60;
    return code ? [{ character: character.character, class: character.class, level, code }] : [];
  }));
}
