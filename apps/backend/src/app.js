const express = require("express");
const cors = require("cors");
const morgan = require("morgan");

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

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN || "http://localhost:5173",
    credentials: true,
  })
);
app.use(express.json());
app.use(morgan(process.env.NODE_ENV === "production" ? "combined" : "dev"));

app.get("/health", (req, res) => res.json({ status: "ok" }));

// -----------------------------------------------------------------------
// Add a new resource to the API by adding one line here + one routes file.
// -----------------------------------------------------------------------
app.use("/api/auth", authRoutes);
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
