const CACHE_NAME = 'flashai-v1';
const ASSETS = [
  '/',
  '/index.html',
  '/menu.html',
  '/game.html',
  '/register.html'
];

// ติดตั้ง Service Worker และเก็บไฟล์ Static
self.addEventListener('install', (e) => {
  // ⚡ บังคับให้ Service Worker ตัวใหม่เข้าควบคุมทันทีที่ติดตั้งเสร็จ ไม่ต้องรอรีเฟรชรอบสอง
  self.skipWaiting(); 
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS))
  );
});

// จัดการเมื่อ Service Worker เริ่มทำงาน
self.addEventListener('activate', (event) => {
  // ⚡ บังคับให้หน้าเว็บทุกหน้า (Clients) มาใช้ Service Worker ตัวใหม่นี้ทันที
  event.waitUntil(clients.claim());
  
  // ล้าง Cache เก่าที่ชื่อไม่ตรงกัน (ถ้ามีการเปลี่ยน CACHE_NAME ในอนาคต)
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log("🧹 Clearing old cache:", cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

// ดึงข้อมูลจาก Cache เมื่อ Offline หรือเก็บรูปใหม่เข้า Cache
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      // 1. ถ้ามีใน Cache ให้คืนค่าไปเลย
      // 2. ถ้าไม่มี ให้ไป fetch จากอินเทอร์เน็ต
      return response || fetch(e.request).then((fetchRes) => {
        // ตรวจสอบว่าต้องเก็บรูปภาพ Pixabay ลง Cache หรือไม่
        const isPixabay = e.request.url.includes('pixabay.com');
        const isPlaceholder = e.request.url.includes('placeholder');

        if (isPixabay || isPlaceholder) {
          return caches.open(CACHE_NAME).then((cache) => {
            // ต้อง .clone() เพราะ stream ของ response ใช้ได้ครั้งเดียว
            cache.put(e.request.url, fetchRes.clone());
            return fetchRes;
          });
        }
        return fetchRes;
      });
    }).catch(() => {
      // กรณี Offline และไม่มีใน Cache
      if (e.request.url.match(/\.(png|jpg|jpeg|gif|svg)$/)) {
        return caches.match('/offline-img.png'); 
      }
    })
  );
});