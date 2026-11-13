-- Portable current-module regression. The legacy factory replay remains separate
-- evidence; these explicit synthetic originals assert the closed local contract.
local fh=assert(io.open("test_live242.lua","r"));local prefix=fh:read("*a"):match("^(.-)\ndo\n");fh:close()
local fixture=assert(loadstring(assert(prefix).."\nreturn fixture"))()
local checks,failed=0,0
local function check(label,yes)checks=checks+1;if not yes then failed=failed+1 end;print((yes and "PASS "or "FAIL ")..label)end
local function clone(v,m)if type(v)~="table"then return v end;m=m or{};if m[v]then return m[v]end;local o={};m[v]=o;for k,x in pairs(v)do o[k]=clone(x,m)end;return o end
local function same(a,b,m)if type(a)~=type(b)then return false end;if type(a)~="table"then return a==b end;m=m or{};m[a]=m[a]or{};if m[a][b]then return true end;m[a][b]=true;for k,v in pairs(a)do if not same(v,b[k],m)then return false end end;for k in pairs(b)do if a[k]==nil then return false end end;return true end
local MAIL,TRADE,DECL=string.rep("a",24),string.rep("b",32),string.rep("c",32)
local function seed()
 local item={slot=1,itemId=321,count=3,name="Known item",link="item:321"}
 local function row(id,source,note)return{id=id,type="donation",source=source,character="Donor",requestedBy="Fern Melder",requestedAt=1794312000,status="pending",attempts=2,outcome="unknown",donation={copper=500,items={clone(item)},note=note},evidence={kind="original-native-facts",confirmedLocal=true,automaticCredit=false}}end
 local mail,trade,decl=row(MAIL,"mail","PRIVATE_MAIL"),row(TRADE,"trade","PRIVATE_TRADE"),row(DECL,"whisper-declaration","PRIVATE_DECLARATION")
 local mc={contextVersion=1,kind="mail",transferId=MAIL,ownGuid="Player-1-1234ABCD",ownName="Fern Melder",guild="OLYMPUS PRIME",realm="Native Realm",observedAt=1794312000,beforeMoney=10000,beforeItems={[321]=0},expected={[321]=3},header={sender="Donor",subject="PRIVATE_SUBJECT",money=500,cod=0,items={clone(item)},hasItems=true},body="PRIVATE_BODY",exportBody=mail,mail={}}
 local tc={contextVersion=1,kind="trade",transferId=TRADE,ownGuid="Player-1-1234ABCD",ownName="Fern Melder",guild="OLYMPUS PRIME",realm="Native Realm",observedAt=1794312000,beforeMoney=10000,beforeItems={},items={clone(item)},incoming=500,outgoing=0,partner="Donor",note="PRIVATE_TRADE",exportBody=trade}
 return{boots=1,intake242={version=1,nextId=3,entries={[MAIL]=mail,[TRADE]=trade,[DECL]=decl},dedup={["declaration|sender|PRIVATE_A|1"]=DECL,["declaration|sender|PRIVATE_B|1"]=DECL},acknowledgements={},mailCollection242=mc,tradeCollection242=tc,heldTransfers627={mail={context=clone(mc),reason="legacy_or_invalid_saved_mail_context",heldAt=1794312000},trade={context=clone(tc),reason="native_trade_cancelled",heldAt=1794312000}},bridgeOutbound242={[MAIL]={bodySHA256=string.rep("d",64)}}},treasury={version=1,nextId=1,receipts={{id=MAIL,ts=1794312000,mac="old-mac",incomingCopper=500}},observations={}}}
