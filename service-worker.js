const CACHE_NAME = 'vita-ordo-cache-v1';

// ATC 서브디렉토리용 상대 경로 사용
const urlsToCache = [
  './',
  './index.html',
  './styles.css',
  './script.js',
  './manifest.json',
  './offline.html',
  // 아이콘 파일들은 실제로 존재하는지 확인 후 추가
  './src/icon-192.png',
  './src/icon-512.png',
  './src/logo.png'
];

// 설치 시 캐싱 - 오류 처리 개선
self.addEventListener('install', event => {
  console.log('Service Worker installing...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Opened cache, attempting to cache files...');
        // 각 파일을 개별적으로 시도하여 어떤 파일이 실패하는지 확인
        return Promise.allSettled(
          urlsToCache.map(url => {
            console.log('Attempting to cache:', url);
            return fetch(url).then(response => {
              if (!response.ok) {
                throw new Error(`HTTP ${response.status} for ${url}`);
              }
              return cache.put(url, response);
            }).catch(error => {
              console.error(`Failed to cache ${url}:`, error);
              // 404나 기타 오류가 있어도 계속 진행
              return null;
            });
          })
        );
      })
      .then(results => {
        const successful = results.filter(r => r.status === 'fulfilled' && r.value !== null).length;
        console.log(`Successfully cached ${successful}/${results.length} files`);
        
        // 실패한 파일들 로그
        results.forEach((result, index) => {
          if (result.status === 'rejected') {
            console.error(`Failed to cache ${urlsToCache[index]}:`, result.reason);
          }
        });
        
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('Cache setup failed:', error);
        return self.skipWaiting(); // 캐시 실패해도 Service Worker는 설치
      })
  );
});

// 요청 가로채기
self.addEventListener('fetch', event => {
  // Chrome extension 요청 등은 무시
  if (!event.request.url.startsWith('http')) {
    return;
  }

  // ATC 디렉토리 내의 요청만 처리
  if (!event.request.url.includes('/ATC/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          console.log('Serving from cache:', event.request.url);
          return response;
        }
        
        console.log('Fetching from network:', event.request.url);
        return fetch(event.request).catch(error => {
          console.log('Network fetch failed for:', event.request.url, error);
          
          // HTML 요청인 경우 오프라인 페이지 반환
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./offline.html');
          }
          
          throw error;
        });
      })
  );
});

// 캐시 정리 및 활성화
self.addEventListener('activate', event => {
  console.log('Service Worker activating...');
  const cacheWhitelist = [CACHE_NAME];
  
  event.waitUntil(
    Promise.all([
      // 이전 캐시 삭제
      caches.keys().then(cacheNames => {
        return Promise.all(
          cacheNames.map(cacheName => {
            if (!cacheWhitelist.includes(cacheName)) {
              console.log('Deleting old cache:', cacheName);
              return caches.delete(cacheName);
            }
          })
        );
      }),
      // 즉시 제어권 획득
      self.clients.claim()
    ])
  );
});