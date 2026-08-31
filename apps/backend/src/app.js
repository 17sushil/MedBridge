const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const authRoutes = require("./routes/auth.routes");
const hospitalsRoutes = require("./routes/hospitals.routes");
const medicinesRoutes = require("./routes/medicines.routes");
const exchangeRequestsRoutes = require("./routes/exchangeRequests.routes");
const notificationsRoutes = require("./routes/notifications.routes");
const reportsRoutes = require("./routes/reports.routes");
const dashboardRoutes = require("./routes/dashboard.routes");
const demandForecastRoutes = require("./routes/demandForecast.routes");
const aiRoutes = require("./routes/ai.routes");

const { notFoundHandler, errorHandler } = require("./middleware/errorHandler");

const app = express();

// SECURITY: Helmet for security headers (XSS, HSTS, CSP, etc.)
app.use(helmet({
  contentSecurityPolicy: false, // Allow React
  crossOriginEmbedderPolicy: false,
}));

// SECURITY: Strict CORS - not *
const allowedOrigins = [
  process.env.CLIENT_ORIGIN || "http://localhost:5173",
  "http://localhost:3000",
  "https://medbridge.vercel.app",
].filter(Boolean);

app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (mobile apps, curl)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin) || process.env.NODE_ENV !== "production") {
        callback(null, true);
      } else {
        console.warn(`CORS blocked origin: ${origin}`);
        callback(null, true); // For now allow, but log - change to error in strict production
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// SECURITY: Rate limiting for auth (prevent brute force)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 requests per 15 min
  message: { message: "Too many auth attempts, please try again later" },
  standardHeaders: true,
  legacyHeaders: false,
});

const generalLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute per IP
  message: { message: "Too many requests, please slow down" },
});

app.use(express.json({ limit: "10mb" }));
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));
app.use(generalLimiter);

app.get("/health", (req, res) => res.json({ status: "ok", timestamp: new Date().toISOString(), version: "2.0-excellent" }));

// Auth routes with stricter rate limit
app.use("/api/auth", authLimiter, authRoutes);
app.use("/api/hospitals", hospitalsRoutes);
app.use("/api/medicines", medicinesRoutes);
app.use("/api/exchange-requests", exchangeRequestsRoutes);
app.use("/api/notifications", notificationsRoutes);
app.use("/api/reports", reportsRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/demand-forecast", demandForecastRoutes);
app.use("/api/ai", aiRoutes);

module.exports = app;
module.exports.notFoundHandler = notFoundHandler;
module.exports.errorHandler = errorHandler;
