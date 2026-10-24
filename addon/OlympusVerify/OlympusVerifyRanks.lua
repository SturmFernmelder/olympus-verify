-- Informational preset only (owner decisions, 9 Oct 2026). Keep it separate
-- from queue/roster code so reading the guide never applies guild changes.
-- Current recommendation follows the owner-selected B ladder of 23 Oct 2026.
local ranks = {
  "Guild Master (GM)", "High Council", "Treasurer", "Officer", "Raid Leader",
  "Veteran", "Raider", "Member", "Alt", "Initiate",
}

OlympusVerifyRanks = {}
function OlympusVerifyRanks.Print(printLine)
  if type(printLine) ~= "function" then return false end
  printLine("Recommended ten-rank preset (highest first; native indices 0-9):")
  for i, rank in ipairs(ranks) do
    printLine(string.format("  %d: %s", i - 1, rank))
  end
  printLine("Appointments: Co-Guild Master (Co-GM) is an office recommended for High Council (native index 1, second rank); Treasurer is native index 2 (third rank) and Officer is native index 3 (fourth rank). Officer Alt is a historical office alias, not an extra native rank.")
  printLine("The approved preset gives every High Council member Withdraw Gold and Modify Bank Tabs.")
  printLine("Raid Leader retains the authenticator safeguard in the preset.")
  printLine("No numeric bank withdrawal allowances have been approved.")
  printLine("Guide only: native Guild Master setup and permission review remain attended in-game actions. This recommendation does not verify anyone’s current game rank. This command changes no ranks, appointments or permissions.")
  return true
end
