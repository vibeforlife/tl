import type { Entry, Journey } from '../../types/domain';
import type { CountryVisitSummary } from './countryVisitCalculations';
const EARTH_RADIUS_MILES = 3958.7613;
// Toronto Pearson reference point: Canadian Transportation Agency airport data.
const YYZ = { latitude: 43.67720032, longitude: -79.63059998 };
export interface TravelMileageSummary { totalMiles: number; journeysWithDistance: number; journeysWithoutDistance: number; }
export interface LongestJourneySummary { days: number; journeys: Journey[]; }
const validDay = (v: string): number | null => {
  const m=/^(\d{4})-(\d{2})-(\d{2})$/.exec(v); if(!m) return null;
  const y=+m[1], mo=+m[2], d=+m[3], t=Date.UTC(y,mo-1,d), x=new Date(t);
  if(x.getUTCFullYear()!==y || x.getUTCMonth()!==mo-1 || x.getUTCDate()!==d) return null;
  return Math.floor(t/86400000);
};
const createdMillis=(e:Entry):number|null=>{
  const v=e.createdAt as unknown as {toMillis?:()=>number;seconds?:number;nanoseconds?:number}|null;
  if(!v) return null;
  try { if(typeof v.toMillis==='function'){const n=v.toMillis();return Number.isFinite(n)?n:null;}
    if(typeof v.seconds==='number'){const n=v.seconds*1000+(v.nanoseconds??0)/1e6;return Number.isFinite(n)?n:null;}
  } catch { return null; } return null;
};
const orderEntries=(entries:Entry[]):Entry[]|null=>{
  const unique=new Map<string,Entry>(); for(const e of entries) unique.set(`${e.journeyId}:${e.id}`,e);
  const all=[...unique.values()]; if(all.some(e=>validDay(e.date)===null)) return null;
  const groups=new Map<string,Entry[]>(); for(const e of all){const a=groups.get(e.date)??[];a.push(e);groups.set(e.date,a);}
  const out:Entry[]=[];
  for(const date of [...groups.keys()].sort()){
    const g=groups.get(date)!; if(g.length===1){out.push(g[0]);continue;}
    const times=g.map(e=>e.time??'');
    if(times.every(t=>/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(t)) && new Set(times).size===times.length){out.push(...g.sort((a,b)=>(a.time??'').localeCompare(b.time??'')));continue;}
    const stamps=g.map(createdMillis);
    if(stamps.some(v=>v===null)||new Set(stamps).size!==stamps.length) return null;
    out.push(...g.sort((a,b)=>createdMillis(a)!-createdMillis(b)!));
  }
  return out;
};
const coords=(e:Entry|undefined)=>{
  const l=e?.location; if(!l) return null; const {latitude,longitude}=l;
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude < -90||latitude>90||longitude < -180||longitude>180) return null;
  return {latitude,longitude};
};
const haversine=(a:{latitude:number;longitude:number},b:{latitude:number;longitude:number}):number=>{
  const r=(d:number)=>d*Math.PI/180, p1=r(a.latitude),p2=r(b.latitude),dp=r(b.latitude-a.latitude),dl=r(b.longitude-a.longitude);
  const h=Math.sin(dp/2)**2+Math.cos(p1)*Math.cos(p2)*Math.sin(dl/2)**2;
  return 2*EARTH_RADIUS_MILES*Math.asin(Math.min(1,Math.sqrt(h)));
};
const journeyMiles=(journey:Journey,entries:Entry[]):number|null=>{
  const ordered=orderEntries(entries); if(!ordered||!ordered.length) return null;
  const explicit=journey.distanceEndpointMode==='explicit'; let miles=0, legs=0;
  const add=(a:ReturnType<typeof coords>,b:ReturnType<typeof coords>)=>{if(!a||!b)return;const n=haversine(a,b);miles+=n;legs++;};
  if(!explicit) add(YYZ,coords(ordered[0]));
  for(let i=1;i<ordered.length;i++) add(coords(ordered[i-1]),coords(ordered[i]));
  if(!explicit) add(coords(ordered[ordered.length-1]),YYZ);
  return legs?miles:null;
};
/** Straight-line great-circle estimate, not actual flight, road, or rail distance. */
export const calculateTravelMileage=(journeys:Journey[],entries:Entry[]):TravelMileageSummary=>{
  let totalMiles=0,journeysWithDistance=0,journeysWithoutDistance=0;
  for(const j of journeys){const m=journeyMiles(j,entries.filter(e=>e.journeyId===j.id));if(m===null)journeysWithoutDistance++;else{totalMiles+=m;journeysWithDistance++;}}
  return {totalMiles,journeysWithDistance,journeysWithoutDistance};
};
export const calculateLongestJourney=(journeys:Journey[]):LongestJourneySummary|null=>{
  let days=0,longest:Journey[]=[];
  for(const j of journeys){const a=validDay(j.startDate),b=validDay(j.endDate);if(a===null||b===null||b<a)continue;const n=b-a+1;if(n>days){days=n;longest=[j];}else if(n===days)longest.push(j);}
  return longest.length?{days,journeys:longest}:null;
};
export const calculateMostVisitedCountries=(countries:CountryVisitSummary[])=>{
  if(!countries.length)return [];const max=Math.max(...countries.map(c=>c.journeyCount));return countries.filter(c=>c.journeyCount===max);
};
export const calculateContinentsExplored=(countries:CountryVisitSummary[],map:Record<string,string>):string[]=>
  [...new Set(countries.map(c=>map[c.code.toUpperCase()]).filter((v):v is string=>Boolean(v)))].sort((a,b)=>a.localeCompare(b));
