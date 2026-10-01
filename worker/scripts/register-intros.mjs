#!/usr/bin/env node
/**
 * Registers the bot's commands in the server that holds the Olympus intros (INTROS_GUILD_ID): /olympus-intros
 * (build .39), and /olympus-lookup plus the "Olympus linked characters" right-click (build .41).
 *   npm run register:intros
 *
 * One POST per command creates or updates just that command and leaves every other command in that server alone,
 * unlike register.mjs, whose PUT replaces a server's whole list. Re-posting an existing command keeps its id, so the
 * roles already allowed for it under Integrations stay allowed. DISCORD_BOT_TOKEN comes from the environment or
 * worker/.dev.vars (never typed on a command line); DISCORD_APP_ID and INTROS_GUILD_ID from the environment or
 * wrangler.toml. The bot must already be in that server, added with the applications.commands scope.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { asmongoldCommands } from "./intros-command.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const devVars = join(here, "..", ".dev.vars");
if (existsSync(devVars)) {
  for (const raw of readFileSync(devVars, "utf8").split(/\r?\n/)) {
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
const toml = readFileSync(join(here, "..", "wrangler.toml"), "utf8");
const fromToml = (key) => toml.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m"))?.[1] ?? "";

const APP = process.env.DISCORD_APP_ID || fromToml("DISCORD_APP_ID");
const TOKEN = process.env.DISCORD_BOT_TOKEN;
const GUILD = process.env.INTROS_GUILD_ID || fromToml("INTROS_GUILD_ID");
if (!TOKEN) {
  console.error("DISCORD_BOT_TOKEN is not set (no worker/.dev.vars, nothing in the environment). In PowerShell, in this window:");
  console.error('  $env:DISCORD_BOT_TOKEN = Read-Host "Bot token"      # paste it at the prompt; it stays out of the command history');
  console.error("  npm run register:intros");
  console.error("Use the token you already have. Resetting it in the Developer Portal breaks the Worker until you also run");
  console.error("  npx wrangler secret put DISCORD_BOT_TOKEN");
  process.exit(1);
}
if (!APP || !GUILD) {
  console.error(`Missing ${!APP ? "DISCORD_APP_ID" : "INTROS_GUILD_ID"}: set it in wrangler.toml [vars] (or the environment).`);
  process.exit(1);
}

let failed = false;
for (const command of asmongoldCommands) {
  const res = await fetch(`https://discord.com/api/v10/applications/${APP}/guilds/${GUILD}/commands`, {
    method: "POST",
    headers: { Authorization: `Bot ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(command),
  });
  const text = await res.text();
  const label = command.type === 2 ? `"${command.name}" (right-click)` : `/${command.name}`;
  if (!res.ok) {
    failed = true;
    console.error(`could not register ${label} in ${GUILD} (${res.status}): ${text}`);
    if (res.status === 403 || res.status === 404) {
      console.error("  This usually means the bot is not in that server yet, or was added without the applications.commands scope.");
    }
    continue;
  }
  const cmd = JSON.parse(text);
  console.log(`registered ${label} (id ${cmd.id}) in ${GUILD}`);
}
if (failed) process.exit(1);
console.log("Only Administrators see them until the server allows roles: Server Settings -> Integrations -> Olympus Verify ->");
console.log("each command -> add Olympus Officer and Olympus Guild Leader. The Worker checks those roles on every use as well.");
