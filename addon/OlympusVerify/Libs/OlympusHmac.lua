--[[ OlympusHmac — SHA-256 / HMAC-SHA256 and the verification-code spec, in the Lua 5.1 + `bit` dialect WoW ships.
     Spec (identical to worker/src/codes.ts and watcher/codes.py):
       message = asciiLower(strip(character)) .. "|" .. utcDay      e.g. "thrall|2026-09-17"
       digest  = HMAC-SHA256(secret, message)
       code    = first 30 bits of digest as 6 symbols of ABCDEFGHJKLMNPQRSTUVWXYZ23456789
     Accepted for the issue day and the following UTC day.
     Request codes ("tickets", 27 Sep 2026): 7 symbols, bound to the Discord request instead of a character --
       ticket = nonce (3 symbols, random, from the Worker) .. first 4 symbols of
                code(HMAC-SHA256(secret, "ticket|" .. nonce .. "|" .. utcDay))
     A 6-symbol code is always a character code, a 7-symbol code always a ticket.
     Vectors: watcher/tests/vectors.json ]]

local band, bor, bxor, bnot, rshift, lshift = bit.band, bit.bor, bit.bxor, bit.bnot, bit.rshift, bit.lshift
local byte, char, rep, sub, format, gsub, lower = string.byte, string.char, string.rep, string.sub, string.format, string.gsub, string.lower
local MOD = 4294967296

local function u32(x) return x % MOD end
local function rrot(x, n) return u32(bor(rshift(x, n), lshift(x, 32 - n))) end

local K = {
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
}

