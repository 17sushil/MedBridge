require("dotenv").config();
const app = require("./app");

const PORT = process.env.PORT || 4000;

async function start() {
  // admin.mjs is ESM (AdminJS v7 requirement) — dynamic import() works fine
  // from CommonJS even though a static `require()` would not.
  const { buildAdminRouter } = await import("./admin.mjs");
  const { adminRouter, rootPath } = await buildAdminRouter();
  app.use(rootPath, adminRouter);

  // These were moved out of app.js and registered here instead, AFTER the
  // admin router — Express matches middleware in the order it's added, so
  // the catch-all 404 handler must come last, or it swallows /admin first.
  app.use(app.notFoundHandler);
  app.use(app.errorHandler);

  app.listen(PORT, () => {
    console.log(`MedBridge API listening on http://localhost:${PORT}`);
    console.log(`Admin panel at http://localhost:${PORT}${rootPath}`);
  });
}

start().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});