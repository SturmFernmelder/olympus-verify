/** One source for the Verify-owned guild registrations and runtime allowlist.
 * Forever's private verification commands are deliberately outside this set. */
const text=(name:string,description:string,required=false,more:Record<string,unknown>={})=>({type:3,name,description,required,...more});
const integer=(name:string,description:string,required=false,min_value=0,max_value=100)=>({type:4,name,description,required,min_value,max_value});
const eventId=()=>text('id','Calendar event ID from /raid list',true,{min_length:22,max_length:22});
const sub=(name:string,description:string,options:unknown[]=[])=>({type:1,name,description,options});
const create=()=>[text('title','Event title; no private information',true,{max_length:80}),text('starts','ISO date/time with Z or UTC offset, e.g. 2026-11-05T01:00:00Z',true,{max_length:40}),integer('minutes','Duration in minutes',true,15,720),integer('capacity','Optional maximum confirmed signups',false,1,100),text('details','Preparation notes; visible to verified guild members',false,{max_length:500})];
const calendar=()=>[
 sub('schedule','Create a guild calendar event (Raid Leader / Officer / Council / Admin)',create()),
 sub('create','Create a guild calendar event (same as schedule)',create()),
 sub('list','Upcoming guild events, with private one-click RSVP buttons',[integer('page','Page of upcoming events',false,1,100)]),
 sub('roster','Current signup preferences and recorded attendance',[eventId(),integer('page','Roster page',false,1,100)]),
 sub('rsvp','Set your own signup preference',[eventId(),text('choice','Your preference, not an organizer roster decision',true,{choices:['tank','healer','melee','ranged','tentative','bench','absent'].map(value=>({name:value,value}))})]),
 sub('remind','Arm one reminder; now attempts it only within one hour of the start',[eventId(),text('mode','One durable reminder per event; unknown sends never retry',true,{choices:['arm','now','cancel'].map(value=>({name:value,value}))})]),
 sub('attendance','After start, record one signup or lock the completed attendance record',[eventId(),text('action','Record a member or finalize the attendance record',true,{choices:['record','lock'].map(value=>({name:value,value}))}),{type:6,name:'member',description:'Existing signup or listed member; required for record',required:false},text('state','Observed result; never inferred from a missing RSVP',false,{choices:['present','absent','excused','unknown'].map(value=>({name:value,value}))})])
];
const command=(name:string,description:string,options:unknown[]=[])=>({type:1,name,description,options});
export const GUILD_COMMANDS_219=Object.freeze([
 command('raid','Olympus raid calendar, signups, reminders and attendance',calendar()),
 command('event','Olympus events (same calendar and controls as /raid)',calendar()),
 command('guide','Forever guides and pinned talent tools',[
  sub('class','Class and specialization guides with talent preset links',[text('class','Class name',true,{choices:['warrior','paladin','hunter','rogue','priest','shaman','mage','warlock','druid'].map(value=>({name:value,value}))}),text('spec','Optional specialization name',false,{max_length:40})]),
  sub('talent','Validate and preview a current Olympus talent code or shared URL',[text('build','Olympus talent code or exact site share URL',true,{max_length:512})]),
  sub('consumes','Raid consumables and Forever evidence grades'),sub('buffs','World-buff and raid-buff rules; Classic references are labelled'),
  sub('attunement','Onyxia / MC / BWL preparation and current availability',[text('raid','Raid name',true,{choices:[{name:'Onyxia',value:'onyxia'},{name:'Molten Core',value:'mc'},{name:'Blackwing Lair',value:'bwl'}]})])
 ]),
 command('workshop','Search opted-in, roster-confirmed guild crafters',[text('search','Recipe, profession or crafter name',false,{max_length:60}),integer('page','Result page',false,1,100)]),
 command('treasury','Treasury policy, Fernmelder and the current Royal Writs switch'),
 command('stockades','Free ordinary appeals and eligible conditional in-game-gold clemency'),
 command('council','The ten native ranks and current High Council portfolio guide'),
 command('branches','OLYMPUS PRIME and branch reports; current capacity may be unknown'),
 command('launch','Official launch information and current availability notes')
]);
export const GUILD_COMMAND_NAMES_219=new Set(GUILD_COMMANDS_219.map(row=>row.name));
