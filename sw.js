// เปลี่ยนเลขเวอร์ชันเป็น v2 เพื่อบังคับให้ระบบมือถือล้าง Cache เก่าทิ้ง
const CACHE_NAME = 'fintech-pro-cache-v2';

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
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js',
  'https://fonts.googleapis.com/css2?family=Prompt:wght@400;500;600;700&display=swap'
];

// 🟢 1. เหตุการณ์ Install: โหลดไฟล์ทั้งหมดลง Cache ทันทีที่เข้าเว็บครั้งแรก
self.addEventListener('install', event => {
  // สั่งให้ Service Worker ตัวใหม่เข้าไปทำงานทันที ไม่ต้องรอ
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('เปิดใช้งาน Cache v2 สำเร็จ');
        return cache.addAll(urlsToCache);
      })
  );
});

// 🟢 2. เหตุการณ์ Activate: ล้าง Cache เวอร์ชันเก่าทิ้ง
self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            console.log('ล้าง Cache เก่าทิ้ง: ', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  // เข้าควบคุมหน้าเว็บทั้งหมดทันที
  self.clients.claim();
});

// 🟢 3. เหตุการณ์ Fetch: กลยุทธ์ "Network First, fallback to Cache"
self.addEventListener('fetch', event => {
  const requestUrl = event.request.url;

  // 🔴 ยกเว้นการ Cache สำหรับ API ของ Google Apps Script (POST Requests) และ Chrome Extensions
  if (event.request.method !== 'GET' || requestUrl.includes('script.google.com') || requestUrl.startsWith('chrome-extension')) {
    return;
  }

  // 🟢 วิ่งไปดึงข้อมูลจาก Server (GitHub) ก่อนเสมอ จะได้โค้ดอัปเดตล่าสุด
  event.respondWith(
    fetch(event.request).then(networkResponse => {
      // ถ้ามีเน็ตและโหลดสำเร็จ ให้ก๊อปปี้ไฟล์ใหม่ไปอัปเดตทับใน Cache ด้วย
      if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
        let responseClone = networkResponse.clone();
        caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, responseClone);
        });
      }
      return networkResponse;
    }).catch(() => {
      // 🔴 ถ้าเน็ตหลุด หรือหาเว็บไม่เจอ (Offline) ให้ดึงไฟล์จาก Cache มาแสดงแทน
      console.log('ทำงานโหมด Offline: โหลดข้อมูลจาก Cache', event.request.url);
      return caches.match(event.request);
    })
  );
});