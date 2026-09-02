const prisma = require("../config/db");
const { ApiError } = require("../utils/ApiError");
const { computeMedicineStatus: calculateMedicineStatus } = require("../utils/medicineStatus");

const TRANSITIONS = {
  PENDING: ["APPROVED", "DECLINED"],
  APPROVED: ["IN_TRANSIT", "DECLINED"],
  IN_TRANSIT: ["COMPLETED"],
  COMPLETED: [],
  DECLINED: [],
};

async function listForHospital(hospitalId, { direction } = {}) {
  let where;
  if (direction === "incoming") {
    where = { fromHospitalId: hospitalId };
  } else if (direction === "outgoing") {
    where = { toHospitalId: hospitalId };
  } else {
    where = { OR: [{ fromHospitalId: hospitalId }, { toHospitalId: hospitalId }] };
  }

  const requests = await prisma.exchangeRequest.findMany({
    where,
    include: { fromHospital: true, toHospital: true },
    orderBy: { requestedOn: "desc" },
  });
  return requests.map((request) => ({
    id: request.id,
    medicine: request.medicine,
    quantity: request.quantity,
    unit: request.unit,
    status: request.status,
    requestedOn: request.requestedOn,
    updatedAt: request.updatedAt,
    fromHospitalId: request.fromHospitalId,
    toHospitalId: request.toHospitalId,
    fromHospital: request.fromHospital.name,
    toHospital: request.toHospital.name,
    direction: request.toHospitalId === hospitalId ? "outgoing" : "incoming",
  }));
}

async function createRequest(requestingHospitalId, { medicine, quantity, unit, toHospitalId }) {
  if (toHospitalId === requestingHospitalId) throw new ApiError(400, "You can't request stock from your own hospital");
  if (quantity <= 0) throw new ApiError(400, "Quantity must be positive");
  if (quantity > 10000) throw new ApiError(400, "Quantity too large - max 10000");
  
  const partner = await prisma.hospital.findUnique({ where: { id: toHospitalId } });
  if (!partner) throw new ApiError(404, "Partner hospital not found");
  const requestingHospital = await prisma.hospital.findUnique({ where: { id: requestingHospitalId } });

  const created = await prisma.$transaction(async (tx) => {
    const req = await tx.exchangeRequest.create({
      data: {
        medicine,
        quantity,
        unit,
        fromHospitalId: toHospitalId,
        toHospitalId: requestingHospitalId,
      },
      include: { fromHospital: true, toHospital: true },
    });

    await tx.notification.create({
      data: {
        hospitalId: toHospitalId,
        title: `New exchange request from ${requestingHospital ? requestingHospital.name : "a partner"}`,
        body: `${requestingHospital ? requestingHospital.name : "A hospital"} requested ${medicine} × ${quantity} ${unit}.`,
        type: "EXCHANGE",
      },
    });

    // Audit log
    try {
      await tx.auditLog.create({
        data: {
          hospitalId: requestingHospitalId,
          userId: null,
          action: "EXCHANGE_REQUEST_CREATED",
          entity: "ExchangeRequest",
          entityId: req.id,
          newValue: { medicine, quantity, unit, toHospitalId },
        },
      });
    } catch {}

    return req;
  });

  return {
    id: created.id,
    medicine: created.medicine,
    quantity: created.quantity,
    unit: created.unit,
    status: created.status,
    requestedOn: created.requestedOn,
    updatedAt: created.updatedAt,
    fromHospitalId: created.fromHospitalId,
    toHospitalId: created.toHospitalId,
    fromHospital: created.fromHospital.name,
    toHospital: created.toHospital.name,
    direction: "outgoing",
  };
}

function assertTransition(request, hospitalId, role, nextStatus) {
  if (role !== "ADMIN") throw new ApiError(403, "Only hospital administrators can change exchange status");
  if (!TRANSITIONS[request.status]?.includes(nextStatus)) {
    throw new ApiError(409, `Cannot change ${request.status} request to ${nextStatus}`);
  }
  const supplierAction = nextStatus === "APPROVED" || nextStatus === "DECLINED" || nextStatus === "IN_TRANSIT";
  if (supplierAction && request.fromHospitalId !== hospitalId) {
    throw new ApiError(403, "Only the supplying hospital can approve, decline, or dispatch this request");
  }
  if (nextStatus === "COMPLETED" && request.toHospitalId !== hospitalId) {
    throw new ApiError(403, "Only the receiving hospital can confirm delivery");
  }
}

