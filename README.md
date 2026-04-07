<div align="center">

# 🚨 CivRescue Operations

**AI-Powered Emergency Response & Volunteer Dispatch Platform**

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/tusharCodeLab/Civrescue)
[![Live Demo](https://img.shields.io/badge/Live-civrescueoperation.vercel.app-blue?style=for-the-badge)](https://civrescueoperation.vercel.app)

</div>

---

## 📋 Overview

CivRescue Operations is a full-stack emergency response management platform that enables **real-time incident reporting**, **AI-powered triage**, and **autonomous volunteer dispatch** for disaster scenarios. Citizens can report emergencies via web portal, SMS, or phone call — and the system automatically analyzes severity, assigns the nearest available volunteer, and tracks response in real time.

---

## ✨ Features

### 🆘 Incident Reporting
- **Web Portal** — Citizens report emergencies with location, type, and details
- **SMS Ingestion** — Twilio webhook receives SMS, AI extracts structured data
- **Voice Call Pipeline** — Multi-step IVR collects location, type, people count, and details via speech-to-text

### 🤖 AI-Powered Triage
- **Claude AI Integration** — Anthropic Claude analyzes reports and assigns severity (1–5)
- **Auto-Classification** — Emergency type, affected count, and tactical recommendations extracted automatically
- **Smart Dispatch** — AI recommends volunteer count and required skill sets based on severity

### 🗺️ Real-Time Tracking
- **Live Volunteer Map** — Leaflet-based map shows volunteer GPS positions in real time
- **Victim Tracking** — Citizens can track assigned volunteer's ETA and distance
- **Geolocation Assignment** — Nearest available volunteer auto-assigned using Haversine distance

### 👥 Role-Based Dashboards
- **Admin Dashboard** — Full incident overview, volunteer roster, analytics, and manual assignment
- **Volunteer Dashboard** — Active assignments, navigation map, status toggle, pre-arrival checklist
- **Citizen Portal** — Emergency reporting, incident tracking, live stats

### 📱 Notifications
- **In-App Notifications** — Real-time bell notifications for assignments and updates
- **SMS Alerts** — Twilio sends dispatch SMS to volunteers and confirmation to reporters
- **Voice Callbacks** — System calls citizens back so they don't need ISD calling

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS, Shadcn UI |
| **Backend** | Node.js, Express.js (Vercel Serverless Functions) |
| **Database** | MongoDB Atlas (Mongoose ODM) |
| **AI** | Anthropic Claude API (Haiku + Sonnet) |
| **Communications** | Twilio (SMS + Voice + IVR) |
| **Maps** | Leaflet.js, React-Leaflet |
| **Auth** | JWT + bcrypt |
| **Deployment** | Vercel (Frontend + Serverless Backend) |

---

## 📁 Project Structure

```
civrescue-operations/
├── api/
│   └── index.js              # Vercel serverless entry point
├── backend/
│   ├── server.js             # Express app (API routes, AI, Twilio)
│   ├── models/               # Mongoose schemas
│   │   ├── Incident.js
│   │   ├── Volunteer.js
│   │   ├── User.js
│   │   └── Notification.js
│   └── package.json
├── src/
│   ├── components/
│   │   ├── civrescue/        # Domain-specific components
│   │   ├── ui/               # Shadcn UI components
│   │   └── NotificationBell.tsx
│   ├── pages/
│   │   ├── AdminDashboard.tsx
│   │   ├── VolunteerDashboard.tsx
│   │   ├── CitizenPortal.tsx
│   │   ├── EmergencyReport.tsx
│   │   ├── Login.tsx
│   │   ├── Register.tsx
│   │   ├── TrackingMap.tsx
│   │   ├── VictimTrack.tsx
│   │   └── ...
│   ├── lib/
│   │   ├── civrescue-api.ts  # API client
│   │   └── civrescue.ts      # Types & helpers
│   └── App.tsx               # Router
├── vercel.json               # Vercel deployment config
├── .env.example              # Environment variable template
└── package.json
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** 18+
- **MongoDB Atlas** account
- **Twilio** account (for SMS/voice features)
- **Anthropic** API key (for AI triage)

### 1. Clone the Repository

```bash
git clone https://github.com/tusharCodeLab/Civrescue.git
cd Civrescue
```

### 2. Install Dependencies

```bash
npm install
cd backend && npm install && cd ..
```

### 3. Configure Environment Variables

Copy the example file and fill in your credentials:

```bash
cp .env.example .env
```

```env
MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/civrescuedelta
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_PHONE_NUMBER=+1xxxxxxxxxx
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxx
JWT_SECRET=your_long_random_secret
```

### 4. Run Locally

Start both frontend and backend:

```bash
# Terminal 1 — Backend
cd backend && node server.js

# Terminal 2 — Frontend
npm run dev
```

Frontend runs on `http://localhost:8080` with API calls proxied to `http://localhost:3000`.

### 5. Demo Credentials

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@civrescue.in | Admin@123 |
| Volunteer | volunteer@civrescue.in | Vol@123 |
| Citizen | citizen@civrescue.in | City@123 |

---

## ☁️ Deployment (Vercel)

1. Push to GitHub
2. Import project on [Vercel](https://vercel.com)
3. Set **Framework Preset** to `Vite`
4. Add all environment variables from `.env.example`
5. Deploy — frontend and backend ship as one project

---

## 📡 API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Register a new user |
| `POST` | `/api/auth/login` | Login and receive JWT |
| `GET` | `/api/civrescue` | List all incidents |
| `POST` | `/api/report-incident` | Report a new emergency |
| `POST` | `/api/civrescue` | Create incident (admin) |
| `PATCH` | `/api/civrescue/:id` | Update incident status |
| `GET` | `/api/volunteers` | List all volunteers |
| `POST` | `/api/volunteer/location` | Update volunteer GPS |
| `PATCH` | `/api/volunteer/status` | Toggle volunteer availability |
| `POST` | `/api/assignments` | Assign volunteer to incident |
| `PATCH` | `/api/assignments/:id` | Update assignment status |
| `GET` | `/api/stats` | Dashboard statistics |
| `POST` | `/api/call/request` | Request Twilio callback |
| `POST` | `/sms` | Twilio SMS webhook |
| `POST` | `/voice` | Twilio voice webhook |

---

## 🏗️ Architecture

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│   Citizens   │────▶│  React Frontend  │────▶│   Express    │
│  (Web/SMS/   │     │  (Vite + Shadcn) │     │   Backend    │
│   Voice)     │     └──────────────────┘     └──────┬───────┘
└──────────────┘                                     │
                                          ┌──────────┼──────────┐
                                          ▼          ▼          ▼
                                    ┌──────────┐ ┌────────┐ ┌────────┐
                                    │ MongoDB  │ │ Claude │ │ Twilio │
                                    │  Atlas   │ │   AI   │ │SMS/Call│
                                    └──────────┘ └────────┘ └────────┘
```

---

## 📄 License

This project is open-source and available under the [MIT License](LICENSE).

---

<div align="center">

**Built with ❤️ for disaster response**

</div>
