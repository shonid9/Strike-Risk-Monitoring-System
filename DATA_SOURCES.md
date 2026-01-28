# מקורות נתונים - Data Sources

## ✅ **נתונים אמיתיים - Real Data Sources**

### 1. **📰 News Intel (30% משקל)**
- **מקור**: NewsAPI.ai (Event Registry)
- **API Key**: `36ba3c3b-7bad-4193-8d30-1054ae9acc26`
- **Endpoint**: `https://eventregistry.org/api/v1/article/getArticles`
- **מה זה עושה**: 
  - מחפש מאמרים על איראן עם מילות מפתח: "strike", "attack", "military", "nuclear", "imminent"
  - מנתח טון דחיפות (urgent tone)
  - סופר מאמרים רלוונטיים
- **סטטוס**: ✅ מחובר ופעיל
- **נתונים**: אמיתיים - מאמרים אמיתיים מ-150,000+ מקורות חדשות

---

### 2. **🌤️ Weather (5% משקל)**
- **מקור**: OpenWeatherMap
- **API Key**: `368a8727b3d3711cdf91e933181130f7`
- **Endpoint**: `https://api.openweathermap.org/data/2.5/weather`
- **מיקום**: טהרן (35.6892°N, 51.3890°E)
- **מה זה עושה**:
  - בודק ראות (visibility) - חשוב לפעולות צבאיות
  - בודק כיסוי עננים (cloud cover)
  - מעריך תנאי מזג אוויר לפעולות
- **סטטוס**: ✅ מחובר ופעיל
- **נתונים**: אמיתיים - מזג אוויר בזמן אמת

---

### 3. **✈️ Civil Aviation (15% משקל)**
- **מקור**: Aviationstack
- **API Key**: `c0da84cd35719bb1930754e7f32ab9fa`
- **Endpoint**: `https://api.aviationstack.com/v1/flights`
- **מה זה עושה**:
  - מחפש טיסות פעילות לשדות תעופה באיראן:
    - IKA (טהרן)
    - SYZ (שיראז)
    - MHD (משהד)
  - סופר טיסות אזרחיות (מסנן צבאי)
  - מחשב drop ratio - אם השמיים ריקים זה סימן רע
- **סטטוס**: ✅ מחובר ופעיל
- **נתונים**: אמיתיים - טיסות בזמן אמת מ-13,000+ חברות תעופה

---

### 4. **📊 Market Odds (10% משקל)**
- **מקור**: Polymarket + PredictIt
- **API Keys**: לא נדרש (public APIs)
- **Endpoints**: 
  - `https://gamma-api.polymarket.com/markets`
  - `https://www.predictit.org/api/marketdata/all/`
- **מה זה עושה**:
  - מחפש שווקים רלוונטיים על איראן/סטרייקים עם מילות מפתח מורחבות:
    - "iran", "iranian", "tehran", "persian", "persian gulf"
    - "strike", "attack", "military", "nuclear", "missile"
    - "us strike", "american strike", "middle east", "gulf"
  - מחפש גם בשווקים סגורים (יכולים לספק סיגנל היסטורי)
  - מחשב הסתברות משוקללת לפי נפח מסחר
  - בודק נפח מסחר (volume) ונותן משקל מינימלי לכל שוק
- **שיפורים אחרונים**:
  - ✅ חיפוש מורחב עם יותר מילות מפתח
  - ✅ טיפול טוב יותר בפורמטים שונים של תגובות
  - ✅ חישוב משוקלל משופר
  - ✅ לוגים מפורטים יותר
- **סטטוס**: ✅ מחובר ומשופר - יחפש שווקים רלוונטיים
- **נתונים**: אמיתיים (אם יש שווקים רלוונטיים) / סימולציה (אם אין)

---

### 5. **🛩️ Military Tankers (10% משקל)**
- **מקור**: adsb.lol (public API)
- **Endpoints**: 
  - `https://api.adsb.lol/v2/mil` - כל המטוסים הצבאיים
  - `https://api.adsb.lol/v2/point/{lat}/{lon}/{radius}` - חיפוש לפי אזור
- **מה זה עושה**:
  - **אסטרטגיה 1**: מחפש בכל המטוסים הצבאיים ומסנן מטוסי תדלוק
  - **אסטרטגיה 2**: בודק אזור המפרץ הפרסי (26.0°N, 52.0°E) - אזור תדלוק נפוץ
  - **אסטרטגיה 3**: בודק מזרח הים התיכון (33.0°N, 35.0°E) - אזור תדלוק חלופי
  - מחפש מטוסי תדלוק: KC-135, KC-10, KC-46, KC-130, KC-767, KC-45, KC-390
  - מזהה לפי: סוג מטוס, callsign, או hex code (US military = AE prefix)
  - מסיר כפילויות לפי hex code (ICAO 24-bit address)
  - מזהה "surge" אם יש 3+ מטוסי תדלוק