// NEW: Stock reservation at APPROVED - prevents overselling (High Priority from audit)
async function reserveStock(tx, request) {
  // Find source medicine with enough stock, FIFO by expiry
  const source = await tx.medicine.findFirst({
    where: {
      hospitalId: request.fromHospitalId,
      name: { equals: request.medicine, mode: "insensitive" },
      unit: request.unit,
      quantity: { gte: request.quantity },
    },
    orderBy: { expiry: "asc" },
  });
  
  if (!source) {
    throw new ApiError(409, `Insufficient stock: ${request.medicine} requires ${request.quantity} ${request.unit}, but supplier has insufficient matching stock. Reservation failed.`);
  }

  // Check if already reserved for other approved requests (prevent oversell)
  const approvedRequests = await tx.exchangeRequest.findMany({
    where: {
      fromHospitalId: request.fromHospitalId,
      medicine: { equals: request.medicine, mode: "insensitive" },
      status: { in: ["APPROVED", "IN_TRANSIT"] },
      id: { not: request.id },
    },
    select: { quantity: true },
  });
  const totalReserved = approvedRequests.reduce((sum, r) => sum + r.quantity, 0);
  const availableAfterReservation = source.quantity - totalReserved;
  
  if (availableAfterReservation < request.quantity) {
    throw new ApiError(409, `Stock reservation failed: ${availableAfterReservation} units available after existing reservations (${totalReserved} reserved), but ${request.quantity} requested.`);
  }

  const sourceNewQty = source.quantity - request.quantity;
  const sourceNewStatus = calculateMedicineStatus(sourceNewQty);

  const updatedSource = await tx.medicine.update({
    where: { id: source.id },
    data: { quantity: sourceNewQty, status: sourceNewStatus },
  });

  await tx.inventoryMovement.create({
    data: {
      hospitalId: request.fromHospitalId,
      medicineId: source.id,
      type: "EXCHANGE_OUT",
      quantity: request.quantity,
    },
  });

  return updatedSource;
}

// NEW: Release reservation when DECLINED after APPROVED
async function releaseReservation(tx, request) {
  // Find the medicine that was reserved (same batch logic)
  // For simplicity, add back to first matching medicine
  const source = await tx.medicine.findFirst({
    where: {
      hospitalId: request.fromHospitalId,
      name: { equals: request.medicine, mode: "insensitive" },
      unit: request.unit,
    },
    orderBy: { expiry: "asc" },
  });

  if (source) {
    const newQty = source.quantity + request.quantity;
    const newStatus = calculateMedicineStatus(newQty);
    await tx.medicine.update({
      where: { id: source.id },
      data: { quantity: newQty, status: newStatus },
    });

    await tx.inventoryMovement.create({
      data: {
        hospitalId: request.fromHospitalId,
        medicineId: source.id,
        type: "PROCUREMENT", // Restock from released reservation
        quantity: request.quantity,
      },
    });
  }
}

