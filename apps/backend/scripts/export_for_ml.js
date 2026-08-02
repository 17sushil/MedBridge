// apps/backend/scripts/export_for_ml.js
//
// Pulls REAL (isSynthetic=false) InventoryMovement rows from Postgres and
// writes them in the exact same column format as transactions.csv, so they
// can be merged into ML training data as real hospitals accumulate usage.
//
// Run: node scripts/export_for_ml.js
// Output: apps/backend/exports/real_transactions.csv

const fs = require("fs");
const path = require("path");
const prisma = require("../src/config/db");

function csvEscape(val) {
  if (val === null || val === undefined) return "";
  const s = String(val);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsvRow(fields) {
  return fields.map(csvEscape).join(",");
}

async function main() {
  const movements = await prisma.inventoryMovement.findMany({
    where: { isSynthetic: false },
    include: { hospital: true, medicine: true },
    orderBy: { occurredAt: "asc" },
  });

  console.log(`Found ${movements.length} real (non-synthetic) movements`);

  const header = [
    "transaction_id", "occurred_at", "date", "type", "hospital_id", "medicine_id",
    "batch_no", "counterparty_id", "department", "quantity", "emergency_flag", "note",
  ];

  const rows = movements.map((m) => {
    // signed quantity, matching transactions.csv convention: consumption/
    // exchange-out/expiry are negative, procurement/exchange-in are positive
    const negative = ["CONSUMPTION", "EXCHANGE_OUT", "EXPIRY_WRITEOFF"].includes(m.type);
    const qty = negative ? -Math.abs(m.quantity) : Math.abs(m.quantity);
    return toCsvRow([
      m.id,
      m.occurredAt.toISOString(),
      m.occurredAt.toISOString().slice(0, 10),
      m.type,
      m.hospital.externalCode || m.hospitalId, // fall back to real id if no ML code assigned
      m.medicine.medicineCode || m.medicineId,
      m.batchNo,
      m.counterpartyId,
      m.department,
      qty,
      m.emergencyFlag ? 1 : 0,
      "real_data",
    ]);
  });

  const outDir = path.join(__dirname, "..", "exports");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, "real_transactions.csv");
  fs.writeFileSync(outPath, [toCsvRow(header), ...rows].join("\n"));

  console.log(`Wrote ${rows.length} rows to ${outPath}`);
  console.log("Next: copy this file's rows into apps/ml-service/data/raw/transactions.csv "
    + "(or merge with pandas.concat) before the next retrain.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());