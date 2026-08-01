const prisma = require("../config/db");
const { ApiError } = require("../utils/ApiError");

const TRANSITIONS = {
  PENDING: ["APPROVED", "DECLINED"],
  APPROVED: ["IN_TRANSIT"],
  IN_TRANSIT: ["COMPLETED"],
  COMPLETED: [],
  DECLINED: [],
};

async function listForHospital(hospitalId, { direction } = {}) {
  const where = { OR: [{ fromHospitalId: hospitalId }, { toHospitalId: hospitalId }] };
  if (direction === "incoming") Object.assign(where, { OR: undefined, toHospitalId: hospitalId });
  if (direction === "outgoing") Object.assign(where, { OR: undefined, fromHospitalId: hospitalId });

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
    fromHospital: request.fromHospital.name,
    toHospital: request.toHospital.name,
    direction: request.fromHospitalId === hospitalId ? "outgoing" : "incoming",
  }));
}

async function createRequest(requestingHospitalId, { medicine, quantity, unit, toHospitalId }) {
  if (toHospitalId === requestingHospitalId) throw new ApiError(400, "You can't request stock from your own hospital");
  const partner = await prisma.hospital.findUnique({ where: { id: toHospitalId } });
  if (!partner) throw new ApiError(404, "Partner hospital not found");
  return prisma.exchangeRequest.create({
    data: { medicine, quantity, unit, fromHospitalId: toHospitalId, toHospitalId: requestingHospitalId },
  });
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

async function completeTransfer(tx, request) {
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
    throw new ApiError(409, "Supplier no longer has enough matching stock to complete this transfer");
  }

  await tx.medicine.update({ where: { id: source.id }, data: { quantity: { decrement: request.quantity } } });
  await tx.inventoryMovement.create({
    data: {
      hospitalId: request.fromHospitalId, medicineId: source.id,
      type: "EXCHANGE_OUT", quantity: request.quantity,
      counterpartyId: request.toHospitalId,
    },
  });

  let destination = await tx.medicine.findFirst({
    where: {
      hospitalId: request.toHospitalId,
      name: { equals: source.name, mode: "insensitive" },
      batch: source.batch,
      unit: source.unit,
      expiry: source.expiry,
    },
  });
  if (destination) {
    destination = await tx.medicine.update({ where: { id: destination.id }, data: { quantity: { increment: request.quantity } } });
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
        status: "IN_STOCK",
        hospitalId: request.toHospitalId,
      },
    });
  }
  await tx.inventoryMovement.create({
    data: {
      hospitalId: request.toHospitalId, medicineId: destination.id,
      type: "EXCHANGE_IN", quantity: request.quantity,
      counterpartyId: request.fromHospitalId,
    },
  });
}

async function updateStatus(hospitalId, role, id, status) {
  return prisma.$transaction(async (tx) => {
    const request = await tx.exchangeRequest.findUnique({ where: { id } });
    if (!request) throw new ApiError(404, "Exchange request not found");
    assertTransition(request, hospitalId, role, status);
    if (status === "COMPLETED") await completeTransfer(tx, request);

    const updated = await tx.exchangeRequest.update({ where: { id }, data: { status } });
    const recipient = status === "COMPLETED" ? request.fromHospitalId : request.toHospitalId;
    await tx.notification.create({
      data: {
        hospitalId: recipient,
        title: `Exchange request ${status.toLowerCase().replace("_", " ")}`,
        body: `${request.medicine} × ${request.quantity} ${request.unit} is now ${status.toLowerCase().replace("_", " ")}.`,
        type: "EXCHANGE",
      },
    });
    return updated;
  });
}

module.exports = { listForHospital, createRequest, updateStatus, assertTransition };
