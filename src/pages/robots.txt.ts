import type { APIRoute } from 'astro';
import config from '../../site.config.mjs';
export const GET: APIRoute = () => new Response(
  'User-agent: *\nDisallow:\n' + (!config.demo ? 'Sitemap: ' + new URL('/sitemap.xml',config.url).href + '\n' : ''),
  {headers:{'content-type':'text/plain'}},
);
