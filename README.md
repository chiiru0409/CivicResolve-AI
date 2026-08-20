# CivicResolve AI 🏙️

**AI-powered Civic Complaint & Resolution Platform**

> A hackathon MVP that lets citizens report civic issues (potholes, garbage, drainage, etc.) using AI-powered analysis, intelligent routing, and real-time tracking.

---

## ✨ Features

- 🤖 **AI-powered complaint analysis** — category detection, priority scoring, department routing
- 📸 **Vision AI** — image analysis with object detection (simulated)
- 🗺️ **Interactive complaint map** — zone-based visualization
- 📊 **Authority dashboard** — manage complaints, update status, escalate
- 💬 **Civic AI Chat** — floating assistant for guided issue reporting
- 🔔 **Notification system** — real-time status alerts

---

## 📋 Requirements

- **Node.js 20+** — Download from [nodejs.org](https://nodejs.org)
- **npm** (included with Node.js)

---

## 🚀 Getting Started

### 1. Clone / Download

```bash
git clone https://github.com/your-username/civic-resolve-ai.git
cd civic-resolve-ai
```

### 2. Install dependencies

```bash
npm install
```

### 3. Start development server

```bash
npm run dev
```

Open **http://localhost:5173** in your browser.

---

## 🏗️ Build for production

```bash
npm run build
```

Build output is in the `dist/` folder.

### Preview the production build locally

```bash
npm run preview
```

---

## 🌐 Deploy to Vercel (recommended)

### Option A — Vercel CLI (fastest)

```bash
npm install -g vercel
vercel
```

Follow the prompts. Vercel auto-detects Vite.

### Option B — Vercel Dashboard

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project**
3. Import your GitHub repository
4. Framework Preset: **Vite** (auto-detected)
5. Click **Deploy**

> The included `vercel.json` ensures all client-side routes work correctly after deployment.

---

## 🗂️ Project Structure

```
src/
├── components/       # Reusable UI components
├── pages/            # Page components
│   └── authority/    # Authority dashboard pages
├── data/             # Mock data (complaints, departments, notifications)
├── services/         # AI service + Complaint CRUD (LocalStorage)
├── types/            # TypeScript interfaces
└── utils/            # Helper functions
```

---

## 🔑 Environment Variables

Copy `.env.example` to `.env` to configure optional integrations:

```bash
cp .env.example .env
```

The app works fully without any `.env` configuration — all AI is simulated for the demo.

---

## 🎯 Demo Workflow

1. Open the app → **Report a Problem**
2. Describe: *"Large pothole near college bus stop"*
3. Upload a photo → AI Vision analysis runs
4. Click **Analyze with CivicResolve AI**
5. AI identifies: **Roads → HIGH priority → Roads Department**
6. Confirm → Get **Complaint ID** (e.g. `CR-2026-XXXXXX`)
7. **Track Complaint** → see timeline
8. **Authority Login** → manage & update status
9. Return to tracking → status updated

---

## ⚠️ Demo Mode Notice

This application uses **simulated AI** and **mock data** for hackathon demonstration.  
No real government systems are contacted. All departments and AI responses are fictional.

---

## 🛠️ Tech Stack

| | |
|---|---|
| Frontend | React 18 + TypeScript |
| Build | Vite 5 |
| Styling | Tailwind CSS 3 |
| Routing | React Router v6 |
| Icons | Lucide React |
| Storage | LocalStorage |
| Deployment | Vercel |
