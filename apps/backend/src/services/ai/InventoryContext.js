const prisma = require("../../config/db");

/**
 * InventoryContext - RAG layer that fetches live MedBridge data for LLM
 * Distinguishes between general medical knowledge and real system data
 */
class InventoryContext {
  static async getContextForQuery(query, hospitalId, userId) {
    if (!query) return "";
    const q = query.toLowerCase();

    try {
      const needs = {
        inventory: q.includes("inventory") || q.includes("medicines") || q.includes("stock") || q.includes("medicine") || q.includes("drug") || q.includes("available") || q.includes("have") || q.includes("cost") || q.includes("price") || q.includes("how much"),
        expiring: q.includes("expir"),
        lowStock: q.includes("low") || q.includes("critical"),
        exchange: q.includes("exchange") || q.includes("request"),
        hospitals: q.includes("hospital"),
        cost: q.includes("cost") || q.includes("price") || q.includes("how much") || q.includes("pricing"),
        specificMedicine: this.extractMedicineName(query),
      };

      const contexts = [];

      if (needs.expiring) {
        const expiring = await this.getExpiringMedicines(hospitalId);
        contexts.push(expiring);
      }

      if (needs.lowStock) {
        const low = await this.getLowStock(hospitalId);
        contexts.push(low);
      }

      if (needs.exchange) {
        const exchanges = await this.getExchangeRequests(hospitalId);
        contexts.push(exchanges);
      }

      if (needs.hospitals && (q.includes("which") || q.includes("hospital"))) {
        const hospitals = await this.getHospitalsContext(query);
        contexts.push(hospitals);
      }

      if (needs.inventory || needs.specificMedicine || needs.cost) {
        const inventory = await this.getInventoryForMedicine(hospitalId, needs.specificMedicine, needs.cost);
        contexts.push(inventory);
      }

      if (contexts.length === 0 && (q.includes("show") || q.includes("list") || q.includes("do we have") || q.includes("available") || q.includes("cost") || q.includes("price"))) {
        const inventory = await this.getGeneralInventory(hospitalId);
        contexts.push(inventory);
      }

      const combined = contexts.filter(Boolean).join("\n\n");
      return combined || "No relevant MedBridge inventory data found for this query.";
    } catch (err) {
      console.error("[InventoryContext] Error fetching context:", err.message);
      return `Error fetching inventory data: ${err.message}. Using general knowledge only.`;
    }
  }

  static extractMedicineName(query) {
    const q = query.toLowerCase();
    const common = [
      "paracetamol", "acetaminophen",
      "insulin", "amoxicillin", "ibuprofen", "ceftriaxone", "azithromycin",
      "metformin", "atorvastatin", "omeprazole", "salbutamol", "ciprofloxacin",
      "diclofenac", "cephalexin", "doxycycline", "levothyroxine",
      "losartan", "amlodipine", "cetirizine", "pantoprazole", "montelukast",
      "tramadol", "vitamin", "metronidazole", "ors", "iron"
    ];
    for (const med of common) {
      if (q.includes(med)) return med;
    }
    const patterns = [
      /(?:have|available|show|cost|price|does|about|for)\s+(?:an?\s+)?([a-zA-Z]+)/i,
      /how much.*?(?:is|does)?\s+(?:an?\s+)?([a-zA-Z]+)/i,
      /([a-zA-Z]+)\s+cost/i,
      /price of\s+(?:an?\s+)?([a-zA-Z]+)/i,
    ];
    for (const pat of patterns) {
      const match = query.match(pat);
      if (match) {
        let word = match[1].toLowerCase();
        const stopWords = ["much", "does", "cost", "price", "the", "an", "a", "is", "of"];
        if (!stopWords.includes(word) && word.length > 2) return word;
      }
    }
    return null;
  }

  static async getExpiringMedicines(hospitalId, days = 30) {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() + days);
      const medicines = await prisma.medicine.findMany({
        where: { hospitalId, expiry: { lte: cutoff } },
        orderBy: { expiry: "asc" },
        take: 15,
      });

      if (!medicines.length) {
        return `EXPIRING MEDICINES (next ${days} days): None found. Your inventory has no medicines expiring in this window.`;
      }

      const lines = medicines.map(m => 
        `- ${m.name} (${m.batch}): ${m.quantity} ${m.unit}, expires ${m.expiry.toISOString().split("T")[0]}, status ${m.status}`
      ).join("\n");