- **שיפורים אחרונים**:
  - ✅ חיפוש ב-3 אזורים שונים
  - ✅ טיפול טוב יותר בפורמטים שונים של תגובות
  - ✅ זיהוי משופר של מטוסי תדלוק (גם לפי hex codes)
  - ✅ לוגים מפורטים יותר
  - ✅ confidence גבוה יותר כשיש surge
- **סטטוס**: ✅ מחובר ומשופר - יחפש ב-3 אזורים
- **נתונים**: אמיתיים (אם ה-API עובד) / סימולציה (אם נכשל)

---

## ❌ **סימולציה בלבד - Simulation Only**

### 6. **🍕 Pentagon Pizza (10% משקל)**
- **מקור**: אין API אמיתי
- **מה זה עושה**: 
  - מדמה דפוסי משלוח פיצה באזור הפנטגון
  - רעיון: אם יש הרבה משלוחים בלילה = פעילות מוגברת
- **סטטוס**: ❌ סימולציה בלבד
- **נתונים**: סימולציה - אין API אמיתי למשלוחי פיצה

---

### 7. **📈 Public Interest (20% משקל)**
- **מקור**: Wikipedia API (חינמי) + NewsAPI.ai (לסיגנל sentiment)
- **Endpoints**: 
  - `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/`
- **מה זה עושה**: 
  - **Wikipedia Pageviews**: מחפש צפיות בדפי ויקיפדיה רלוונטיים:
    - "Iran"
    - "Iran–United_States_relations"
    - "Iranian_Revolutionary_Guards"
    - "Nuclear_program_of_Iran"
    - "Tehran"
  - מחשב spike - השוואה בין היום לשבוע שעבר
  - **GDELT Sentiment**: משתמש ב-NewsAPI.ai כסיגנל proxy (GDELT API דורש הרשמה מורכבת)
  - מחשב confidence ו-intensity לפי הנתונים האמיתיים
- **שיפורים אחרונים**:
  - ✅ חיבור ל-Wikipedia API - נתונים אמיתיים על צפיות
  - ✅ חישוב spike אמיתי (היום vs שבוע שעבר)
  - ✅ baseline דינמי - לומד מהנתונים
  - ✅ fallback לסימולציה אם ה-API נכשל
- **סטטוס**: ✅ מחובר - Wikipedia עובד, GDELT = proxy דרך NewsAPI
- **נתונים**: אמיתיים (Wikipedia) + proxy (GDELT דרך NewsAPI) / סימולציה (fallback)

---

## 📊 סיכום

### נתונים אמיתיים (4 connectors):
1. ✅ **News Intel** - NewsAPI.ai
2. ✅ **Weather** - OpenWeatherMap  
3. ✅ **Civil Aviation** - Aviationstack
4. ✅ **Public Interest** - Wikipedia API (חלקי - Wikipedia אמיתי, GDELT = proxy)

### מחובר ומשופר (2 connectors):
5. ✅ **Markets** - Polymarket/PredictIt (מחובר, מחפש שווקים רלוונטיים)
6. ✅ **Military Tankers** - adsb.lol (מחובר, מחפש ב-3 אזורים)

### סימולציה בלבד (1 connector):
7. ❌ **Pentagon Pizza** - אין API אמיתי

---

## 🎯 כיסוי נתונים אמיתיים

**כרגע**: ~70% נתונים אמיתיים (guaranteed)
- News (30%) ✅
- Weather (5%) ✅
- Aviation (15%) ✅
- Public Interest (20%) ✅ (Wikipedia אמיתי, GDELT = proxy)
- **סה"כ**: 70% מהמשקלים

**פוטנציאל**: ~90% נתונים אמיתיים (אם כל ה-APIs עובדים)
- + Markets (10%) ✅ (מחובר, תלוי אם יש שווקים רלוונטיים)
- + Tankers (10%) ✅ (מחובר, תלוי בזמינות adsb.lol)
- **סה"כ**: 90% מהמשקלים

**סימולציה**: ~10% מהמשקלים
- Pizza (10%) ❌ (אין API אמיתי)

---

## 🔍 איך לבדוק מה עובד

1. **בדוק לוגי השרת** - חפש:
   - `[NewsConnector] Real data: X articles...` ✅
   - `[WeatherConnector] Real data: ...` ✅
   - `[AviationConnector] Real data (Aviationstack): X flights...` ✅
   - `[MarketsConnector] Found X relevant markets...` ⚠️
   - `API failed, using simulation` ❌

2. **בדוק Frontend**:
   - "✅ LIVE DATA" = נתונים אמיתיים
   - "⚠️ SIMULATION MODE" = סימולציה

3. **בדוק `/api/status`**:
   ```bash
   http://localhost:4000/api/status
   ```
