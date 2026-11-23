import { defineConfig } from 'astro/config';
import config from './site.config.mjs';

if (!config.demo && (!config.url.startsWith('https://') || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(config.contact))) {
  throw new Error('Configure a production HTTPS origin and contact email before disabling demo mode.');
}
if (config.ads.enabled && (config.demo || !/^ca-pub-\d{16}$/.test(config.ads.publisher) ||
    ![config.ads.results, config.ads.footer].every(id => /^\d+$/.test(id)))) {
  throw new Error('AdSense requires production mode, a publisher ID and valid slot IDs.');
}
export default defineConfig({ output: 'static', site: config.url || undefined, trailingSlash: 'always' });