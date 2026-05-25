# Deployment Setup — Postgres + Environment

**Status:** Pre-deployment checklist for Sharad

---

## 1. Database Setup (PostgreSQL)

### Prerequisites
- PostgreSQL 13+ installed locally or on a remote server
- `psql` command-line tool available

### Create Database

```bash
# Connect to PostgreSQL as admin
psql -U postgres

# Create database and user
CREATE DATABASE rainman;
CREATE USER rainman_user WITH PASSWORD 'strong-random-password';
GRANT ALL PRIVILEGES ON DATABASE rainman TO rainman_user;
\q
```

### Verify Connection

```bash
psql -U rainman_user -d rainman -h localhost

# Should connect successfully and show: rainman=>
\q
```

---

## 2. Environment Variables

### Generate Secrets

```bash
# JWT_ACCESS_SECRET (256-bit random)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Output: abc123def456...

# JWT_REFRESH_SECRET (different random)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Output: xyz789uvw012...

# ENCRYPTION_KEY (AES-256-GCM, 32-byte hex)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Output: 123abc456def789...
```

### Create `.env` File

```bash
cd ~/.openclaw/dev/project-rain-man/server

# Copy template
cp ../.env.example .env

# Edit with your values
nano .env
```

### Fill in `.env`

```bash
# --- Database ---
DATABASE_URL="postgresql://rainman_user:strong-random-password@localhost:5432/rainman"

# --- Auth (from generated secrets above) ---
JWT_ACCESS_SECRET="abc123def456..."
JWT_REFRESH_SECRET="xyz789uvw012..."
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# --- Encryption (from generated secrets) ---
ENCRYPTION_KEY="123abc456def789..."

# --- Bybit ---
BYBIT_TESTNET=true
# (Per-user keys stored in DB, not in .env)

# --- Server ---
PORT=3001
NODE_ENV=development

# --- Client ---
VITE_API_URL=http://localhost:3001
```

### Verify Secrets

```bash
# Check ENCRYPTION_KEY is exactly 64 hex chars (32 bytes)
grep ENCRYPTION_KEY .env | wc -c
# Should output: 97 (64 chars + 20 for "ENCRYPTION_KEY="... + newline)

# Check JWT secrets are not empty
grep JWT_ACCESS_SECRET .env
grep JWT_REFRESH_SECRET .env
```

---

## 3. Prisma Migration

### Install Dependencies

```bash
cd ~/.openclaw/dev/project-rain-man/server

npm install
```

### Run Migration

```bash
# Create migration (adds UserSettings.haltedUntil/haltReason + RiskEvent table)
npx prisma migrate dev --name add-risk-management

# Output should show:
# ✔ Generated Prisma Client (x.x.x) to ./node_modules/@prisma/client in XXXms
# ✔ Created database schema using SQL
# ✔ Migration applied
```

### Verify Schema

```bash
# Open Prisma Studio
npx prisma studio

# Browser opens: http://localhost:5555
# Verify tables exist:
# - users
# - user_api_keys
# - user_settings
# - risk_events (new)
# - refresh_tokens
# - trades
```

---

## 4. Start Server

```bash
cd ~/.openclaw/dev/project-rain-man/server

# Development (watch mode)
npm run dev

# Or production
npm start

# Output should show:
# Rain Man server running on port 3001
# WebSocket ready at ws://localhost:3001/ws
```

### Verify Server Health

```bash
# Health check
curl http://localhost:3001/health
# { "status": "ok", "ts": 1716648000000 }

# Should be able to connect
curl -X GET http://localhost:3001/api/me \
  -H "Authorization: Bearer <access-token>"
# (Will fail auth without token, which is expected)
```

---

## 5. Bybit Testnet Setup (for Manual Testing)

### Create Testnet Account
1. Go to https://testnet.bybit.com
2. Create account (or use existing)
3. Generate API key:
   - **Permissions:** Read only (for now)
   - **IP whitelist:** Allow all (for testing)
   - Copy API Key and Secret

### Store in Database

Once server is running, register API key via API:

