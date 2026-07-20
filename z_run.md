Backend (na raiz do backend):

cd d:\HoloRaid\backend
npm run dev
Frontend (build + serve) — os flags importam:

cd d:\HoloRaid\app
flutter build web --pwa-strategy=none --no-web-resources-cdn --dart-define=API_BASE_URL=http://localhost:3010
cd build\web
python -m http.server 8899
