import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import demo from '../../data/demo.json';
import config from '../../site.config.mjs';
import { normal, slugify, distance } from './shared.mjs';

export interface Shop {
  id: string;
  placeId?: string;
  slug: string;
  name: string;
  locality: string;
  state: string;
  postcode: string;
  address: string;
  coords?: [number, number];
  metro?: string;
  chain?: string;
  temporary?: boolean;
  demo?: boolean;
  timezone?: string;
  hours?: ([number,number][] | null)[] | null;
  hoursText?: string[] | null;
  phone?: string;
  website?: string;
  maps?: string;
  importedAt?: string;
  sourceUpdatedAt?: string;
  rating?: number;
  reviews?: number;
}
const dataPath = process.env.OP_SHOPS_SNAPSHOT || resolve('data/shops.json');
const live: Shop[] = JSON.parse(readFileSync(dataPath,'utf8'));
if (!config.demo && (!live.length || live.some(shop => shop.demo))) {
  throw new Error('Production mode requires a nonempty imported dataset without sample entries.');
}
export const shops: Shop[] = live.length ? live : demo as unknown as Shop[];
export const usingFixtures = !live.length;
export const shopPath = (shop: Shop) => '/shops/' + shop.slug + '/';
export function nearby(shop: Shop) {
  if (!shop.coords) return [];
  return shops.filter(other => other.id !== shop.id && other.coords && !other.temporary)
    .map(other => ({shop:other,km:distance(shop.coords,other.coords)}))
    .filter(other => other.km <= 30).sort((a,b) => a.km-b.km).slice(0,4);
}

interface Area { name: string; state: string; postcode: string; slug: string; shops: Shop[]; kind: 'locality' | 'metro'; }
const areas = new Map<string,Area>();
for (const shop of shops) {
  if (shop.temporary) continue;
  const definitions = [
    { name:shop.locality,postcode:shop.postcode,kind:'locality' as const },
    { name:shop.metro,postcode:'',kind:'metro' as const },
  ];
  for (const {name,postcode,kind} of definitions) {
    if (!name || !slugify(name)) continue;
    const key = [shop.state,normal(name),postcode,kind].join('/');
    const area = areas.get(key) ?? {name,state:shop.state,postcode,slug:slugify(name),shops:[],kind};
    area.shops.push(shop);
    areas.set(key,area);
  }
}
const duplicateLocalities = new Map<string,number>();
for (const area of areas.values()) if (area.kind === 'locality') {
  const key = area.state + '/' + area.slug;
  duplicateLocalities.set(key,(duplicateLocalities.get(key) ?? 0)+1);
}
export const localities = [...areas.values()].filter(area => area.kind === 'locality').map(area => {
  const key = area.state + '/' + area.slug;
  const hasMetro = areas.has([area.state,normal(area.name),'','metro'].join('/'));
  if (hasMetro || (duplicateLocalities.get(key) ?? 0) > 1) area.slug += '-' + (area.postcode || 'area');
  return area;
});
export const metros = [...areas.values()].filter(area => area.kind === 'metro');
export const allAreas = [...metros,...localities];
export const areaPath = (area: Area) => '/op-shops/' + area.state.toLowerCase() + '/' + area.slug + '/';

export function indexFor(state: string) {
  return shops.filter(shop => shop.state === state).map(({slug,name,locality,state,postcode,metro,address,coords,chain,timezone,hours,temporary,rating,reviews,placeId,demo}) =>
    ({slug,name,locality,state,postcode,metro,address,coords,chain,timezone,hours,temporary,rating,reviews,placeId,demo}));
}
