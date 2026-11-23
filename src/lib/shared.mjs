export const states = {
  ACT: ['Australian Capital Territory', 'Australia/Sydney'], NSW: ['New South Wales', 'Australia/Sydney'],
  NT: ['Northern Territory', 'Australia/Darwin'], QLD: ['Queensland', 'Australia/Brisbane'],
  SA: ['South Australia', 'Australia/Adelaide'], TAS: ['Tasmania', 'Australia/Hobart'],
  VIC: ['Victoria', 'Australia/Melbourne'], WA: ['Western Australia', 'Australia/Perth'],
};
export const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
export const normal = value => String(value ?? '').normalize('NFKD').replace(/\p{M}/gu,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export const slugify = value => normal(value).replaceAll(' ', '-');

const formatter = new Map();
export function openStatus(shop, date = new Date()) {
  if (shop.temporary) return 'Temporarily closed';
  if (!shop.timezone || !shop.hours) return 'Hours unavailable';
  if (!formatter.has(shop.timezone)) formatter.set(shop.timezone, new Intl.DateTimeFormat('en-AU', {
    timeZone: shop.timezone, weekday: 'long', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }));
  const parts = Object.fromEntries(formatter.get(shop.timezone).formatToParts(date).map(({type,value}) => [type,value]));
  const day = days.indexOf(parts.weekday);
  const current = shop.hours[day];
  const previous = shop.hours[(day + 6) % 7];
  const minute = Number(parts.hour) * 60 + Number(parts.minute);
  if (current?.some(([start,end]) => start <= minute && minute < end) ||
      previous?.some(([,end]) => minute < end - 1440)) return 'Open according to listed hours';
  if (!current || (!previous && !shop.hours.every(Boolean))) return 'Hours unavailable';
  return 'Closed according to listed hours';
}

export function distance(a,b) {
  if (!a || !b) return Infinity;
  const radians = Math.PI / 180;
  const dlat = (b[0]-a[0])*radians, dlng = (b[1]-a[1])*radians;
  const h = Math.sin(dlat/2)**2 + Math.cos(a[0]*radians)*Math.cos(b[0]*radians)*Math.sin(dlng/2)**2;
  return 12742 * Math.asin(Math.sqrt(Math.min(1,h)));
}

export function directions(shop) {
  if (shop.demo) return '';
  const params = new URLSearchParams({api:'1',destination:shop.coords?.join(',') || [shop.name,shop.address,shop.state,shop.postcode,'Australia'].filter(Boolean).join(', ')});
  if (shop.placeId) params.set('destination_place_id',shop.placeId);
  return 'https://www.google.com/maps/dir/?' + params;
}

export function findShops(shops, {q='', state='', chain='', open=false, sort='', origin=null}, now = new Date()) {
  const terms = normal(q).split(' ').filter(Boolean);
  return shops.flatMap(shop => {
    if ((state && shop.state !== state) || (chain && shop.chain !== chain)) return [];
    const status = openStatus(shop, now);
    if (open && status !== 'Open according to listed hours') return [];
    const name = normal(shop.name);
    const locality = normal(shop.locality);
    const searchable = normal([shop.name, shop.locality, shop.address, shop.postcode, shop.metro, shop.state, states[shop.state]?.[0]].join(' '));
    if (!terms.every(term => (/^\d{4}$/.test(term) ? shop.postcode === term : searchable.includes(term)))) return [];
    const relevance = terms.reduce((points,t) => points + (shop.postcode === t ? 8 : locality === t ? 6 : name.startsWith(t) ? 4 : name.includes(t) ? 2 : 1), 0);
    return [{shop,status,relevance,km:distance(origin,shop.coords)}];
  }).sort((a,b) => {
    if (sort === 'distance' && a.km !== b.km) return a.km - b.km;
    if (sort === 'rating' && a.shop.rating !== b.shop.rating) return (b.shop.rating ?? -1) - (a.shop.rating ?? -1);
    return b.relevance - a.relevance || a.shop.name.localeCompare(b.shop.name, 'en-AU');
  });
}
