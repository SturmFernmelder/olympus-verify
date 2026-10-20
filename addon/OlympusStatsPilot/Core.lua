-- Independently authored one-guild local pilot (owner, 20 October 2026).
-- Framing checks detect corruption; they never authenticate a reporter or prove membership.
OlympusStatsPilot = {}
local A = OlympusStatsPilot
local floor, MOD = math.floor, 4294967296
local function band(a, b)
  local n, p = 0, 1
  for _ = 1, 32 do
    if a % 2 == 1 and b % 2 == 1 then n = n + p end
    a, b, p = floor(a / 2), floor(b / 2), p * 2
  end
  return n
end
local function bxor(a, b)
  local n, p = 0, 1
  for _ = 1, 32 do
    if a % 2 ~= b % 2 then n = n + p end
    a, b, p = floor(a / 2), floor(b / 2), p * 2
  end
  return n
end
local function ror(a, n) return floor(a / 2 ^ n) + a % 2 ^ n * 2 ^ (32 - n) end
local K = {
  1116352408,1899447441,3049323471,3921009573,961987163,1508970993,2453635748,2870763221,
  3624381080,310598401,607225278,1426881987,1925078388,2162078206,2614888103,3248222580,
  3835390401,4022224774,264347078,604807628,770255983,1249150122,1555081692,1996064986,
  2554220882,2821834349,2952996808,3210313671,3336571891,3584528711,113926993,338241895,
  666307205,773529912,1294757372,1396182291,1695183700,1986661051,2177026350,2456956037,
  2730485921,2820302411,3259730800,3345764771,3516065817,3600352804,4094571909,275423344,
  430227734,506948616,659060556,883997877,958139571,1322822218,1537002063,1747873779,
  1955562222,2024104815,2227730452,2361852424,2428436474,2756734187,3204031479,3329325298,
}
function A.Sha256(value)
  if type(value) ~= 'string' or #value > 1023 then return nil end
  local bitLength = #value * 8
  local bytes = {value:byte(1, #value)}
  bytes[#bytes + 1] = 128
  while #bytes % 64 ~= 56 do bytes[#bytes + 1] = 0 end
  for _ = 1, 4 do bytes[#bytes + 1] = 0 end
  for n = 3, 0, -1 do bytes[#bytes + 1] = floor(bitLength / 256 ^ n) % 256 end
  local h = {1779033703,3144134277,1013904242,2773480762,1359893119,2600822924,528734635,1541459225}
  for offset = 1, #bytes, 64 do
    local w = {}
    for i = 0, 15 do local j = offset + i * 4; w[i] = bytes[j] * 16777216 + bytes[j+1] * 65536 + bytes[j+2] * 256 + bytes[j+3] end
    for i = 16, 63 do
      local x, y = w[i-15], w[i-2]
      local s0 = bxor(bxor(ror(x,7),ror(x,18)),floor(x / 8))
      local s1 = bxor(bxor(ror(y,17),ror(y,19)),floor(y / 1024))
      w[i] = (w[i-16] + s0 + w[i-7] + s1) % MOD
    end
    local a,b,c,d,e,f,g,hv = unpack(h)
    for i = 0, 63 do
      local s1 = bxor(bxor(ror(e,6),ror(e,11)),ror(e,25))
      local ch = bxor(band(e,f),band(MOD-1-e,g))
      local t1 = (hv + s1 + ch + K[i+1] + w[i]) % MOD
      local s0 = bxor(bxor(ror(a,2),ror(a,13)),ror(a,22))
      local maj = bxor(bxor(band(a,b),band(a,c)),band(b,c))
      local t2 = (s0 + maj) % MOD
      hv,g,f,e,d,c,b,a = g,f,e,(d+t1)%MOD,c,b,a,(t1+t2)%MOD
    end
    local result = {a,b,c,d,e,f,g,hv}
    for i = 1, 8 do h[i] = (h[i] + result[i]) % MOD end
  end
  local out = {}
  for _, v in ipairs(h) do for n = 3, 0, -1 do out[#out+1] = string.char(floor(v / 256 ^ n) % 256) end end
  return table.concat(out)
end
local alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
function A.Base64url(value)
  if type(value) ~= 'string' then return nil end
  local out = {}
  for i = 1, #value, 3 do
    local a,b,c = value:byte(i,i+2)
    local n = a * 65536 + (b or 0) * 256 + (c or 0)
    out[#out+1] = alphabet:sub(floor(n/262144)%64+1,floor(n/262144)%64+1)
    out[#out+1] = alphabet:sub(floor(n/4096)%64+1,floor(n/4096)%64+1)
    if b then out[#out+1] = alphabet:sub(floor(n/64)%64+1,floor(n/64)%64+1) end
    if c then out[#out+1] = alphabet:sub(n%64+1,n%64+1) end
  end
  return table.concat(out)
end
local function integer(n, lo, hi) return type(n)=='number' and n==floor(n) and n>=lo and n<=hi end
local function text(value)
  if type(value)~='string' or #value<1 or #value>128 or value:find('[%z\1-\31\127]') or value:match('^%s') or value:match('%s$') then return false end
  -- Lua 5.1 has no utf8 library. Reject malformed, overlong, surrogate and out-of-range input.
  local i=1
  while i<=#value do
    local b=value:byte(i);local width=1
    if b<128 then width=1 elseif b>=194 and b<=223 then width=2 elseif b>=224 and b<=239 then width=3 elseif b>=240 and b<=244 then width=4 else return false end
    if i+width-1>#value then return false end
    for j=1,width-1 do local c=value:byte(i+j);if c<128 or c>191 then return false end end
    if width==2 and b==194 and value:byte(i+1)<=159 then return false end
    if width==3 then local c=value:byte(i+1);if (b==224 and c<160) or (b==237 and c>159) then return false end end
    if width==4 then local c=value:byte(i+1);if (b==240 and c<144) or (b==244 and c>143) then return false end end
    i=i+width
  end
  return true
end
A.ValidText = text
local function quoted(value) return '"'..value:gsub('\\','\\\\'):gsub('"','\\"')..'"' end
function A.MaskCount(n) if integer(n,0,1000) then return n>=1 and n<=4 and 'few' or n end end
function A.Serialize(snapshot)
  if type(snapshot)~='table' or not text(snapshot.guild) or not text(snapshot.realmGroup) or (snapshot.faction~='Alliance' and snapshot.faction~='Horde') or not integer(snapshot.observedAt,1,4102444800) or not integer(snapshot.members,1,1000) then return nil,'Native own-guild snapshot is incomplete.' end
  local online = snapshot.online
  if online~=nil and not integer(online,0,snapshot.members) then return nil,'Online count is incomplete.' end
  local members=A.MaskCount(snapshot.members)
  local smallComplement=online~=nil and online>=5 and snapshot.members-online>=1 and snapshot.members-online<=4
  online=(members=='few' or online==nil or smallComplement) and 'null' or A.MaskCount(online)
  local function count(v) return v=='few' and '"few"' or tostring(v) end
  local value = '{"format":"olympus-stat-observation-v1","scope":"own-guild","source":"volunteer-client","sourceVerified":false,"membershipProof":false,"addonVersion":"0.1.0","realmGroup":'..quoted(snapshot.realmGroup)..',"faction":'..quoted(snapshot.faction)..',"observedAt":'..snapshot.observedAt..',"guilds":[{"name":'..quoted(snapshot.guild)..',"receivedAt":'..snapshot.observedAt..',"reportedCharacters":'..count(members)..',"online":'..count(online)..'}]}'
  if #value>1023 then return nil,'Snapshot exceeds the local pilot limit.' end
  return value
end
function A.Frames(value, nonce)
  if type(value)~='string' or #value<1 or #value>1023 or type(nonce)~='string' or #nonce~=32 or nonce:find('[^0-9a-f]') then return nil,'Use the complete current browser challenge.' end
  local digest=A.Base64url(A.Sha256(value));local total=math.ceil(#value/75)
  if total>14 then return nil,'Snapshot exceeds the local pilot limit.' end
  local frames={}
  for i=1,total do
    frames[i]=string.format('OLCS1|%s|%s|%03d|%03d|%s',nonce,digest,i,total,A.Base64url(value:sub((i-1)*75+1,i*75)))
    if #frames[i]>191 then return nil,'QR framing invariant failed.' end
  end
  return frames
end
