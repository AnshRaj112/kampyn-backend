# KAMPYN - Backend

*Project under **EXSOLVIA** - Excellence in Software Solutions*

## Introduction

The **KAMPYN backend** is an **Express.js** API for campus ordering, inventory, payments, university and vendor administration, guest-house and auditorium booking, invoices, notifications, and related workflows. It uses **multiple MongoDB databases** (one connection per domain cluster), **JWT** authentication, **Argon2** password hashing, **Razorpay**, **Cloudinary** uploads, and structured logging with **Pino**.

## Tech Stack

- **Runtime:** Node.js (see `engines` in `package.json`: 18.x / 20.x / 22.x)
- **Framework:** Express.js 4
- **Database:** MongoDB via Mongoose (separate URIs per cluster)
- **Security:** Helmet, CORS (configurable frontend origins), cookie settings, rate limiting (`express-rate-limit`), `lusca`-related patterns where applied
- **Auth:** JWT (`JWT_SECRET`), role-specific route modules
- **Passwords:** Argon2 (tunable via optional env vars)
- **Payments:** Razorpay
- **Media:** Cloudinary
- **Email / OTP:** Nodemailer (SMTP) and optional **Loops** transactional API (`LOOPS_*` vars)
- **PDF:** PDFKit (invoices / reports)
- **Process manager:** PM2 (production-oriented tooling)
- **Patches:** `patch-package` runs on `postinstall`

## Features

- Multi-role auth (users, universities, vendors, admins, guest house)
- Orders, carts, inventory, menus, favourites, express orders, order approval flow
- Razorpay payment and vendor settlement flows
- University and vendor management, platform fees, admin features and analytics hooks
- Guest house and auditorium APIs
- Invoices, grievances, recipes, reviews, team/contact endpoints
- Health check for uptime monitoring (`GET /api/health`)

## Quick Start

### Prerequisites

- **Node.js** 18, 20, or 22 (see `package.json` → `engines`)
- **MongoDB** — six cluster URIs are expected for a full deployment (see environment variables)
- **npm** ≥ 8

### Installation

From this repository’s backend folder:

```bash
git clone https://github.com/exsolvia/kampyn-backend.git
cd kampyn-backend

npm install
```

Create a **`.env`** file in the project root with the variables below (there is no committed `.env.example` in all setups—copy from your team’s secret manager or internal docs).

Start the development server (reloads with **nodemon**):

```bash
npm run dev
```

The server listens on **`PORT`** (default **5001**) and binds to **0.0.0.0**.

Production-style start:

```bash
npm start
```

Uses `scripts/start-server.js` (suitable for platforms that expect `npm start`).

If you use the **KAMPYN monorepo**, open `kampyn-backend` from the workspace root and follow the same steps. Configure **`FRONTEND_URL`** (and optional `FRONTEND_URL_2` … `FRONTEND_URL_5`) so CORS matches your Next.js origin.

## NPM scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Development with nodemon (`index.js`) |
| `npm start` | Production-oriented server start |
| `npm run verify-debug` | Debug verification utility |
| `npm run fix-debug` | Debug fix utility |
| `npm run migrate-orders` | Order migration script |
| `npm run test-locks` | Locking system test |
| `npm run create-admin` | Create super-admin helper |
| `npm run validate-cicd` | CI/CD validation helper |

## Quick API examples

Routes use mixed prefixes (`/api/...`, `/order`, `/cart`, `/admin`, etc.). Always inspect `index.js` for the full map.

### Health

```bash
curl http://localhost:5001/api/health
```

### User auth (illustrative)

Mounted at **`/api/user/auth`** — standard routes include `/signup`, `/login`, `/otpverification`, Google endpoints, etc.

```bash
# Login (adjust body to match your schema)
POST /api/user/auth/login
Content-Type: application/json

{
  "identifier": "user@example.com",
  "password": "your-password"
}
```

### Orders

Order routes are mounted at **`/order`** (not under `/api/orders`). Example:

```bash
# Place order (requires Authorization / cookie per your deployment)
POST /order/:userId
```

Refer to `routes/orderRoutes.js` and controllers for required fields.

## Environment variables