local function sha256(msg)
  local h0, h1, h2, h3, h4, h5, h6, h7 = 0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19
  local len = #msg
  local padlen = (56 - (len + 1) % 64) % 64
  -- 64-bit big-endian bit length; messages here are tiny, so the high word is 0
  local bits = len * 8
  msg = msg .. "\128" .. rep("\0", padlen) .. char(0, 0, 0, 0,
    band(rshift(bits, 24), 255), band(rshift(bits, 16), 255), band(rshift(bits, 8), 255), band(bits, 255))
  local w = {}
  for chunk = 1, #msg, 64 do
    for i = 0, 15 do
      local a, b, c, d = byte(msg, chunk + i * 4, chunk + i * 4 + 3)
      w[i] = a * 16777216 + b * 65536 + c * 256 + d
    end
    for i = 16, 63 do
      local x, y = w[i - 15], w[i - 2]
      local s0 = bxor(bxor(rrot(x, 7), rrot(x, 18)), rshift(x, 3))
      local s1 = bxor(bxor(rrot(y, 17), rrot(y, 19)), rshift(y, 10))
      w[i] = u32(w[i - 16] + u32(s0) + w[i - 7] + u32(s1))
    end
    local a, b, c, d, e, f, g, h = h0, h1, h2, h3, h4, h5, h6, h7
    for i = 0, 63 do
      local S1 = bxor(bxor(rrot(e, 6), rrot(e, 11)), rrot(e, 25))
      local ch = bxor(band(e, f), band(bnot(e), g))
      local t1 = u32(h + u32(S1) + u32(ch) + K[i + 1] + w[i])
      local S0 = bxor(bxor(rrot(a, 2), rrot(a, 13)), rrot(a, 22))
      local maj = bxor(bxor(band(a, b), band(a, c)), band(b, c))
      local t2 = u32(u32(S0) + u32(maj))
      h, g, f = g, f, e
      e = u32(d + t1)
      d, c, b = c, b, a
      a = u32(t1 + t2)
    end
    h0, h1, h2, h3 = u32(h0 + a), u32(h1 + b), u32(h2 + c), u32(h3 + d)
    h4, h5, h6, h7 = u32(h4 + e), u32(h5 + f), u32(h6 + g), u32(h7 + h)
  end
  local out = {}
  for _, v in ipairs({ h0, h1, h2, h3, h4, h5, h6, h7 }) do
    out[#out + 1] = char(band(rshift(v, 24), 255), band(rshift(v, 16), 255), band(rshift(v, 8), 255), band(v, 255))
  end
  return table.concat(out) -- 32 raw bytes
end

local function hmacSha256(key, msg)
  if #key > 64 then key = sha256(key) end
  key = key .. rep("\0", 64 - #key)
  local ipad, opad = {}, {}
  for i = 1, 64 do
    local k = byte(key, i)
    ipad[i] = char(bxor(k, 0x36))
    opad[i] = char(bxor(k, 0x5c))
  end
  return sha256(table.concat(opad) .. sha256(table.concat(ipad) .. msg))
end

local function toHex(s)
  return (gsub(s, ".", function(c) return format("%02x", byte(c)) end))
end

local ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
local CODE_LENGTH = 6
local TICKET_LENGTH = 7
local TICKET_NONCE_LENGTH = 3

--- ASCII-only lowercase, whitespace collapsed, realm suffix ("-Realm") removed. Same as TS/Python.
local function normalizeCharacter(name)
  local s = gsub(gsub(name or "", "^%s+", ""), "%s+$", "")
  s = gsub(s, "%s+", " ")
  local dash = string.find(s, "-", 2, true)
  if dash then s = sub(s, 1, dash - 1) end
  return lower(s) -- WoW's Lua runs in the C locale: only A-Z change
end

local function digestToCode(digest)
  local b0, b1, b2, b3 = byte(digest, 1, 4)
  local bits = b0 * 16777216 + b1 * 65536 + b2 * 256 + b3
  local code = {}
  for i = 1, CODE_LENGTH do
    local shift = 32 - 5 * i
    local idx = band(rshift(bits, shift), 31)
    code[i] = sub(ALPHABET, idx + 1, idx + 1)
  end
  return table.concat(code)
end

local function codeFor(secret, character, day)
  return digestToCode(hmacSha256(secret, normalizeCharacter(character) .. "|" .. day))
end

local function utcDay(t) return date("!%Y-%m-%d", t) end

local function validCodes(secret, character, now)
  now = now or time()
  return { codeFor(secret, character, utcDay(now)), codeFor(secret, character, utcDay(now - 86400)) }
end

local function normalizeCodeInput(s)
  return (gsub(string.upper(s or ""), "[^A-Z2-9]", ""))
end

-- Marker the addon appends to its join-confirmation whisper. The chat log records outgoing whispers verbatim, so a
-- line the addon emits can be signed; the text of a guild system message cannot ("X has joined the guild." is exactly
-- what /emote produces). Mirrored in watcher/codes.py (join_token).
local function joinToken(secret, character, day)
  return string.sub(toHex(hmacSha256(secret, "joined|" .. normalizeCharacter(character) .. "|" .. day)), 1, 10)
end

local function isValidCode(secret, character, input, now)
  local c = normalizeCodeInput(input)
  if #c ~= CODE_LENGTH then return false end
  for _, v in ipairs(validCodes(secret, character, now)) do
    if v == c then return true end
  end
  return false
end

-- Request codes: the nonce comes from the Worker, the mac proves the Worker issued it. Checked offline like a
-- character code; which character it links is decided by who whispers it.
local function ticketFor(secret, nonce, day)
  local n = sub(normalizeCodeInput(nonce), 1, TICKET_NONCE_LENGTH)
  local mac = sub(digestToCode(hmacSha256(secret, "ticket|" .. n .. "|" .. day)), 1, TICKET_LENGTH - TICKET_NONCE_LENGTH)
  return n .. mac
end

local function isValidTicket(secret, input, now)
  local c = normalizeCodeInput(input)
  if #c ~= TICKET_LENGTH then return false end
  now = now or time()
  local nonce = sub(c, 1, TICKET_NONCE_LENGTH)
  return c == ticketFor(secret, nonce, utcDay(now)) or c == ticketFor(secret, nonce, utcDay(now - 86400))
end

-- The code in a `!verify` token, or nil: exactly 6 or 7 symbols from A-Z and 2-9, either case, nothing stripped. So
-- "K7QYADR1" or "0K7QYADR" is refused rather than trimmed into a valid code. The watcher applies the same rule
-- (codes.strict_code), so the two never disagree about what was whispered.
local function strictCode(token)
  if type(token) ~= "string" then return nil end
  local c = string.upper(token)
  if (#c == CODE_LENGTH or #c == TICKET_LENGTH) and not string.find(c, "[^A-Z2-9]") then return c end
  return nil
end

-- "character" or "ticket" for a code that is valid right now, else nil. The length decides which spec applies.
local function checkCode(secret, character, input, now)
  local c = normalizeCodeInput(input)
  if #c == CODE_LENGTH then return isValidCode(secret, character, c, now) and "character" or nil end
  if #c == TICKET_LENGTH then return isValidTicket(secret, c, now) and "ticket" or nil end
  return nil
end

-- Marker for the addon's note-to-self when a guild system line says someone left or was removed. The system line
-- itself cannot be forged by another client, but its chat-log copy can (/emote writes the same text), so the note
-- carries proof. kind: "left" | "kicked" | "space" | "unverified" -- inside the MAC. Mirrored in watcher/codes.py.
local function leaveToken(secret, kind, character, day)
  return string.sub(toHex(hmacSha256(secret, "left|" .. kind .. "|" .. normalizeCharacter(character) .. "|" .. day)), 1, 10)
end

-- Marker for the note-to-self at every login and reload: "Olympus: relay <Name> is in the world (addon <version>, ref
-- OLVr-...)". Tells the watcher which character is playing and which addon build is loaded. Mirrored in
-- watcher/codes.py (relay_token).
local function relayToken(secret, character, version, day)
  return string.sub(toHex(hmacSha256(secret, "relay|" .. normalizeCharacter(character) .. "|" .. tostring(version) .. "|" .. day)), 1, 10)
end

-- Marker for the note naming the character behind a confirmed code: "Olympus: <Name> is <GUID> (ref OLVg-...)". The MAC
-- covers the name and the GUID. Mirrored in watcher/codes.py (guid_token).
local function guidToken(secret, character, guid, day)
  return string.sub(toHex(hmacSha256(secret, "guid|" .. normalizeCharacter(character) .. "|" .. tostring(guid) .. "|" .. day)), 1, 10)
end

OlympusHmac = {
  sha256hex = function(s) return toHex(sha256(s)) end,
  hmacSha256hex = function(k, m) return toHex(hmacSha256(k, m)) end,
  normalizeCharacter = normalizeCharacter,
  codeFor = codeFor,
  joinToken = joinToken,
  leaveToken = leaveToken,
  relayToken = relayToken,
  guidToken = guidToken,
  strictCode = strictCode,
  validCodes = validCodes,
  isValidCode = isValidCode,
  ticketFor = ticketFor,
  isValidTicket = isValidTicket,
  checkCode = checkCode,
  normalizeCodeInput = normalizeCodeInput,
  utcDay = utcDay,
}
