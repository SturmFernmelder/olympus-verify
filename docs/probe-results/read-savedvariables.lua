dofile(arg[1])
local DB = OlympusProbeDB
local function dump(v, ind, depth)
  ind = ind or ""; depth = depth or 0
  if type(v) ~= "table" then return tostring(v) end
  local keys = {}
  for k in pairs(v) do keys[#keys + 1] = k end
  table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
  local out = { "{" }
  for _, k in ipairs(keys) do out[#out + 1] = ind .. "  " .. tostring(k) .. " = " .. dump(v[k], ind .. "  ", depth + 1) end
  out[#out + 1] = ind .. "}"
  return table.concat(out, "\n")
end
print("probeVersion", DB.probeVersion, "sessions", #DB.sessions)
for si, S in ipairs(DB.sessions) do
  print("==================== session", si, S.startedAt, "→", S.endedAt)
  print("build", dump(S.build), "tocversion", S.tocversion)
  print("flags", dump(S.flags))
  print("cvars", dump(S.cvars))
  print("player", dump(S.player))
  print("guild", dump(S.guild))
  print("roster", dump(S.roster))
  print("projectGlobals", dump(S.projectGlobals))
  print("---- tests")
  for _, t in ipairs(S.tests or {}) do print(t.at, t.phase, t.label or "", t.result or "", t.inGuild or "") end
  print("---- forbidden")
  for _, f in ipairs(S.forbidden or {}) do print(f.at, f.event, f.addon, f.func, f.phase) end
  print("---- testMessages")
  for _, m in ipairs(S.testMessages or {}) do print(m.at, m.event, m.phase, m.text) end
  print("---- chat")
  for _, c in ipairs(S.chat or {}) do print(c.at, c.event, "nargs=" .. tostring(c.nargs), "sender=" .. tostring(c.sender), "sender2=" .. tostring(c.sender2), "guid=" .. tostring(c.guid), "bn=" .. tostring(c.bnSenderID), "lineID=" .. tostring(c.lineID), "len=" .. tostring(c.msgLen), c.text or "", "types=" .. tostring(c.types)) end
  print("---- errors")
  for _, e in ipairs(S.errors or {}) do print(e.at, e.err) end
  print("---- funcs: absent / non-function")
  local keys = {}
  for k, v in pairs(S.funcs or {}) do if v ~= "function" then keys[#keys + 1] = k .. " = " .. tostring(v) end end
  table.sort(keys); for _, k in ipairs(keys) do print("  " .. k) end
  print("---- funcs: present count", (function() local c = 0; for _, v in pairs(S.funcs or {}) do if v == "function" then c = c + 1 end end; return c end)())
  print("---- namespaces (count)")
  local ns = {}
  for k, v in pairs(S.namespaces or {}) do ns[#ns + 1] = k .. "=" .. tostring(v) end
  table.sort(ns); print(table.concat(ns, " "))
  print("---- namespaceFuncs")
  for k, v in pairs(S.namespaceFuncs or {}) do print(k .. ": " .. v) end
end
print("==================== docs")
for ns, d in pairs(DB.docs or {}) do
  print("### C_" .. ns, d.at, d.count or "", d.error or "")
  for _, f in ipairs(d.functions or {}) do print("  fn", f.sig or f.name, "| args:", f.args, "| returns:", f.returns, f.doc and ("| doc: " .. f.doc) or "", f.mayReturnNothing and "| mayReturnNothing" or "") end
  for _, e in ipairs(d.events or {}) do print("  ev", e.name, "| payload:", e.payload, e.doc and ("| doc: " .. e.doc) or "") end
  for _, t in ipairs(d.tables or {}) do print("  tb", t.type, t.name, "| fields:", t.fields, t.doc and ("| doc: " .. t.doc) or "") end
end
