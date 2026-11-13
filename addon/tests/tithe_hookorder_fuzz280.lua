-- Randomized model check: receipts (by sender|copper) must never exceed real collections.
-- Native model: hooks request a take; the server completes it later in two halves (wallet, inbox) in random order.
local SEEDS=tonumber(FUZZ_SEEDS or 2000)
local UNRELATED=FUZZ_UNRELATED and true or false
local function event(x,k,...) x.treasuryFrame:GetScript('OnEvent')(x.treasuryFrame,k,...) end
local senders={{'Tithe Donor',700},{'Tithe Donor',700},{'Tithe Donor',300},{'Other Donor',700},{'Auction House',700}}
local worst,overCases,totalCollected,totalReceipts,sequences={},0,0,0,0
local example
local perSeed={}
for seed=(FUZZ_ONLY or 1),(FUZZ_ONLY or SEEDS) do
  math.randomseed(seed)
  local x=fixture(true);x.e.GetTime=function()return x.e.MONO or x.e.NOW end;x.e.OlympusVerifyConfig.readMail=false
  local timers={};x.e.C_Timer.After=function(d,fn) timers[#timers+1]={due=x.e.NOW+d,fn=fn} end
  local log={}
  local inbox={}
  for i=1,math.random(1,5) do local s=senders[math.random(#senders)]
    inbox[i]={sender=s[1],subject=s[1]=='Auction House' and 'Auction successful' or 'TITHE-ABCD-EFGH',money=s[2],amount=s[2],items=math.random()<0.5 and {{name='I',id=i,count=1}} or {},cod=0}
  end
  x.inbox=inbox;event(x,'MAIL_SHOW')
  local open=true
  local collected={}
  local pending={}
  local function scan() if open then event(x,'MAIL_INBOX_UPDATE') end end
  local function tick(dt) x.e.NOW=x.e.NOW+dt;local due={};local keep={}
    for _,t in ipairs(timers) do if x.e.NOW>=t.due then due[#due+1]=t else keep[#keep+1]=t end end
    timers=keep;for _,t in ipairs(due) do t.fn() end end
  for step=1,math.random(4,18) do
    local r=math.random(100)
    if r<=30 and #x.inbox>0 and open then
      local i=math.random(#x.inbox);local m=x.inbox[i]
      if m.money>0 and not m.pending then m.pending={money=false,inbox=false};pending[#pending+1]=m end
      log[#log+1]='hook'..i
      if math.random()<0.5 then x.e.AutoLootMailItem(i) else x.e.TakeInboxMoney(i) end
    elseif r<=60 and #pending>0 then
      local k=math.random(#pending);local m=pending[k]
      local half=(m.pending.money and 'inbox') or (m.pending.inbox and 'money') or (math.random()<0.5 and 'money' or 'inbox')
      if half=='money' then
        m.pending.money=true;x.wallet=x.wallet+m.amount
        if m.subject~='Auction successful' then local key=m.sender..'|'..m.amount;collected[key]=(collected[key] or 0)+1 end
        log[#log+1]='money';event(x,'PLAYER_MONEY')
      else
        m.pending.inbox=true;m.money=0
        if #m.items==0 and math.random()<0.6 then for j,v in ipairs(x.inbox) do if v==m then table.remove(x.inbox,j);break end end end
        log[#log+1]='inbox';scan()
      end
      if m.pending.money and m.pending.inbox then m.pending=nil;table.remove(pending,k) end
    elseif r<=68 then
      local any=false;for _,m in ipairs(x.inbox) do if #m.items>0 then table.remove(m.items);any=true;break end end
      log[#log+1]=any and 'itemscan' or 'scan';scan()
    elseif r<=73 and #pending>0 then
      local k=math.random(#pending);local m=pending[k]
      if not m.pending.money and not m.pending.inbox then m.pending=nil;table.remove(pending,k);log[#log+1]='fail' end
    elseif r<=78 then
      if open then log[#log+1]='close';event(x,'MAIL_CLOSED');open=false else log[#log+1]='show';open=true;event(x,'MAIL_SHOW') end
    elseif r<=82 and UNRELATED then
      local c=({700,300,-700,100})[math.random(4)];x.wallet=x.wallet+c;log[#log+1]='unrelated'..c;event(x,'PLAYER_MONEY')
    elseif r<=86 and open then
      for j,m in ipairs(x.inbox) do if m.money==0 and #m.items==0 then log[#log+1]='delete'..j;x.e.DeleteInboxItem(j);scan();break end end
    else local dt=math.random(0,3);log[#log+1]='t+'..dt;tick(dt) end
  end
  -- drain: complete every pending take in random half order, then let timers expire
  for _,m in ipairs(pending) do
    if not m.pending.money then x.wallet=x.wallet+m.amount;if m.subject~='Auction successful' then local key=m.sender..'|'..m.amount;collected[key]=(collected[key] or 0)+1 end;log[#log+1]='money';event(x,'PLAYER_MONEY') end
    if not m.pending.inbox then m.money=0;log[#log+1]='inbox';scan() end
  end
  tick(10)
  local got={};local nrec=0
  for _,row in ipairs(x.e.OlympusVerifyDB.treasury.receipts) do local key=row.sender..'|'..row.incomingCopper;got[key]=(got[key] or 0)+1;nrec=nrec+1 end
  local nc=0;for _,v in pairs(collected) do nc=nc+v end
  perSeed[#perSeed+1]=nrec;totalCollected=totalCollected+nc;totalReceipts=totalReceipts+nrec;sequences=sequences+1
  local over=false;for k,v in pairs(got) do if v>(collected[k] or 0) then over=true end end
  if FUZZ_ONLY then example={seed=seed,log=table.concat(log,' '),receipts=nrec,collected=nc} end
  if over then overCases=overCases+1;if not example then example={seed=seed,log=table.concat(log,' '),receipts=nrec,collected=nc} end end
end
return {sequences=sequences,overCreditSequences=overCases,collected=totalCollected,receipts=totalReceipts,firstOver=example,perSeed=table.concat(perSeed,','),unrelatedMoney=UNRELATED}
