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
