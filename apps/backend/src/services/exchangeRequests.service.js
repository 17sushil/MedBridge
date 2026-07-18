const prisma = require("../config/db");
const { ApiError } = require("../utils/ApiError");

// Returns every request touching this hospital, tagged with a `direction`
// so the frontend can filter/label incoming vs outgoing without extra logic.
async function listForHospital(hospitalId, { direction } = {}) {
  const where = { OR: [{ fromHospitalId: hospitalId }, { toHospitalId: hospitalId }] };

  if (direction === "incoming") {
    where.OR = undefined;
    where.toHospitalId = hospitalId;
  } else if (direction === "outgoing") {
    where.OR = undefined;
    where.fromHospitalId = hospitalId;
  }

  const requests = await prisma.exchangeRequest.findMany({
    where,
    include: { fromHospital: true, toHospital: true },
    orderBy: { requestedOn: "desc" },
  });

  return requests.map((r) => ({
    id: r.id,
    medicine: r.medicine,
    quantity: r.quantity,
    unit: r.unit,
    status: r.status,
    requestedOn: r.requestedOn,
    fromHospital: r.fromHospital.name,
    toHospital: r.toHospital.name,
    direction: r.fromHospitalId === hospitalId ? "outgoing" : "incoming",
  }));
}

// A hospital requests stock FROM another hospital: caller is toHospital
// (recipient), the partner is fromHospital (supplier being asked).
async function createRequest(requestingHospitalId, { medicine, quantity, unit, toHospitalId }) {
  if (toHospitalId === requestingHospitalId) {
    throw new ApiError(400, "You can't request stock from your own hospital");
  }

  const partner = await prisma.hospital.findUnique({ where: { id: toHospitalId } });
  if (!partner) throw new ApiError(404, "Partner hospital not found");

  // The requesting hospital is asking the partner to supply — so the
  // partner is recorded as "fromHospital" (the supplier) and the
  // requester as "toHospital" (the recipient), matching real-world intent.
  return prisma.exchangeRequest.create({
    data: {
      medicine,
      quantity,
      unit,
      fromHospitalId: toHospitalId,
      toHospitalId: requestingHospitalId,
    },
  });
}

async function updateStatus(hospitalId, id, status) {
  const request = await prisma.exchangeRequest.findUnique({ where: { id } });
  if (!request) throw new ApiError(404, "Exchange request not found");

  const involved = request.fromHospitalId === hospitalId || request.toHospitalId === hospitalId;
  if (!involved) throw new ApiError(403, "This request doesn't belong to your hospital");

  return prisma.exchangeRequest.update({ where: { id }, data: { status } });
}

module.exports = { listForHospital, createRequest, updateStatus };
