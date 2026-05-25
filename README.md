# Project Rain Man

Systematic trading system targeting Bybit tokenized stocks and crypto markets.

## Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite + recharts |
| Backend | Node.js + Express |
| ORM | Prisma |
| Database | PostgreSQL |
| Exchange | ccxt (Bybit) |
| Strategy | technicalindicators |
| Auth | JWT (access + refresh) + bcrypt |
| Key storage | AES-256-GCM encrypted in Postgres |

## Project Structure

```
project-rain-man/
├── client/                  # React frontend (Vite)
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── hooks/
│       └── api/
├── server/                  # Node.js backend
│   ├── prisma/
│   │   └── schema.prisma    # DB schema
│   └── src/
│       ├── auth/            # JWT tokens, AES encryption
│       ├── bybit/           # ccxt integration
│       ├── strategy/        # CCI/EMA/ADX/ATR engine
│       ├── polymarket/      # Probability feed
│       ├── db/              # Prisma client
│       ├── middleware/      # Auth middleware
│       ├── routes/          # Express routes
│       └── index.js
├── strategy/                # Pine Script originals + notes
│   └── pine/
├── vault/                   # Obsidian project notes
├── .env.example             # Copy to .env — never commit .env
├── .gitignore
└── package.json             # Workspace root
```

## Getting Started

### Prerequisites
- Node.js 20+
- PostgreSQL running locally

### Setup

```bash
# 1. Clone and install
git clone <repo>
cd project-rain-man
npm install

# 2. Environment
cp .env.example .env
# Fill in DATABASE_URL, JWT secrets, ENCRYPTION_KEY

# 3. Database
cd server
npx prisma migrate dev --name init

# 4. Run (dev)
cd ..
npm run dev
```

### Generating ENCRYPTION_KEY

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Security Rules

- ⚠️ `.env` is gitignored — never commit it
- ⚠️ Bybit API keys are AES-256-GCM encrypted in the database
- ⚠️ Bybit testnet only until explicitly switched to mainnet
- ⚠️ Each user's keys are isolated — no cross-user access
