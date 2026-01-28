# 🚀 מדריך העלאה לאוויר - Deployment Guide

## 📊 ניתוח הפרויקט

הפרויקט שלך כולל:
- **Backend**: Express.js עם TypeScript
- **Frontend**: SPA (Single Page Application) בקובץ HTML יחיד
- **Background Jobs**: Refresh אוטומטי כל 60 שניות
- **SSE**: Server-Sent Events לעדכונים בזמן אמת
- **API Keys**: דורש API keys חיצוניים (OpenWeather, NewsAPI, Aviationstack)

**❌ למה לא Netlify?**
- Netlify מיועד לאתרים סטטיים בלבד
- אין תמיכה ב-Node.js backend
- אין תמיכה ב-background jobs
- אין תמיכה ב-SSE

**✅ למה כן שרת/Cloud?**
- צריך Node.js runtime
- צריך background processes
- צריך SSE connections
- צריך API endpoints

---

## 🎯 אפשרויות Deployment (מהמומלץ לפחות מומלץ)

### 1. **Render.com** ⭐ (הכי מומלץ - הכי פשוט)

**יתרונות:**
- ✅ חינמי ל-projects קטנים
- ✅ תמיכה מלאה ב-Node.js
- ✅ תמיכה ב-background jobs
- ✅ SSL אוטומטי
- ✅ Git integration
- ✅ Environment variables נוח

**חסרונות:**
- ⚠️ Free tier יכול להיות איטי (spin down אחרי 15 דקות)
- ⚠️ Limited resources

**מחיר:** חינמי (עם הגבלות) / $7/חודש (Starter)

---

### 2. **Railway.app** ⭐⭐ (מומלץ מאוד)

**יתרונות:**
- ✅ חינמי עם $5 credit כל חודש
- ✅ תמיכה מעולה ב-Node.js
- ✅ תמיכה ב-background jobs
- ✅ SSL אוטומטי
- ✅ Git integration
- ✅ מהיר מאוד

**חסרונות:**
- ⚠️ Free tier מוגבל

**מחיר:** $5 credit חינם / $5-20/חודש

---

### 3. **Fly.io** ⭐⭐⭐ (מצוין ל-background jobs)

**יתרונות:**
- ✅ חינמי עם limits נדיבים
- ✅ תמיכה מעולה ב-background jobs
- ✅ תמיכה ב-SSE
- ✅ מהיר מאוד
- ✅ Global edge network

**חסרונות:**
- ⚠️ קצת יותר מורכב להגדרה

**מחיר:** חינמי (עם limits) / $1.94/חודש (Shared CPU)

---

### 4. **DigitalOcean App Platform**

**יתרונות:**
- ✅ פשוט להגדרה
- ✅ תמיכה ב-Node.js
- ✅ SSL אוטומטי

**חסרונות:**
- ⚠️ יקר יותר ($5/חודש minimum)

**מחיר:** $5/חודש

---

### 5. **VPS (DigitalOcean, Linode, Hetzner)**

**יתרונות:**
- ✅ שליטה מלאה
- ✅ זול ($4-6/חודש)
- ✅ אין הגבלות

**חסרונות:**
- ❌ צריך להגדיר הכל בעצמך
- ❌ צריך לנהל את השרת
- ❌ יותר עבודה

**מחיר:** $4-6/חודש

---

## 📝 הוראות Deployment - Render.com (הכי פשוט)

### שלב 1: הכנת הפרויקט

1. ודא שיש לך Git repository:
```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin <your-github-repo-url>
git push -u origin main
```

2. ודא שה-`.env` לא ב-Git (הוא כבר ב-`.gitignore`)

### שלב 2: העלאה ל-Render

