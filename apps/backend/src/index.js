require("dotenv").config();

const app = require("./app");

const PORT = parseInt(process.env.PORT, 10) || 4000;

console.log("◇ Starting MedBridge API...");
console.log(`◇ NODE_ENV=${process.env.NODE_ENV || "development"}`);
console.log(`◇ DATABASE_URL=${process.env.DATABASE_URL ? process.env.DATABASE_URL.slice(0, 50) + "..." : "NOT SET"}`);
console.log(`◇ LLM_PROVIDER=${process.env.LLM_PROVIDER || "auto-detect (mock fallback)"}`);
console.log(`◇ CLIENT_ORIGIN=${process.env.CLIENT_ORIGIN || "http://localhost:5173"}`);

function startServer(portToUse) {
  const server = app.listen(portToUse, () => {
    console.log(`✓ MedBridge API listening on http://localhost:${portToUse}`);
    console.log(`✓ Health check: http://localhost:${portToUse}/health`);
    console.log(`✓ AI Provider: Check logs above for [AI] provider`);
  });

  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`✗ Port ${portToUse} already in use!`);
      console.error(`  Run in PowerShell:`);
      console.error(`  netstat -ano | findstr :${portToUse}`);
      console.error(`  Then: taskkill /PID <actual_number> /F  (replace with real PID)`);
      console.error(`  Or kill all node: taskkill /IM node.exe /F`);
      console.error(`  Trying port ${portToUse + 1}...`);
      // Try next port automatically
      setTimeout(() => startServer(portToUse + 1), 1000);
    } else {
      console.error("Server error:", err);
    }
  });

  // Graceful shutdown
  process.on("SIGTERM", () => {
    console.log("SIGTERM received, shutting down");
    server.close(() => process.exit(0));
  });

  process.on("SIGINT", () => {
    console.log("SIGINT received, shutting down");
    server.close(() => process.exit(0));
  });

  return server;
}

const server = startServer(PORT);

// Prevent unhandled rejections from crashing silently but log them
process.on("unhandledRejection", (reason) => {
  console.error("Unhandled Rejection:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("Uncaught Exception:", err.message);
  console.error(err.stack);
});
