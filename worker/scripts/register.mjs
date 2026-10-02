#!/usr/bin/env node
/**
 * One-time registration: role-connection metadata (the Linked Role requirement) and the guild slash commands.
 *   DISCORD_APP_ID=... DISCORD_BOT_TOKEN=... GUILD_ID=1549537348516188200 node scripts/register.mjs
 * Re-run whenever the command definitions change. Node 18+ (global fetch).
 */
import { existsSync, readFileSync as _readFileSync } from "node:fs";
import { fileURLToPath as _fileURLToPath } from "node:url";
import { dirname as _dirname, join as _join } from "node:path";
import { introsCommand, lookupCommand } from "./intros-command.mjs";

// Fall back to worker/.dev.vars (gitignored, the same file `wrangler dev` reads) so the bot token never has to be
// typed on a command line or pasted into a chat. Values already in the environment win.
const _here = _dirname(_fileURLToPath(import.meta.url));
const _devVars = _join(_here, "..", ".dev.vars");
if (existsSync(_devVars)) {
  for (const raw of _readFileSync(_devVars, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (!process.env[k]) process.env[k] = v;
  }
}

const APP = process.env.DISCORD_APP_ID;
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD = process.env.GUILD_ID;
if (!GUILD || !/^\d{17,20}$/.test(GUILD)) {
  // .55: this PUT replaces a whole server's command list; the server is named explicitly, never defaulted.
  console.error("GUILD_ID is required (a server id): this run replaces that server's command list. There is no default.");
  process.exit(1);
}
if (!APP || !TOKEN) {
  console.error("DISCORD_APP_ID and DISCORD_BOT_TOKEN are required — set them in the environment or in worker/.dev.vars");
  process.exit(1);
}
const API = "https://discord.com/api/v10";
const headers = { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" };

async function put(path, body) {
  const res = await fetch(API + path, { method: "PUT", headers, body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`${path} -> ${res.status} ${text}`);
  return text;
}

// 0. Application URLs. PUBLIC_BASE_URL comes from the environment or from wrangler.toml next to this script.
//    Discord validates interactions_endpoint_url by sending a signed PING — the Worker must already be deployed.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
let BASE = process.env.PUBLIC_BASE_URL;
if (!BASE) {
  try {
    const toml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "wrangler.toml"), "utf8");
    BASE = toml.match(/^PUBLIC_BASE_URL\s*=\s*"([^"]+)"/m)?.[1];
  } catch {}
}
if (BASE && !/REPLACE/.test(BASE)) {
  BASE = BASE.replace(/\/+$/, "");
  const res = await fetch(`${API}/applications/@me`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ interactions_endpoint_url: `${BASE}/interactions`, role_connections_verification_url: `${BASE}/linked-role` }),
  });
  const app = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`could not set the application URLs (${res.status}): ${JSON.stringify(app)}`);
    console.error(`  is the Worker live at ${BASE}/health and deployed with DISCORD_PUBLIC_KEY?`);
    process.exit(1);
  }
  console.log(`interactions endpoint = ${app.interactions_endpoint_url}`);
  console.log(`linked roles url      = ${app.role_connections_verification_url}`);
  const redirects = app.redirect_uris ?? [];
  const wanted = `${BASE}/oauth/callback`;
  if (redirects.includes(wanted)) console.log(`oauth2 redirect       = ${wanted} (registered)`);
  else console.log(`oauth2 redirect       = NOT registered yet — add ${wanted} under OAuth2 → Redirects in the Developer Portal (the API cannot set it)`);
} else {
  console.log("PUBLIC_BASE_URL not set — skipping the application URLs");
}

// 1. Linked Role metadata. Type 7 = BOOLEAN_EQUAL. The role requirement in Discord is "battlenet_linked is true".
await put(`/applications/${APP}/role-connections/metadata`, [
  { type: 7, key: "battlenet_linked", name: "Battle.net linked", description: "A verified Battle.net account is connected to this Discord account" },
]);
console.log("role-connection metadata registered");

