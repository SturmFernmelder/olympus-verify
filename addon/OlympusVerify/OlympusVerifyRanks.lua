-- Informational preset only (owner decisions, 9 Oct 2026). Keep it separate
-- from queue/roster code so reading the guide never applies guild changes.
local ranks = {
  "Guild Master (GM)", "High Council", "Officer", "Officer Alt", "Raid Leader",
  "Veteran", "Raider", "Member", "Alt", "Initiate",
}

OlympusVerifyRanks = {}
function OlympusVerifyRanks.Print(printLine)
  if type(printLine) ~= "function" then return false end
  printLine("Recommended ten-rank preset (highest first; native indices 0-9):")
  for i, rank in ipairs(ranks) do
    printLine(string.format("  %d: %s", i - 1, rank))
  end
  printLine("Appointments: Treasurer belongs within High Council; Co-Guild Master (Co-GM) is an appointment, not an extra native rank.")
  printLine("The approved preset gives every High Council member Withdraw Gold and Modify Bank Tabs.")
  printLine("Raid Leader retains the authenticator safeguard in the preset.")
  printLine("No numeric bank withdrawal allowances have been approved.")
  printLine("Guide only: native Guild Master setup and permission review remain attended in-game actions. This command changes no ranks, appointments or permissions.")
  return true
end
