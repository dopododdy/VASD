// sw.js — VASD Service Worker
// ทำงานในพื้นหลังเพื่อรับ push notification แม้เบราว์เซอร์ปิด/จอดับ

self.addEventListener('install', (event) => {
  console.log('[VASD SW] installed');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('[VASD SW] activated');
  event.waitUntil(self.clients.claim());
});

// รับ push event จาก server
self.addEventListener('push', (event) => {
  console.log('[VASD SW] push received');
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (e) {
    data = { title: '🚨 EMERGENCY CALL', body: event.data ? event.data.text() : 'มีการเรียกฉุกเฉิน' };
  }

  const title = data.title || '🚨 EMERGENCY CALL';
  const options = {
    body: data.body || 'มีการเรียกฉุกเฉิน',
    icon: '/VASD/logo.png',
    badge: '/VASD/logo.png',
    vibrate: [400, 200, 400, 200, 400, 200, 1000],
    requireInteraction: true,  // ต้องกดปิดเอง
    tag: 'vasd-emergency',
    renotify: true,
    data: {
      url: data.url || '/VASD/index.html',
      timestamp: data.timestamp || Date.now()
    }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// เมื่อกดที่ notification → เปิดเว็บ
self.addEventListener('notificationclick', (event) => {
  console.log('[VASD SW] notification clicked');
  event.notification.close();
  const targetUrl = event.notification.data?.url || '/VASD/index.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // ถ้ามีหน้า VASD เปิดอยู่แล้ว → focus
      for (const client of clientList) {
        if (client.url.includes('/VASD/') && 'focus' in client) {
          return client.focus();
        }
      }
      // ไม่มี → เปิดใหม่
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
    })
  );
});