async function completeTransfer(tx, request) {
  // Source already decremented at APPROVED stage (reservation), so we don't decrement again
  // Just find source for reference and create destination
  const source = await tx.medicine.findFirst({
    where: {
      hospitalId: request.fromHospitalId,
      name: { equals: request.medicine, mode: "insensitive" },
      unit: request.unit,
    },
    orderBy: { expiry: "asc" },
  });

  // If source was not found (should not happen if reservation worked), throw
  if (!source && request.status !== "APPROVED" && request.status !== "IN_TRANSIT") {
    // For backward compatibility, if request was approved before reservation feature, check stock now
    const fallbackSource = await tx.medicine.findFirst({
      where: {
        hospitalId: request.fromHospitalId,
        name: { equals: request.medicine, mode: "insensitive" },
        unit: request.unit,
        quantity: { gte: request.quantity },
      },
      orderBy: { expiry: "asc" },
    });
    if (!fallbackSource) {
      throw new ApiError(409, "Supplier no longer has enough matching stock to complete this transfer");
    }
  }

  let destination = null;
  if (source) {
    destination = await tx.medicine.findFirst({
      where: {
        hospitalId: request.toHospitalId,
        name: { equals: source.name, mode: "insensitive" },
        batch: source.batch,
        unit: source.unit,
        expiry: source.expiry,
      },
    });

    if (destination) {
      const destNewQty = destination.quantity + request.quantity;
      const destNewStatus = calculateMedicineStatus(destNewQty);
      destination = await tx.medicine.update({
        where: { id: destination.id },
        data: { quantity: destNewQty, status: destNewStatus },
      });
    } else {
      destination = await tx.medicine.create({
        data: {
          medicineCode: source.medicineCode,
          name: source.name,
          category: source.category,
          batch: source.batch,
          quantity: request.quantity,
          unit: source.unit,
          unitPrice: source.unitPrice,
          expiry: source.expiry,
          status: calculateMedicineStatus(request.quantity),
          hospitalId: request.toHospitalId,
        },
      });
    }

    await tx.inventoryMovement.create({
      data: {
        hospitalId: request.toHospitalId,
        medicineId: destination.id,
        type: "EXCHANGE_IN",
        quantity: request.quantity,
      },
    });
  }

  return { destination };
}

async function updateStatus(hospitalId, role, id, status) {
  const result = await prisma.$transaction(async (tx) => {
    const request = await tx.exchangeRequest.findUnique({
      where: { id },
      include: { fromHospital: true, toHospital: true },
    });
    if (!request) throw new ApiError(404, "Exchange request not found");
    assertTransition(request, hospitalId, role, status);

    // STOCK RESERVATION LOGIC (High Priority Fix)
    if (status === "APPROVED") {
      await reserveStock(tx, request);
    }

    if (status === "DECLINED" && ["APPROVED", "IN_TRANSIT"].includes(request.status)) {
      await releaseReservation(tx, request);
    }

    if (status === "COMPLETED") {
      await completeTransfer(tx, request);
    }

    const updated = await tx.exchangeRequest.update({
      where: { id },
      data: { status },
      include: { fromHospital: true, toHospital: true },
    });

    const recipientHospitalId = status === "COMPLETED" ? request.fromHospitalId : request.toHospitalId;
    const notifyingHospitalName = status === "COMPLETED" ? request.toHospital.name : request.fromHospital.name;

    await tx.notification.create({
      data: {
        hospitalId: recipientHospitalId,
        title: `Exchange request ${status.toLowerCase().replace("_", " ")}`,
        body: `${request.medicine} × ${request.quantity} ${request.unit} is now ${status.toLowerCase().replace("_", " ")}${notifyingHospitalName ? ` by ${notifyingHospitalName}` : ""}.`,
        type: "EXCHANGE",
      },
    });

    if (status === "COMPLETED") {
      await tx.notification.create({
        data: {
          hospitalId: request.toHospitalId,
          title: `Stock received: ${request.medicine}`,
          body: `${request.quantity} ${request.unit} of ${request.medicine} received from ${request.fromHospital.name}. Inventory updated.`,
          type: "SUCCESS",
        },
      });
    }

    // Audit log
    try {
      await tx.auditLog.create({
        data: {
          hospitalId,
          action: `EXCHANGE_${status}`,
          entity: "ExchangeRequest",
          entityId: id,
          newValue: { status, medicine: request.medicine, quantity: request.quantity },
        },
      });
    } catch {}

    return updated;
  });

  return {
    id: result.id,
    medicine: result.medicine,
    quantity: result.quantity,
    unit: result.unit,
    status: result.status,
    requestedOn: result.requestedOn,
    updatedAt: result.updatedAt,
    fromHospitalId: result.fromHospitalId,
    toHospitalId: result.toHospitalId,
    fromHospital: result.fromHospital.name,
    toHospital: result.toHospital.name,
    direction: result.toHospitalId === hospitalId ? "outgoing" : "incoming",
  };
}

module.exports = { listForHospital, createRequest, updateStatus };
