import { createHash } from 'node:crypto';
import { readFile, rename, writeFile, copyFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { days, normal, slugify, states } from '../src/lib/shared.mjs';

const rules = JSON.parse(await readFile(new URL('../data/rules.json', import.meta.url),'utf8'));
const database = new URL('../data/shops.json', import.meta.url);
const clean = value => String(typeof value === 'string' || typeof value === 'number' ? value : '').trim();
const hash = value => createHash('sha256').update(value).digest('hex');
const truthy = value => value === true || /^(true|1|yes)$/i.test(clean(value));

export function parseCsv(input) {
  const rows = [];
  let row = [], cell = '', quoted = false, finishedQuote = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i+1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; finishedQuote = true; }
      else cell += char;
    } else if (char === ',' || char === '\r' || char === '\n') {
      row.push(cell); cell = ''; finishedQuote = false;
      if (char !== ',') {
        if (row.some(Boolean)) rows.push(row);
        row = [];
        if (char === '\r' && input[i+1] === '\n') i++;
      }
    } else if (char === '"' && !cell && !finishedQuote) quoted = true;
    else if (finishedQuote || char === '"') throw new Error('Malformed CSV quoting.');
    else cell += char;
  }
  if (quoted) throw new Error('Unclosed CSV quote.');
  row.push(cell);
  if (row.some(Boolean)) rows.push(row);
  const header = rows.shift() ?? [];
  if (!header.length || new Set(header).size !== header.length) throw new Error('Missing or duplicate CSV headers.');
  return rows.map((values,index) => {
    if (values.length !== header.length) throw new Error('Unexpected column count at CSV record ' + (index + 2));
    return Object.fromEntries(header.map((key,i) => [key.trim(),values[i]]));
  });
}

function decoded(value) {
  if (typeof value !== 'string' || !/^[\[{]/.test(value.trim())) return value;
  try { return JSON.parse(value); } catch { return value; }
}

function minutes(raw, fallback) {
  const m = raw.trim().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)?$/i);
  if (!m) return null;
  let h = Number(m[1]); const min = Number(m[2] ?? 0);
  const suffix = m[3]?.toLowerCase() ?? fallback;
  if (min >= 60 || h > 24 || (h === 24 && (min || suffix))) return null;
  if (suffix) {
    if (h < 1 || h > 12) return null;
    h = h % 12 + (suffix === 'pm' ? 12 : 0);
  }
  return h * 60 + min;
}

export function parseHours(raw) {
  if (!Array.isArray(raw)) return {hours:null,hoursText:null};
  const hours = Array(7).fill(null), hoursText = Array(7).fill('');
  for (const item of raw) {
    const day = days.findIndex(d => d.toLowerCase() === clean(item?.day).toLowerCase());
    if (day < 0) continue;
    const label = clean(item?.hours);
    hoursText[day] = label;
    const value = label.replace(/[\u2009\u202f\u00a0]/g,' ').toLowerCase();
    if (value === 'closed') { hours[day] = []; continue; }
    if (/^(open )?24 hours$/.test(value)) { hours[day] = [[0,1440]]; continue; }
    const ranges = value.split(/[,;]+/).map(range => {
      const endpoints = range.split(/\s*(?:-|-|-|\bto\b)\s*/u);
      if (endpoints.length !== 2) return null;
      const [from,to] = endpoints;
      const end = minutes(to);
      let start = minutes(from, to.match(/([ap]m)$/i)?.[1]);
      if (start === null || end === null || start >= 1440 || start === end) return null;
      // A single suffix commonly describes same-meridiem ranges. Infer noon crossings only when needed.
      if (!/[ap]m$/i.test(from) && /[ap]m$/i.test(to) && start > end) start = (start + 720) % 1440;
      return [start,end < start ? end + 1440 : end];
    });
    if (ranges.every(Boolean)) hours[day] = ranges;
  }
  return {hours,hoursText};
}

function url(value) {
  try {
    const link = new URL(clean(value));
    return /^https?:$/.test(link.protocol) && !link.username && !link.password ? link.href : undefined;
  } catch { return undefined; }
}

