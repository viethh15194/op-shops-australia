const assert = require('node:assert/strict');
const { chromium } = require('playwright');

async function main() {
  const base = process.argv[2];
  if (!base) throw new Error('Pass an Astro preview or Cloudflare Pages URL.');
  const browser = await chromium.launch();
  try {
    for (const width of [320, 390, 768]) {
      const context = await browser.newContext({
        viewport: {width, height: 844}, isMobile: true, hasTouch: true,
      });
      try {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        async function check(path, title) {
          const response = await page.goto(new URL(path,base).href);
          assert.ok(response?.ok(), path + ' should load');
          await page.getByRole('heading',{name:title,level:1}).waitFor();
          const overflows = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
          assert.equal(overflows,false,'Horizontal overflow at width ' + width + ' on ' + path);
        }
        await check('/', /^Find op shops near you in Australia/);
        await page.getByRole('link',{name:/Melbourne/}).click();
        await page.getByRole('heading',{name:'Op shops in Melbourne',level:1}).waitFor();
        await page.goto(new URL('/',base).href);
        await page.getByRole('searchbox').fill('0800');
        await page.getByRole('button',{name:'Find op shops',exact:true}).click();
        await page.getByRole('link',{name:'Little Loop Op Shop',exact:true}).waitFor();
        await page.getByText('1 shop',{exact:true}).waitFor();
        assert.equal(new URL(page.url()).searchParams.get('q'),'0800');
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth),false);
        await page.getByRole('link',{name:'View shop',exact:true}).click();
        await page.getByRole('heading',{name:'Little Loop Op Shop',exact:true,level:1}).waitFor();
        assert.match(await page.locator('meta[name="robots"]').getAttribute('content'),/noindex/);
        await check('/find/?q=6003','Find op shops');
        await page.getByRole('link',{name:'Again & Co. Op Shop',exact:true}).click();
        await page.getByText('Hours unavailable.',{exact:true}).waitFor();
        await page.getByRole('link',{name:'Find shops in this area'}).click();
        await page.getByRole('searchbox').fill('no-matching-shop-example');
        await page.getByRole('button',{name:'Search',exact:true}).click();
        await page.getByText('No shops found',{exact:true}).waitFor();
        await page.getByRole('button',{name:'Clear search and filters'}).click();
        await page.getByRole('link',{name:'Little Loop Op Shop',exact:true}).waitFor();
        assert.equal(new URL(page.url()).search,'');
        assert.equal(await page.getByRole('searchbox').inputValue(),'');
        const missing = await page.goto(new URL('/missing-preview-test/',base).href);
        assert.equal(missing?.status(),404);
        assert.equal(errors.length,0,errors.join('\n'));
        console.log('Mobile smoke check passed at ' + width + ' px');
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