// 2. Guild commands.
const STRING = 3, USER = 6, CHANNEL = 7, SUB = 1;
const commands = [
  {
    name: "verify",
    description: "Get a one-day code to whisper to an officer in game (the character that sends it is linked)",
    // Optional since 27 Sep: without it the code works from whichever character whispers it (a request code).
    options: [{ type: STRING, name: "character", autocomplete: true, description: "Optional: only this character may use the code", required: false, max_length: 32 }],
  },
  { name: "verify-status", description: "Show your verified characters and your Olympus access" },
  {
    name: "olympus-admin",
    description: "Officer tools for the verification bot",
    default_member_permissions: "268435456", // MANAGE_ROLES as a first gate; the Worker checks Officer/Moderator/Guild Leader roles too
    options: [
      { type: SUB, name: "unbind", description: "Release a character name from its Discord account", options: [{ type: STRING, name: "character", description: "Character", required: true }] },
      { type: SUB, name: "ban", description: "Refuse verification for a Discord account and its characters", options: [{ type: USER, name: "user", description: "Member", required: true }, { type: STRING, name: "reason", description: "Reason", required: false }] },
      { type: SUB, name: "unban", description: "Allow verification again", options: [{ type: USER, name: "user", description: "Member", required: true }] },
      { type: SUB, name: "queue", description: "Show pending invites" },
      { type: SUB, name: "sync", description: "Re-apply the latest roster export now (grants and removals)" },
      { type: SUB, name: "roster", description: "Last roster export and who in the guild is not verified here" },
      {
        type: SUB,
        name: "lookup",
        description: "Who owns a character, or which characters a member linked",
        options: [
          { type: STRING, name: "character", description: "Character name", required: false },
          { type: USER, name: "user", description: "Member", required: false },
        ],
      },
      {
        type: SUB,
        name: "refresh-guide",
        description: "Update the pinned guide in place after a redeploy — keeps the pin, leaves no stale copy",
        options: [{ type: CHANNEL, name: "channel", description: "Channel (default: this one)", required: false, channel_types: [0] }],
      },
      {
        type: SUB,
        name: "post-guide",
        description: "Post the verification guide with its buttons (here, or in the channel given) — pin it afterwards",
        options: [{ type: CHANNEL, name: "channel", description: "Channel (default: this one)", required: false, channel_types: [0] }],
      },
    ],
  },
  // User context menu (right-click a member → Apps): same answer as /olympus-admin lookup user:. Type 2 = USER command;
  // the name must match USER_MENU_LOOKUP in src/interactions.ts. Officer/Moderator/Guild Leader roles are checked by the Worker.
  { name: "Olympus linked characters", type: 2, default_member_permissions: "268435456" },
];
// Build .39: once verification serves the same server as the Olympus intros (after the move), the PUT below replaces
// that server's whole command list, so /olympus-intros has to be in it or it would vanish. Before the move the two
// servers differ and `npm run register:intros` registers it on its own.
let INTROS_GUILD = process.env.INTROS_GUILD_ID;
if (INTROS_GUILD === undefined) {
  try {
    const toml = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "wrangler.toml"), "utf8");
    INTROS_GUILD = toml.match(/^INTROS_GUILD_ID\s*=\s*"([^"]*)"/m)?.[1] ?? "";
  } catch {
    INTROS_GUILD = "";
  }
}
// Build .41: /olympus-lookup too. The right-click "Olympus linked characters" is already in the list above (same name,
// same answer since .41), so it is not added a second time: Discord refuses two commands with one name.
if (INTROS_GUILD && INTROS_GUILD === GUILD) commands.push(introsCommand, lookupCommand);
await put(`/applications/${APP}/guilds/${GUILD}/commands`, commands);
console.log(`registered ${commands.length} guild commands in ${GUILD}`);
