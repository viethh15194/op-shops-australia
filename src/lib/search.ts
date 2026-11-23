import { directions,findShops } from './shared.mjs';
import type { Shop } from './catalog';

const form = document.querySelector<HTMLFormElement>('#filters')!;
const field = (name: string) => form.elements.namedItem(name) as HTMLInputElement & HTMLSelectElement;
const results = document.querySelector<HTMLElement>('#results')!;
const summary = document.querySelector<HTMLElement>('#result-summary')!;
const more = document.querySelector<HTMLButtonElement>('#more')!;
const locationStatus = document.querySelector<HTMLElement>('#location-status')!;
const locate = document.querySelector<HTMLButtonElement>('#locate')!;
const template = document.querySelector<HTMLTemplateElement>('#shop-card')!;
const ad = document.querySelector<HTMLTemplateElement>('#listing-ad')!;
const states = form.dataset.states?.split(',').filter(Boolean) ?? [];
const indexes = new Map<string,Promise<Shop[]>>();
let origin: [number,number] | null = null;
let limit = 12;
let generation = 0;

function restore() {
  const parameters = new URLSearchParams(location.search);
  for (const name of ['q','state','chain','sort']) field(name).value = parameters.get(name) ?? '';
  field('open').checked = parameters.get('open') === '1';
  if (!origin && field('sort').value === 'distance') field('sort').value = '';
}
function store() {
  const parameters = new URLSearchParams();
  for (const [key,value] of new FormData(form)) if (value) parameters.set(key,String(value));
  const query = parameters.toString();
  const next = '/find/' + (query ? '?' + query : '');
  if (next !== location.pathname + location.search) history.pushState(null,'',next);
}
function load(state: string): Promise<Shop[]> {
  const pending = indexes.get(state);
  if (pending) return pending;
  const request = fetch('/index/' + state.toLowerCase() + '.json').then(response => {
    if (!response.ok) throw new Error('Index unavailable');
    return response.json();
  }).catch(error => { indexes.delete(state); throw error; });
  indexes.set(state,request);
  return request;
}
function card({shop,status,km}: {shop: Shop; status: string; km: number}) {
  const clone = template.content.cloneNode(true) as DocumentFragment;
  const element = (key: string) => clone.querySelector<HTMLElement>('[data-' + key + ']')!;
  const path = '/shops/' + encodeURIComponent(shop.slug) + '/';
  const put = (key: string,value: string) => { element(key).textContent = value; element(key).hidden = !value; };
  put('area',[shop.locality,shop.state,shop.postcode,shop.demo ? '� Sample' : ''].filter(Boolean).join(' '));
  put('name',shop.name);
  put('address',shop.address);
  put('status',status);
  put('rating',shop.rating != null ? 'Google rating ' + shop.rating + '/5 (' + shop.reviews + ' reviews)' : '');
  put('distance',Number.isFinite(km) ? 'Approx. distance ' + (km < 1 ? '<1' : Math.round(km)) + ' km' : '');
  element('name').setAttribute('href',path);
  element('details').setAttribute('href',path);
  const route = directions(shop);
  if (route) element('directions').setAttribute('href',route);
  else element('directions').hidden = true;
  return clone;
}
async function render(focusIndex?: number) {
  const turn = ++generation;
  const state = field('state').value;
  const filters = { q:field('q').value, state, chain:field('chain').value, open:field('open').checked, sort:field('sort').value, origin };
  try {
    const lists = await Promise.all((state ? [state] : states).map(load));
    if (turn !== generation) return;
    const matches = findShops(lists.flat(),filters);
    const visible = matches.slice(0,limit);
    const existingAd = results.querySelector('[data-ad]');
    results.replaceChildren();
    visible.forEach((item,index) => {
      results.append(card(item));
      if (index === 5 && visible.length > 6) results.append(existingAd ?? ad.content.cloneNode(true));
    });
    const count = matches.length;
    summary.textContent = count ? count + (count === 1 ? ' shop' : ' shops') : 'No shops found';
    if (!count) {
      const tip = document.createElement('p');
      tip.textContent = 'Try a different search or clear one of the filters.';
      results.append(tip);
    }
    more.hidden = limit >= count;
    if (focusIndex !== undefined) results.querySelectorAll<HTMLAnchorElement>('[data-name]')[focusIndex]?.focus();
    dispatchEvent(new Event('opshop:ads'));
  } catch {
    if (turn !== generation) return;
    results.replaceChildren();
    more.hidden = true;
    summary.textContent = 'Could not load shops. Try searching again.';
  }
}
function requestLocation() {
  if (!navigator.geolocation) { locationStatus.textContent = 'Location is unavailable. Try a suburb or postcode.'; return; }
  locate.disabled = true;
  locationStatus.textContent = 'Finding your location.';
  navigator.geolocation.getCurrentPosition(({coords}) => {
    origin = [coords.latitude,coords.longitude];
    field('sort').querySelector<HTMLOptionElement>('[value="distance"]')!.disabled = false;
    field('sort').value = 'distance';
    locationStatus.textContent = 'Sorting by approximate straight-line distance.';
    locate.disabled = false;
    field('q').value = '';
    limit = 12; store(); void render();
  },() => {
    locate.disabled = false;
    locationStatus.textContent = 'Could not access your location. Try a suburb or postcode.';
  },{timeout:8000,maximumAge:60000});
}
form.addEventListener('submit',event => { event.preventDefault(); limit = 12; store(); void render(); });
form.addEventListener('change',event => {
  if (event.target === field('q')) return;
  limit = 12; store(); void render();
});
more.addEventListener('click',() => { const firstNew = limit; limit += 12; void render(firstNew); });
locate.addEventListener('click',requestLocation);
addEventListener('popstate',() => { restore(); limit = 12; void render(); });
restore();
if (new URLSearchParams(location.search).has('near')) {
  const params = new URLSearchParams(location.search);
  params.delete('near');
  history.replaceState(null,'','/find/' + (params.size ? '?' + params : ''));
  requestLocation();
}
void render();