1. היכנס ל-[render.com](https://render.com) ויצור חשבון (חינמי)

2. לחץ על **"New +"** → **"Web Service"**

3. חבר את ה-GitHub repository שלך

4. הגדר את ה-settings:
   - **Name**: `iran-strike-risk-monitor`
   - **Environment**: `Node`
   - **Build Command**: `cd backend && npm install && npm run build`
   - **Start Command**: `cd backend && node dist/index.js`
   - **Root Directory**: `.` (root)

5. הוסף Environment Variables:
   - `NODE_ENV` = `production`
   - `PORT` = `4000`
   - `OPENWEATHER_API_KEY` = `368a8727b3d3711cdf91e933181130f7`
   - `NEWSAPI_KEY` = `36ba3c3b-7bad-4193-8d30-1054ae9acc26`
   - `AVIATIONSTACK_API_KEY` = `c0da84cd35719bb1930754e7f32ab9fa`
   - `OPENSKY_USERNAME` = (אופציונלי)
   - `OPENSKY_PASSWORD` = (אופציונלי)
   - `OPENSKY_CLIENT_ID` = (אופציונלי)
   - `OPENSKY_CLIENT_SECRET` = (אופציונלי)

6. לחץ על **"Create Web Service"**

7. Render יבנה ויעלה את הפרויקט אוטומטית

8. תקבל URL כמו: `https://iran-strike-risk-monitor.onrender.com`

---

## 📝 הוראות Deployment - Railway.app

### שלב 1: הכנת הפרויקט

1. ודא שיש לך Git repository (כמו ב-Render)

### שלב 2: העלאה ל-Railway

1. היכנס ל-[railway.app](https://railway.app) ויצור חשבון

2. לחץ על **"New Project"** → **"Deploy from GitHub repo"**

3. בחר את ה-repository שלך

4. Railway יזהה אוטומטית שזה Node.js project

5. הוסף Environment Variables (כמו ב-Render)

6. Railway יבנה ויעלה אוטומטית

7. תקבל URL אוטומטי

---

## 📝 הוראות Deployment - Fly.io

### שלב 1: התקנת Fly CLI

```bash
# Windows (PowerShell)
iwr https://fly.io/install.ps1 -useb | iex
```

### שלב 2: יצירת Fly App

```bash
cd backend
fly launch
```

עקוב אחרי ההוראות:
- בחר שם ל-app
- בחר region (למשל `iad` - Washington DC)
- אל תיצור Postgres/Redis (לא צריך)

### שלב 3: הגדרת Environment Variables

```bash
fly secrets set OPENWEATHER_API_KEY=368a8727b3d3711cdf91e933181130f7
fly secrets set NEWSAPI_KEY=36ba3c3b-7bad-4193-8d30-1054ae9acc26
fly secrets set AVIATIONSTACK_API_KEY=c0da84cd35719bb1930754e7f32ab9fa
fly secrets set NODE_ENV=production
```

### שלב 4: Deployment

```bash
fly deploy
```

---

## 📝 הוראות Deployment - VPS (DigitalOcean)

### שלב 1: יצירת Droplet

1. היכנס ל-[DigitalOcean](https://digitalocean.com)
2. צור Droplet חדש:
   - **Image**: Ubuntu 22.04
   - **Plan**: Basic $4/חודש (1GB RAM)
   - **Region**: בחר הכי קרוב אליך
   - **Authentication**: SSH keys (מומלץ)

### שלב 2: התחברות לשרת

```bash
ssh root@<your-server-ip>
```

### שלב 3: התקנת Node.js

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

### שלב 4: התקנת PM2

```bash
sudo npm install -g pm2
```

### שלב 5: העלאת הקוד

```bash
# על המחשב המקומי
scp -r . root@<your-server-ip>:/opt/iran-strike-risk

# על השרת
cd /opt/iran-strike-risk/backend
npm install
npm run build
```

### שלב 6: יצירת .env

```bash
cd /opt/iran-strike-risk/backend
nano .env
```

הדבק את ה-environment variables

### שלב 7: הרצה עם PM2

```bash
cd /opt/iran-strike-risk/backend
pm2 start dist/index.js --name "strike-risk"
pm2 save
pm2 startup
```

### שלב 8: הגדרת Nginx (reverse proxy)

```bash
sudo apt install nginx
sudo nano /etc/nginx/sites-available/default
```

הדבק:
```nginx
server {
    listen 80;
    server_name <your-domain-or-ip>;

    location / {
        proxy_pass http://localhost:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
sudo nginx -t
sudo systemctl restart nginx
```

### שלב 9: SSL עם Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d <your-domain>
```

---

## 🔧 שיפורים שבוצעו

### 1. שיפור Dockerfile ✅

- יצרתי `Dockerfile` חדש בשורש הפרויקט
- מעתיק את ה-backend וה-frontend נכון
- מוכן ל-production

### 2. קבצי Configuration ✅

- `render.yaml` - ל-Render.com
- `railway.json` - ל-Railway.app
- `docker-compose.prod.yml` - ל-Docker deployment

### 3. שימוש ב-Docker (אופציונלי)

אם אתה רוצה להריץ עם Docker:

```bash
# Build
docker build -t iran-strike-risk .

# Run
docker run -p 4000:4000 \
  -e OPENWEATHER_API_KEY=your_key \
  -e NEWSAPI_KEY=your_key \
  -e AVIATIONSTACK_API_KEY=your_key \
  iran-strike-risk
```

או עם docker-compose:
```bash
docker-compose -f docker-compose.prod.yml up -d
```

---

## ✅ המלצה סופית

**למתחילים**: **Render.com** - הכי פשוט, חינמי, עובד מצוין

**למתקדמים**: **Railway.app** - מהיר יותר, נוח יותר

**לחובבי שליטה**: **Fly.io** - מצוין ל-background jobs

**לחובבי VPS**: **DigitalOcean** - זול, שליטה מלאה

---

## 🐛 Troubleshooting

### הבעיה: השרת לא עולה
- בדוק שה-`PORT` מוגדר נכון
- בדוק שה-`build` עבר בהצלחה
- בדוק את ה-logs ב-Render/Railway

### הבעיה: Frontend לא נטען
- בדוק שה-path ל-frontend נכון
- בדוק שה-frontend מועתק ב-Dockerfile

### הבעיה: API לא עובד
- בדוק שה-API keys מוגדרים נכון
- בדוק את ה-CORS settings

---

## 📞 תמיכה

אם יש בעיות, בדוק:
1. Logs ב-Render/Railway/Fly dashboard
2. Environment variables
3. Build logs
