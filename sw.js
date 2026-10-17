self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  const data = event.data ? event.data.text() : 'Sara Hospital: Notun message ba call asheche!';
  const options = {
    body: data,
    icon: '/icon.png',
    badge: '/icon.png',
    vibrate: [200, 100, 200]
  };
  event.waitUntil(
    self.registration.showNotification('Sara Hospital Intercom', options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow('/')
  );
});

