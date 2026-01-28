# 🎯 Strike Risk Monitoring System

מערכת ניטור סיכון תקיפה בזמן אמת המבוססת על ניתוח של מספר מקורות נתונים.

## 📋 תיאור

מערכת זו מנטרת ומנתחת סיכונים פוטנציאליים לתקיפה על בסיס:
- 📰 חדשות בזמן אמת (NewsAPI.ai)
- 🌤️ תנאי מזג אוויר (OpenWeatherMap)
- ✈️ תנועת כלי טיס אזרחיים (Aviationstack)
- 🛩️ מיקום מכליות תדלוק צבאיות (ADS-B)
- 📊 שווקי חיזוי (Polymarket, PredictIt)
- 📈 עניין ציבורי (Wikipedia, GDELT)

## 🚀 התקנה והרצה מקומית

### דרישות
- Node.js 20+
- npm

### התקנה

```bash
# התקנת dependencies
cd backend
npm install

# בניית הפרויקט
npm run build

# הרצה
npm start
```

השרת יעלה על `http://localhost:4000`

### פיתוח

```bash
cd backend
npm run dev
```

## 🔧 הגדרת Environment Variables

צור קובץ `.env` בתיקיית `backend/`:

```env
OPENWEATHER_API_KEY=your_key
NEWSAPI_KEY=your_key
AVIATIONSTACK_API_KEY=your_key
OPENSKY_CLIENT_ID=your_key (אופציונלי)
OPENSKY_CLIENT_SECRET=your_key (אופציונלי)
PORT=4000
NODE_ENV=development
```

## 📦 Deployment

### ⚡ העלאה מהירה (מומלץ)

**Render.com** - הכי פשוט ומהיר:
1. דחוף את הקוד ל-GitHub
2. היכנס ל-[render.com](https://render.com)
3. New + → Web Service → חבר את ה-repo
4. הגדר Build Command: `cd backend && npm install && npm run build`
5. הגדר Start Command: `cd backend && node dist/index.js`
6. הוסף את ה-Environment Variables
7. Create Web Service

**לפרטים מלאים:** ראה [QUICK_DEPLOY.md](./QUICK_DEPLOY.md) או [DEPLOYMENT.md](./DEPLOYMENT.md)

### אפשרויות אחרות
- **Railway.app** - מהיר ונוח
- **Fly.io** - מצוין ל-background jobs
- **DigitalOcean App Platform** - פשוט
- **VPS** - שליטה מלאה

## 🏗️ מבנה הפרויקט

```
.
├── backend/          # Express.js backend (TypeScript)
│   ├── src/
│   │   ├── api/      # API routes
│   │   ├── ingestion/ # Data connectors
│   │   ├── analysis/  # Analysis engine
│   │   ├── scoring/   # Scoring model
│   │   └── alerts/    # Alert system
│   └── package.json
├── frontend/         # Frontend (SPA)
│   └── index.html
├── infra/            # Infrastructure configs
│   ├── docker-compose.yml
│   └── nginx.conf
└── DEPLOYMENT.md     # מדריך deployment מפורט
```

## 📡 API Endpoints

- `GET /api/health` - Health check
- `GET /api/status` - System status
- `GET /api/score` - Current risk score
- `GET /api/signals` - All signals
- `GET /api/trend` - Score trend
- `GET /api/analysis` - Detailed analysis
- `GET /api/aircraft` - Aircraft positions
- `GET /api/events/sse` - Server-Sent Events stream

## 🛠️ טכנולוגיות

- **Backend**: Node.js, Express.js, TypeScript
- **Frontend**: Vanilla JavaScript, Leaflet.js, Chart.js
- **APIs**: NewsAPI.ai, OpenWeatherMap, Aviationstack, OpenSky, ADS-B

## 📝 רישיון

Private project

## 🔗 קישורים

- [מדריך Deployment מפורט](./DEPLOYMENT.md)
- [מדריך Deployment מהיר](./QUICK_DEPLOY.md)
- [מקורות נתונים](./DATA_SOURCES.md)
- [סטטוס Connectors](./CONNECTOR_STATUS.md)
