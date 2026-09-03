// ตั้งชื่อ Cache และเวอร์ชัน (หากมีการแก้ไขไฟล์ HTML/CSS ให้เปลี่ยนเลข v1 เป็น v2, v3...)
const CACHE_NAME = 'fintech-pro-cache-v1';

// รายชื่อไฟล์ทั้งหมดที่ต้องการให้เก็บลงเครื่อง (App Shell)
const urlsToCache = [
  '/',
  '/index.html',
  '/admin.html',
  '/user.html',
  '/client.html',
  '/style.css',
  '/index.js',
  '/admin.js',
  '/user.js',
  '/client.js',
  '/manifest.json',
  '/logo1.svg',
  '/logo.png',
  '/logo.svg',
  '/logo512.png',
  // เก็บ Cache ของ Bootstrap และ Font จากภายนอกด้วย
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
  'https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;700&display=swap'
];

// 🟢 1. เหตุการณ์ Install: โหลดไฟล์ทั้งหมดลง Cache ทันทีที่เข้าเว็บครั้งแรก
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('เปิดใช้งาน Cache สำเร็จ');
        return cache.addAll(urlsToCache);
      })
  );
  // สั่งให้ Service Worker ตัวใหม่ทำงานทันทีโดยไม่ต้องรอโหลดหน้าเว็บใหม่
  self.skipWaiting();
});

// 🟢 2. เหตุการณ์ Activate: ล้าง Cache เวอร์ชันเก่าทิ้ง (ถ้ามีการเปลี่ยนเลข v)
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('ล้าง Cache เก่า: ', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

// 🟢 3. เหตุการณ์ Fetch: ดักจับการดึงข้อมูลเพื่อส่งจาก Cache หรือเน็ต
self.addEventListener('fetch', event => {
  const requestUrl = event.request.url;

  // 🔴 ยกเว้นการ Cache สำหรับ API ของ Google Apps Script (POST Requests) และ Chrome Extensions
  if (event.request.method !== 'GET' || requestUrl.includes('script.google.com') || requestUrl.startsWith('chrome-extension')) {
    return;
  }

  // 🟢 กลยุทธ์ "Cache First, fallback to Network"
  event.respondWith(
    caches.match(event.request)
      .then(response => {
        // ถ้าเจอไฟล์ใน Cache ให้ส่งกลับทันที (โหลดไว 0.1 วิ)
        if (response) {
          return response;
        }

        // ถ้าไม่เจอใน Cache ให้ไปโหลดจากเน็ต
        return fetch(event.request).then(
          function(networkResponse) {
            // เช็คว่าข้อมูลที่โหลดมาถูกต้องไหม ถ้าไม่ให้ส่งกลับไปเลย
            if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
              return networkResponse;
            }

            // ถ้าโหลดสำเร็จ ให้ก๊อปปี้ไฟล์นั้นเก็บลง Cache ไว้ใช้รอบหน้า
            var responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME)
              .then(function(cache) {
                cache.put(event.request, responseToCache);
              });

            return networkResponse;
          }
        );
      }).catch(() => {
        // กรณี Offline แล้วหาไฟล์ไม่เจอใน Cache (เผื่อทำหน้า Offline Page ในอนาคต)
        console.log('Offline: ไม่สามารถโหลด ', event.request.url);
      })
  );
});