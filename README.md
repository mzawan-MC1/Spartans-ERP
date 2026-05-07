# Spartans Gym Management System

A comprehensive gym/fitness center management system with multi-location support, member management, class scheduling, sales tracking, and a CMS-driven public website.

## Quick Start (Local Development)

### Prerequisites

- **Python** 3.10+
- **Node.js** 18+ with **Yarn** (`npm install -g yarn`)
- **MongoDB** 6.0+ (local, Docker, or Atlas)

### 1. Clone & Setup

```bash
git clone <your-repo-url>
cd spartans-gym
```

### 2. Backend Setup

```bash
cd backend

# Create Python virtual environment
python -m venv venv
source venv/bin/activate   # Windows: venv\Scripts\activate

# Install dependencies
pip install -r requirements.local.txt

# Create environment file
cp .env.example .env
```

Edit `backend/.env` — the defaults work for local development:

| Variable | Local Default | Description |
|----------|---------------|-------------|
| `MONGO_URL` | `mongodb://localhost:27017` | MongoDB connection |
| `DB_NAME` | `spartans_gym` | Database name |
| `JWT_SECRET` | *(change this)* | Any random string for JWT signing |
| `CORS_ORIGINS` | `http://localhost:3010` | Frontend origin(s), comma-separated |
| `COOKIE_SECURE` | `false` | **Must be `false` for HTTP localhost** |
| `ENVIRONMENT` | `local` | Set to `production` for live HTTPS |
| `UPLOAD_DIR` | `./uploads` | Where uploaded files are stored |
| `GOOGLE_OAUTH_ENABLED` | `false` | Disable Google OAuth for local dev |

### 3. Frontend Setup

```bash
cd ../frontend

# Install dependencies
yarn install

# Create environment file
cp .env.example .env
```

Edit `frontend/.env`:

| Variable | Local Default | Description |
|----------|---------------|-------------|
| `REACT_APP_BACKEND_URL` | `http://localhost:8000` | Backend API URL (no trailing slash) |
| `REACT_APP_GOOGLE_OAUTH_ENABLED` | `false` | Hide Google login button |
| `PORT` | `3010` | Frontend dev server port |
| `SKIP_PREFLIGHT_CHECK` | `true` | Skip CRA preflight checks (dev only) |

### 4. Start MongoDB

**Option A: Local Install**
```bash
# macOS
brew services start mongodb-community

# Ubuntu/Debian
sudo systemctl start mongod

# Windows
net start MongoDB
```

**Option B: Docker (easiest)**
```bash
docker run -d -p 27017:27017 --name spartans-mongo mongo:6.0
```

**Option C: MongoDB Atlas (Cloud)**
- Create a free cluster at https://cloud.mongodb.com
- Get the connection string and set `MONGO_URL` in `backend/.env`

### 5. Run the Application

**Terminal 1 — Backend:**
```bash
cd backend
source venv/bin/activate
uvicorn server:app --host 0.0.0.0 --port 8000 --reload
```

**Terminal 2 — Frontend:**
```bash
cd frontend
yarn start
```

### 6. Access the Application

| URL | Description |
|-----|-------------|
| http://localhost:3010 | Frontend (React) |
| http://localhost:8000/api | Backend API |
| http://localhost:8000/docs | Swagger API Docs |

### 7. Load Demo Data

Click **"Load Demo Data"** on the login page, or run:

```bash
curl -X POST http://localhost:8000/api/seed
```

**Demo Credentials:**

| Role | Email | Password |
|------|-------|----------|
| Owner | `owner@spartans.com` | `Spartans2024!` |
| Manager | `manager.sharjah1@spartans.ae` | `Manager2024!` |

---

## Docker Compose (Alternative)

Run the entire stack with a single command:

```bash
# 1. Copy env files
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env

# 2. Edit backend/.env: set MONGO_URL=mongodb://mongodb:27017
# 3. Edit frontend/.env: set REACT_APP_BACKEND_URL=http://localhost:8000

# 4. Start everything
docker compose up --build
```

Then open http://localhost:3010 and load demo data.

---

## Project Structure

