-- Informational preset only (owner decisions, 9 Oct 2026). Keep it separate
-- from queue/roster code so reading the guide never applies guild changes.
-- Preserve the historical .199 recommendation; observe today's profile separately.
local ranks = {
  "Leader (Guild Master)", "High Council", "Officer", "Officer Alt", "Raid Leader",
  "Veteran", "Raider", "Member", "Alt", "Initiate",
}

OlympusVerifyRanks = {}
function OlympusVerifyRanks.Print(printLine)
  if type(printLine) ~= "function" then return false end
  local native = OlympusVerifyNativeRanks
  local observed = native and native.Observe and native.Observe()
  local scheme = native and native.Scheme and native.Scheme(observed)
  if scheme then
    printLine("Current observed native profile: "..scheme.profile.." (highest first; native indices 0-9):")
    for i, rank in ipairs(observed.names) do printLine(string.format("  %d: %s",i-1,rank)) end
    printLine(string.format("Current native targets: Veteran %d; Member %d; Alt %d; Initiate %d. Observation alone grants no promotion authority.",scheme.veteran,scheme.member,scheme.alt,scheme.initiate))
  else
    printLine("Current native profile: unconfirmed. The complete readable rank table must match a supported profile; the historical preset below is not a current observation.")
  end
  printLine("Historical recommended preset (9 October 2026; native indices 0-9):")
  for i, rank in ipairs(ranks) do
    printLine(string.format("  %d: %s", i - 1, rank))
  end
  printLine("Historical preset appointments: Co-Guild Master (Co-GM) and Treasurer are High Council offices (native index 1, second rank), not extra native ranks. Officer is native index 2; Officer Alt is native index 3.")
  printLine("The historical approved preset gives every High Council member Withdraw Gold and Modify Bank Tabs.")
  printLine("Raid Leader retains the authenticator safeguard in the historical preset.")
  printLine("No numeric bank withdrawal allowances have been approved.")
  printLine("Historical guidance only: native Guild Master setup and permission review remain attended in-game actions. This preset does not verify anyone’s current game rank. This command changes no ranks, appointments or permissions.")
  return true
end
