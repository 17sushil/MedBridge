require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

/**
 * Seed MedBridge from the CURRENT ledger-format ML files.
 *
 * Required:
 *   apps/ml-service/data/raw/hospitals.csv
 *   apps/ml-service/data/raw/medicines.csv
 *   apps/ml-service/data/raw/inventory.csv
 *
 * Optional (used to create useful dashboard history):
 *   apps/ml-service/data/raw/inventory_state.csv
 *
 * Demo password for every HOSP-* admin: MedBridge@2026
 *
 * WARNING: this is a destructive demo seed. It replaces application data.
 */

const fs = require("fs");
const path = require("path");
const readline = require("readline");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const ML_RAW = path.resolve(__dirname, "../../ml-service/data/raw");
const DEMO_PASSWORD = "MedBridge@2026";

function splitCsvLine(line) {
  const out = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === "," && !inQuotes) {
      out.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

function rowFromLine(headers, line) {
  const values = splitCsvLine(line);
  return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
}

function readCsv(fileName, { optional = false } = {}) {
  const fullPath = path.join(ML_RAW, fileName);
  if (!fs.existsSync(fullPath)) {
    if (optional) return [];
    throw new Error(
      `Missing ${fullPath}. Run: cd apps/ml-service && python3 training/generate_ledger_data.py`
    );
  }

  const text = fs.readFileSync(fullPath, "utf8").trim();
  if (!text) {
    if (optional) return [];
    throw new Error(`Empty CSV: ${fullPath}`);
  }

  const lines = text.split(/\r?\n/);
  const headers = splitCsvLine(lines[0]);
  return lines.slice(1).filter(Boolean).map((line) => rowFromLine(headers, line));
}

/**
 * inventory_state.csv is large. Stream it and retain only the latest N rows
 * per demo hospital/medicine pair instead of loading 500k objects into RAM.
 */
async function readRecentInventoryState(demoCodes, rowsPerPair = 28) {
  const fullPath = path.join(ML_RAW, "inventory_state.csv");
  if (!fs.existsSync(fullPath)) return new Map();

  const input = fs.createReadStream(fullPath, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  let headers = null;
  const byPair = new Map();

  for await (const line of lines) {
    if (!headers) {
      headers = splitCsvLine(line);
      continue;
    }
    if (!line.trim()) continue;

    const row = rowFromLine(headers, line);
    if (!demoCodes.has(row.hospital_id)) continue;

    const key = `${row.hospital_id}|${row.medicine_id}`;
    const recent = byPair.get(key) || [];
    recent.push(row);
    if (recent.length > rowsPerPair) recent.shift();
    byPair.set(key, recent);
  }

  return byPair;
}

function int(value, fallback = 0) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function number(value, fallback = 0) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function validDate(value, fallbackDays = 180) {
  const parsed = value ? new Date(value) : new Date(NaN);
  if (!Number.isNaN(parsed.getTime())) return parsed;
  return new Date(Date.now() + fallbackDays * 86_400_000);
}

function facilityTypeLabel(value) {
  return String(value || "General").replace(/_/g, " ");
}

function mapStockStatus(quantity, reorderLevel) {
  if (quantity <= 0) return "CRITICAL";
  if (quantity <= reorderLevel) return "LOW_STOCK";
  if (reorderLevel > 0 && quantity < reorderLevel * 2) return "MEDIUM_STOCK";
  return "IN_STOCK";
}

async function deleteIfAvailable(modelName) {
  const model = prisma[modelName];
  if (!model?.deleteMany) return;
  try {
    await model.deleteMany();
  } catch (error) {
    // Conversation tables may not exist in an older local DB. The subsequent
    // `prisma db push` command creates them; don't hide unrelated failures.
    if (error.code !== "P2021") throw error;
  }
}

async function insertInChunks(model, rows, size = 1000) {
  for (let i = 0; i < rows.length; i += size) {
    await model.createMany({ data: rows.slice(i, i + size) });
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is not set in apps/backend/.env");
  }

  console.log("Seeding from current ML ledger files in", ML_RAW);

  const hospitalsCsv = readCsv("hospitals.csv");
  const medicinesCsv = readCsv("medicines.csv");
  const inventoryCsv = readCsv("inventory.csv");

  const demoHospitals = hospitalsCsv.filter((row) => String(row.is_demo) === "1");
  if (demoHospitals.length !== 8) {
    throw new Error(`Expected 8 is_demo=1 hospitals, found ${demoHospitals.length}`);
  }

  const demoCodes = new Set(demoHospitals.map((row) => row.hospital_id));
  const recentStateByPair = await readRecentInventoryState(demoCodes);
  const medByCode = new Map(medicinesCsv.map((row) => [row.medicine_id, row]));

  console.log("Cleaning existing application data...");
  await deleteIfAvailable("aIMessage");
  await deleteIfAvailable("conversation");
  await prisma.inventoryMovement.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.report.deleteMany();
  await prisma.exchangeRequest.deleteMany();
  await prisma.medicine.deleteMany();
  await prisma.user.deleteMany();
  await prisma.hospital.deleteMany();

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);
  const legacyPasswordHash = await bcrypt.hash("password123", 10);
  const hospitalIdByCode = new Map();
  const expectedLogins = [];

  console.log(`Creating ${demoHospitals.length} demo hospitals and admins...`);
  for (const row of demoHospitals) {
    const code = row.hospital_id;
    const hospital = await prisma.hospital.create({
      data: {
        externalCode: code,
        name: row.hospital_name,
        location: [row.municipality, row.district, row.province].filter(Boolean).join(", "),
        type: facilityTypeLabel(row.facility_type),
        province: row.province || null,
        district: row.district || null,
        ecoregion: row.ecoregion || null,
        rating: 4.5,
      },
    });

    const email = `admin@${code.toLowerCase()}.medbridge.local`;
    await prisma.user.create({
      data: {
        name: `${row.hospital_name} Admin`,
        email,
        passwordHash,
        role: "ADMIN",
        hospitalId: hospital.id,
      },
    });

    hospitalIdByCode.set(code, hospital.id);
    expectedLogins.push({ code, email, username: row.demo_username || code.toLowerCase().replaceAll("-", "_") });
  }

  // Preserve the login advertised by older UI/docs, but map it to the current
  // Bir Hospital code rather than the removed DEMO-01 code.
  const birHospitalId = hospitalIdByCode.get("HOSP-BG-001");
  if (birHospitalId) {
    await prisma.user.create({
      data: {
        name: "Dr. Sarah Johnson",
        email: "sarah.johnson@cityhospital.org",
        passwordHash: legacyPasswordHash,
        role: "ADMIN",
        hospitalId: birHospitalId,
      },
    });
  }

  const latestStateByPair = new Map();
  for (const [key, rows] of recentStateByPair) {
    rows.sort((a, b) => String(a.week_start).localeCompare(String(b.week_start)));
    if (rows.length) latestStateByPair.set(key, rows[rows.length - 1]);
  }

  const demoInventory = inventoryCsv.filter((row) => demoCodes.has(row.hospital_id));
  const medicineIdByPair = new Map();
  const inventoryByPair = new Map();

  console.log(`Importing ${demoInventory.length} current inventory batches...`);
  for (const row of demoInventory) {
    const hospitalId = hospitalIdByCode.get(row.hospital_id);
    if (!hospitalId) continue;

    const pairKey = `${row.hospital_id}|${row.medicine_id}`;
    const meta = medByCode.get(row.medicine_id) || {};
    const state = latestStateByPair.get(pairKey) || {};
    const quantity = Math.max(0, int(row.quantity_available));
    const reorderLevel = Math.max(1, int(state.reorder_level, Math.ceil(quantity * 0.35)));

    const medicine = await prisma.medicine.create({
      data: {
        medicineCode: row.medicine_id,
        name: meta.generic_name || row.medicine_id,
        category: meta.category || "Uncategorized",
        batch: row.batch_no || `BATCH-${row.medicine_id}`,
        quantity,
        unit: meta.unit || "units",
        unitPrice: number(meta.unit_cost_npr),
        expiry: validDate(row.expiry_date),
        status: mapStockStatus(quantity, reorderLevel),
        hospitalId,
      },
    });

    if (!medicineIdByPair.has(pairKey)) medicineIdByPair.set(pairKey, medicine.id);
    const summary = inventoryByPair.get(pairKey) || { total: 0, maxBatch: 0 };
    summary.total += quantity;
    summary.maxBatch = Math.max(summary.maxBatch, quantity);
    inventoryByPair.set(pairKey, summary);
  }

  // Recreate recent stock movement history from the weekly ledger state. This
  // keeps dashboard/fallback charts useful even though transactions.csv is
  // intentionally not committed to GitHub.
  const movementRows = [];
  for (const [pairKey, rows] of recentStateByPair) {
    const medicineId = medicineIdByPair.get(pairKey);
    if (!medicineId || rows.length < 2) continue;

    const [hospitalCode] = pairKey.split("|");
    const hospitalId = hospitalIdByCode.get(hospitalCode);
    const sorted = [...rows].sort((a, b) => String(a.week_start).localeCompare(String(b.week_start)));

    for (let index = 1; index < sorted.length; index++) {
      const previous = int(sorted[index - 1].quantity_on_hand);
      const current = int(sorted[index].quantity_on_hand);
      const difference = current - previous;
      if (difference === 0) continue;

      movementRows.push({
        hospitalId,
        medicineId,
        type: difference > 0 ? "PROCUREMENT" : "CONSUMPTION",
        quantity: Math.abs(difference),
        occurredAt: validDate(`${sorted[index].week_start}T12:00:00Z`, 0),
      });
    }
  }
  await insertInChunks(prisma.inventoryMovement, movementRows);
  console.log(`Created ${movementRows.length} recent inventory movements.`);

  // Create a small set of real workflow-ready requests from low-stock demo
  // pairs to the strongest demo donor for the same medicine.
  const exchangeRows = [];
  for (const [needKey, state] of latestStateByPair) {
    if (exchangeRows.length >= 12) break;

    const [toCode, medicineCode] = needKey.split("|");
    const needQty = int(state.quantity_on_hand);
    const reorder = int(state.reorder_level);
    if (needQty > reorder) continue;

    let bestDonor = null;
    for (const [candidateKey, summary] of inventoryByPair) {
      const [fromCode, candidateMedicine] = candidateKey.split("|");
      if (candidateMedicine !== medicineCode || fromCode === toCode) continue;
      if (!bestDonor || summary.total > bestDonor.summary.total) {
        bestDonor = { fromCode, summary };
      }
    }
    if (!bestDonor || bestDonor.summary.maxBatch < 2) continue;

    const meta = medByCode.get(medicineCode) || {};
    const requested = Math.max(
      1,
      Math.min(
        Math.max(reorder - needQty, 1),
        Math.floor(bestDonor.summary.maxBatch * 0.2)
      )
    );

    exchangeRows.push({
      medicine: meta.generic_name || medicineCode,
      quantity: requested,
      unit: meta.unit || "units",
      status: "PENDING",
      fromHospitalId: hospitalIdByCode.get(bestDonor.fromCode),
      toHospitalId: hospitalIdByCode.get(toCode),
    });
  }
  if (exchangeRows.length) await prisma.exchangeRequest.createMany({ data: exchangeRows });
  console.log(`Created ${exchangeRows.length} demo exchange requests.`);

  for (const { code } of expectedLogins) {
    const hospitalId = hospitalIdByCode.get(code);
    const lowStock = await prisma.medicine.findMany({
      where: { hospitalId, status: { in: ["CRITICAL", "LOW_STOCK"] } },
      orderBy: { quantity: "asc" },
      take: 3,
    });

    const notifications = lowStock.map((medicine) => ({
      hospitalId,
      title: `${medicine.name} is low`,
      body: `Only ${medicine.quantity} ${medicine.unit} remain in batch ${medicine.batch}.`,
      type: medicine.status === "CRITICAL" ? "CRITICAL" : "INFO",
      read: false,
    }));
    notifications.push({
      hospitalId,
      title: "XGBoost forecast ready",
      body: "Open Demand Forecast to view this facility's medicine-demand forecast.",
      type: "SUCCESS",
      read: false,
    });
    await prisma.notification.createMany({ data: notifications });

    await prisma.report.createMany({
      data: [
        { hospitalId, name: "Monthly Inventory Summary", period: "Jun 2026", type: "INVENTORY" },
        { hospitalId, name: "Exchange Activity Report", period: "Q2 2026", type: "EXCHANGE" },
        { hospitalId, name: "Expiry Risk Report", period: "Jun 2026", type: "COMPLIANCE" },
      ],
    });
  }

  // Verify exactly what login() will verify: row exists + bcrypt password.
  const failed = [];
  for (const login of expectedLogins) {
    const user = await prisma.user.findUnique({ where: { email: login.email } });
    const passwordMatches = Boolean(user) && (await bcrypt.compare(DEMO_PASSWORD, user.passwordHash));
    if (!user || !passwordMatches) failed.push(login.email);
  }
  if (failed.length) {
    throw new Error(`Demo-login verification failed for: ${failed.join(", ")}`);
  }

  console.log("\nSeed complete. All 8 credentials were re-read from this database and bcrypt-verified:");
  for (const login of expectedLogins) {
    console.log(`  ${login.code}  login: ${login.email} / ${DEMO_PASSWORD}  (${login.username})`);
  }
  console.log("  Legacy: sarah.johnson@cityhospital.org / password123 -> HOSP-BG-001");
}

if (require.main === module) {
  main()
    .catch((error) => {
      console.error("Seed failed:", error);
      process.exitCode = 1;
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}

module.exports = {
  splitCsvLine,
  readCsv,
  readRecentInventoryState,
  mapStockStatus,
  facilityTypeLabel,
};
