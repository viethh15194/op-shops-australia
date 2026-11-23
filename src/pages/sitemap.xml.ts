import type { APIRoute } from 'astro';
import config from '../../site.config.mjs';
import { allAreas,areaPath,shopPath,shops } from '../lib/catalog';
const escape = (value:string) => value.replaceAll('&','&amp;').replaceAll('<','&lt;');
export const GET: APIRoute = () => {
  const paths = config.demo ? [] : ['/', '/about/', '/contact/', '/privacy/', '/terms/',...allAreas.map(areaPath),...shops.map(shopPath)];
  const urls = paths.map(path => '<url><loc>' + escape(new URL(path,config.url).href) + '</loc></url>').join('');
  return new Response('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls + '</urlset>',{headers:{'content-type':'application/xml'}});
};
