# Cloudflare Backend for NPTEL Pro Solver ☁️⚡

A serverless Cloudflare Worker powered by **Cloudflare D1 (Serverless SQLite)** that provides a centralized **Answer Vault** for NPTEL students.

---

## 🌟 Why Cloudflare D1 + Workers?
- **5 Million Database Reads / Day** (100% Free)
- **100,000 API Requests / Day** (100% Free)
- **<20ms Edge Latency** across India (Mumbai, Delhi, Bangalore, Chennai)
- **Zero API Keys Required for Students**: The backend serves cached verified solutions instantly, and uses its own server secret key for missing questions.

---

## 🚀 2-Minute Deployment Guide

### Step 1: Install Wrangler & Login
Open your terminal inside this `cloudflare-backend` folder:
```bash
npm install -g wrangler
wrangler login
```

### Step 2: Create Free D1 Database
```bash
wrangler d1 create nptel-vault
```
*Wrangler will output a `database_id` (e.g. `c7a1...`). Copy it and paste it into `wrangler.toml`:*
```toml
database_id = "paste_your_database_id_here"
```

### Step 3: Run Database Schema & Seed Data
```bash
wrangler d1 execute nptel-vault --remote --file=./schema.sql
```

### Step 4: Add Your Gemini API Key (Secret)
```bash
wrangler secret put GEMINI_API_KEY
```
*(Paste your free Google AI Studio key when prompted)*

### Step 5: Deploy to Global Edge!
```bash
wrangler deploy
```

Your API is now live at:
`https://nptel-pro-solver-api.<your-subdomain>.workers.dev`

---

## 🔗 Connect to the Extension

1. In the Chrome Extension **Side Panel**, go to **Settings & API**.
2. Paste your Cloudflare Worker URL into **"Cloudflare Vault Backend URL"**.
3. Now all students can solve assignments with **zero API keys** and instant verified accuracy!
