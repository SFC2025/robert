// server/server.js
/*
  🚀 API de Bolidos Rifas — Node/Express + Postgres
  - CORS restringido a FRONTEND_ORIGIN
  - Rate limit, Helmet + CSP
  - Multer (5MB, jpg/png/webp) + Cloudinary
  - JWT auth admin, bcrypt, express-validator
  - Transacciones para asignación atómica (SELECT ... FOR UPDATE SKIP LOCKED)
  - Endpoints:
      GET /health
      GET /api/stats
      POST /api/auth/login
      POST /api/purchase
      GET  /api/verify?phone=... | ?ticket=...
      POST /api/admin/confirm {purchase_id, status} (Bearer)
*/
import "dotenv/config";
import express from "express";
import helmet from "helmet";
import cors from "cors";
import rateLimit from "express-rate-limit";
import morgan from "morgan";
import bcrypt from "bcrypt";

import ticketsRouter from "./routes/tickets.js";
import pool from "./models/db.js";
import purchaseRoutes from "./routes/purchase.js";
import authRoutes from "./routes/auth.js";
import adminRoutes from "./routes/admin.js";
import verifyRoutes from "./routes/verify.js";

const app = express();
const PORT = process.env.PORT || 10000;
const API = process.env.API_BASE_PATH || "/api";
const JWT_SECRET = process.env.JWT_SECRET || "dev";
const ASSIGN_MODE = (process.env.ASSIGN_MODE || "secuencial").toLowerCase();
const TOTAL_TICKETS = Number(process.env.TOTAL_TICKETS || 10000);

// orígenes permitidos por CORS (separados por coma en FRONTEND_ORIGIN)
const ORIGINS = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

// --- HEALTH sin prefijo, MUY ARRIBA ---
app.get("/health", (_req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() })
);
// detrás de proxy (Render)
app.set("trust proxy", 1);

// HSTS solo prod
if (process.env.NODE_ENV === "production") {
  app.use(
    helmet.hsts({ maxAge: 15552000, includeSubDomains: true, preload: true })
  );
}

// Helmet + CSP: permite llamadas (connect-src/form-action) a los orígenes del front
app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        "default-src": ["'self'"],
        "img-src": ["'self'", "data:", "blob:", "*.cloudinary.com"],
        "connect-src": ["'self'", ...ORIGINS, "*.vercel.app"],
        "form-action": ["'self'", ...ORIGINS, "*.vercel.app"],
        "frame-ancestors": ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);

// CORS con allowed + previews de Vercel
const allowed = (process.env.FRONTEND_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true); // curl / same-origin
      if (allowed.includes(origin)) return cb(null, true);
      try {
        const host = new URL(origin).hostname;
        if (host.endsWith(".vercel.app")) return cb(null, true); // previews
      } catch {}
      return cb(new Error("CORS: origin no permitido"));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.options("*", cors());

// body + logs
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: true }));

app.use(
  morgan((tokens, req, res) => {
    const ip = req.ip?.replace(/^::ffff:/, "") || "";
    const url = String(tokens.url(req, res) || "").replace(
      /(authorization:\s*bearer\s+)[^ ]+/i,
      "$1***"
    );
    const body = req.body ? JSON.stringify(req.body) : "";
    const bodySafe = body
      .replace(/"email":"([^"]+)"/g, '"email":"***"')
      .replace(/"phone":"([^"]+)"/g, '"phone":"***"');
    return JSON.stringify({
      time: tokens.date(req, res, "iso"),
      ip,
      method: tokens.method(req, res),
      url,
      status: Number(tokens.status(req, res)),
      len: tokens.res(req, res, "content-length"),
      rt_ms: Number(tokens["response-time"](req, res)),
      body: bodySafe.length > 400 ? bodySafe.slice(0, 400) + "…" : bodySafe,
    });
  })
);

// Rate limiter GLOBAL
const limiter = rateLimit({
  windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000),
  max: Number(process.env.RATE_LIMIT_MAX || 200),
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// Rate limit por endpoint
const tight = rateLimit({ windowMs: 15 * 60 * 1000, max: 60 });
const bursty = rateLimit({ windowMs: 60 * 1000, max: 30 });
app.use(`${API}/verify`, bursty);
app.use(`${API}/purchase`, tight);
app.use(`${API}/auth/login`, tight);
app.use(`${API}/tickets`, bursty);
app.use(`${API}/admin`, tight);

// Rutas montadas todas bajo API_BASE_PATH
app.use(`${API}/purchase`, purchaseRoutes);
app.use(`${API}/auth`, authRoutes);
app.use(`${API}/admin`, adminRoutes);
app.use(`${API}/verify`, verifyRoutes);
app.use(`${API}/tickets`, ticketsRouter);

// Ensure admin hash (idempotente)
async function ensureAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const pass = process.env.ADMIN_PASSWORD;
  if (!email || !pass) return;
  const hash = await bcrypt.hash(pass, 10);
  await pool.query(
    `insert into users(email, role, password_hash)
     values($1,'admin',$2)
     on conflict (email) do update set password_hash = EXCLUDED.password_hash`,
    [email, hash]
  );
}
ensureAdmin().catch(console.error);

// Health (bajo /api)
app.get(`${API}/health`, (_req, res) =>
  res.json({ status: "ok", time: new Date().toISOString() })
);

// --- DB health ---
app.get(`${API}/db/health`, async (_req, res) => {
  try {
    const r = await pool.query("select 1 as ok");
    return res.json({ db: "ok", result: r.rows[0] });
  } catch (e) {
    return res.status(500).json({ db: "down", error: e.message });
  }
});

// Stats (bajo /api)
app.get(`${API}/stats`, async (_req, res, next) => {
  try {
    const sold = await pool.query(
      "select count(*)::int as c from tickets where status='sold'"
    );
    const tot = await pool.query("select count(*)::int as c from tickets");
    res.json({ sold: sold.rows[0].c, total: tot.rows[0].c });
  } catch (e) {
    next(e);
  }
});

// Error handler
// eslint-disable-next-line no-unused-vars
app.use((errObj, _req, res, _next) => {
  console.error(errObj);
  const status = errObj.status || 500;
  res.status(status).json({ message: errObj.message || "Error inesperado" });
});

app.listen(PORT, () => {
  console.log(`API running on :${PORT}`);
});
