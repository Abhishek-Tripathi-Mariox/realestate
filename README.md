# Real Estate Society Management & Accounting

Single repo containing both the API (Express + MongoDB) and the dashboard
(Next.js 14 + Tailwind). Run them together with **one command** from the
project root.

```
realestate/
├── backend/     # Express API on port 8001
├── frontend/    # Next.js dashboard on port 3000
└── package.json # root scripts to run / build both
```

## Prerequisites

- **Node.js 18+**
- **MongoDB** running locally (or set `MONGO_URL` in `backend/.env`)

## First-time setup

Install dependencies for the root, backend, and frontend in one go:

```bash
npm run install:all
```

That runs `npm install` in each of `./`, `./backend/`, and `./frontend/`.
The root only needs `concurrently` (small dev dep) to run both processes
together; the real dependencies live inside backend/ and frontend/.

## Running in development

```bash
npm run dev
```

Starts both with colour-coded prefixes:

- `[BACKEND]`  — `nodemon backend/src/server.js` on **http://localhost:8001**
- `[FRONTEND]` — `next dev` on **http://localhost:3000**

`Ctrl+C` once kills both.

If you want to run them separately:

```bash
npm run dev:backend     # only the API
npm run dev:frontend    # only the dashboard
```

## Production / build

```bash
npm run build           # builds the Next.js app (frontend/.next)
npm start               # runs both backend and the built frontend in parallel
```

Or individually:

```bash
npm run start:backend
npm run start:frontend
```

## Environment variables

- `backend/.env` — `MONGO_URL`, `DB_NAME`, `JWT_SECRET`, `PORT`,
  `CORS_ORIGINS`, `DELETE_MASTER_OTP` (master OTP for any DELETE call).
- `frontend/.env` — `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_BASE_URL`.

## Folder map

| Path                              | What's inside                                              |
| --------------------------------- | ---------------------------------------------------------- |
| `backend/src/server.js`           | All Express routes, middleware, audit logger, OTP guard    |
| `backend/src/config/database.js`  | MongoDB connection                                         |
| `frontend/src/app/`               | Next.js routes (dashboard, societies, daybook, ...)        |
| `frontend/src/components/dashboard/` | Sidebar, Topbar, AppShell, StatCard                     |
| `frontend/src/lib/`               | Shared helpers (`money.js`, `deleteOtp.js`, `utils.js`)    |
| `frontend/public/images/`         | Drop logos / backgrounds here                              |
