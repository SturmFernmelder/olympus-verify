/** .181: generic sign-in branding only; no private title, path, account or Army data enters link previews. */
export function olympusSocialMetadata(): string {
  return [
    '<meta name="description" content="Enter the Olympus guild hall for World of Warcraft: Forever. Sign in with Discord to access the member website.">',
    '<meta property="og:type" content="website">',
    '<meta property="og:site_name" content="Olympus">',
    '<meta property="og:title" content="Olympus — World of Warcraft: Forever">',
    '<meta property="og:description" content="Enter the guild hall. Sign in with Discord to access Olympus.">',
    '<meta property="og:url" content="https://olympus.roachcouncil.com/">',
    '<meta property="og:image" content="https://olympus.roachcouncil.com/static/olympus-icon.png">',
    '<meta property="og:image:type" content="image/png">',
    '<meta property="og:image:width" content="250">',
    '<meta property="og:image:height" content="250">',
    '<meta property="og:image:alt" content="Owner-approved Olympus guild tabard: a mountain banner inside a circular gold frame">',
    '<meta name="twitter:card" content="summary">',
    '<meta name="twitter:title" content="Olympus — World of Warcraft: Forever">',
    '<meta name="twitter:description" content="Enter the guild hall. Sign in with Discord to access Olympus.">',
    '<meta name="twitter:image" content="https://olympus.roachcouncil.com/static/olympus-icon.png">'
  ].join('\n');
}
