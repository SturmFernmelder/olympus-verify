local results={}
local function event(x,k) x.treasuryFrame:GetScript('OnEvent')(x.treasuryFrame,k) end
local function n(x) return #x.e.OlympusVerifyDB.treasury.receipts end
local function count(x) local n=0;for _ in pairs(x)do n=n+1 end;return n end
local function check(label,yes,observed) results[#results+1]={name=label,pass=yes==true,observed=observed} end
local function mail(two)
 local x=fixture(true);x.e.GetTime=function()return x.e.MONO or x.e.NOW end;x.e.OlympusVerifyConfig.readMail=false
 x.inbox={{sender='Tithe Donor',subject='TITHE-ABCD-EFGH',money=700,items={{name='Attachment',id=1,count=1}}}}
 if two then x.inbox[2]={sender='Tithe Donor',subject='TITHE-ABCD-EFGH',money=700} end
 event(x,'MAIL_SHOW');return x
end
local function finish(x,copper)
 for _,row in ipairs(x.inbox)do row.money=0 end
 x.wallet=x.wallet+copper;event(x,'MAIL_INBOX_UPDATE');event(x,'PLAYER_MONEY')
end
local x=mail();x.e.AutoLootMailItem(1);finish(x,700);check('no intermediate scan original positive',n(x)==1 and count(x.rows())==1,n(x))
local x=mail();x.e.AutoLootMailItem(1);event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney(1);finish(x,700);check('same-money intermediate update reuses one pending intent',n(x)==1 and x.e.OlympusVerifyDB.treasury.nextId==1 and count(x.rows())==1,n(x))
local x=mail(true);x.e.AutoLootMailItem(1);x.e.TakeInboxMoney(2);finish(x,1400);check('two identical legitimate mails preserve multiplicity',n(x)==2 and x.e.OlympusVerifyDB.treasury.nextId==2,n(x))
local x=mail(true);x.e.AutoLootMailItem(1);event(x,'MAIL_INBOX_UPDATE');x.e.AutoLootMailItem(2);event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney(1);event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney(2);finish(x,1400);check('interleaved hook pairs on identical distinct indices produce two originals',n(x)==2 and x.e.OlympusVerifyDB.treasury.nextId==2,n(x))
local x=mail();x.e.AutoLootMailItem(1)
for i=1,3 do x.e.NOW=x.e.NOW+1;event(x,'MAIL_INBOX_UPDATE') end
x.e.TakeInboxMoney(1);finish(x,700);check('several equivalent updates reuse same original without extra context',n(x)==1 and x.e.OlympusVerifyDB.treasury.nextId==1,n(x))
local x=mail();x.e.AutoLootMailItem(1);x.inbox[1].items={};event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney(1);finish(x,700);check('attachment removal leaves authorized gold snapshot equivalent',n(x)==1,n(x))
local x=mail(true);x.e.TakeInboxMoney(1);x.inbox[1].money=0;x.wallet=x.wallet+700;event(x,'MAIL_INBOX_UPDATE');event(x,'PLAYER_MONEY')
table.remove(x.inbox,1);event(x,'MAIL_INBOX_UPDATE');x.e.AutoLootMailItem(1);event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney(1);finish(x,700)
check('sequential identical real mails create two separate batch receipts',n(x)==2 and x.e.OlympusVerifyDB.treasury.nextId==2,n(x))
local x=mail();x.e.AutoLootMailItem(1);event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney(1);check('item-only hook without gold movement is not confirmed',n(x)==0,n(x))
local x=mail();x.e.AutoLootMailItem(1);event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney(1);x.wallet=x.wallet+700;event(x,'PLAYER_MONEY');check('wallet delta without native depletion holds',n(x)==0,n(x))
local x=mail();x.e.AutoLootMailItem(1);event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney(1);x.inbox[1].money=0;event(x,'MAIL_INBOX_UPDATE');check('native depletion without wallet delta holds',n(x)==0,n(x))
local x=mail(true);x.e.AutoLootMailItem(1);event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney(2);x.inbox[1].money=0;x.wallet=x.wallet+700;event(x,'MAIL_INBOX_UPDATE');event(x,'PLAYER_MONEY');check('partial two-intent settlement is held',n(x)==0,n(x));x.inbox[2].money=0;x.wallet=x.wallet+700;event(x,'MAIL_INBOX_UPDATE');event(x,'PLAYER_MONEY');check('later exact full wallet and depletion settles original two intents',n(x)==2,n(x))
local x=mail();x.e.AutoLootMailItem(1);local get=x.e.GetInboxNumItems;x.e.GetInboxNumItems=function()return 1,2 end;event(x,'MAIL_INBOX_UPDATE');x.e.GetInboxNumItems=get;event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney(1);finish(x,700);check('partial native snapshot cannot authorize cross-scan alias',n(x)==0,n(x))
local x=mail();x.e.AutoLootMailItem(1);local get=x.e.GetInboxHeaderInfo;x.e.GetInboxHeaderInfo=function()return nil end;event(x,'MAIL_INBOX_UPDATE');x.e.GetInboxHeaderInfo=get;event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney(1);finish(x,700);check('unreadable counted row cannot authorize cross-scan alias',n(x)==0,n(x))
local x=mail();x.e.AutoLootMailItem(1);local get=x.e.GetMoney;x.e.GetMoney=function()return nil end;event(x,'MAIL_INBOX_UPDATE');x.e.GetMoney=get;event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney(1);finish(x,700);check('unreadable wallet gap cannot authorize later alias',n(x)==0,n(x))
local x=mail();x.e.AutoLootMailItem(1);x.inbox[1].cod=20;event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney(1);finish(x,700);check('COD change holds original batch',n(x)==0,n(x))
local x=mail();x.e.AutoLootMailItem(1);x.e.OlympusVerifyAPI.TreasuryTransport.Guid=function()return 'Player-1-FFFFBBBB' end;event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney(1);finish(x,700);check('changed collector GUID never borrows original alias',n(x)==0,n(x))
local x=mail(true);x.e.AutoLootMailItem(1);table.remove(x.inbox,1);event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney(1);finish(x,700);check('shifted identical index with only one wallet movement stays held',n(x)==0,n(x))
local x=mail();x.e.AutoLootMailItem(1);x.inbox[2]={sender='Tithe Donor',subject='TITHE-ABCD-EFGH',money=700};event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney(1);x.inbox[1].money=0;x.wallet=x.wallet+700;event(x,'MAIL_INBOX_UPDATE');event(x,'PLAYER_MONEY');check('new identical arrival cannot erase multiplicity or fill depletion proof',n(x)==0,n(x))
local x=mail();x.e.AutoLootMailItem(1);event(x,'MAIL_INBOX_UPDATE');x.wallet=x.wallet+100;x.e.TakeInboxMoney(1);x.inbox[1].money=0;x.wallet=x.wallet+600;event(x,'MAIL_INBOX_UPDATE');event(x,'PLAYER_MONEY');check('wallet change after equivalent scan refuses carried alias',n(x)==0,n(x))
local x=mail();x.e.AutoLootMailItem(1);local get=x.e.GetInboxHeaderInfo;local once=false;x.e.GetInboxHeaderInfo=function(i)if not once then once=true;x.wallet=x.wallet+1 end;return get(i)end;event(x,'MAIL_INBOX_UPDATE');x.e.GetInboxHeaderInfo=get;x.wallet=x.wallet-1;x.e.TakeInboxMoney(1);finish(x,700);check('wallet changed during native scan cannot be reused after resetting value',n(x)==0,n(x))
local x=mail();x.e.AutoLootMailItem(1);x.e.NOW=x.e.NOW+9;event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney(1);finish(x,700);check('after-expiry hook starts fresh batch from current native cache',n(x)==1,n(x))
local x=mail();x.e.AutoLootMailItem(1);x.e.DeleteInboxItem(1);x.wallet=x.wallet+700;event(x,'MAIL_INBOX_UPDATE');event(x,'PLAYER_MONEY');check('native delete interruption prevents collected receipt',n(x)==0,n(x))
local x=mail();x.inbox[1].subject='Auction successful';event(x,'MAIL_INBOX_UPDATE');x.e.AutoLootMailItem(1);event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney(1);finish(x,700);check('excluded gold never gains sender original or transfer context',n(x)==0 and x.e.OlympusVerifyDB.treasury.nextId==0,n(x))
local x=mail();x.e.AutoLootMailItem(1);event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney(1);finish(x,700)
local row=x.e.OlympusVerifyDB.treasury.receipts[1];local id=row and row.id;local mac=row and row.mac;local at=row and row.ts;local body=row and x.e.OlympusVerifyTreasury.IntakeBody280(row)
event(x,'MAIL_INBOX_UPDATE');event(x,'PLAYER_MONEY')
check('confirmed original id MAC timestamp and body remain unchanged',row and row.id==id and row.mac==mac and row.ts==at and body.id==id and body.evidence.mac==mac and n(x)==1,n(x))
local x=mail();x.e.AutoLootMailItem(1);event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney('01');finish(x,700);check('native hook index uses canonical bounded integer before alias key',n(x)==1 and x.e.OlympusVerifyDB.treasury.nextId==1,n(x))
local x=mail();x.e.AutoLootMailItem(1);event(x,'MAIL_INBOX_UPDATE');event(x,'PLAYER_MONEY');x.e.TakeInboxMoney(1);finish(x,700);check('cross-scan wallet event cannot be erased by matching sampled balance',n(x)==0,n(x))
local function timed()
 local x=mail();x.e.MONO=0;x.timers={}
 x.e.C_Timer.After=function(delay,fn)x.timers[#x.timers+1]={at=x.e.MONO+delay,fn=fn}end
 x.tick=function(amount) x.e.MONO=x.e.MONO+amount;x.e.NOW=x.e.NOW+amount;local due,keep={},{};for _,timer in ipairs(x.timers)do if timer.at<=x.e.MONO then due[#due+1]=timer else keep[#keep+1]=timer end end;x.timers=keep;for _,timer in ipairs(due)do timer.fn()end end
 return x
end
local x=timed();x.e.AutoLootMailItem(1);x.tick(7.9);event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney(1);finish(x,700);check('actual timer remains pending at7.9seconds',n(x)==1,n(x))
local x=timed();x.e.AutoLootMailItem(1);x.tick(8);x.e.TakeInboxMoney(1);finish(x,700);check('actual timer fires at8seconds then new hook starts one fresh batch',n(x)==1,n(x))
local x=timed();x.e.AutoLootMailItem(1);x.tick(8);finish(x,700);check('expired timer without new native hook cannot invent receipt',n(x)==0,n(x))
local x=timed();x.e.AutoLootMailItem(1);x.e.NOW=x.e.NOW+500;event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney(1);finish(x,700);check('wall clock jump does not change bounded monotonic alias age',n(x)==1,n(x))
local x=timed();x.e.AutoLootMailItem(1);x.e.MONO=-1;event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney(1);finish(x,700);check('backwards monotonic clock does not preserve old alias',n(x)==1,n(x))
local x=mail();x.e.AutoLootMailItem(1);x.wallet=x.wallet+700;event(x,'PLAYER_MONEY');x.e.TakeInboxMoney(1);x.inbox[1].money=0;event(x,'MAIL_INBOX_UPDATE');check('wallet event retains base same-scan dedup key',n(x)==1,n(x))
local x=mail();x.e.AutoLootMailItem(1);event(x,'PLAYER_MONEY');x.e.TakeInboxMoney(1);finish(x,700);check('wallet-neutral event retains base same-scan dedup key',n(x)==1,n(x))
local x=mail();x.inbox={};for i=1,20 do x.inbox[i]={sender='Tithe Donor',subject='TITHE-ABCD-EFGH',money=700}end;event(x,'MAIL_INBOX_UPDATE');for i=1,20 do x.e.AutoLootMailItem(i);event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney(i);x.inbox[i].money=0;event(x,'MAIL_INBOX_UPDATE');x.wallet=x.wallet+700;event(x,'PLAYER_MONEY')end;check('Open All twenty paired hooks retain all real originals',n(x)==20,n(x))
local x=mail();x.e.AutoLootMailItem(1);event(x,'PLAYER_MONEY');event(x,'MAIL_INBOX_UPDATE');x.e.TakeInboxMoney(1);finish(x,700);check('wallet-neutral event permanently prevents carried alias after next scan',n(x)==0 and x.e.OlympusVerifyDB.treasury.nextId==2,{receipts=n(x),contexts=x.e.OlympusVerifyDB.treasury.nextId})
local passed=0;for _,r in ipairs(results)do if r.pass then passed=passed+1 end end
return {checks=#results,passed=passed,results=results,providerCalls=0,nativeActions=0,scope='Synthetic supported post-hook controls; no observed real-client ordering claim'}