Below are the **primary** variables used across the codebase. Tune Mongo pool settings only if you know your deployment limits.

### Core

| Variable | Purpose |
|----------|---------|
| `PORT` | HTTP port (default `5001`) |
| `NODE_ENV` | `development` / `production` |
| `JWT_SECRET` | Secret for signing and verifying JWTs |
| `TZ` | Set to `Asia/Kolkata` in `index.js` for IST |

### MongoDB (multi-cluster)

| Variable | Purpose |
|----------|---------|
| `MONGO_URI_USER` | Users cluster |
| `MONGO_URI_ORDER` | Orders cluster |
| `MONGO_URI_ITEM` | Items cluster |
| `MONGO_URI_INVENTORY` | Inventory cluster |
| `MONGO_URI_ACCOUNT` | Accounts cluster |
| `MONGO_URI_CACHE` | Cache / analytics cluster |

Optional pool tuning: `MONGO_MAX_POOL_SIZE`, `MONGO_MIN_POOL_SIZE`, `MONGO_MAX_IDLE_TIME_MS`, `MONGO_WAIT_QUEUE_TIMEOUT_MS`, `MONGO_SERVER_SELECTION_TIMEOUT_MS`, `MONGO_SOCKET_TIMEOUT_MS`, `MONGO_CONNECT_TIMEOUT_MS`, `MONGO_HEARTBEAT_FREQUENCY_MS`.

### CORS / cookies

| Variable | Purpose |
|----------|---------|
| `FRONTEND_URL` | Allowed frontend origin |
| `FRONTEND_URL_2` … `FRONTEND_URL_5` | Additional allowed origins |
| `COOKIE_DOMAIN` | Cookie domain in production (when set) |

### Razorpay

| Variable | Purpose |
|----------|---------|
| `RAZORPAY_KEY_ID` | Key ID |
| `RAZORPAY_KEY_SECRET` | Key secret (primary; a few invoice branches read `RAZORPAY_SECRET` — use the same value for both if both are set) |

### Cloudinary

| Variable | Purpose |
|----------|---------|
| `CLOUDINARY_CLOUD_NAME` | Cloud name |
| `CLOUDINARY_API_KEY` | API key |
| `CLOUDINARY_API_SECRET` | API secret |

### Email / Loops

| Variable | Purpose |
|----------|---------|
| `EMAIL_USER` | SMTP user / from mailbox |
| `EMAIL_PASS` | SMTP password |
| `LOOPS_API_KEY` | Loops API key (if using Loops) |
| `LOOPS_TRANSACTIONAL_ID` | Loops transactional template ID |

### Argon2 (optional overrides)

| Variable | Purpose |
|----------|---------|
| `ARGON2_MEMORY_KIB` | Memory cost (KiB) |
| `ARGON2_TIME` | Time cost |
| `ARGON2_PAR` | Parallelism |

### Logging

| Variable | Purpose |
|----------|---------|
| `LOG_LEVEL` | Pino level (default `info`) |

## Documentation

- [Documentation overview](./docs/README.md)
- [Development guide](./docs/DEVELOPMENT_GUIDE.md)
- [API reference](./docs/API_REFERENCE.md)
- [Security guide](./docs/SECURITY.md)
- [Deployment guide](./docs/DEPLOYMENT.md)

## Development workflow

### Branch naming

- **Features:** `feature/feature-description`
- **Bug fixes:** `fix/bug-description`
- **Hotfixes:** `hotfix/critical-fix-description`

### Commit messages

```bash
git commit -m "feat: implement user authentication system"
git commit -m "fix: resolve payment validation issue"
git commit -m "docs: update API documentation"
git commit -m "refactor: improve order processing logic"
git commit -m "perf: optimize database queries"
```

## Contributing

1. Fork or branch from the appropriate repo
2. Create a feature branch (`git checkout -b feature/your-feature`)
3. Commit your changes with clear messages
4. Push and open a pull request

## License

**ISC** — see `package.json` for the SPDX identifier.

## Support & Contact

- **Contact:** [contact@kampyn.com](mailto:contact@kampyn.com)

---

**© 2026 EXSOLVIA. All rights reserved.**
