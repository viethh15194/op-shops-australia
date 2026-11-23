import type { Shop } from './catalog';

const cdn = 'https://unpkg.com/leaflet@1.9.4/dist/';
function loadAsset(element: HTMLLinkElement | HTMLScriptElement) {
  return new Promise<void>((resolve,reject) => {
    element.addEventListener('load',() => resolve(),{once:true});
    element.addEventListener('error',reject,{once:true});
    document.head.append(element);
  });
}
async function loadLeaflet() {
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = cdn + 'leaflet.css';
  css.integrity = 'sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=';
  css.crossOrigin = 'anonymous';
  const script = document.createElement('script');
  script.src = cdn + 'leaflet.js';
  script.integrity = 'sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=';
  script.crossOrigin = 'anonymous';
  try {
    await Promise.all([loadAsset(css),loadAsset(script)]);
  } catch (error) {
    css.remove();
    script.remove();
    throw error;
  }
}
type Position = [number,number];
type MapView = {invalidateSize():void;fitBounds(p:Position[],opts:{padding:Position;maxZoom:number}):void};
type Layer = {addTo(target:MapView):Layer;clearLayers():void};
type Leaflet = {
  map(element:HTMLElement,options:{scrollWheelZoom:boolean}):MapView;
  layerGroup():Layer;
  tileLayer(url:string,options:{maxZoom:number;attribution:string}):Layer;
  marker(position:Position,options:{title:string;alt:string}):{
    bindPopup(content:HTMLElement):{addTo(layer:Layer):void};
  };
};
let assets:Promise<void> | undefined;
let map:MapView | undefined;
let markers:Layer | undefined;

export async function showShopMap(element:HTMLElement,shops:Shop[],isCurrent:()=>boolean) {
  assets ??= loadLeaflet().catch(error => { assets = undefined; throw error; });
  await assets;
  if (!isCurrent()) return;
  const leaflet = (window as Window & {L:Leaflet}).L;
  if (!map) {
    map = leaflet.map(element,{scrollWheelZoom:false});
    leaflet.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
      maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap contributors</a>',
    }).addTo(map);
  }
  markers ??= leaflet.layerGroup().addTo(map);
  markers.clearLayers();
  const positions:Position[] = [];
  for (const shop of shops) {
    if (!shop.coords) continue;
    positions.push(shop.coords);
    const link = document.createElement('a');
    link.href = '/shops/' + encodeURIComponent(shop.slug) + '/';
    link.textContent = shop.name;
    leaflet.marker(shop.coords,{title:shop.name,alt:shop.name}).bindPopup(link).addTo(markers);
  }
  map.invalidateSize();
  if (positions.length) map.fitBounds(positions,{padding:[32,32],maxZoom:15});
}
