-- Informational preset only (owner decisions, 9 Oct 2026). Keep it separate
-- from queue/roster code so reading the guide never applies guild changes.
-- Current recommendation follows the owner-confirmed .199 ten-rank ladder.
local ranks = {
  "Leader (Guild Master)", "High Council", "Officer", "Officer Alt", "Raid Leader",
  "Veteran", "Raider", "Member", "Alt", "Initiate",
}

OlympusVerifyRanks = {}
function OlympusVerifyRanks.Print(printLine)
  if type(printLine) ~= "function" then return false end
  printLine("Recommended ten-rank preset (highest first; native indices 0-9):")
  for i, rank in ipairs(ranks) do
    printLine(string.format("  %d: %s", i - 1, rank))
  end
  printLine("Appointments: Co-Guild Master (Co-GM) and Treasurer are High Council offices (native index 1, second rank), not extra native ranks. Officer is native index 2; Officer Alt is native index 3.")
  printLine("The approved preset gives every High Council member Withdraw Gold and Modify Bank Tabs.")
  printLine("Raid Leader retains the authenticator safeguard in the preset.")
  printLine("No numeric bank withdrawal allowances have been approved.")
  printLine("Guide only: native Guild Master setup and permission review remain attended in-game actions. This recommendation does not verify anyone’s current game rank. This command changes no ranks, appointments or permissions.")
  return true
end