function number(value) {
  return clean(value) === '' ? NaN : Number(value);
}
function indexed(row,key, fields) {
  const items = new Map();
  const pattern = new RegExp('^' + key + '[./](\\d+)(?:[./](\\w+))?$');
  for (const [column,value] of Object.entries(row)) {
    const match = column.match(pattern);
    if (!match) continue;
    const [,index,field] = match;
    if (!fields) items.set(+index,value);
    else if (fields.includes(field)) items.set(+index,{...items.get(+index),[field]:value});
  }
  return [...items.entries()].sort(([a],[b]) => a-b).map(([,value]) => value);
}
function identity(row) {
  const placeId = clean(row.placeId);
  const name = clean(row.title ?? row.name);
  const address = clean(row.address) || [row.street,row.city,row.state,row.postalCode].map(clean).filter(Boolean).join(', ');
  const fallback = name && address ? hash(normal(name) + '|' + normal(address)).slice(0,24) : '';
  return {placeId,name,address,fallback,id:placeId || fallback};
}
function normalize(row, original, importedAt) {
  const country = clean(row.countryCode ?? row.country).toUpperCase();
  if (country && !['AU','AUS','AUSTRALIA'].includes(country)) return {reason:'foreign'};
  const region = normal(row.state);
  const state = Object.keys(states).find(code => [normal(code),normal(states[code][0])].includes(region));
  const addressCountry = /(?:^|,\s*)Australia\.?$/i.test(original.address);
  if (!country && !(addressCountry && state)) return {reason:'review-country'};
  if (truthy(row.permanentlyClosed)) return {closed:true};
  if (!original.name || !original.address || !state) return {reason:'review-fields'};
  const categories = decoded(row.categories) ?? indexed(row,'categories');
  const categoryList = [row.categoryName,...(Array.isArray(categories) ? categories : clean(categories).split(/[;|,]/))].map(normal);
  const name = normal(original.name);
  const chain = rules.chains.find(value => (' ' + name + ' ').includes(' ' + normal(value) + ' '));
  if (rules.exclude.some(value => value === original.placeId || normal(value) === name)) return {reason:'excluded'};
  const explicitShop = rules.shopCategories.some(value => categoryList.includes(normal(value)));
  const explicitDonation = rules.donationCategories.some(value => categoryList.includes(normal(value))) ||
    /\b(donation (bin|centre|center|drop off)|collection bin)\b/.test(name);
  if (explicitDonation && !explicitShop) return {reason:'donation'};
  if (!explicitShop && !/\b(op shop|thrift shop|charity shop)\b/.test(name)) return {reason:'review-category'};

  const locality = clean(row.city ?? row.suburb);
  const postcode = /^\d{4}$/.test(clean(row.postalCode)) ? clean(row.postalCode) : '';
  const regionKey = [state,slugify(locality),postcode].join('/');
  const location = decoded(row.location);
  const lat = number(location?.lat ?? row['location.lat'] ?? row['location/lat']);
  const lng = number(location?.lng ?? row['location.lng'] ?? row['location/lng']);
  const coords = lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180 ? [lat,lng] : undefined;
  const rawHours = decoded(row.openingHours) ?? indexed(row, 'openingHours',['day','hours']);
  const phone = clean(row.phone);
  const rating = number(row.totalScore), reviews = number(row.reviewsCount);
  const sourceTime = Date.parse(clean(row.sourceUpdatedAt ?? row.scrapedAt));
  const special = (state === 'NSW' && (/broken hill|silverton/i.test(original.address) || postcode === '2880')) ? 'Australia/Broken_Hill'
    : (state === 'WA' && /\beucla\b/i.test(original.address)) ? 'Australia/Eucla'
    : (state === 'NSW' && /lord howe/i.test(original.address)) ? 'Australia/Lord_Howe' : undefined;
  const timezone = rules.timezones[regionKey] ?? special ?? states[state][1];
  new Intl.DateTimeFormat('en-AU',{timeZone:timezone});
  return {shop:{
    id:original.id, fallback:original.fallback, placeId:original.placeId || undefined, name:original.name, address:original.address,
    locality, state, postcode, metro:rules.metro[regionKey], chain, coords, timezone,
    phone:/^\+?[\d ()-]+$/.test(phone) && /^\d{8,15}$/.test(phone.replace(/\D/g,'')) ? phone : undefined,
    website:url(row.website), maps:url(row.url),
    ...parseHours(rawHours), rating:rating >= 1 && rating <= 5 && Number.isInteger(reviews) && reviews > 0 ? rating : undefined,
    reviews:Number.isInteger(reviews) && reviews > 0 ? reviews : undefined,
    temporary:truthy(row.temporarilyClosed), importedAt,
    sourceUpdatedAt:Number.isFinite(sourceTime) ? new Date(sourceTime).toISOString() : undefined,
  }};
}

