/* 断网也能打开。
 *
 * 策略是 network-first：联网时永远走网络拿最新的，顺手更新缓存；
 * 只有断网（fetch 抛错）才回落到缓存。
 * 这样改了 index.html 传上去，用户刷新一次就是新版本，不会卡在旧缓存里。
 *
 * 改了内容记得把 V 加一，旧缓存会在 activate 时被清掉。
 *
 * 注意：部署在仓库根时，这个 SW 的作用域是整站（/），
 * 会同时看到 stm32/、training-log/ 之类的其他页面。
 * 所以「回落首页」只在「根路径的导航请求」时才做，别的路径老老实实报错，
 * 不能拿焊接页面去顶替别人的页面。
 */
const V = 'soldermap-v1';
const CORE = ['./index.html', './manifest.json', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(V).then(c => c.addAll(CORE)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== V).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  // 只缓存自己站内的，别把别人的外链也吞进来
  if (url.origin !== location.origin) return;

  e.respondWith(
    fetch(req)
      .then(r => {
        // 只缓存正常响应：404 / 500 别写进缓存，否则断网时会一直吃到错误页
        if (r && r.ok) {
          const copy = r.clone();
          caches.open(V).then(c => c.put(req, copy));
        }
        return r;
      })
      .catch(() => caches.match(req).then(hit => {
        if (hit) return hit;
        // 兜底只给站点根：/ 或 /index.html 的整页导航
        if (req.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) {
          return caches.match('./index.html');
        }
        return Response.error();
      }))
  );
});
