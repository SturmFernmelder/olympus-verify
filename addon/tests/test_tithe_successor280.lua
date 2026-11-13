-- Actual stopped source, synthetic native API calls; never real gold/mail.
local out={}
local function check(name,pass) out[#out+1]={name=name,pass=pass==true};print((pass and "PASS " or "FAIL ")..name) end
local function event(x,kind) x.treasuryFrame:GetScript('OnEvent')(x.treasuryFrame,kind) end
local function n(x) return #(x.e.OlympusVerifyDB.treasury.receipts or {}) end
local function mail()
 local x=fixture(true);x.e.OlympusVerifyConfig.readMail=false
 x.inbox={{sender='Tithe Donor',subject='TITHE-ABCD-EFGH',money=700},{sender='Auction House',subject='Auction successful',money=300}}
 event(x,'MAIL_SHOW');return x
end
do
 for _,auctionFirst in ipairs({false,true}) do
  local x=mail();if auctionFirst then x.e.TakeInboxMoney(2);x.e.TakeInboxMoney(1) else x.e.TakeInboxMoney(1);x.e.TakeInboxMoney(2) end
  x.inbox[1].money=0;x.inbox[2].money=0;x.wallet=x.wallet+1000;event(x,'MAIL_INBOX_UPDATE');event(x,'PLAYER_MONEY')
  local r=x.e.OlympusVerifyDB.treasury.receipts[1]
  check('mixed complete batch records only700 TITHE, hook order '..tostring(auctionFirst),n(x)==1 and r.incomingCopper==700 and r.reference=='TITHE-ABCD-EFGH')
  check('excluded auction creates no transfer context or financial original '..tostring(auctionFirst),x.e.OlympusVerifyDB.treasury.nextId==1 and count(x.rows())==1)
 end
 local x=mail();x.e.TakeInboxMoney(2);x.e.TakeInboxMoney(1);x.inbox[2].money=0;x.wallet=x.wallet+300;event(x,'MAIL_INBOX_UPDATE');event(x,'PLAYER_MONEY')
 check('auction-first partial wallet/depletion never prematurely credits TITHE',n(x)==0)
 x.inbox[1].money=0;x.wallet=x.wallet+700;event(x,'MAIL_INBOX_UPDATE');event(x,'PLAYER_MONEY')
 check('second observed matching TITHE arrival completes only intended receipt',n(x)==1 and x.e.OlympusVerifyDB.treasury.receipts[1].incomingCopper==700)
 local y=mail();y.e.TakeInboxMoney(1);y.e.TakeInboxMoney(2);y.inbox[1].money=0;y.inbox[2].money=0;y.wallet=y.wallet+700;event(y,'MAIL_INBOX_UPDATE');event(y,'PLAYER_MONEY')
 check('depleted mixed inbox with only partial wallet delta stays unconfirmed',n(y)==0)
 local z=mail();z.e.TakeInboxMoney(1);z.inbox[1].money=0;z.wallet=z.wallet+1000;event(z,'MAIL_INBOX_UPDATE');event(z,'PLAYER_MONEY')
 check('unexplained unrelated income cannot fill a missing native take intent',n(z)==0)
 local plain=mail();plain.e.TakeInboxMoney(2);plain.inbox[2].money=0;plain.wallet=plain.wallet+300;event(plain,'MAIL_INBOX_UPDATE');event(plain,'PLAYER_MONEY')
 check('auction-only collection creates no receipt or transfer id',n(plain)==0 and plain.e.OlympusVerifyDB.treasury.nextId==0 and count(plain.rows())==0)
 local cod=mail();cod.inbox[1].cod=20;event(cod,'MAIL_INBOX_UPDATE');cod.e.TakeInboxMoney(1);cod.inbox[1].money=0;cod.wallet=cod.wallet+700;event(cod,'MAIL_INBOX_UPDATE');event(cod,'PLAYER_MONEY')
 check('COD never creates a qualifying receipt',n(cod)==0)
 local partial=mail();partial.e.TakeInboxMoney(1);partial.e.TakeInboxMoney(2);partial.inbox[1].money=0;partial.wallet=partial.wallet+700;event(partial,'MAIL_INBOX_UPDATE');event(partial,'PLAYER_MONEY')
 check('partial mixed depletion stays held until all observed take intents settle',n(partial)==0)
end
do
 local x=fixture(true);x.e.OlympusVerifyAPI.TreasuryTransport.Name=function()return 'Fern Melder-NATIVE REALM' end
 x.incoming=700;x.event('TRADE_SHOW');local accepted=x.e.OlympusVerifyTreasury.SetTradeReference280('TITHE-ABCD-EFGH');x.event('TRADE_ACCEPT_UPDATE',1,1);x.wallet=x.wallet+700;x.event('UI_INFO_MESSAGE',1,'Trade complete.');x.event('PLAYER_MONEY')
 local r=x.e.OlympusVerifyDB.treasury.receipts[1]
 check('exact collector plus one matching current native realm captures trade',accepted and n(x)==1 and r.recipient=='Fern Melder' and r.collectorGuid=='Player-1-1234ABCD' and r.realm=='Native Realm')
 local y=mail();y.e.OlympusVerifyAPI.TreasuryTransport.Name=function()return 'Fern Melder-NativeRealm' end;y.e.TakeInboxMoney(1);y.inbox[1].money=0;y.wallet=y.wallet+700;event(y,'MAIL_INBOX_UPDATE');event(y,'PLAYER_MONEY')
 check('matching native suffix mail uses canonical recipient without discarding actual scope',n(y)==1 and y.e.OlympusVerifyDB.treasury.receipts[1].recipient=='Fern Melder')
 for _,name in ipairs({'Fern Melder-OtherRealm','Fern Melder-NativeRealm-Extra','Fern Melder-','Fernmelder','fern melder','Other Officer',' Fern Melder'}) do
  local bad=fixture(true);bad.e.OlympusVerifyAPI.TreasuryTransport.Name=function()return name end;bad.incoming=700;bad.event('TRADE_SHOW');local ref=bad.e.OlympusVerifyTreasury.SetTradeReference280('TITHE-ABCD-EFGH')
  bad.event('TRADE_ACCEPT_UPDATE',1,1);bad.wallet=bad.wallet+700;bad.event('UI_INFO_MESSAGE',1,'Trade complete.');bad.event('PLAYER_MONEY')
  check('ambiguous alternate collector identity held: '..name,not ref and n(bad)==0)
 end
end
do
 local x=fixture(true);local d=x.e.OlympusVerifyDB.intake242;d.heldTransfers627={one={body='OLD PRIVATE'},two={unknown=true}};d.tradeCollection242={old=true};d.receiptPolicyHolds280={trade=true}
 local old=pack(d.heldTransfers627);local okay,status=pcall(x.v.Status)
 check('Live Status counts retained holds without deleted helper or original mutation',okay and status.heldTransfers>=2 and pack(d.heldTransfers627)==old)
 d.entries.unreadable=false;local read,held=pcall(x.v.Status)
 check('read-only Status holds malformed retained row without overwriting it',read and held.heldTransfers>=3 and d.entries.unreadable==false)
 local y=mail();y.e.TakeInboxMoney(1);event(y,'MAIL_CLOSED')
 check('Treasury Status counts new counts-only unconfirmed observations',y.e.OlympusVerifyTreasury.Status().unconfirmed>=1)
 local z=fixture(true);z.incoming=100;z.event('TRADE_SHOW');local api=z.e.OlympusVerifyTreasury
 check('strict API still refuses noncanonical stored reference form',not api.SetTradeReference280(' tithe-abcd-efgh '))
 local command=api.SetTradeReferenceCommand280
 check('new deliberate command accepts trimmed lowercase reference only for open intended trade',type(command)=='function' and command(' tithe-abcd-efgh '))
 z.event('TRADE_CLOSED');check('new command never carries reference into a closed or next trade',type(command)=='function' and not command('TITHE-ABCD-EFGH'))
 local kept={old=true};z.e.OlympusVerifyDB.treasury.liveIntakeOwners242=kept
 check('obsolete claim APIs no longer create fresh contexts or claims',api.ClaimMailIntake242==nil and api.ClaimTradeIntake242==nil and api.MailTransferId627==nil and z.e.OlympusVerifyDB.treasury.liveIntakeOwners242==kept)
end
do
 for _,field in ipairs({'clientVersion','guild','rankName','rankIndex'}) do
  local sender=member('Typed Sender');sender.v.QueueSelf('ABC234');local row;for _,r in pairs(sender.rows())do row=copy(r) end
  row[field]={[1]='numeric-nested'};local receiver=fixture();local calls=0;receiver.e.OlympusVerifyAPI.NativeBridgeMembership242=function()calls=calls+1 end
  emit(receiver,row,sender.name)
  check('new remote optional '..field..' is scalar-typed before proof/storage',count(receiver.rows())==0 and calls==0)
 end
 local sender=member('Valid Producer');sender.v.QueueSelf('ABC234');local receiver=fixture();drain(sender,receiver)
 check('valid actual producer still passes scalar admission with original fields',count(receiver.rows())==1)
 local x=fixture();local h=x.e.OlympusHmac;local name='Old Mail Sender';local code=h.codeFor(x.e.OlympusVerifyConfig.secret,name,h.utcDay(x.e.NOW));local subject='!verify '..code;local body='TRANSIENT BODY'
 local fp=h.sha256hex(name..'|'..subject..'|'..body..'|'..code);local id=string.rep('c',32);local at=x.e.NOW-100
 local original={id=id,type='verify',source='mail',character=name,code=code,observedAt=at,requestedAt=at,status='pending'};x.rows()[id]=original
 x.e.OlympusVerifyDB.intake242.mail={[fp]={verifyId=id,observation={id=string.rep('a',32),observedAt=at},firstSeen=at}}
 local before=pack(original);TITHE_SUCCESSOR_OLD_MAIL_BEFORE=copy(original);x.inbox={{sender=name,subject=subject,body=body,money=0}};x.event('MAIL_SHOW')
 check('retained no-proof mail original never gains a proof or canonical-body change',original.mailProof242==nil and pack(original)==before)
 local fresh=fixture();local fh=fresh.e.OlympusHmac;local fc=fh.codeFor(fresh.e.OlympusVerifyConfig.secret,name,fh.utcDay(fresh.e.NOW));fresh.inbox={{sender=name,subject='!verify '..fc,body='NEW NATIVE MAIL',money=0}};fresh.event('MAIL_SHOW')
 local current;for _,r in pairs(fresh.rows())do current=r end
 check('new source-owned mail capture still finishes its original proof immediately',current and current.mailProof242 and current.mailProof242.observedAt==current.observedAt)
 TITHE_SUCCESSOR_OLD_MAIL=copy(original)
end
local passed=0;for _,r in ipairs(out)do if r.pass then passed=passed+1 end end
return {checks=#out,passed=passed,results=out,oldMail=TITHE_SUCCESSOR_OLD_MAIL,oldMailBefore=TITHE_SUCCESSOR_OLD_MAIL_BEFORE,nativeAcceptance=false,providerCalls=0}