end
local x=fixture(true);local root=seed();local original=root.intake242;local foreign=original.entries[MAIL];local before=clone(root);x.e.OlympusVerifyDB=root;x.e.OlympusDB={pendingRoleUpdates={original=foreign}}
local view=x.v.VisibleEntries();local d=root.intake242;local m=d.localCorrespondence280;local p=x.e.OlympusVerifyLocalPrivacy280
check("first Live consumer replaces only owned intake",d~=original and root.treasury.receipts[1].mac=="old-mac")
check("entry correspondence blanks without status/attempt renewal",d.entries[MAIL].donation.note==""and d.entries[MAIL].status=="pending"and d.entries[MAIL].attempts==2 and d.entries[MAIL].outcome=="unknown")
check("both saved context body/note/subject strings blank",d.mailCollection242.body==""and d.mailCollection242.header.subject==""and d.tradeCollection242.note=="")
check("both exportBody notes and held context leaves blank",d.mailCollection242.exportBody.donation.note==""and d.tradeCollection242.exportBody.donation.note==""and d.heldTransfers627.mail.context.body==""and d.heldTransfers627.trade.context.note=="")
check("foreign original stays unchanged while internal alias remains",foreign.donation.note=="PRIVATE_MAIL"and d.mailCollection242.exportBody==d.entries[MAIL])
check("structured item fields, old commitment and original clocks stay",same(d.entries[MAIL].donation.items,before.intake242.entries[MAIL].donation.items)and d.bridgeOutbound242[MAIL].bodySHA256==string.rep("d",64)and d.entries[MAIL].requestedAt==1794312000)
check("two raw keys preserve two old identities without raw messages",#m.retiredDeclarations==2 and m.retiredDeclarations[1].entryId==DECL and m.retiredDeclarations[2].entryId==DECL and next(d.dedup)==nil)
check("fixed local marker grants no delivery state",m.version==1 and m.purpose=="financial-correspondence-local-only-v1"and m.blockedIds[MAIL]and m.createdAt==nil and m.mac==nil and m.complete==nil)
local first=clone(root);p.Ensure(root);check("second Ensure neither changes originals nor creates new clocks",same(first,root))
x.ack(d.entries[MAIL]);x.v.Flush("signed-old-ack")
check("signed old ACK cannot settle changed-body original",d.entries[MAIL].status=="pending"and d.acknowledgements[MAIL]==nil and d.entries[MAIL].serverReceipt==nil)
local nextId=d.nextId;check("retired declaration key cannot create another original",x.v.Queue({type="verify",character="Fresh Member",code="ABCDEF"},"declaration|PRIVATE_NEW")==nil and d.nextId==nextId)
for _,kind in ipairs({"malformed","cycle","metadata-infinite","metadata-overflow"})do
 local box=fixture(true);local bad=seed()
 if kind=="malformed"then bad.intake242.mailCollection242.exportBody=42
 elseif kind=="cycle"then bad.intake242.mailCollection242.self=bad.intake242.mailCollection242
 else bad.intake242.localCorrespondence280={version=1,purpose="financial-correspondence-local-only-v1",blockedIds={},blockedTransferIds={},retiredDeclarations={},stats={blankedLeaves=kind=="metadata-infinite"and math.huge or 9007199254740991,retiredKeyCount=0,blockedOriginals=0,blockedTransfers=0}}end
 box.e.OlympusVerifyDB=bad;local old=bad.intake242;local oldNote=old.entries[MAIL].donation.note
 box.v.Status();local status=box.e.OlympusVerifyLocalPrivacy280.Status(bad)
 local itemHold=kind=="malformed"and bad.intake242~=old and bad.intake242.entries[MAIL].donation.note==""and bad.intake242.mailCollection242==old.mailCollection242 and old.entries[MAIL].donation.note==oldNote and status.heldContexts==1
 local globalHold=kind~="malformed"and bad.intake242==old and old.entries[MAIL].donation.note==oldNote
 check(kind.." holds the unknown item or global structural failure without rewriting originals",status.held and not status.complete and(itemHold or globalHold))
 local obs=box.v.NewVerificationObservation("whisper","Fresh Member","Player-1-AAAA2222","fresh-"..kind)
 local verified=box.v.CaptureVerification("whisper","Fresh Member","ABCDEF","Player-1-AAAA2222",nil,false,obs)
 check(kind.." does not impose a global verification hold",verified and verified.status=="pending"and verified.observationId==obs.id)
 box.incoming=750;box.event("TRADE_SHOW");local accepted=box.e.OlympusVerifyTreasury.SetTradeReference280("TITHE-ABCD-EFGH");box.event("TRADE_ACCEPT_UPDATE",1,1);box.wallet=box.wallet+750;box.event("UI_INFO_MESSAGE",1,"Trade complete.");box.event("PLAYER_MONEY")
 local current;for _,r in pairs(box.rows())do if r.source=="tithe-gold-v2"and r.donation.copper==750 then current=r end end
 check(kind.." still admits genuine fresh native v2 normally",accepted and current and current.donation.note==nil)
end
do
 local box=fixture(true);local old=seed();box.e.OlympusVerifyDB=old;box.e.NOW=1794312000+31*86400
 local ack=box.ack(old.intake242.entries[MAIL]);old.intake242.acknowledgements[MAIL]=ack
 old.treasury.observations={{ts=1794312000,reason="synthetic-old-observation"}}
 box.e.OlympusVerifyLocalPrivacy280=nil
 local prior=clone(old.intake242);box.e.OlympusVerifyTreasury.Status()
 check("missing helper holds affected receipt prune invocation",#old.treasury.receipts==1 and old.treasury.receipts[1].id==MAIL)
 check("missing helper preserves observation expiry policy",#old.treasury.observations==0)
 check("missing helper never marks IDs or changes historical original/ACK",same(old.intake242,prior)and old.intake242.localCorrespondence280==nil)
end
-- Known local denial is retained despite unrelated marker corruption. Every
-- row below is produced by the actual current native-v2 trade factory first;
-- marker mutation is an explicit synthetic adversarial precondition.
for _,mode in ipairs({"ids-stats","transfers-stats","ids-extra","transfers-extra","ids-other-missing","transfers-other-missing","empty","foreign-version","foreign-purpose","nontrue","map-metatable","marker-metatable"})do
 local box=fixture(true);box.incoming=750;box.event("TRADE_SHOW");local accepted=box.e.OlympusVerifyTreasury.SetTradeReference280("TITHE-ABCD-EFGH");box.event("TRADE_ACCEPT_UPDATE",1,1);box.wallet=box.wallet+750;box.event("UI_INFO_MESSAGE",1,"Trade complete.");box.event("PLAYER_MONEY")
 local stored=box.e.OlympusVerifyDB.intake242;local row;for _,r in pairs(box.rows())do if r.source=="tithe-gold-v2"and r.donation.copper==750 then row=r end end
 assert(accepted and row,"actual current native-v2 producer must succeed")
 local mark={version=1,purpose="financial-correspondence-local-only-v1",blockedIds={},blockedTransferIds={},retiredDeclarations={},stats={blankedLeaves=math.huge,retiredKeyCount=0,blockedOriginals=0,blockedTransfers=0}}
 local field=mode:find("transfers",1,true)and "blockedTransferIds"or "blockedIds"
 if mode~="empty"then mark[field][row.id]=true end
 if mode:find("extra",1,true)then mark.stats.blankedLeaves=0;mark.extra="synthetic-unsupported"end
 if mode=="ids-other-missing"then mark.blockedTransferIds=nil elseif mode=="transfers-other-missing"then mark.blockedIds=nil
 elseif mode=="foreign-version"then mark.version=2 elseif mode=="foreign-purpose"then mark.purpose="foreign-local-purpose"
 elseif mode=="nontrue"then mark.blockedIds[row.id]="true"
 elseif mode=="map-metatable"then setmetatable(mark.blockedIds,{}) elseif mode=="marker-metatable"then setmetatable(mark,{})end
 stored.localCorrespondence280=mark
 setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLocalPrivacy280.lua")),box.e)("OlympusVerify")
 local privacy=box.e.OlympusVerifyLocalPrivacy280;local expected=mode:sub(1,4)=="ids-"or mode:sub(1,10)=="transfers-"
 local complete=privacy.Ensure(box.e.OlympusVerifyDB)
 check(mode.." marker remains incomplete without partial mutation",not complete and box.e.OlympusVerifyDB.intake242==stored and stored.localCorrespondence280==mark)
 check(mode.." exact namespace/plain-map/true denial is precise",privacy.Blocked(box.e.OlympusVerifyDB,row.id,row)==expected)
 local body=clone(row);body.status=nil;local existing=box.v.Queue(body,"synthetic-same-id-"..mode)
 check(mode.." same-ID adoption follows only exact known denial",expected and existing==nil or not expected and existing==row)
 local obs=box.v.NewVerificationObservation("whisper","Fresh Member","Player-1-AAAA2222","marker-"..mode)
 local proof=box.v.CaptureVerification("whisper","Fresh Member","ABCDEF","Player-1-AAAA2222",nil,false,obs)
 check(mode.." fresh verification keeps original validators",proof and proof.observationId==obs.id and proof.status=="pending")
 box.incoming=751;box.event("TRADE_SHOW");local ready=box.e.OlympusVerifyTreasury.SetTradeReference280("TITHE-ABCD-EFGH");box.event("TRADE_ACCEPT_UPDATE",1,1);box.wallet=box.wallet+751;box.event("UI_INFO_MESSAGE",1,"Trade complete.");box.event("PLAYER_MONEY")
 local nextRow;for _,r in pairs(box.rows())do if r.source=="tithe-gold-v2"and r.donation.copper==751 then nextRow=r end end
 check(mode.." unrelated current native-v2 keeps original validators",ready and nextRow and nextRow.id~=row.id and nextRow.donation.note==nil)
end
-- This row shape was reproduced through actual dfca sender chunks and the
-- actual collector receiveWire path in actual_dfca_probe.py, not inferred from
-- an allegation or granted remote trust. The literal is a portable regression.
local function bridgeRow(id)
 local row=seed().intake242.entries[MAIL];row.id=id;row.source="addon-bridge242";row.bridgeUntrusted=true;row.bridgeSender="Relayed Member"
 row.evidence={kind="remote-unconfirmed-declaration",confirmedLocal=false,automaticCredit=false};return row
end
do
 local box=fixture(true);local root=seed();local id=string.rep("e",32);root.intake242.entries[id]=bridgeRow(id);local original=clone(root.intake242.entries[id]);box.e.OlympusVerifyDB=root
 local p=box.e.OlympusVerifyLocalPrivacy280;p.Ensure(root);local row=root.intake242.entries[id];local status=p.Status(root)
 check("exact dfca relayed donation is recognized without remote authority",status.complete and row.source=="addon-bridge242"and row.evidence.kind=="remote-unconfirmed-declaration"and row.evidence.confirmedLocal==false)
 check("relayed correspondence blanks and original ID stays denied",row.donation.note==""and p.Blocked(root,id,row)and root.intake242.localCorrespondence280.blockedIds[id])
 local expected=clone(original);expected.donation.note="";check("bridged sender facts/hash/status/attempts/clocks stay exact",same(row,expected))
 local before=clone(row);box.ack(row);box.v.Flush("bridged-old-ack");check("recognized bridged original cannot adopt even a signed ACK",same(row,before)and root.intake242.acknowledgements[id]==nil)
end
do
 local box=fixture(true);local root=seed();local bridge=string.rep("e",32);local unknown=string.rep("f",32);local scalar=string.rep("d",24)
 root.intake242.entries[bridge]=bridgeRow(bridge)
 root.intake242.entries[unknown]={id=unknown,type="donation",source="Olympus-pendingRoleUpdates",character="Unknown Donor",requestedAt=1794312000,status="outcome_unknown",attempts=7,donation={note="PRIVATE_UNKNOWN",items={{itemId=789,count=4}}},unexpected=true}
 root.intake242.bridgeMetadata={[unknown]={origin="Olympus-pendingRoleUpdates"}}
 root.intake242.heldTransfers627["untyped-1"]={context={kind="mail",body="PRIVATE_UNTYPED",header={subject="PRIVATE_UNTYPED_SUBJECT"}},reason="legacy_or_invalid_saved_mail_context",heldAt=1794312000}
 root.intake242.entries[scalar]={id=scalar,type="donation",source="treasury-receipt242",requestedAt=1794312000,donation={copper=12}}
 local old=root.intake242;local unknownRow=old.entries[unknown];local untyped=old.heldTransfers627["untyped-1"];local unknownImage=clone(unknownRow);local untypedImage=clone(untyped)
 box.e.OlympusVerifyDB=root;local p=box.e.OlympusVerifyLocalPrivacy280;local complete=p.Ensure(root);local d=root.intake242;local status=p.Status(root)
 check("one unknown row and untyped context do not prevent recognized blanking",not complete and d~=old and d.entries[MAIL].donation.note==""and d.entries[bridge].donation.note==""and next(d.dedup)==nil)
 check("unsupported mirror and untyped context stay byte-equivalent original objects",d.entries[unknown]==unknownRow and same(unknownRow,unknownImage)and d.heldTransfers627["untyped-1"]==untyped and same(untyped,untypedImage))
 check("partial status explicitly counts both held items",status.held and not status.complete and status.heldEntries==1 and status.heldContexts==1 and status.heldKeys==0 and status.heldItems==2)
 check("unknown valid original ID is permanently deny-only",d.localCorrespondence280.blockedIds[unknown]and p.Blocked(root,unknown,unknownRow))
 check("unrelated scalar receipt is not blanket-marked or delivery-blocked",not d.localCorrespondence280.blockedIds[scalar]and not p.Blocked(root,scalar,d.entries[scalar]))
 check("original graph facts and foreign copies remain unchanged",old.entries[MAIL].donation.note=="PRIVATE_MAIL"and unknownRow.attempts==7 and unknownRow.status=="outcome_unknown"and unknownRow.donation.items[1].count==4)
 local first=clone(d);setfenv(assert(loadfile("../OlympusVerify/OlympusVerifyLocalPrivacy280.lua")),box.e)("OlympusVerify");p=box.e.OlympusVerifyLocalPrivacy280;p.Ensure(root)
 check("partial reload neither reblanks nor renews counts or identities",same(root.intake242,first)and p.Status(root).heldItems==2)
 local obs=box.v.NewVerificationObservation("whisper","Fresh Member","Player-1-AAAA2222","mixed-unknown")
 local proof=box.v.CaptureVerification("whisper","Fresh Member","ABCDEF","Player-1-AAAA2222",nil,false,obs)
 check("partial item holds preserve fresh verification path",proof and proof.observationId==obs.id and proof.status=="pending")
 box.incoming=752;box.event("TRADE_SHOW");local ready=box.e.OlympusVerifyTreasury.SetTradeReference280("TITHE-ABCD-EFGH");box.event("TRADE_ACCEPT_UPDATE",1,1);box.wallet=box.wallet+752;box.event("UI_INFO_MESSAGE",1,"Trade complete.");box.event("PLAYER_MONEY")
 local current;for _,row in pairs(box.rows())do if row.source=="tithe-gold-v2"and row.donation.copper==752 then current=row end end
 check("partial item holds preserve actual fresh native v2",ready and current and current.donation.note==nil)
end
do
 local box=fixture(true);local root=seed();local id=string.rep("f",24);local shared=root.intake242.entries[MAIL].donation
 root.intake242.entries[id]={id=id,type="donation",source="unclassified",donation=shared};local unknown=root.intake242.entries[id];box.e.OlympusVerifyDB=root
 local p=box.e.OlympusVerifyLocalPrivacy280;p.Ensure(root)
 check("recognized/unknown shared aliases detach before any blanking",root.intake242.entries[MAIL].donation.note==""and unknown.donation==shared and shared.note=="PRIVATE_MAIL"and root.intake242.entries[id]==unknown)
 check("recognized internal entry/context aliases remain preserved",root.intake242.mailCollection242.exportBody==root.intake242.entries[MAIL])
end
for _,kind in ipairs({"wrong-evidence","untrusted-false","bad-sender","extra-key"})do
 local box=fixture(true);local root=seed();local id=string.rep("e",32);local row=bridgeRow(id)
 if kind=="wrong-evidence"then row.evidence.kind="unrecognized"elseif kind=="untrusted-false"then row.bridgeUntrusted=false elseif kind=="bad-sender"then row.bridgeSender=42 else row.extra=true end
 root.intake242.entries[id]=row;local image=clone(row);box.e.OlympusVerifyDB=root;local p=box.e.OlympusVerifyLocalPrivacy280;p.Ensure(root)
 check(kind.." bridge item stays unchanged while other text blanks",same(row,image)and root.intake242.entries[id]==row and root.intake242.entries[MAIL].donation.note==""and p.Status(root).heldEntries==1)
 check(kind.." bridge item has no send/ACK authority",p.Blocked(root,id,row)and root.intake242.localCorrespondence280.blockedIds[id])
end
do
 local box=fixture(true);local root=seed();local badKey="declaration|PRIVATE_UNCLASSIFIED_KEY";root.intake242.dedup[badKey]=42;box.e.OlympusVerifyDB=root
 local p=box.e.OlympusVerifyLocalPrivacy280;p.Ensure(root);local status=p.Status(root)
 check("unknown raw key is preserved without suppressing known retirements",root.intake242.dedup[badKey]==42 and #root.intake242.localCorrespondence280.retiredDeclarations==2 and root.intake242.entries[MAIL].donation.note=="")
 check("unknown raw key reports counted incomplete status",status.heldItems==1 and status.heldKeys==1 and not status.complete)
end
-- Global structural/metadata bounds still veto the entire candidate even
-- when known and unknown financial items would otherwise be handled separately.
for _,kind in ipairs({"invalid-counter","generated-counter","generated-capacity"})do
 local box=fixture(true);local root=seed();local bridge=string.rep("e",32);local unknown=string.rep("f",32)
 root.intake242.entries[bridge]=bridgeRow(bridge);root.intake242.entries[unknown]={id=unknown,type="donation",source="unclassified",donation={note="PRIVATE_UNKNOWN"}}
 if kind=="generated-capacity"then
  root.intake242.extra={};local function fields(v,seen)if type(v)~="table"then return 0 end;seen=seen or{};if seen[v]then return 0 end;seen[v]=true;local n=0;for _,x in pairs(v)do n=n+1+fields(x,seen)end;return n end
  local available=262143-fields(root.intake242);for i=1,available do root.intake242.extra[i]=true end
 else root.intake242.localCorrespondence280={version=1,purpose="financial-correspondence-local-only-v1",blockedIds={},blockedTransferIds={},retiredDeclarations={},stats={blankedLeaves=kind=="invalid-counter"and -1 or 9007199254740991,retiredKeyCount=0,blockedOriginals=0,blockedTransfers=0}}end
 local old=root.intake242;local note=old.entries[MAIL].donation.note;box.e.OlympusVerifyDB=root;local p=box.e.OlympusVerifyLocalPrivacy280;local complete=p.Ensure(root);local status=p.Status(root)
 check(kind.." mixed scope preserves the entire original on global failure",not complete and root.intake242==old and old.entries[MAIL].donation.note==note and old.entries[bridge].donation.note~="")
 check(kind.." reports incomplete without invented per-item count",status.held and not status.complete and status.heldItems==nil)
 check(kind.." keeps known and unknown financial originals blocked",p.Blocked(root,bridge,old.entries[bridge])and p.Blocked(root,unknown,old.entries[unknown]))
end
print(string.format("local correspondence280: %d/%d passed",checks-failed,checks))
if failed>0 then error("local correspondence280 regression failed")end
