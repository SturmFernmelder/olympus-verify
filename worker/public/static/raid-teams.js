const API = "/api/community/raid-teams";
const HOME = "#/community/raid-teams";
const ROLES = { tank: "Tank", healer: "Healer", melee: "Melee damage", ranged: "Ranged damage", flex: "Flexible" };
const STATUS = { forming: "Forming", recruiting: "Recruiting", full: "Full", reserves: "Recruiting reserves", inactive: "Inactive" };
const SEATS = { applied: "Application submitted", submitted: "Application submitted", offered_primary: "Primary place offered",
  offered_reserve: "Reserve place offered", primary: "Primary raider", reserve: "Reserve raider", waitlisted: "Waitlisted", declined: "Declined", withdrawn: "Withdrawn" };
const myZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
const dateTime = (epoch, timezone) => new Intl.DateTimeFormat(undefined, {
  weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: timezone,
}).format(new Date(epoch * 1000));
const requestId = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(16)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");

export async function renderRaidTeams(root, parts, { h, frame, api, live, explain, toast }) {
  root.classList.add("raid-teams");
  const link = (title, href) => h("a", { class: "btn small", href, text: title });
  const button = (title, onclick, primary = false) => h("button", { class: "btn" + (primary ? " primary" : " small"), type: "button", text: title, onclick });
  const row = (...els) => h("div", { class: "btn-row" }, ...els);
  const p = (text, cls = "muted") => h("p", { class: cls, text });
  const section = (title, ...kids) => h("section", { class: "card stack" }, h("h3", { text: title }), ...kids);
  const goTeam = (id) => HOME + "/" + encodeURIComponent(id);
  const field = (label, input, hint) => h("label", { class: "field" }, h("span", { class: "lab", text: label }), input, hint && h("span", { class: "hint below", text: hint }));
  const input = (name, value = "", extra = {}) => h("input", { name, value: value ?? "", ...extra });
  const area = (name, value = "", extra = {}) => h("textarea", { name, rows: 3, ...extra }, value || "");
  const options = (name, choices, value) => h("select", { name }, ...Object.entries(choices).map(([key, label]) => h("option", { value: key, selected: String(value) === key, text: label })));
  const facts = (pairs) => h("dl", { class: "kv" }, ...pairs.flatMap(([key, val]) => val || val === 0 ? [h("dt", {text:key}), h("dd", {text:String(val)})] : []));
  const notice = h("p", { role: "status", class: "raid-feedback", tabindex: "-1" });
  const main = h("div", { class: "stack" });
  const tab = parts[0] || "", teamRoute = tab && !["players","profile","new","schedule"].includes(tab);
  const routes = [["", "Find a team"], ["players", "Find raiders"], ["profile", "My raider profile"], ["schedule", "My next raid"]];
  root.replaceChildren(h("nav", { class: "btn-row", "aria-label": "Raid recruitment" },
    ...routes.map(([path,title]) => h("a", { class: "btn small", href: HOME + (path ? "/" + path : ""), "aria-current": path === tab ? "page" : null, text:title }))),
    notice, main);
  const read = (path) => api("GET", path, undefined, { live });
  if (!live()) return;
  let busy = false, generation = 0;
  function report(text, error = false) {
    notice.textContent = text;
    notice.className = error ? "raid-feedback err" : "raid-feedback";
    if (error) notice.focus();
  }
  function errors(err, fallback) {
    const known = {
      other_primary_commitment: "This team’s weekly raid times overlap another primary commitment in the next eight weeks. Review both schedules before accepting.",
      stale: "This record changed. Refresh it before making another change.",
      stale_revision: "This record changed. Refresh it before making another change.",
      full: "This team has no open places for this offer.",
      verified_character_required: "Link a current guild character before continuing.",
    };
    return known[err?.data?.error] || explain(err, fallback);
  }
  function form(label, fields, save, title, primary = true) {
    const submit = h("button", { type:"submit", class: "btn" + (primary ? " primary" : " small"), text: title });
    const f = h("form", { class: "stack", "aria-label": label }, ...fields, row(submit));
    f.addEventListener("submit", (e) => { e.preventDefault(); if (!busy) save(Object.fromEntries(new FormData(f)), f); });
    return f;
  }
  let refresh;
  async function write(path, payload, message, success, conflict) {
    if (busy || !live()) return;
    busy = true;
    main.inert = true;
    report("Saving…");
    try {
      const result = await api("POST", path, payload, { live });
      if (!live()) return;
      if (success) await success(result);
      else await refresh();
      if (live()) report(message);
    } catch (e) {
      if (!live()) return;
      report(errors(e, "The change could not be saved. Check the latest record before trying again."), true);
      if (e?.data?.error === "other_primary_commitment" && conflict) conflict();
      else if (e?.status === 409 || !e?.status) notice.append(" ", button("Refresh current record", () => refresh()));
    } finally { busy = false; main.inert = false; }
  }
  function details(label, content) {
    return h("details", {class:"raid-details"}, h("summary", {text:label}), content);
  }
  function charSelect(chars, chosen) {
    return field("Verified character", options("guid", Object.fromEntries(chars.map(c => [c.guid,c.name])), chosen));
  }
  function verifyNotice() {
    return p("To take a roster place, verify your guild character in Discord’s Olympus verification guide, then return here.");
  }
  const days={1:"Monday",2:"Tuesday",3:"Wednesday",4:"Thursday",5:"Friday",6:"Saturday",7:"Sunday"};
  const timingLabel=t=>(t.weeklyWindows||[]).map(w=>days[w.day]+" "+w.start+"–"+w.end+(w.end<w.start?" (+1 day)":"")).join(", ");
  const filters={q:"",status:"",role:"",timezone:"",class:"",spec:"",teamRole:"",style:"",day:"",from:"",to:""};
  let page = 1, chosenGuid = "", calendarAfter = "";
  function directoryPath() {
    const params = new URLSearchParams({teamPage:String(tab === "players" ? 1 : page), playerPage:String(tab === "players" ? page : 1)});
    for (const [key,value] of Object.entries(filters)) if (value) params.set(key,value);
    if (filters.day || filters.from || filters.to) params.set("viewerZone",myZone());
    return API + "?" + params.toString();
  }
  function weeklyEditor(windows) {
    const list=h("div",{class:"stack"}),addButton=button("Add weekly time",()=>add({day:1,start:"",end:""}));
    let sequence=0;
    function add(w) {
      if(list.children.length>=7)return;
      const i=++sequence;
      const day=options("windowDay"+i,days,w.day),start=input("windowStart"+i,w.start,{type:"time",required:true}),
        end=input("windowEnd"+i,w.end,{type:"time",required:true});
      const entry=h("div",{class:"raid-week-window"},field("Day",day),field("Starts",start),field("Ends",end),
        button("Remove time",()=>{entry.remove();addButton.disabled=false;}));
      list.append(entry);addButton.disabled=list.children.length>=7;
    }
    for(const w of windows||[])add(w);
    return h("fieldset",{class:"stack"},h("legend",{text:"Weekly raid times"}),list,addButton,
      p("Use the team’s time zone. An end before the start means the raid continues after midnight."));
  }
  function charterPayload(formData) {
    const data={...formData},weeklyWindows=[],roleNeeds=[];
    for(const key of Object.keys(formData)){
      const day=/^windowDay(\d+)$/.exec(key);
      if(day){
        const i=day[1];weeklyWindows.push({day:Number(data[key]),start:data["windowStart"+i],end:data["windowEnd"+i]});
        delete data[key];delete data["windowStart"+i];delete data["windowEnd"+i];
      }
      if(key.startsWith("needRole_")){roleNeeds.push(key.slice(9));delete data[key];}
    }
    return {...data,capacity:Number(data.capacity),weeklyWindows,roleNeeds};
  }
  function charterFields(t) {
    return [
      field("Team name", input("name",t.name,{required:true,maxlength:64})),
      h("div",{class:"grid two"},
        field("Recruitment", options("status",STATUS,t.status || "forming")),
        field("Primary roster capacity", input("capacity",t.capacity || 40,{type:"number",min:1,max:100,required:true}))),
      field("Raid schedule", input("schedule",t.schedule,{maxlength:240,required:true,placeholder:"e.g. Tuesday and Thursday, 8–11 p.m."})),
      field("Schedule time zone",input("timezone",t.timezone || myZone(),{maxlength:64,required:true,placeholder:"America/Chicago"})),
      weeklyEditor(t.weeklyWindows),
      field("Raiding style",input("philosophy",t.philosophy,{maxlength:80,placeholder:"e.g. Beginner-friendly progression"})),
      h("fieldset",{class:"stack"},h("legend",{text:"Recruiting for"}),row(...Object.entries(ROLES).map(([key,label])=>
        h("label",null,input("needRole_"+key,"yes",{type:"checkbox",checked:(t.roleNeeds||[]).includes(key)})," "+label)))),
      field("Classes, specializations or other needs",input("needs",t.needs,{maxlength:160})),
      field("Loot rules and hard reserves",area("loot",t.loot,{required:true,maxlength:1000}),"Disclose reserved items and who can receive them before players accept a place."),
      field("Attendance, bench and preparation expectations",area("expectations",t.expectations,{maxlength:1000})),
    ];
  }
  function drawDirectory(d) {
    const players = tab === "players";
    const rows = players ? d.players : d.teams;
    const searchForm = form("Filter listings", [h("div",{class:"grid two"},
      field("Search", input("q",filters.q,{type:"search",maxlength:100,placeholder:players ? "Character, specialization or availability" : "Team name, raid day or open role"})),
      players ? field("Raid role",options("role",{"":"All roles",...ROLES},filters.role)) : field("Recruitment",options("status",{"":"All statuses",...STATUS},filters.status))),
      players ? h("div",{class:"grid two"},field("Class",input("class",filters.class,{maxlength:40})),field("Specialization",input("spec",filters.spec,{maxlength:80}))) : h("div",{class:"stack"},
        h("div",{class:"grid two"},field("Open raid role",options("teamRole",{"":"All roles",...ROLES},filters.teamRole)),field("Raiding style",input("style",filters.style,{maxlength:80}))),
        h("div",{class:"grid two"},field("Team time zone",input("timezone",filters.timezone,{maxlength:64,placeholder:"All time zones"})),
          field("Raid day in "+myZone(),options("day",{"":"Any day",...days},filters.day))),
        h("div",{class:"grid two"},field("Earliest start in "+myZone(),input("from",filters.from,{type:"time"})),
          field("Latest start in "+myZone(),input("to",filters.to,{type:"time"}))))],
    (data) => { Object.assign(filters,data); page=1; refresh(); }, "Filter listings", false);
    const next = players ? d.nextPlayers : d.nextTeams;
    const pager = row(page > 1 && button("Previous page", () => {page--;refresh();}),
      next && button("Next page", () => {page++;refresh();}));
    const cards = rows.map(t => players
      ? section(t.character,facts([["Role",ROLES[t.role]],["Class",t.playerClass],["Specialization",t.spec],["Availability",t.availability],["About this raider",t.notes]]))
      : h("article",{class:"card raid-team-card"},h("div",{class:"card-head"},
        h("h3",null,h("a",{href:goTeam(t.id),text:t.name})),h("span",{class:"badge",text:STATUS[t.status]})),
        facts([["Raid lead",t.leader],["Schedule",[timingLabel(t),t.schedule,t.timezone].filter(Boolean).join(" · ")],["Roster",t.primaryCount+" / "+t.capacity+" primary · "+t.reserveCount+" reserve"],
          ["Recruiting for",[...(t.roleNeeds||[]).map(r=>ROLES[r]),t.needs].filter(Boolean).join(", ")],["Raiding style",t.philosophy]]),
        h("a",{href:goTeam(t.id),text:"View charter and roster"})));
    const aside = players ? link("Edit my listing",HOME+"/profile") : link("Create a team",HOME+"/new");
    const places=!players && d.myTeams?.length ? section("My teams and applications",h("ul",{class:"raid-member-list"},...d.myTeams.map(m=>h("li",null,h("a",{href:goTeam(m.teamId),text:m.name})," · "+(SEATS[m.state]||m.state))))) : null;
    main.replaceChildren(frame(players ? "Find raiders" : "Find a raid team",aside,places,searchForm,rows.length ? h("div",{class:"grid two mt"},...cards)
      : p(Object.values(filters).some(Boolean) ? "No listings match these filters." : players ? "No raiders have listed themselves yet." : "No raid teams are listed yet."),pager));
  }
  function drawProfile(d) {
    const model=d.profile || {}, chars=d.characters || [];
    if (!chars.length) {
      main.replaceChildren(frame("My raider profile",null,verifyNotice()));
      return;
    }
    const f=form("My raider profile",[charSelect(chars,model.guid), field("Preferred role",options("role",ROLES,model.role || "flex")),
      field("Class",input("playerClass",model.playerClass,{maxlength:40})),field("Specialization",input("spec",model.spec,{maxlength:80})),
      field("Availability with time zone",input("availability",model.availability,{maxlength:240})),
      field("Raider introduction",area("notes",model.notes,{maxlength:400})),
      h("label",null,input("listed","yes",{type:"checkbox",checked:model.listed})," List my character, preferred role, specialization, availability and introduction in Find raiders.")],
      data=>write(API,{...data,action:"profile",listed:data.listed==="yes",revision:model.revision || 0},"Raider profile saved."),"Save profile");
    main.replaceChildren(frame("My raider profile",null,f));
  }
  function drawCreate(d) {
    if (!d.characters.length) {main.replaceChildren(frame("Create a raid team",null,verifyNotice())); return;}
    const id=crypto.randomUUID();
    const f=form("Create a raid team",[charSelect(d.characters),field("Your role",options("role",ROLES,"flex")),...charterFields({})],
      data=>write(API,{...charterPayload(data),id,action:"create"},"Team created.",res=>{location.hash=goTeam(res.id||id);}),"Publish charter");
    main.replaceChildren(frame("Create a raid team",link("Find a team",HOME),f));
  }

  function ownSeat(detail) {
    const team=detail.team, mine=detail.mine, path=API+"/"+encodeURIComponent(team.id);
    const chars=detail.characters || [];
    const apply=() => form("Apply to "+team.name,[charSelect(chars,mine?.guid),
      field("Raid role",options("role",ROLES,mine?.role || "flex")),
      field("Message to this team’s leadership",area("note","",{maxlength:500}),"Only you and this team’s managers can read your application message.")],
      data=>write(path,{...data,action:"apply",revision:mine?.revision || 0},"Application submitted."),"Submit application");
    if (!mine || ["declined","withdrawn"].includes(mine.state)) {
      return section("My application",mine && row(p("Last application: "+SEATS[mine.state]),button("Forget closed application",()=>write(path,{action:"forget",seatId:mine.id,revision:mine.revision},"Closed application removed."))),
        ["full","inactive"].includes(team.status) ? p("This team is closed to applications.") : chars.length ? apply() : verifyNotice());
    }
    const seat={seatId:mine.id,revision:mine.revision};
    const controls=row();
    if (["offered_primary","offered_reserve"].includes(mine.state)) {
      const response={...seat,action:"respond",state:mine.state==="offered_primary"?"primary":"reserve"};
      controls.append(button("Accept "+(response.state==="primary"?"primary":"reserve")+" place",()=>write(path,response,
        "Roster place confirmed.",null,()=>{
          const confirm=button("I checked both schedules · accept this place",()=>write(path,{...response,confirmOverlap:true},"Roster place confirmed."));
          notice.append(" ",confirm);
        }),true));
    }
    const active=["primary","reserve"].includes(mine.state);
    if (!active || !detail.isLeader) {
      controls.append(details(active?"Leave this raid team":"Withdraw application",button(active?"Confirm leave team":"Confirm withdrawal",()=>write(path,
        active?{action:"leave",...seat}:{action:"respond",...seat,state:"withdrawn"},active?"You left the raid team.":"Application withdrawn."))));
    }
    return section(active?"My roster place":"My application",facts([["Character",mine.character],["Status",SEATS[mine.state]||mine.state],
      ["Raid role",ROLES[mine.role]],["Application message",mine.note]]),controls);
  }
  function rosterPanel(detail) {
    const team=detail.team, path=API+"/"+encodeURIComponent(team.id);
    const groups={"":"Unassigned",...Object.fromEntries(Array.from({length:8},(_,i)=>[i+1,"Group "+(i+1)]))};
    const members=detail.members.map(m=>{
      const assignment=detail.canManage && m.state==="primary" ? form("Assign "+m.character+" to a group",
        [field("Subgroup for "+m.character,options("groupNumber",groups,m.groupNumber || ""))],
        data=>write(path,{action:"group",seatId:m.id,revision:m.revision,groupNumber:data.groupNumber?Number(data.groupNumber):null},"Subgroup updated."),
        "Save group",false) : null;
      const delegate=detail.isLeader && m.id!==detail.mine?.id ? button(m.isOfficer?"Remove team officer access":"Appoint team officer",
        ()=>write(path,{action:"officer",seatId:m.id,revision:m.revision,enabled:!m.isOfficer},"Team officer access updated.")) : null;
      const removable=detail.canManage && m.id!==detail.mine?.id && m.character!==team.leader && (!m.isOfficer || detail.isLeader);
      const remove=removable ? details("Remove from team",button("Confirm removal of "+m.character,()=>write(path,{action:"remove",seatId:m.id,revision:m.revision},"Team place removed."))) : null;
      const transfer=detail.isLeader && m.id!==detail.mine?.id ? details("Transfer team leadership",button("Confirm transfer to "+m.character,()=>write(path,{action:"transfer",seatId:m.id,revision:m.revision},"Team leadership transferred."))) : null;
      return h("li",null,h("strong",{text:m.character})," · "+(ROLES[m.role] || m.role)+" · "+(SEATS[m.state] || m.state),
        m.groupNumber?" · Group "+m.groupNumber:"",m.isOfficer?" · Team officer":"",
        (assignment||delegate||remove||transfer) && details("Manage "+m.character,h("div",{class:"stack"},assignment,delegate,remove,transfer)));
    });
    return section("Team roster",members.length?h("ul",{class:"raid-member-list"},...members):p("There are no confirmed places yet."));
  }
  function reviewPanel(detail) {
    const path=API+"/"+encodeURIComponent(detail.team.id), choices={offered_primary:"Offer primary place",offered_reserve:"Offer reserve place",waitlisted:"Waitlist",declined:"Decline"};
    const reviews=detail.applications.map(a=>section(a.character,
      facts([["Role",ROLES[a.role]],["Application",SEATS[a.state]||a.state],["Private message",a.note]]),
      form("Review "+a.character,[field("Decision for "+a.character,options("state",choices,a.state))],
        data=>write(path,{action:"decide",seatId:a.id,revision:a.revision,state:data.state},"Application decision saved."),"Save decision",false)));
    return section("Applications",reviews.length?reviews:p("No applications are awaiting review."));
  }
  function drawDetail(d) {
    const t=d.team, path=API+"/"+encodeURIComponent(t.id);
    const charter=frame(t.name,row(link("Find a team",HOME),link("Team calendar",goTeam(t.id)+"/calendar")),
      facts([["Raid leader",t.leader],["Recruitment",STATUS[t.status]],["Schedule",[timingLabel(t),t.schedule,t.timezone].filter(Boolean).join(" · ")],
        ["Roster",t.primaryCount+" / "+t.capacity+" primary · "+t.reserveCount+" reserve"],["Roles and classes needed",t.needs],["Raiding style",t.philosophy],
        ["Loot rules and hard reserves",t.loot],["Expectations",t.expectations]]));
    const edit=d.canManage?details("Edit team charter",form("Edit charter",charterFields(t),data=>write(path,
      {action:"edit",revision:t.revision,...charterPayload(data)},"Charter updated."),"Save charter")):null;
    charter.append(details("Who handles raid disputes?", h("div", {class:"stack"},
      p("For a loot, attendance or roster decision, contact your raid leader or a team officer privately. Identify the raid, the published rule and what happened."),
      p("You can take serious misconduct, substantial guild policy violations or a documented concern about team leadership directly to High Council. Keep names and evidence in the private report."),
      link("Find High Council in the organization chart", "#/organization"))));
    if(edit) charter.append(edit);
    main.replaceChildren(charter,ownSeat(d),...(d.canViewRoster?[rosterPanel(d)]:[]),...(d.canManage?[reviewPanel(d)]:[]));
  }
  async function drawMine(seq) {
    const d=await read(API+"/my-next-raid"+(chosenGuid?"?guid="+encodeURIComponent(chosenGuid):""));
    if(!live() || seq!==generation) return;
    const select=options("guid",Object.fromEntries(d.characters.map(c=>[c.guid,c.name])),d.selectedGuid);
    select.addEventListener("change",()=>{chosenGuid=select.value;refresh();});
    const cards=d.events.map(e=>section(e.title,facts([["Team",e.teamName],["When",dateTime(e.startsAt)],
      ["Group",e.groupLabel || "Whole team"],["My answer",ANSWERS[e.answer] || "Awaiting response"],["Preparation",e.preparation]])));
    const manual=area("import",d.addonImport,{readonly:true,rows:4});
    const copy=button("Copy addon schedule",async()=>{
      try { await navigator.clipboard.writeText(d.addonImport); if(live())report("Schedule copied. Open /olv raid in WoW and paste it into the import box."); }
      catch { manual.focus(); manual.select(); if(live())report("Select and copy the schedule text, then paste it into /olv raid."); }
    },true);
    const exportPanel = d.addonImport ? section("In-game reminders",p("Copy this character’s schedule into the addon. Import it again after a cancellation or schedule change."),
      row(copy),field("Schedule to paste in /olv raid",manual)) : null;
    main.replaceChildren(frame("My next raid",null,d.characters.length?field("Character",select):verifyNotice(),
      cards.length?h("div",{class:"stack"},...cards):p("No raids are scheduled for this character in the next seven days."),exportPanel));
  }
  const ANSWERS={confirmed:"Confirmed",tentative:"Tentative",unavailable:"Unavailable",late:"Running late",substitute:"Available as substitute"};
  function wallTime(epoch,timezone) {
    const parts=Object.fromEntries(new Intl.DateTimeFormat("en-GB",{year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit",hourCycle:"h23",timeZone:timezone}).formatToParts(new Date(epoch*1000)).map(p=>[p.type,p.value]));
    return parts.year+"-"+parts.month+"-"+parts.day+"T"+parts.hour+":"+parts.minute;
  }
  function eventFields(e,t) {
    return [field("Raid name",input("title",e?.title,{maxlength:200,required:true})),h("div",{class:"grid two"},
      field("Starts on", input("localStart",e?wallTime(e.startsAt,e.timezone):"",{type:"datetime-local",required:true})),
      field("Time zone for this start",input("timezone",e?.timezone||t.timezone,{maxlength:64,required:true}))),
      h("div",{class:"grid two"},field("Duration in minutes",input("durationMin",e?Math.round((e.endsAt-e.startsAt)/60):180,{type:"number",min:15,max:720,required:true})),
        field("Assemble how many minutes before?",input("assemblyMinutes",e?.assemblyMinutes ?? 15,{type:"number",min:0,max:120,required:true}))),
      field("Preparation",area("preparation",e?.preparation,{maxlength:500}))];
  }
  function eventBody(data) {
    return {...data,durationMin:Number(data.durationMin),assemblyMinutes:Number(data.assemblyMinutes)};
  }
  function calendarEvent(e,t,path) {
    const href=goTeam(t.id)+"/calendar/"+encodeURIComponent(e.eventId);
    return section(e.title,facts([["Status",e.status==="cancelled"?"Cancelled":"Scheduled"],["When",dateTime(e.startsAt)],["Ends",dateTime(e.endsAt)],
      ["Assembly",dateTime(e.startsAt-e.assemblyMinutes*60)],["Roster",e.groupLabel || "Whole team"],["Your answer",ANSWERS[e.answer]],
      ["Preparation",e.preparation],["Published loot rules",e.loot],["Published expectations",e.expectations]]),
      e.canRespond && e.status!=="cancelled" ? form("RSVP for "+e.title,
        [field("Your response",options("answer",ANSWERS,e.answer))],
        data=>write(path,{action:"rsvp",eventId:e.eventId,revision:e.revision,rsvpRevision:e.rsvpRevision||0,answer:data.answer},"Your response is saved."),"Save response", false):null,
      !parts[2]?link(e.canManage?"Review attendance and responses":"View raid details",href):null,
      e.canManage && e.status!=="cancelled" && e.startsAt*1000>Date.now()?details("Edit this occurrence",form("Edit "+e.title,eventFields(e,t),
        data=>write(path,{...eventBody(data),action:"edit",eventId:e.eventId,revision:e.revision},"Occurrence updated."),"Save changes")):null,
      e.canManage && e.status!=="cancelled" && e.startsAt*1000>Date.now()?details("Cancel this occurrence",button("Confirm cancellation",()=>write(path,
        {action:"cancel",eventId:e.eventId,revision:e.revision},"Occurrence cancelled."))):null);
  }
  function drawCalendar(d,calendar) {
    const t=d.team, path=API+"/"+encodeURIComponent(t.id)+"/calendar", eventId=parts[2];
    const byId=eventId?calendar.events.filter(e=>e.eventId===eventId):calendar.events;
    const opId=requestId();
    const create=d.canManage && !eventId ? details("Schedule a raid",form("Schedule a team raid",[...eventFields(null,t),
      h("div",{class:"grid two"},field("Event size",options("capacity",{10:"10 players",20:"20 players",40:"40 players"},40)),field("Invite roster",
        options("audience",{all:"Whole team",selected:"Selected groups"},"all"))),
      h("fieldset", {class:"stack"},h("legend",{text:"Groups for a selected-group raid"}),
        h("div",{class:"btn-row"},...Array.from({length:8},(_,i)=>field("Group "+(i+1),input("groups",i+1,{type:"checkbox"}))))),
      field("Weekly occurrences",input("occurrences",1,{type:"number",min:1,max:8,required:true}),"Choose 1 for a single raid. Each occurrence can be changed separately.")],
      (data,f)=>{
        const groups=new FormData(f).getAll("groups").map(Number);
        if(data.audience==="selected" && !groups.length) return report("Choose at least one group to invite.",true);
        if(data.audience==="all" && groups.length) return report("Choose Selected groups to invite only the checked groups.",true);
        write(path,{...eventBody(data),action:"schedule",opId,teamRevision:t.revision,capacity:Number(data.capacity),groups,occurrences:Number(data.occurrences)},"Raid schedule saved.");
      },"Schedule raid")):null;
    const attendance=eventId && byId[0]?.canManage && calendar.roster ? section("Responses and attendance",
      calendar.roster.length ? calendar.roster.map(a=>{
        const ev=byId[0];
        return section(a.name,facts([["Raid role",ROLES[a.role]],["Response",ANSWERS[a.answer]||"Awaiting response"],["Attendance",a.attendance]]),
          ev.status==="scheduled" && ev.startsAt*1000<=Date.now() && form("Record attendance for "+a.name,[field("Attendance",options("state",{present:"Present",absent:"Absent",excused:"Excused",unknown:"Unknown"},a.attendance||"unknown"))],
          data=>write(path,{action:"attendance",eventId,revision:ev.revision,seatId:a.seatId,state:data.state,attendanceRevision:a.attendanceRevision || 0},"Attendance saved."),"Save attendance",false));
      }):p("Nobody is assigned to this occurrence.")):null;
    main.replaceChildren(frame(t.name+" · Calendar",row(link("Team charter",goTeam(t.id)),eventId&&link("All occurrences",goTeam(t.id)+"/calendar")),
      create,byId.length?h("div",{class:"stack mt"},...byId.map(e=>calendarEvent(e,t,path))):p(eventId?"This occurrence is unavailable.":"No raids have been scheduled."),attendance,
      row(calendarAfter && button("First page",()=>{calendarAfter="";refresh();}),calendar.next && button("Next page",()=>{calendarAfter=calendar.next;refresh();}))));
  }
  refresh = async function() {
    const seq=++generation;
    if(!live())return;
    main.setAttribute("aria-busy","true");
    try {
      if(tab==="schedule"){await drawMine(seq);return;}
      if(teamRoute) {
        const id=encodeURIComponent(tab),calendar=parts[1]==="calendar";
        const suffix=parts[2]?"?eventId="+encodeURIComponent(parts[2]):calendarAfter?"?after="+encodeURIComponent(calendarAfter):"";
        const [detail,eventData]=await Promise.all([read(API+"/"+id),calendar?read(API+"/"+id+"/calendar"+suffix):null]);
        if(live() && seq===generation){if(calendar)drawCalendar(detail,eventData);else drawDetail(detail);}
      } else {
        const d=await read(directoryPath());
        if(live() && seq===generation) {
          if(tab==="new")drawCreate(d);else if(tab==="profile")drawProfile(d);else drawDirectory(d);
        }
      }
    } catch(e) {
      if(live() && seq===generation) main.replaceChildren(frame("Raid teams",null,p(errors(e,"Raid teams could not be loaded.")),row(button("Try again",refresh),link("Find a team",HOME))));
    } finally {if(live() && seq===generation)main.removeAttribute("aria-busy");}
  };
  await refresh();
}
