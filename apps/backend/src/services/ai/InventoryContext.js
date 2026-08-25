const prisma = require("../../config/db");

/**
 * InventoryContext - SIMPLIFIED, FAST, NO LAG
 * Only fetches what is needed, not everything at once
 */
class InventoryContext {
  static async getContextForQuery(query, hospitalId) {
    if (!query || !hospitalId) return "";
    const q = query.toLowerCase();

    try {
      // Simple keyword detection - only fetch needed data
      if (q.includes("expir")) {
        const days = q.includes("7") ? 7 : q.includes("30") ? 30 : 14;
        return await this.getExpiring(hospitalId, days);
      }
      if (q.includes("low") || q.includes("critical") || q.includes("reorder") || q.includes("out of stock")) {
        return await this.getLowStock(hospitalId);
      }
      if (q.includes("cost") || q.includes("price") || q.includes("value") || q.includes("how much")) {
        const med = this.extractMedicine(query);
        return await this.getCost(hospitalId, med);
      }
      if (q.includes("hospital") && (q.includes("which") || q.includes("has") || q.includes("excess"))) {
        const med = this.extractMedicine(query);
        if (med) return await this.getHospitalsForMedicine(med, hospitalId);
        return await this.getHospitals(hospitalId);
      }
      if (q.includes("exchange") || q.includes("request")) {
        return await this.getExchange(hospitalId);
      }

      // For specific medicine query
      const med = this.extractMedicine(query);
      if (med) {
        return await this.getMedicine(hospitalId, med);
      }

      // General inventory request
      if (q.includes("inventory") || q.includes("show") || q.includes("list") || q.includes("available")) {
        return await this.getGeneral(hospitalId);
      }

      return "";
    } catch (err) {
      console.error("[InventoryContext] Error:", err.message);
      return "";
    }
  }

  static extractMedicine(query) {
    const common = ["paracetamol", "insulin", "amoxicillin", "ibuprofen", "ceftriaxone", "azithromycin", "metformin", "atorvastatin", "omeprazole", "salbutamol", "ciprofloxacin"];
    const q = query.toLowerCase();
    for (const m of common) if (q.includes(m)) return m;
    return null;
  }

  static async getExpiring(hospitalId, days = 14) {
    const now = new Date();
    const cutoff = new Date();
    cutoff.setDate(now.getDate() + days);
    const meds = await prisma.medicine.findMany({
      where: { hospitalId, expiry: { gte: now, lte: cutoff } },
      orderBy: { expiry: "asc" },
      take: 8,
    });
    if (!meds.length) return `No medicines expiring in next ${days} days.`;
    const list = meds.map(m => `${m.name} | Batch ${m.batch} | ${m.quantity} ${m.unit} | NPR ${m.unitPrice} | Exp ${m.expiry.toISOString().split("T")[0]}`).join("\n");
    return `Expiring in ${days} days (${meds.length} batches):\n${list}`;
  }

  static async getLowStock(hospitalId) {
    const meds = await prisma.medicine.findMany({
      where: { hospitalId, status: { in: ["CRITICAL", "LOW_STOCK"] } },
      orderBy: { quantity: "asc" },
      take: 8,
    });
    if (!meds.length) return "No critical/low stock. Inventory healthy.";
    const list = meds.map(m => `${m.name} | ${m.quantity} ${m.unit} | ${m.status} | Batch ${m.batch} | NPR ${m.unitPrice}`).join("\n");
    return `Low stock (${meds.length}):\n${list}`;
  }

  static async getMedicine(hospitalId, name) {
    const meds = await prisma.medicine.findMany({
      where: { hospitalId, name: { contains: name, mode: "insensitive" } },
      take: 5,
    });
    if (!meds.length) return `No ${name} found in your hospital.`;
    const list = meds.map(m => `${m.name} | Batch ${m.batch} | ${m.quantity} ${m.unit} | NPR ${m.unitPrice} | Exp ${m.expiry.toISOString().split("T")[0]} | ${m.status}`).join("\n");
    const total = meds.reduce((a, b) => a + b.quantity * b.unitPrice, 0);
    return `${name} - Total value NPR ${total.toFixed(2)}:\n${list}`;
  }

  static async getGeneral(hospitalId) {
    const meds = await prisma.medicine.findMany({ where: { hospitalId }, take: 10, orderBy: { quantity: "desc" } });
    if (!meds.length) return "No inventory.";
    const list = meds.map(m => `${m.name} | ${m.quantity} ${m.unit} | ${m.status}`).join("\n");
    return `Top inventory:\n${list}`;
  }

  static async getCost(hospitalId, medicineName) {
    let meds;
    if (medicineName) {
      meds = await prisma.medicine.findMany({ where: { hospitalId, name: { contains: medicineName, mode: "insensitive" } }, take: 5 });
    } else {
      meds = await prisma.medicine.findMany({ where: { hospitalId }, take: 10 });
    }
    if (!meds.length) return "No cost data.";
    const total = meds.reduce((a, b) => a + b.quantity * b.unitPrice, 0);
    const list = meds.map(m => `${m.name} | ${m.quantity} x NPR ${m.unitPrice} = NPR ${(m.quantity * m.unitPrice).toFixed(2)}`).join("\n");
    return `Cost - Total NPR ${total.toFixed(2)}:\n${list}`;
  }

  static async getHospitals(hospitalId) {
    const hospitals = await prisma.hospital.findMany({ take: 6, select: { id: true, name: true, location: true } });
    const others = hospitals.filter(h => h.id !== hospitalId).slice(0, 4);
    if (!others.length) return "No partner hospitals.";
    return `Partner hospitals:\n${others.map(h => `${h.name} | ${h.location}`).join("\n")}`;
  }

  static async getHospitalsForMedicine(name, hospitalId) {
    const hospitals = await prisma.hospital.findMany({
      where: { medicines: { some: { name: { contains: name, mode: "insensitive" } } } },
      include: { medicines: { where: { name: { contains: name, mode: "insensitive" } }, select: { quantity: true } } },
      take: 5,
    });
    const others = hospitals.filter(h => h.id !== hospitalId);
    if (!others.length) return `No partner has ${name}.`;
    const list = others.map(h => {
      const qty = h.medicines.reduce((a, b) => a + b.quantity, 0);
      const level = qty > 100 ? "High" : qty > 20 ? "Medium" : "Low";
      return `${h.name} | ${level} stock | ~${qty} units`;
    }).join("\n");
    return `Hospitals with ${name}:\n${list}`;
  }

  static async getExchange(hospitalId) {
    const reqs = await prisma.exchangeRequest.findMany({
      where: { OR: [{ fromHospitalId: hospitalId }, { toHospitalId: hospitalId }] },
      take: 4,
      orderBy: { requestedOn: "desc" },
      include: { fromHospital: { select: { name: true } }, toHospital: { select: { name: true } } },
    });
    if (!reqs.length) return "No exchange requests.";
    return `Recent exchanges:\n${reqs.map(r => `${r.medicine} x${r.quantity} | ${r.fromHospital.name} -> ${r.toHospital.name} | ${r.status}`).join("\n")}`;
  }
}

module.exports = InventoryContext;
