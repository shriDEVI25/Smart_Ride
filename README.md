# 🚗 Smart Ride — Real-Time Ride Booking Platform

A full-stack ride-booking web application built with **Python Flask** and **Vanilla JavaScript**, featuring real-time trip management, interactive maps, secure PIN verification, payment integration, and a Women-Only (Pink Ride) safety option.

> **Status:** Fully tested and working. All known bugs fixed. SQLite is used as the primary local database with optional Supabase sync.

---

## 📋 Table of Contents

- [Features](#-features)
- [Tech Stack](#-tech-stack)
- [Project Structure](#-project-structure)
- [Prerequisites & Tools](#-prerequisites--tools)
- [Installation & Setup](#-installation--setup)
- [Running the App](#-running-the-app)
- [How It Works — Full Flow](#-how-it-works--full-flow)
- [API Endpoints](#-api-endpoints)
- [Database Schema](#-database-schema)
- [Pages & UI](#-pages--ui)
- [Key Design Decisions](#-key-design-decisions)
- [Known Bugs Fixed](#-known-bugs-fixed)
- [Production Checklist](#-production-checklist)
- [All Dependencies](#-all-dependencies-at-a-glance)

---

## ✨ Features

### 🧑‍💼 Rider Side
| Feature | Details |
|---|---|
| Register / Login | Full name, email, password, gender, role |
| Book a Ride | Type location names — auto-geocoded via Nominatim |
| Detect Location | One-click GPS + reverse geocode → shows place name |
| Fare Calculator | Haversine distance × per-vehicle rate (Bike / Auto / Car) |
| Interactive Map | Leaflet.js — green pickup marker, red drop marker, route line |
| PIN System | Unique 4-digit PIN shown after booking; share with driver |
| Pink Ride 🌸 | Toggle to request a verified female driver only |
| Payment | Choose UPI / Card / Cash at booking; pay after ride via modal |
| Live Status | Polls trip status every 3 s — shows driver accepted, in-progress, completed |

### 🧑‍✈️ Driver Side
| Feature | Details |
|---|---|
| Register / Login | With gender selection (used for Pink Ride filtering) |
| Available Trips | Auto-refreshing feed of open trips; Pink Ride trips hidden from male drivers |
| Accept Ride | Sees full trip card — customer name, fare, distance, route map |
| PIN Verification | Enter rider's 4-digit PIN to officially start the ride |
| Complete Ride | Marks trip done; payment badge updates live |
| Multi-Ride Support | After completing a ride, driver can immediately accept the next one |

### 🔒 Auth & Session
- Local session stored in `localStorage` (UUID-based, persists across page refreshes)
- Role-aware redirect after login → `/rider` or `/driver`
- Gender stored in session and sent with every trip-fetch for Pink Ride filtering

### 🗄️ Database — Hybrid Mode
- **Primary (local):** SQLite (`smart_ride.db`) — always used, auto-created on first run
- **Optional sync:** Supabase remote writes attempted when DNS is reachable
- **No data loss:** If Supabase is offline/unreachable, everything works 100% from SQLite

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3.9+, Flask |
| **Database (Primary)** | SQLite 3 (built-in, zero setup) |
| **Database (Optional Sync)** | Supabase (PostgreSQL) |
| **Frontend** | HTML5, CSS3, Vanilla JavaScript ES6+ |
| **Maps** | Leaflet.js 1.9.4 (CDN, no install) |
| **Geocoding** | OpenStreetMap Nominatim — free, no API key needed |
| **Reverse Geocoding** | Nominatim `/reverse` — GPS coords → place name |
| **Geolocation** | Browser `navigator.geolocation` API |
| **Fonts** | Google Fonts — Plus Jakarta Sans |
| **Icons** | Unicode Emoji (no icon library needed) |
| **Environment** | python-dotenv (`.env` file) |
| **HTTP (backend)** | Python `requests` |
| **HTTP (frontend)** | Browser `fetch()` |
| **Error Handling** | Flask `@app.errorhandler` → JSON for 404 / 405 / 500 |
| **CORS** | Flask `@app.after_request` headers |

---

## 📁 Project Structure

```
smart-ride/
│
├── app.py                  # Flask app — all routes, API endpoints, fare logic
├── supabase_client.py      # HybridClient: SQLite primary + optional Supabase sync
├── requirements.txt        # Python pip dependencies
├── .env                    # Supabase credentials (optional)
├── .gitignore              # Git ignore rules
├── smart_ride.db           # SQLite database (auto-created on first run)
├── README.md               # This file
│
├── templates/              # Jinja2 HTML templates
│   ├── index.html          # Landing page — Rider or Driver portal selection
│   ├── login.html          # Login form
│   ├── register.html       # Registration form (name, email, password, role, gender)
│   ├── rider.html          # Rider dashboard — book, map, fare, PIN, payment
│   └── driver.html         # Driver dashboard — trips feed, map, PIN verify, complete
│
└── static/
    ├── css/
    │   └── style.css       # Dark-theme design system (all pages unified)
    └── js/
        ├── auth.js         # Session manager — login, register, logout, localStorage
        ├── rider.js        # Rider logic: geocode, fare, book, poll, payment, map
        └── driver.js       # Driver logic: fetch trips, accept, PIN, complete, map
```

---

## 🔧 Prerequisites & Tools

### ✅ Required Software

| Tool | Version | Download |
|---|---|---|
| **Python** | 3.9 or higher | [python.org/downloads](https://www.python.org/downloads/) |
| **pip** | Comes with Python | — |
| **Git** | Any recent version | [git-scm.com](https://git-scm.com/downloads) |
| **Web Browser** | Chrome 90+ / Firefox 88+ / Edge 90+ | — |

> No Node.js, no npm, no build tools required. Everything runs directly.

### ✅ Recommended VS Code Extensions

| Extension | ID | Purpose |
|---|---|---|
| Python | `ms-python.python` | IntelliSense, linting, debugging |
| Pylance | `ms-python.vscode-pylance` | Fast type checking |
| SQLite Viewer | `qwtel.sqlite-viewer` | Browse `smart_ride.db` visually |
| REST Client | `humao.rest-client` | Test API endpoints from VS Code |
| HTML CSS Support | `ecmel.vscode-html-css` | CSS autocomplete in HTML |
| JavaScript Snippets | `xabikos.javascriptsnippets` | ES6 snippets |
| Prettier | `esbenp.prettier-vscode` | Auto-format HTML / CSS / JS |
| GitLens | `eamodio.gitlens` | Git history and blame |

---

## 🚀 Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/smart-ride.git
cd smart-ride
```

### 2. Create a Virtual Environment

```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS / Linux
python3 -m venv venv
source venv/bin/activate
```

### 3. Install Python Dependencies

```bash
pip install -r requirements.txt
```

**`requirements.txt` contents:**
```
flask
supabase
python-dotenv
```

### 4. Configure Environment (Optional)

Create a `.env` file in the project root if you want Supabase sync:

```env
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_KEY=your_supabase_anon_key
```

> **If you skip this step**, the app works fully with local SQLite — no Supabase account needed.

### 5. (Optional) Supabase Table Setup

If you want remote Supabase sync, run this in the Supabase SQL Editor:

```sql
-- Profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name TEXT,
  email     TEXT UNIQUE,
  password  TEXT,
  role      TEXT,
  gender    TEXT DEFAULT 'other'
);

-- Trips table
CREATE TABLE IF NOT EXISTS trips (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  rider_id          TEXT,
  driver_id         TEXT,
  customer_name     TEXT,
  customer_email    TEXT,
  vehicle_type      TEXT,
  fare              REAL,
  distance_km       REAL,
  pickup_lat        REAL,
  pickup_lng        REAL,
  drop_lat          REAL,
  drop_lng          REAL,
  pin               TEXT,
  status            TEXT DEFAULT 'requested',
  women_driver_only BOOLEAN DEFAULT FALSE,
  payment_method    TEXT DEFAULT 'cash',
  payment_status    TEXT DEFAULT 'pending'
);
```

> **SQLite schema is created automatically on first run** — no manual steps needed for local use.

---

## ▶️ Running the App

```bash
# Activate your virtual environment (if not already)
venv\Scripts\activate        # Windows
source venv/bin/activate     # macOS / Linux

# Start Flask
python app.py
```

Open your browser: **[http://localhost:5000](http://localhost:5000)**

---

## 🔄 How It Works — Full Flow

```
Rider                          Server                         Driver
  │                               │                               │
  ├─ Register / Login ───────────►│                               │
  ├─ Type pickup + drop location  │                               │
  ├─ Click Calculate Fare ────────►│ Nominatim geocodes names      │
  │                               │ Haversine calculates distance │
  │◄─ Fare + distance returned ───│                               │
  ├─ Select payment, Pink Ride    │                               │
  ├─ Click Book Ride ─────────────►│ Saves trip to SQLite          │
  │◄─ 4-digit PIN shown ──────────│                               │
  │  (polls /api/trip-status)     │          ◄── Auto-refreshes ──┤
  │                               │◄─ Accept Ride ────────────────┤
  │◄─ "Driver accepted!" ─────────│                               │
  │  Share PIN with driver ───────┼──────────────── Enters PIN ──►│
  │◄─ "Trip in progress" ─────────│◄─ PIN verified, ride starts ──│
  │◄─ "Trip completed!" ──────────│◄─ Complete Ride ───────────────┤
  ├─ Payment modal appears        │                               │
  ├─ Pay Now ─────────────────────►│ Updates payment_status        │
  │◄─ "Payment received!" ────────│──────────────► Badge updates ─┤
```

---

## 🌐 API Endpoints

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `GET` | `/` | — | Landing page |
| `GET` | `/login` | — | Login page |
| `GET` | `/register` | — | Register page |
| `GET` | `/rider` | — | Rider dashboard |
| `GET` | `/driver` | — | Driver dashboard |
| `GET` | `/api/health` | — | Server health check |
| `POST` | `/api/register` | — | Create new account |
| `POST` | `/api/login` | — | Authenticate and get session |
| `POST` | `/api/calculate-fare` | — | Calculate fare from coordinates |
| `POST` | `/api/book-ride` | Rider | Book a new trip |
| `GET` | `/api/available-trips` | Driver | List open trips (gender-filtered) |
| `POST` | `/api/accept-ride` | Driver | Accept a trip |
| `POST` | `/api/verify-pin` | Driver | Verify PIN to start ride |
| `POST` | `/api/complete-ride` | Driver | Mark trip as completed |
| `GET` | `/api/trip-status/<id>` | Rider | Poll trip status |
| `POST` | `/api/process-payment` | Rider | Submit payment |

### Example Request/Response

**POST `/api/book-ride`**
```json
// Request
{
  "rider_id": "uuid-here",
  "vehicle_type": "auto",
  "fare": 91.42,
  "distance_km": 5.12,
  "pickup_lat": 12.9352,
  "pickup_lng": 77.6245,
  "drop_lat": 12.9784,
  "drop_lng": 77.6408,
  "women_driver_only": false,
  "payment_method": "upi",
  "customer_name": "Priya Sharma",
  "customer_email": "priya@example.com"
}

// Response
{
  "success": true,
  "trip_id": 12,
  "pin": "4199",
  "message": "Ride requested successfully"
}
```

---

## 🗃️ Database Schema

### `profiles` table

| Column | Type | Constraint | Description |
|---|---|---|---|
| `id` | TEXT / UUID | PRIMARY KEY | Auto-generated unique ID |
| `full_name` | TEXT | NOT NULL | User's display name |
| `email` | TEXT | UNIQUE, NOT NULL | Login email |
| `password` | TEXT | NOT NULL | Password (plain — hash in production) |
| `role` | TEXT | NOT NULL | `'rider'` or `'driver'` |
| `gender` | TEXT | DEFAULT `'other'` | `'female'`, `'male'`, `'other'` |

### `trips` table

| Column | Type | Default | Description |
|---|---|---|---|
| `id` | INTEGER | AUTOINCREMENT | Trip ID |
| `rider_id` | TEXT | — | Rider's profile UUID |
| `driver_id` | TEXT | NULL | Set when driver accepts |
| `customer_name` | TEXT | — | Rider's name (stored at booking) |
| `customer_email` | TEXT | — | Rider's email |
| `vehicle_type` | TEXT | — | `'bike'`, `'auto'`, `'car'` |
| `fare` | REAL | — | Estimated fare in ₹ |
| `distance_km` | REAL | — | Haversine distance |
| `pickup_lat` / `pickup_lng` | REAL | — | Pickup GPS coordinates |
| `drop_lat` / `drop_lng` | REAL | — | Drop GPS coordinates |
| `pin` | TEXT | — | 4-digit random security PIN |
| `status` | TEXT | `'requested'` | `requested → accepted → in_progress → completed` |
| `women_driver_only` | BOOLEAN | `FALSE` | Pink Ride flag |
| `payment_method` | TEXT | `'cash'` | `'upi'`, `'card'`, `'cash'` |
| `payment_status` | TEXT | `'pending'` | `'pending'` → `'completed'` |

---

## 📄 Pages & UI

| Page | URL | What You Can Do |
|---|---|---|
| **Landing** | `/` | Choose Rider or Driver mode |
| **Login** | `/login` | Sign in with email + password |
| **Register** | `/register` | Create account — select role + gender |
| **Rider Dashboard** | `/rider` | Type locations, calculate fare, book, track, pay |
| **Driver Dashboard** | `/driver` | Go online, see trips, accept, verify PIN, complete |

---

## 💡 Key Design Decisions

| Decision | Reason |
|---|---|
| **SQLite as primary DB** | Supabase DNS is intermittently unreachable; SQLite guarantees the app always works |
| **HybridClient write-both** | Writes go to SQLite (authoritative) + attempts Supabase sync; reads always from SQLite |
| **Nominatim geocoding** | Free, no API key, no account — converts typed location names to lat/lng |
| **Hidden lat/lng inputs** | User sees text fields; JS resolves to coordinates and stores in hidden `<input>` — backend APIs unchanged |
| **One-shot accepted alert** | `acceptedAlertShown` flag prevents the "Driver accepted" alert firing every 3 seconds |
| **Book Ride re-enabled** | After trip completes, the Book Ride button is re-enabled so rider can book again |
| **Gender-based filtering** | Pink Ride trips excluded server-side for non-female drivers — logic in `/api/available-trips` |
| **Haversine with clamp** | `a` clamped to `[0, 1]` prevents `math.sqrt` domain error when coords are identical |
| **CORS headers** | `@app.after_request` adds headers so fetch() never fails due to browser CORS policy |
| **JSON error handlers** | 404 / 405 / 500 return JSON instead of HTML so the frontend can handle errors gracefully |
| **`inputmode=numeric` on PIN** | Mobile keyboards show numeric keypad; `oninput` strips non-digits client-side |

---

## 🐛 Known Bugs Fixed

All bugs listed below have been identified and fixed.

### rider.js
| Bug | Symptom | Fix |
|---|---|---|
| Undeclared globals | `ReferenceError` on `currentVehicleType`, `calculatedFare` | Added `let` declarations at top |
| Summary card always visible | Showed empty `₹0.00` on page load | Hidden on `DOMContentLoaded`, shown after fare calc |
| Alert spam | "Driver accepted!" fired every 3 s during polling | `acceptedAlertShown` flag — fires exactly once |
| Book button stuck | "✅ Ride Requested" disabled permanently after a trip | Re-enabled with `🚀 Book Ride` on `completed` status |

### driver.js
| Bug | Symptom | Fix |
|---|---|---|
| Undeclared globals | `ReferenceError` on `isOnline`, `activeTrip` | Added `let isOnline = true; let activeTrip = null;` |
| Map stuck on old location | 2nd ride map stayed centered on 1st pickup | Added `driverMap.setView([pLat, pLng], 13)` on reuse |

### driver.html
| Bug | Symptom | Fix |
|---|---|---|
| Pink banner always visible | `display:none` overridden by later `display:flex` in same style string | Removed duplicate `display:flex` |
| PIN accepts letters | No keyboard restriction | Added `inputmode="numeric"`, `pattern`, `oninput` strip |

### app.py
| Bug | Symptom | Fix |
|---|---|---|
| No CORS headers | Fetch could fail in some browsers/environments | Added `@app.after_request` CORS hook |
| HTML on API errors | 404/405/500 returned HTML error pages to JS | Added `@app.errorhandler` → JSON for 404, 405, 500 |
| Haversine domain error | `math.sqrt` crashed on identical coordinates | Clamped `a = max(0.0, min(1.0, a))` |

### supabase_client.py
| Bug | Symptom | Fix |
|---|---|---|
| Split-brain reads | Data written to SQLite but read from empty Supabase remote | SELECTs always read from SQLite; remote only receives async writes |

---

## ⚠️ Production Checklist

Before deploying to a live server:

- [ ] 🔐 **Hash passwords** — use `bcrypt` or `werkzeug.security.generate_password_hash`
- [ ] 🔑 **Replace localStorage sessions** — use Flask sessions with a secret key or JWT tokens
- [ ] 🗄️ **Use PostgreSQL** — replace SQLite with Supabase or any Postgres DB in production
- [ ] 🌐 **Use HTTPS** — never serve over HTTP in production
- [ ] 🗺️ **Switch to Google Maps API** — Nominatim has a 1 req/sec rate limit; not for production scale
- [ ] 🔒 **Move `.env` to server env vars** — never commit credentials to Git
- [ ] ⚡ **Use a production WSGI server** — replace `flask run` with Gunicorn or uWSGI
- [ ] 🔄 **Replace polling with WebSockets** — use `flask-socketio` for true real-time push

---

## 📦 All Dependencies at a Glance

### Python (install via pip)
```
flask          — Web framework and routing
supabase       — Supabase Python client (optional remote sync)
python-dotenv  — Load .env file into os.environ
```

### JavaScript (CDN — no install required)
```
Leaflet.js 1.9.4           — Interactive maps (leaflet.com)
OpenStreetMap Nominatim    — Free geocoding API (no key needed)
Google Fonts               — Plus Jakarta Sans typeface
```

### Browser APIs (built-in — no install)
```
navigator.geolocation      — Detect current GPS coordinates
localStorage               — Persist session (user ID, name, role, gender)
fetch()                    — All HTTP requests to Flask API
setInterval()              — Trip status polling every 3–5 seconds
```

### Fare Rates (built into app.py)
```
Bike  — ₹20 base + ₹8/km
Auto  — ₹30 base + ₹12/km
Car   — ₹50 base + ₹18/km
```

---

> Built with ❤️ — **Smart Ride** | Ride smarter, ride safer.