      return `EXPIRING MEDICINES (next ${days} days) for this hospital:\n${lines}\nTotal: ${medicines.length} batches expiring.`;
    } catch (e) {
      return `EXPIRING MEDICINES: Error fetching - ${e.message}`;
    }
  }

  static async getLowStock(hospitalId) {
    try {
      const medicines = await prisma.medicine.findMany({
        where: { hospitalId, status: { in: ["LOW_STOCK", "CRITICAL", "MEDIUM_STOCK"] } },
        orderBy: { quantity: "asc" },
        take: 15,
      });

      if (!medicines.length) {
        return "LOW STOCK: No low or critical stock found. Inventory is healthy.";
      }

      const lines = medicines.map(m =>
        `- ${m.name} (${m.batch}): ${m.quantity} ${m.unit} - ${m.status}, category ${m.category}`
      ).join("\n");

      return `LOW STOCK MEDICINES:\n${lines}\nConsider exchange requests for restocking.`;
    } catch (e) {
      return `LOW STOCK: Error - ${e.message}`;
    }
  }

  static async getExchangeRequests(hospitalId) {
    try {
      const requests = await prisma.exchangeRequest.findMany({
        where: {
          OR: [{ fromHospitalId: hospitalId }, { toHospitalId: hospitalId }],
          status: { in: ["PENDING", "APPROVED", "IN_TRANSIT"] },
        },
        include: { fromHospital: true, toHospital: true },
        orderBy: { requestedOn: "desc" },
        take: 10,
      });

      if (!requests.length) {
        return "ACTIVE EXCHANGE REQUESTS: No active requests. All caught up.";
      }

      const lines = requests.map(r => {
        const dir = r.toHospitalId === hospitalId ? "Outgoing (you requested)" : "Incoming (requested from you)";
        return `- [${r.status}] ${dir}: ${r.medicine} x${r.quantity} ${r.unit} | ${r.fromHospital.name} -> ${r.toHospital.name} | ${r.requestedOn.toISOString().split("T")[0]}`;
      }).join("\n");

      return `ACTIVE EXCHANGE REQUESTS (Pending/Approved/In Transit):\n${lines}`;
    } catch (e) {
      return `EXCHANGE REQUESTS: Error - ${e.message}`;
    }
  }

  static async getHospitalsContext(query) {
    try {
      const medicineName = this.extractMedicineName(query);

      if (medicineName) {
        const hospitalsWithMed = await prisma.medicine.findMany({
          where: {
            name: { contains: medicineName, mode: "insensitive" },
            quantity: { gt: 0 },
          },
          include: { hospital: true },
          take: 20,
        });

        if (!hospitalsWithMed.length) {
          return `HOSPITALS WITH ${medicineName.toUpperCase()}: No hospital in network has ${medicineName} in stock currently (based on live inventory).`;
        }

        const grouped = {};
        hospitalsWithMed.forEach(m => {
          const hName = m.hospital.name;
          if (!grouped[hName]) grouped[hName] = { hospital: m.hospital, total: 0, batches: [] };
          grouped[hName].total += m.quantity;
          grouped[hName].batches.push(`${m.batch} (${m.quantity} ${m.unit})`);
        });

        const lines = Object.values(grouped).map(g =>
          `- ${g.hospital.name} (${g.hospital.location}): ${g.total} units total, batches: ${g.batches.join(", ")}`
        ).join("\n");

        return `HOSPITALS WITH ${medicineName.toUpperCase()} IN STOCK:\n${lines}`;
      } else {
        const hospitals = await prisma.hospital.findMany({
          include: {
            _count: { select: { medicines: true } },
          },
          orderBy: { name: "asc" },
          take: 10,
        });

        const lines = hospitals.map(h =>
          `- ${h.name} (${h.location}, ${h.type}): ${h._count.medicines} medicine types, rating ${h.rating}`
        ).join("\n");

        return `PARTNER HOSPITALS:\n${lines}`;
      }
    } catch (e) {
      return `HOSPITALS: Error - ${e.message}`;
    }
  }

  static async getInventoryForMedicine(hospitalId, medicineName, isCostQuery = false) {
    try {
      let where = { hospitalId };
      if (medicineName) {
        where.name = { contains: medicineName, mode: "insensitive" };
      }

      const medicines = await prisma.medicine.findMany({
        where,
        orderBy: { quantity: "desc" },
        take: medicineName ? 10 : 20,
      });

      if (!medicines.length) {
        if (medicineName) {
          return `INVENTORY SEARCH FOR "${medicineName}": Not found in your hospital's inventory. Quantity 0. Unit price unknown for this hospital. You may want to request from partner hospitals.`;
        }
        return "GENERAL INVENTORY: No medicines found in your hospital inventory.";
      }

      const lines = medicines.map(m => {
        const expiryStr = m.expiry ? new Date(m.expiry).toISOString().split("T")[0] : "unknown";
        if (isCostQuery) {
          return `- ${m.name} | Batch: ${m.batch} | Unit Price: $${m.unitPrice} per ${m.unit} | Qty: ${m.quantity} ${m.unit} available | Category: ${m.category} | Expiry: ${expiryStr} | Status: ${m.status} | Terminology: generic name=${m.name}, batch=${m.batch}, unit=${m.unit}, unitPrice=$${m.unitPrice}, quantity=${m.quantity}`;
        }
        return `- ${m.name} | Batch: ${m.batch} | Qty: ${m.quantity} ${m.unit} | Category: ${m.category} | Expiry: ${expiryStr} | Status: ${m.status} | Price: $${m.unitPrice} per ${m.unit}`;
      }).join("\n");

      const totalQty = medicines.reduce((s, m) => s + m.quantity, 0);
      const totalValue = medicines.reduce((s, m) => s + (m.quantity * (m.unitPrice || 0)), 0);
      
      let prefix;
      if (isCostQuery) {
        prefix = medicineName ? `COST/PRICING FOR "${medicineName.toUpperCase()}" - Live inventory pricing` : "CURRENT INVENTORY PRICING";
      } else {
        prefix = medicineName ? `INVENTORY FOR "${medicineName}"` : "CURRENT INVENTORY (top 20 by quantity)";
      }

      const costSummary = isCostQuery ? `\nTotal inventory value for this result: $${totalValue.toFixed(2)}. Prices are from live hospital inventory system (unitPrice field).` : "";

      return `${prefix} (Total units in result: ${totalQty})${costSummary}:
${lines}`;
    } catch (e) {
      return `INVENTORY: Error - ${e.message}`;
    }
  }

  static async getGeneralInventory(hospitalId) {
    return this.getInventoryForMedicine(hospitalId, null);
  }
}

module.exports = InventoryContext;
