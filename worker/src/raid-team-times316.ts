/** Weekly wall-clock commitments. Minutes are transient computation values; no local machine time zone is used. */
export interface WeeklyWindow316 { day:number; start:string; end:string }
type Span = [number,number];
interface Offset { start:number; end:number; minutes:number }
const DAY=1440, WEEK=7*DAY;
// 1970-01-01 was Thursday. Moving three days maps ISO Monday to minute zero.
const BASE=3*DAY;
export const clock316=(s:string)=>Number(s.slice(0,2))*60+Number(s.slice(3));
export const validClock316=(v:unknown):v is string=>typeof v==='string'&&/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(v);
export function canonicalZone316(v:string):string {
  if(!/^[a-z][a-z0-9+_.\-/]{0,63}$/i.test(v)) throw Error('invalid_zone');
  return new Intl.DateTimeFormat('en-US',{timeZone:v}).resolvedOptions().timeZone;
}
export function weeklyWindows316(v:unknown):WeeklyWindow316[] {
  if(v===undefined) return [];
  if(!Array.isArray(v)||v.length>7) throw Error('invalid_weekly_windows');
  const entries=v.map(w=>{
    if(!w||typeof w!=='object'||!Number.isInteger(w.day)||w.day<1||w.day>7||!validClock316(w.start)||!validClock316(w.end)||w.start===w.end) throw Error('invalid_weekly_windows');
    return {day:w.day,start:w.start,end:w.end};
  });
  entries.sort((a,b)=>a.day-b.day||a.start.localeCompare(b.start)||a.end.localeCompare(b.end));
  if(new Set(entries.map(w=>w.day+' '+w.start)).size!==entries.length) throw Error('invalid_weekly_windows');
  return entries;
}
// Work on segments with constant UTC offset. In the present/forthcoming IANA calendar no zone has two
// transitions on the same UTC day. Binary search finds the precise minute for half-hour DST transitions too.
function offsets(zone:string,first:number,last:number):Offset[] {
  const format=new Intl.DateTimeFormat('en-US',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'});
  function offset(at:number) {
    const p=Object.fromEntries(format.formatToParts(at*60000).map(x=>[x.type,x.value]));
    return Date.UTC(+p.year!,+p.month!-1,+p.day!,+p.hour!,+p.minute!)/60000-at;
  }
  const result:Offset[]=[];
  let cursor=first, current=offset(first);
  for(let probe=first;probe<last-1;) {
    const next=Math.min(probe+DAY,last-1),atNext=offset(next);
    if(atNext!==current) {
      let lo=probe+1,hi=next;
      while(lo<hi){const mid=Math.floor((lo+hi)/2);if(offset(mid)===current)lo=mid+1;else hi=mid;}
      result.push({start:cursor,end:lo,minutes:current});cursor=lo;current=atNext;
    }
    probe=next;
  }
  result.push({start:cursor,end:last,minutes:current});
  return result;
}
function projectDays(start:number,end:number,offset:number,day:number,startClock:number,endClock:number):Span[] {
  const result:Span[]=[];
  const localStart=start+offset+BASE, localEnd=end+offset+BASE;
  const firstWeek=Math.floor((localStart-WEEK)/WEEK);
  for(let week=firstWeek;week*WEEK<localEnd;week++){
    const d=week*WEEK+(day-1)*DAY;
    const a=Math.max(start,d+startClock-offset-BASE),b=Math.min(end,d+endClock-offset-BASE);
    if(a<b)result.push([a,b]);
  }
  return result;
}
function merge(spans:Span[]):Span[] {
  spans.sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  const result:Span[]=[];
  for(const [a,b] of spans){
    const prev=result.at(-1);
    if(prev&&prev[1]>=a)prev[1]=Math.max(prev[1],b);else result.push([a,b]);
  }
  return result;
}
export function overlapDetector316(nowSeconds:number) {
  const first=Math.floor(nowSeconds/60),end=first+8*WEEK,cache=new Map<string,Offset[]>();
  function recurring(zone:string,windows:WeeklyWindow316[]) {
    if(!windows.length)return [];
    let segments=cache.get(zone);
    if(!segments){segments=offsets(zone,first,end);cache.set(zone,segments);}
    const spans:Span[]=[];
    for(const w of windows){
      const a=clock316(w.start),b=clock316(w.end);
      for(const seg of segments)spans.push(...projectDays(seg.start,seg.end,seg.minutes,w.day,a,b+(b<a?DAY:0)));
    }
    return merge(spans);
  }
  return (one:{zone:string;windows:WeeklyWindow316[]},others:{zone:string;windows:WeeklyWindow316[]}[]):boolean=>{
    const own=recurring(one.zone,one.windows);
    if(!own.length)return false;
    return others.some(other=>{
      const spans=recurring(other.zone,other.windows);let i=0,j=0;
      while(i<own.length&&j<spans.length){
        const a=own[i]!,b=spans[j]!;
        if(a[0]<b[1]&&b[0]<a[1])return true;
        if(a[1]<=b[1])i++;else j++;
      }
      return false;
    });
  };
}
// Map the viewer's next seven days of matching raid start times to local minutes-of-week in each team zone.
// SQL applies these ranges before LIMIT/OFFSET, keeping filters consistent across directory pages.
export function localStartRanges316(nowSeconds:number, viewerZone:string,day:number|null,earliest:number,latest:number,zones:string[]) {
  const first=Math.floor(nowSeconds/60),end=first+WEEK,desired:Span[]=[];
  for(const seg of offsets(viewerZone,first,end)) {
    for(let d=1;d<=7;d++)if(day===null||d===day) desired.push(...projectDays(seg.start,seg.end,seg.minutes,d,earliest,latest+1+(latest<earliest?DAY:0)));
  }
  const selected=merge(desired),ranges:Record<string,Span[]>={};
  for(const zone of zones){
    const spans:Span[]=[];
    for(const seg of offsets(zone,first,end))for(const [start,stop] of selected){
      const lo=Math.max(start,seg.start),hi=Math.min(stop,seg.end);
      if(lo>=hi)continue;
      const a=lo+seg.minutes+BASE,b=hi+seg.minutes+BASE;
      for(let w=Math.floor(a/WEEK);w*WEEK<b;w++)spans.push([Math.max(0,a-w*WEEK),Math.min(WEEK,b-w*WEEK)]);
    }
    ranges[zone]=merge(spans);
  }
  return ranges;
}
