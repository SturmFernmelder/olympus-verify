-- Local correspondence minimization only. This module never authenticates,
-- relays, settles, renews, hashes, or changes an original delivery outcome.
local P={version=1}
OlympusVerifyLocalPrivacy280=P
local FIELD,PURPOSE="localCorrespondence280","financial-correspondence-local-only-v1"
local RETIRED="retired-local-correspondence-key-v1"
local LIMIT={tables=65536,fields=262144,depth=32,bytes=16777216}
local cache=setmetatable({},{__mode="k"})
local function plain(v)return type(v)=="table" and getmetatable(v)==nil end
local function rid(v)return type(v)=="string" and (#v==24 or #v==32) and v:match("^[0-9a-f]+$")~=nil end
local function keys(v,allowed)
 if not plain(v)then return false end
 for k in next,v do if not allowed[k]then return false end end;return true
end
local function set(list)local t={}for _,k in ipairs(list)do t[k]=true end;return t end
local META=set({"version","purpose","blockedIds","blockedTransferIds","retiredDeclarations","stats"})
local STATS=set({"blankedLeaves","retiredKeyCount","blockedOriginals","blockedTransfers"})
local CONTEXT=set({"contextVersion","kind","transferId","ownGuid","ownName","guild","realm","observedAt","completedAt","beforeMoney","beforeItems","treasuryExpected","exclusiveClaimed","exportBody","heldReason","restored","moneyConfirmed","itemsConfirmed","index","header","key","mail","mailFingerprint","body","expected","inboxConfirmed","partner","guid","items","incoming","outgoing","ambiguous","note","accepted","complete"})
local HEADER=set({"sender","subject","money","cod","items","hasItems","returned","canReply"})
local DONATION=set({"copper","outgoingCopper","items","note"})
local ENTRY=set({"id","type","source","character","guid","guidSource","requestedAt","requestedBy","status","clientVersion","guild","realm","observedAt","donation","evidence","attempts","outcome","acknowledgedAt","serverReceipt"})
local LEGACY={mail=8192,trade=512,["whisper-declaration"]=4096,["treasury-receipt242"]=0}
local BRIDGE_ENTRY={};for k in next,ENTRY do BRIDGE_ENTRY[k]=true end;BRIDGE_ENTRY.bridgeUntrusted=true;BRIDGE_ENTRY.bridgeSender=true
local BRIDGE_EVIDENCE=set({"kind","confirmedLocal","automaticCredit"})
local function count(t)local n=0;for _ in next,t do n=n+1 end;return n end
local function integer(n)return type(n)=="number" and n==n and n>=0 and n<=9007199254740991 and n==math.floor(n)end
local function metadata(m)
 if not keys(m,META)or m.version~=1 or m.purpose~=PURPOSE or not plain(m.blockedIds)or not plain(m.blockedTransferIds)or not plain(m.retiredDeclarations)or not keys(m.stats,STATS)then return false end
 for _,map in ipairs({m.blockedIds,m.blockedTransferIds})do for id,v in next,map do if not rid(id)or v~=true then return false end end end
 local n=0;for k,r in next,m.retiredDeclarations do n=n+1;if not integer(k)or k<1 or not keys(r,{entryId=true,reason=true})or not rid(r.entryId)or r.reason~=RETIRED then return false end end
 if n~=#m.retiredDeclarations then return false end
 for k in next,STATS do if not integer(rawget(m.stats,k))then return false end end
 return true
end
-- Raw bounded copying never follows a foreign metatable or invokes callbacks.
local function graph(v,copy)
 local seen,active={},{};local cost={tables=0,fields=0,bytes=0}
 local function visit(x,depth)
  local kind=type(x)
  if kind=="string"then cost.bytes=cost.bytes+#x;if cost.bytes>LIMIT.bytes then error("byte-capacity",0)end;return x end
  if kind=="number"or kind=="boolean"or kind=="nil"then return x end
  if kind~="table"or not plain(x)then error("retained-format",0)end
  if active[x]then error("cycle",0)end
  if seen[x]then return seen[x]end
  if depth>LIMIT.depth then error("depth-capacity",0)end
  cost.tables=cost.tables+1;if cost.tables>LIMIT.tables then error("table-capacity",0)end
  local result=copy and {}or x;seen[x]=result;active[x]=true
  for k,value in next,x do
   if type(k)~="string"and type(k)~="number"then error("retained-key-format",0)end
   if type(k)=="number"and(k~=k or k==math.huge or k==-math.huge)then error("retained-key-format",0)end
   cost.fields=cost.fields+1;if cost.fields>LIMIT.fields then error("field-capacity",0)end
   visit(k,depth+1);local nextValue=visit(value,depth+1);if copy then rawset(result,k,nextValue)end
  end
  active[x]=nil;return result
 end
 return visit(v,0),cost
end
local CURRENT=set({"id","type","source","character","guid","requestedAt","requestedBy","guild","realm","clientVersion","donation","evidence","status","acknowledgedAt","outcome","attempts","serverReceipt"})
local CURRENT_DONATION=set({"version","kind","copper","recipient","collectorGuid","reference"})
local CURRENT_EVIDENCE=set({"kind","confirmedLocal","automaticCredit","mac"})
local function currentV2(row)
 if not keys(row,CURRENT)or row.type~="donation"or row.source~="tithe-gold-v2"or row.requestedBy~="Fern Melder"
  or not keys(row.donation,CURRENT_DONATION)or not keys(row.evidence,CURRENT_EVIDENCE)then return false end
 return row.donation.version==2 and row.donation.recipient=="Fern Melder"and row.evidence.confirmedLocal==true and row.evidence.automaticCredit==false
end
local function entryLimit(row,key)
 if not plain(row)or row.type~="donation"or not rid(row.id)or row.id~=key or not keys(row.donation,DONATION)then return nil end
 local limit=LEGACY[row.source]
 if limit~=nil and keys(row,ENTRY)then return limit end
 -- Exact dfca receiveWire replacement. It is untrusted correspondence only.
 if row.source=="addon-bridge242"and keys(row,BRIDGE_ENTRY)and row.bridgeUntrusted==true
  and type(row.bridgeSender)=="string"and #row.bridgeSender>0 and #row.bridgeSender<=128 and not row.bridgeSender:find("[%z\1-\8\11\12\14-\31]")
  and keys(row.evidence,BRIDGE_EVIDENCE)and row.evidence.kind=="remote-unconfirmed-declaration"and row.evidence.confirmedLocal==false and row.evidence.automaticCredit==false then return 4096 end
 return nil
end
local function validEntry(row,key)
 local limit=entryLimit(row,key);if limit==nil then return false end
 local note=rawget(row.donation,"note");return note==nil or type(note)=="string"and #note<=limit
end
local function financial(row)return type(row)=="table"and(rawget(row,"type")=="donation"or rawget(row,"donation")~=nil)end
local function hasText(v)return type(v)=="string"and #v>0 end
local function contextText(c)
 if type(c)~="table"then return false end
 local h,body=rawget(c,"header"),rawget(c,"exportBody")
 return hasText(rawget(c,"body"))or hasText(rawget(c,"note"))or type(h)=="table"and hasText(rawget(h,"subject"))
  or type(body)=="table"and type(rawget(body,"donation"))=="table"and hasText(rawget(body.donation,"note"))
end
local REASONS=set({"retained-format","byte-capacity","table-capacity","field-capacity","depth-capacity","retained-key-format","cycle","privacy-metadata-format","correspondence-format","original-id-format","financial-original-format","financial-context-format","mail-context-format","export-body-format","held-context-format","declaration-key-format","metadata-capacity","original-root-changed"})
local function held(root,d,reason)
 reason=REASONS[reason]and reason or "retained-format"
 if type(root)=="table"then cache[root]={intake=d,complete=false,held=true,globalHeld=true,reason=reason}end
 return false,reason
end
function P.Ensure(root)
 if not plain(root)then return false,"savedvars-unavailable"end
 local d,prior=rawget(root,"intake242"),cache[root]
 if prior and prior.intake==d then return prior.complete,prior.reason end
 if d==nil then cache[root]={complete=true,held=false,reason="absent"};return true end
 if not plain(d)or not plain(rawget(d,"entries"))or not plain(rawget(d,"dedup"))or not plain(rawget(d,"acknowledgements"))then return held(root,d,"retained-format")end
 local ok,replacement,cost=pcall(graph,d,true)
 if not ok then return held(root,d,replacement)end
 local m=rawget(replacement,FIELD)
 if m~=nil and not metadata(m)then return held(root,d,"privacy-metadata-format")end
 m=m or {version=1,purpose=PURPOSE,blockedIds={},blockedTransferIds={},retiredDeclarations={},stats={blankedLeaves=0,retiredKeyCount=0,blockedOriginals=0,blockedTransfers=0}}
 local changed,blanks=false,0
 local counts={heldEntries=0,heldContexts=0,heldKeys=0,heldItems=0}
 local entries,contexts,retired={},{},{}
 local function affected(id,transfer)
  if rid(id)then
   if m.blockedIds[id]~=true then m.blockedIds[id]=true;changed=true end
   if transfer and m.blockedTransferIds[id]~=true then m.blockedTransferIds[id]=true;changed=true end
  end
 end
 local function itemHeld(kind,id,other,transfer)
  counts[kind]=counts[kind]+1;counts.heldItems=counts.heldItems+1;affected(id,transfer);affected(other,transfer)
 end
 local function mirrored(id)return type(rawget(d,"bridgeMetadata"))=="table"and rawget(d.bridgeMetadata,id)~=nil end
 local function knownEntry(row,key)return validEntry(row,key)and not mirrored(key)end
 local function leaf(t,key,limit)local v=rawget(t,key);return v==nil or type(v)=="string"and #v<=limit end
 local function knownContext(c)
  if not keys(c,CONTEXT)or c.contextVersion~=1 or(c.kind~="mail"and c.kind~="trade")or not rid(c.transferId)then return false end
  if c.kind=="mail"then
   if not keys(c.header,HEADER)or type(c.body)~="string"or #c.body>8192 or not leaf(c.header,"subject",512)then return false end
  elseif not leaf(c,"note",512)then return false end
  return c.exportBody==nil or knownEntry(c.exportBody,c.transferId)and c.exportBody.source==c.kind
 end
 -- Classify every item before blanking. Unknown roots retain their original
 -- objects so aliases into a recognized clone cannot accidentally edit them.
 for id,row in next,replacement.entries do
  if financial(row)and not currentV2(row)then
   if knownEntry(row,id)then entries[#entries+1]={row=row,key=id,original=rawget(d.entries,id)}
   else local original=rawget(d.entries,id);replacement.entries[id]=original;itemHeld("heldEntries",id,type(original)=="table"and rawget(original,"id"))end
  end
 end
 for _,field in ipairs({"mailCollection242","tradeCollection242"})do
  local c=rawget(replacement,field)
  if c~=nil then
   if knownContext(c)then contexts[#contexts+1]={row=c,original=rawget(d,field)}
   else local original=rawget(d,field);replacement[field]=original;itemHeld("heldContexts",type(original)=="table"and rawget(original,"transferId"),nil,true)end
  end
 end
 local transfers=rawget(replacement,"heldTransfers627")
 if transfers~=nil then
  if not plain(transfers)then replacement.heldTransfers627=rawget(d,"heldTransfers627");itemHeld("heldContexts")
  else for key,wrapper in next,transfers do
   local original=rawget(d.heldTransfers627,key)
   if keys(wrapper,{context=true,reason=true,heldAt=true})and knownContext(wrapper.context)then contexts[#contexts+1]={row=wrapper.context,original=original and original.context}
   else transfers[key]=original;local c=type(original)=="table"and rawget(original,"context");itemHeld("heldContexts",type(c)=="table"and rawget(c,"transferId"),nil,true)end
  end end
 end
 for key,id in next,replacement.dedup do
  if type(key)=="string"and key:sub(1,12)=="declaration|"then
   local row=type(id)=="string"and rawget(replacement.entries,id)
   if #key<=4258 and knownEntry(row,id)and row.source=="whisper-declaration"then retired[#retired+1]={key=key,entryId=id}
   else itemHeld("heldKeys",id)end
  end
 end
 local function blank(t,key)
  if hasText(rawget(t,key))then rawset(t,key,"");changed=true;blanks=blanks+1 end
 end
 local function blankEntry(row,id,original)
  local donation=type(original)=="table"and rawget(original,"donation")
  if type(donation)=="table"and hasText(rawget(donation,"note"))then affected(id)end
  blank(row.donation,"note")
 end
 for _,item in ipairs(entries)do blankEntry(item.row,item.key,item.original)end
 for _,item in ipairs(contexts)do
  local c=item.row;local touched=contextText(item.original)
  if c.kind=="mail"then blank(c,"body");blank(c.header,"subject")else blank(c,"note")end
  if c.exportBody then blankEntry(c.exportBody,c.exportBody.id,type(item.original)=="table"and rawget(item.original,"exportBody"))end
  if touched then affected(c.transferId,true)end
 end
 for _,record in ipairs(retired)do
  replacement.dedup[record.key]=nil;m.retiredDeclarations[#m.retiredDeclarations+1]={entryId=record.entryId,reason=RETIRED};affected(record.entryId);changed=true
 end
 if changed then
  m.stats.blankedLeaves=m.stats.blankedLeaves+blanks;m.stats.retiredKeyCount=#m.retiredDeclarations
  m.stats.blockedOriginals=count(m.blockedIds);m.stats.blockedTransfers=count(m.blockedTransferIds)
  if not metadata(m)then return held(root,d,"metadata-capacity")end
  rawset(replacement,FIELD,m)
  local bounded,_,afterCost=pcall(graph,replacement,false);if not bounded then return held(root,d,"metadata-capacity")end
  if rawget(root,"intake242")~=d then return held(root,d,"original-root-changed")end
  rawset(root,"intake242",replacement);d=replacement;cost=afterCost
 end
 local current=rawget(d,FIELD);local complete=counts.heldItems==0
 local reason=complete and "scoped-minimization-complete"or "scoped-minimization-incomplete"
 cache[root]={intake=d,complete=complete,held=not complete,globalHeld=false,reason=reason,cost=cost,counts=counts,stats=current and current.stats or {blankedLeaves=0,retiredKeyCount=0,blockedOriginals=0,blockedTransfers=0}}
 return complete,reason
end
-- Existing current rows still pass their ORIGINAL validators; this is a denial
-- test only, never a claim that a row or receipt is authentic.
local function inspectId(root,id)
 local d=type(root)=="table"and rawget(root,"intake242")
 if type(d)~="table"then return false,false end
 local m=rawget(d,FIELD)
 -- Exact known-map membership only denies this original; unrelated malformed
 -- metadata never turns it into proof or permits same-ID adoption.
 if plain(m)and rawget(m,"version")==1 and rawget(m,"purpose")==PURPOSE and rid(id)then
  for _,field in ipairs({"blockedIds","blockedTransferIds"})do
   local map=rawget(m,field);if plain(map)and rawget(map,id)==true then return true,false end
  end
 end
 local unknown=m~=nil and not metadata(m)
 local entries=rawget(d,"entries");local row=type(entries)=="table"and rawget(entries,id)
 if row~=nil and not plain(row)then unknown=true end
 if financial(row)then local donation=rawget(row,"donation");if type(donation)=="table"and hasText(rawget(donation,"note"))then return true,false end;if not currentV2(row)and not validEntry(row,id)then unknown=true end end
 for _,field in ipairs({"mailCollection242","tradeCollection242"})do local c=rawget(d,field);if c~=nil then if not plain(c)or not rid(rawget(c,"transferId"))then unknown=true elseif rawget(c,"transferId")==id and contextText(c)then return true,false end end end
 local wrappers,n=rawget(d,"heldTransfers627"),0
 if wrappers~=nil then
  if not plain(wrappers)then return false,true end
  for _,wrapper in next,wrappers do
   n=n+1;if n>1000 then return false,true end
   if not plain(wrapper)or not plain(rawget(wrapper,"context"))then return false,true end
   local c=rawget(wrapper,"context");if not rid(rawget(c,"transferId"))or rawget(c,"contextVersion")~=1 or(c.kind~="mail"and c.kind~="trade")then unknown=true elseif rawget(c,"transferId")==id and contextText(c)then return true,false end
  end
 end
 return false,unknown
end
function P.Blocked(root,id,row)
 local complete=P.Ensure(root)
 if id~=nil then local blocked=inspectId(root,id);if blocked then return true end end
 if financial(row)then
  if currentV2(row)then return false end -- every normal source validator still runs
  local donation=type(row)=="table"and rawget(row,"donation")
  local state=type(root)=="table"and cache[root]
  if not state or state.globalHeld or not validEntry(row,id)or type(donation)=="table"and hasText(rawget(donation,"note"))then return true end
 end
 return false
end
function P.PruneBlocked(root,id)
 P.Ensure(root)
 local blocked,unknown=inspectId(root,id)
 return blocked or unknown -- only this uncertain prune invocation is held
end
function P.Status(root)
 P.Ensure(root);local s=type(root)=="table"and cache[root]
 local out={available=true,complete=s and s.complete==true or false,held=not s or s.held==true,reason=s and s.reason or "savedvars-unavailable"}
 if s and not s.globalHeld then for k,v in next,s.stats or {}do out[k]=v end;for k,v in next,s.counts or {}do out[k]=v end;out.cost=s.cost end
 return out
end
