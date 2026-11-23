# C?p nh?t danh b?

1. Xu?t JSON ho?c CSV t? Apify, r?i d?t file v�o thu m?c `input/`. Gi? nguy�n postcode c� s? 0 d?u. Ch? d�ng d? li?u du?c ph�p t�i xu?t b?n.
2. Ch?y `npm run import -- input/shops.json --dry-run`. Xem c�c m?c c?n ki?m tra nhu qu?c gia, lo?i c?a h�ng ho?c d?a ch? thi?u. N?u d�ng CSV, d?i du�i ? c? hai l?nh.
3. Ch?y `npm run update -- input/shops.json`. L?nh th? build v?i d? li?u m?i tru?c khi thay snapshot. B?n tru?c n?m ? `data/shops.json.backup`.
4. Commit v� push `data/shops.json` c�ng c�c thay d?i quy t?c li�n quan. Gi? file xu?t th� trong `input/`.
5. Ki?m tra tr?ng th�i deploy m?i trong Cloudflare Pages. Khi deploy b�o th�nh c�ng, m? URL c�ng khai v� t�m m?t c?a h�ng v?a d?i d? x�c nh?n d? li?u d� l�n m?ng.

M?c d?nh m?i l?n nh?p gi? c�c c?a h�ng cu v?ng m?t trong file m?i. D�ng ch? d? thay c? bang khi file l� b?n xu?t d?y d? c?a bang d�. N?u m?t l?n c?p nh?t c� l?i d? li?u, kh�i ph?c file backup, build ki?m tra v� push l?i.
