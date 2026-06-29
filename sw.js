const CACHE_NAME = 'albaburok-v1';
const URLS_TO_CACHE = [
  '/-/albaburok_2.html',
  '/-/customer.html',
  '/-/manifest.json',
  '/-/manifest-customer.json'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(URLS_TO_CACHE))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.url.includes('supabase.co')) return;
  e.respondWith(
    fetch(e.request).catch(() => caches.match(e.request))
  );
});

// 푸시 알림 수신
self.addEventListener('push', e => {
  let title = '알바부족';
  let body = '새 알림이 있어요!';
  try {
    if(e.data) {
      const text = e.data.text();
      const data = JSON.parse(text);
      if(data.title) title = data.title;
      if(data.body) body = data.body;
    }
  } catch(err) {
    console.error('알림 파싱 실패:', err);
  }
  e.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/-/icon-192.png',
      badge: '/-/icon-192.png',
      vibrate: [200, 100, 200],
      requireInteraction: false,
    })
  );
});

// 알림 클릭 시 앱 열기
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(
    clients.matchAll({ type: 'window' }).then(list => {
      for (const c of list) {
        if (c.url.includes('albaburok') && 'focus' in c) return c.focus();
      }
      return clients.openWindow('https://junhookim.github.io/-/albaburok_2.html');
    })
  );
});