export function importRows(rows, existing, {importedAt = new Date().toISOString(), replaceState} = {}) {
  if (!Array.isArray(rows) || rows.some(row => !row || Array.isArray(row) || typeof row !== 'object')) throw new Error('Expected an array of export records.');
  if (!Array.isArray(existing) || existing.some(shop => !shop?.id || !shop?.slug)) throw new Error('Invalid existing snapshot.');
  const result = new Map(existing.map(shop => [shop.id,shop]));
  const fallbackIds = new Map();
  const slugs = new Set();
  for (const shop of existing) {
    if (shop.fallback) fallbackIds.set(shop.fallback,shop.id);
    slugs.add(shop.slug);
  }
  const seen = new Set(), retained = new Set(), closed = new Set();
  const report = {input:rows.length, duplicates:0, excluded:0, closed:0, temporary:0, missingFields:0, published:0, review:[], removedBySnapshot:0};
  for (const [index,row] of rows.entries()) {
    const key = identity(row);
    const byAddress = result.get(fallbackIds.get(key.fallback));
    const previous = result.get(key.id) ?? (byAddress && (!key.placeId || !byAddress.placeId) ? byAddress : undefined);
    if (previous?.placeId && !key.placeId) { key.placeId = previous.placeId; key.id = previous.id; }
    const normalized = normalize(row,key,importedAt);
    if (normalized.reason) {
      report.excluded++;
      if (normalized.reason === 'review-fields') report.missingFields++;
      if (normalized.reason.startsWith('review')) report.review.push({record:index+1,name:key.name,reason:normalized.reason});
      continue;
    }
    if (normalized.closed) {
      report.closed++;
      if (key.id) { closed.add(key.id); result.delete(previous?.id ?? key.id); }
      continue;
    }
    const shop = normalized.shop;
    if (replaceState && shop.state !== replaceState) throw new Error('Replacement export must contain only ' + replaceState);
    if (closed.has(shop.id)) continue;
    if (seen.has(shop.id)) { report.duplicates++; continue; }
    seen.add(shop.id);
    if (!shop.coords || !shop.phone || !shop.postcode || !shop.locality || !shop.hours?.some(Boolean)) report.missingFields++;
    if (shop.temporary) report.temporary++;
    const base = slugify(shop.name + ' ' + (shop.locality || shop.state)) || 'shop';
    shop.slug = previous?.slug ?? (slugs.has(base) ? base + '-' + hash(shop.id).slice(0,12) : base);
    slugs.add(shop.slug);
    if (previous && previous.id !== shop.id) result.delete(previous.id);
    result.set(shop.id,shop);
    if (shop.fallback) fallbackIds.set(shop.fallback,shop.id);
    retained.add(shop.id);
  }
  if (replaceState) {
    if (!retained.size || report.review.length) throw new Error('Replacement needs accepted records and no unresolved review entries.');
    for (const [id,shop] of result) if (shop.state === replaceState && !retained.has(id)) {
      result.delete(id); report.removedBySnapshot++;
    }
  }
  report.published = result.size;
  return {shops:[...result.values()].sort((a,b) => a.slug.localeCompare(b.slug)),report};
}

export async function readExport(file) {
  const input = (await readFile(file,'utf8')).replace(/^\uFEFF/,'');
  switch (extname(file).toLowerCase()) {
    case '.csv': return parseCsv(input);
    case '.json': return JSON.parse(input);
    default: throw new Error('Use a .json or .csv export.');
  }
}
export async function run(args, validateBuild) {
  const {positionals,values} = parseArgs({
    args,allowPositionals:true,options:{'dry-run':{type:'boolean'},'replace-state':{type:'string'}},
  });
  if (positionals.length !== 1) throw new Error('Usage: npm run import -- input/shops.json [--dry-run] [--replace-state VIC]');
  const replaceState = values['replace-state']?.toUpperCase();
  if (replaceState && !Object.hasOwn(states,replaceState)) throw new Error('Unknown replacement state.');
  const existing = JSON.parse(await readFile(database,'utf8'));
  const {shops,report} = importRows(await readExport(positionals[0]),existing,{replaceState});
  console.log(JSON.stringify({dryRun:!!values['dry-run'], ...report},null,2));
  if (values['dry-run']) return;
  const staged = new URL('../data/shops.json.tmp',import.meta.url);
  await writeFile(staged, JSON.stringify(shops,null,2) + '\n',{flag:'wx'});
  try {
    if (validateBuild) await validateBuild(staged);
    await copyFile(database,new URL('../data/shops.json.backup',import.meta.url));
    await rename(staged,database);
  } catch (error) {
    const {unlink} = await import('node:fs/promises');
    await unlink(staged);
    throw error;
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  run(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