```
spartans-gym/
├── backend/
│   ├── server.py              # Main FastAPI app, auth, locations, seed
│   ├── admin_features.py      # Owner features: SEO, blogs, email settings
│   ├── members.py             # Member CRUD, memberships, payments, invoices
│   ├── section2.py            # Programs, schedules, instructors, attendance
│   ├── section3.py            # Customer portal APIs
│   ├── section4.py            # Staff, HR, payroll, finance
│   ├── section5_admin.py      # CMS admin (disciplines, pricing, pages, FAQs)
│   ├── section5_public.py     # Public website APIs (also Google Reviews, gallery)
│   ├── sales.py               # Sales pipeline (teams, leads, revenue)
│   ├── user_management.py     # Admin user CRUD
│   ├── rbac.py                # Roles & permissions
│   ├── member_import.py       # CSV import for members
│   ├── requirements.local.txt # Python dependencies (for local dev)
│   ├── requirements.txt       # Full frozen deps (pip freeze)
│   ├── .env.example           # Environment template
│   ├── Dockerfile
│   ├── uploads/               # Uploaded files directory
│   └── tests/                 # pytest test files
├── frontend/
│   ├── src/
│   │   ├── App.js             # React Router, all routes
│   │   ├── components/        # Shared components
│   │   │   ├── ui/            # Shadcn/UI component library
│   │   │   ├── Sidebar.jsx    # Manager/owner sidebar
│   │   │   ├── PublicLayout.jsx # Public site header/footer
│   │   │   ├── SEOHead.jsx    # Dynamic SEO <head> injection
│   │   │   └── AuthCallback.jsx # OAuth callback handler
│   │   ├── pages/
│   │   │   ├── LoginPage.jsx
│   │   │   ├── DashboardPage.jsx  # Owner dashboard
│   │   │   ├── manager/       # Manager-side pages
│   │   │   ├── owner/         # Owner-only pages (CMS, SEO, analytics)
│   │   │   ├── public/        # Public website pages
│   │   │   ├── customer/      # Customer portal
│   │   │   └── member/        # Member portal
│   │   ├── lib/
│   │   │   └── api.js         # Axios API client (all endpoints)
│   │   └── i18n/              # Translation files (en, ar)
│   ├── public/
│   ├── package.json
│   ├── tailwind.config.js
│   ├── craco.config.js        # Build config with path aliases
│   ├── .env.example           # Frontend env template
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## Configuration Reference

### Backend Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `MONGO_URL` | Yes | — | MongoDB connection string |
| `DB_NAME` | Yes | — | Database name |
| `JWT_SECRET` | Yes | — | JWT signing secret |
| `CORS_ORIGINS` | No | `*` | Comma-separated allowed origins |
| `COOKIE_SECURE` | No | `true` | `false` for local HTTP, `true` for HTTPS |
| `COOKIE_SAMESITE` | No | auto | `lax` for local, `none` for cross-origin HTTPS |
| `UPLOAD_DIR` | No | `./uploads` | File upload storage path |
| `GOOGLE_OAUTH_ENABLED` | No | `false` | Enable Google OAuth login |
| `GOOGLE_OAUTH_SESSION_URL` | No | — | OAuth session verification URL |
| `JWT_EXPIRY_DAYS` | No | `7` | Token expiry in days |
| `HOST` | No | `0.0.0.0` | Server bind address |
| `PORT` | No | `8000` | Server port |

### Frontend Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `REACT_APP_BACKEND_URL` | Yes | — | Backend URL (e.g., `http://localhost:8000`) |
| `REACT_APP_GOOGLE_OAUTH_ENABLED` | No | `false` | Show Google login button |
| `REACT_APP_GOOGLE_OAUTH_URL` | No | — | Google OAuth provider URL |
| `REACT_APP_DEFAULT_LANGUAGE` | No | `en` | Default language (en/ar) |

---

## Authentication

### User Roles

| Role | Access |
|------|--------|
| `OWNER` | Full system access across all locations |
| `LOCATION_MANAGER` | Single location management |
| `RECEPTIONIST` | Check-in, basic operations |
| `CUSTOMER` | Customer portal (self-service) |
| `MEMBER` | Member portal |

### API Authentication

All protected endpoints require a JWT in the `Authorization` header:

```bash
# Login to get a token
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"owner@spartans.com","password":"Spartans2024!"}' \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['token'])")

# Use the token
curl -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/auth/me
```

---

## Key Features

### Owner Dashboard
- Multi-location management
- Analytics & revenue reports
- User & role management

### Manager Dashboard
- Member registration (with payment receipt upload)
- Membership & payment tracking (PDF invoices)
- Program & schedule management
- Staff & payroll management
- Sales pipeline (teams, leads)
- Agreement management

### CMS (Owner)
- Public site content (disciplines, pricing, FAQs, pages)
- Header & footer configuration
- Image gallery management
- Google Reviews integration (requires Google Places API key — configured in CMS)
- Blog management
- SEO settings (per-page meta, global code snippets)
- Email settings (SMTP configuration)

### Public Website
- Dynamic landing page with CMS-driven content
- Disciplines, pricing, branches, FAQ pages
- Blog with SEO support
- Contact form
- Member self-registration

### Customer/Member Portal
- Class browsing & booking
- Attendance history
- Profile management

---

## Google Reviews Setup (Optional)

The landing page can display Google Reviews. To enable:

1. Get a **Google Places API Key** from [Google Cloud Console](https://console.cloud.google.com/apis/credentials)
2. Enable the **Places API** in your Google Cloud project
3. Find your gym's **Place ID** using [Place ID Finder](https://developers.google.com/maps/documentation/places/web-service/place-id)
4. Log in as Owner → CMS → Reviews tab → Enter the Place ID and API key

---

## Database Collections

| Collection | Description |
|------------|-------------|
| `users` | System users (owners, managers, staff) |
| `members` | Gym members |
| `memberships` | Member subscriptions |
| `payments` | Payment records |
| `staff` | Staff employment records |
| `instructors` | Instructors |
| `programs` | Training programs |
| `class_schedules` | Weekly timetables |
| `class_sessions` | Individual class sessions |
| `bookings` | Class bookings |
| `attendance_records` | Attendance tracking |
| `locations` | Gym branches |
| `salesTeams` | Sales teams |
| `salesLeads` | Sales leads |
| `site_settings` | CMS configuration |
| `cms_disciplines` | Public site disciplines |
| `cms_pricing` | Public pricing plans |
| `blogs` | Blog posts |
| `seo_settings` | Per-page SEO settings |
| `global_seo_settings` | Global SEO code snippets |
| `email_settings` | SMTP & email template config |
| `agreements` | Agreement templates |

---

## Development

### Running Tests

```bash
cd backend
source venv/bin/activate
pytest tests/ -v
```

### Code Formatting

```bash
# Backend
cd backend && black . && flake8 .

# Frontend
cd frontend && yarn lint
```

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 19, Tailwind CSS, Shadcn/UI, React Router 7, Axios, Recharts, i18next |
| **Backend** | FastAPI, Motor (async MongoDB), Pydantic, PyJWT, Bcrypt |
| **Database** | MongoDB 6.0 |
| **PDF Gen** | ReportLab (invoice generation) |
| **SEO** | react-helmet-async |

---

## License

[Your License Here]
