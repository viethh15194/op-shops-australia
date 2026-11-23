import assert from 'node:assert/strict';
import test from 'node:test';
import { importRows,parseCsv,parseHours } from '../scripts/import.mjs';
import { openStatus,distance,findShops,directions } from '../src/lib/shared.mjs';
const date = '2026-11-23T00:00:00Z';
const row = (overrides = {}) => ({
  title:'Example Op Shop', address:'100 Sample Lane, Darwin City NT 0800, Australia',
  city:'Darwin City', state:'Northern Territory', postalCode:'0800', countryCode:'AU', placeId:'sample-id',
  location:{lat:-12.46,lng:130.84}, categoryName:'Thrift store',...overrides,
});
const run = (rows,prior = [],options = {}) => importRows(rows,prior,{importedAt:date,...options});

test('CSV handles quoted commas, escaped quotes, newlines and leading-zero postcodes', () => {
  const csv = 'title,address,postalCode\r\n"Shop ""Again""","100 Sample Lane,\r\nDarwin",0800\r\n';
  assert.deepEqual(parseCsv(csv),[{title:'Shop "Again"',address:'100 Sample Lane,\r\nDarwin',postalCode:'0800'}]);
  assert.throws(() => parseCsv('a,b\n"x,y'),/Unclosed/);
  assert.throws(() => parseCsv('a,b\nx,y,z'),/column count/);
});
test('partial and repeated imports update by ID, keep a stable slug and preserve other branches', () => {
  const otherAddress = row({placeId:'other-id',address:'200 Sample Lane, Darwin City NT 0800, Australia'});
  const initial = run([row(),row(),otherAddress]);
  assert.equal(initial.shops.length,2);
  assert.equal(initial.report.duplicates,1);
  assert.equal(new Set(initial.shops.map(shop => shop.slug)).size,2);
  const after = run([row({title:'Renamed Op Shop'})],initial.shops);
  assert.equal(after.shops.length,2);
  assert.equal(after.shops.find(shop => shop.id === 'sample-id').slug,initial.shops.find(shop => shop.id === 'sample-id').slug);
});
test('fallback dedup joins a later Place ID and preserves the canonical slug', () => {
  const first = run([row({placeId:''})]);
  const second = run([row()],first.shops);
  assert.equal(second.shops.length,1);
  assert.equal(second.shops[0].id,'sample-id');
  assert.equal(second.shops[0].slug,first.shops[0].slug);
});
test('filters foreign, uncertain and donation-only records and removes permanent closures', () => {
  const first = run([row()]).shops;
  const updated = run([
    row({permanentlyClosed:'true'}),
    row({placeId:'temp',temporarilyClosed:true,address:'101 Sample Lane, Australia',website:'javascript:alert(1)'}),
    row({placeId:'nz',countryCode:'NZ'}),
    row({placeId:'unknown',countryCode:'',address:'Somewhere'}),
    row({placeId:'bin',title:'Example Donation Centre',categoryName:'Donation centre'}),
  ],first);
  assert.deepEqual(updated.shops.map(shop => shop.id),['temp']);
  assert.equal(openStatus(updated.shops[0]),'Temporarily closed');
  assert.equal(updated.shops[0].website,undefined);
  assert.equal(updated.report.closed,1);
  assert.equal(updated.report.review[0].reason,'review-country');
});
test('state replacement refuses unusable or wrong-state snapshots', () => {
  assert.throws(() => run([],run([row()]).shops,{replaceState:'NT'}),/accepted/);
  assert.throws(() => run([row()],[],{replaceState:'VIC'}),/only VIC/);
});
test('weekly hours handle multiple ranges, overnight hours and partial schedules', () => {
  const {hours} = parseHours([
    {day:'Sunday',hours:'9:30 AM to 1:00 PM, 10 PM to 2 AM'},
    {day:'Monday',hours:'Closed'},
    {day:'Tuesday',hours:'Unknown'},
  ]);
  assert.deepEqual(hours[6],[[570,780],[1320,1560]]);
  const shop = {timezone:'Australia/Melbourne',hours};
  assert.match(openStatus(shop,new Date('2026-11-22T14:30:00Z')),/^Open/);
  assert.match(openStatus(shop,new Date('2026-11-22T16:00:00Z')),/^Closed/);
  assert.equal(openStatus(shop,new Date('2026-11-24T01:00:00Z')),'Hours unavailable');
});
test('Open now distinguishes Australian time zones and daylight saving', () => {
  const hours = Array.from({length:7},() => [[600,660]]);
  const summer = new Date('2026-11-23T00:00:00Z');
  const winter = new Date('2026-07-23T00:00:00Z');
  assert.match(openStatus({timezone:'Australia/Melbourne',hours},summer),/^Closed/);
  assert.match(openStatus({timezone:'Australia/Melbourne',hours},winter),/^Open/);
  assert.match(openStatus({timezone:'Australia/Brisbane',hours},summer),/^Open/);
  assert.match(openStatus({timezone:'Australia/Darwin',hours},summer),/^Closed/);
});
test('search handles leading zero, shared locality names, ratings and straight-line ordering', () => {
  const first = run([row()]).shops[0];
  const shops = [first,{...first,name:'B',state:'VIC',postcode:'3000',rating:4,coords:[-37.8,145]}];
  assert.equal(findShops(shops,{q:'0800'}).length,1);
  assert.equal(findShops(shops,{q:'DARWIN CITY'}).length,2);
  assert.equal(findShops(shops,{q:'darwin city',state:'VIC'})[0].shop.name,'B');
  assert.equal(findShops(shops,{sort:'rating'})[0].shop.name,'B');
  assert.equal(findShops(shops,{sort:'distance',origin:first.coords})[0].km,0);
  assert.ok(Math.abs(distance([0,0],[0,1]) - 111.195) < .01);
  assert.equal(new URL(directions(first)).searchParams.get('destination_place_id'),'sample-id');
  assert.equal(directions({...first,demo:true}),'');
});