```bash
# 1. Create user account
curl -X POST http://localhost:3001/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "username": "testuser",
    "password": "strong-password"
  }'

# Response: { accessToken, refreshToken }
export TOKEN="<accessToken-from-response>"

# 2. Store Bybit API key
curl -X POST http://localhost:3001/api/keys \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "exchange": "bybit",
    "label": "testnet",
    "apiKey": "YOUR_BYBIT_API_KEY",
    "apiSecret": "YOUR_BYBIT_API_SECRET",
    "isTestnet": true
  }'

# Response: { id, exchange, label, isTestnet }
```

### Test Connection

```bash
# Check Bybit health
curl -X GET "http://localhost:3001/api/bybit/status" \
  -H "Authorization: Bearer $TOKEN"

# Response should show:
# { "status": { "ok": true, "latencyMs": 45 }, "circuitBreaker": {...}, ... }
```

---

## 6. Database Backup (Testnet)

```bash
# Backup
pg_dump -U rainman_user -d rainman > rainman_backup.sql

# Restore (if needed)
psql -U rainman_user -d rainman < rainman_backup.sql
```

---

## 7. Checklist

- [ ] PostgreSQL installed and running
- [ ] Database `rainman` created
- [ ] User `rainman_user` created with password
- [ ] `.env` file created and secrets filled in
  - [ ] `DATABASE_URL` correct
  - [ ] `JWT_ACCESS_SECRET` (64 hex chars)
  - [ ] `JWT_REFRESH_SECRET` (64 hex chars)
  - [ ] `ENCRYPTION_KEY` (64 hex chars)
- [ ] `npm install` completed in server/
- [ ] Prisma migration run (`npx prisma migrate dev`)
- [ ] Server starts without errors (`npm run dev`)
- [ ] Health check passes (`curl /health`)
- [ ] Bybit testnet API key stored in DB (optional, for testing)

---

## 8. Production Deployment (Checklist)

Before going live on testnet:

- [ ] Change `NODE_ENV=production`
- [ ] Change `BYBIT_TESTNET=false` (only if explicitly approving mainnet)
- [ ] Change `VITE_API_URL` to production server URL
- [ ] Use strong database password (32+ chars, random)
- [ ] Store `.env` securely (secrets manager, not git)
- [ ] Enable HTTPS for production
- [ ] Set `CORS_ORIGIN` to exact frontend URL (not http://localhost)
- [ ] Run Prisma migration on production database
- [ ] Backup database before any changes
- [ ] Test full flow: register → login → store key → fetch data

---

## Troubleshooting

### Database Connection Error
```
Error: connect ECONNREFUSED 127.0.0.1:5432
```
**Fix:** PostgreSQL not running. Start it:
```bash
# macOS
brew services start postgresql

# Linux
sudo systemctl start postgresql

# Windows
pg_ctl -D "C:\Program Files\PostgreSQL\data" start
```

### JWT Secret Not Set
```
Error: JWT_ACCESS_SECRET is required
```
**Fix:** Add to `.env`:
```bash
JWT_ACCESS_SECRET="<64-hex-chars>"
```

### Encryption Key Invalid
```
Error: ENCRYPTION_KEY must be 32 bytes (64 hex chars)
```
**Fix:** Generate new key:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Prisma Migration Fails
```
Error: Can't reach database server
```
**Fix:** Verify `DATABASE_URL` in `.env`:
```bash
psql -U rainman_user -d rainman -h localhost
# Should connect successfully
```

---

## Security Notes

- ✅ Never commit `.env` to git (add to `.gitignore`)
- ✅ Rotate JWT secrets every 90 days
- ✅ Use strong database password (32+ chars)
- ✅ Enable HTTPS in production
- ✅ Restrict CORS origin to exact frontend URL
- ✅ Store API keys encrypted in database (AES-256-GCM)
- ✅ Never log plaintext secrets or API keys

---

## Files

- `.env.example` — Template (check in)
- `.env` — Local secrets (do NOT check in)
- `server/package.json` — Dependencies
- `server/prisma/schema.prisma` — Database schema
- `server/src/index.js` — Server startup

---

## Next Steps (Waiting for Cho)

1. ✅ Set up Postgres database
2. ✅ Create `.env` with secrets
3. ✅ Run `npx prisma migrate dev`
4. ✅ Start server (`npm run dev`)
5. ⏳ Cho delivers React frontend
6. ⏳ Brock reviews WS auth flow
7. ⏳ Integration testing
8. ⏳ Deploy to testnet

**Sharad:** Ready to set up when you approve. Waiting on Cho's frontend.
