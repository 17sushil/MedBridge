const prisma = require("../config/db");
const { ApiError } = require("../utils/ApiError");

async function listHospitals() {
  return prisma.hospital.findMany({
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          outgoingRequests: { where: { status: { in: ["PENDING", "APPROVED", "IN_TRANSIT"] } } },
          incomingRequests: { where: { status: { in: ["PENDING", "APPROVED", "IN_TRANSIT"] } } },
          medicines: true,
          users: true,
        },
      },
    },
  });
}

async function getHospital(id) {
  const hospital = await prisma.hospital.findUnique({
    where: { id },
    include: {
      _count: {
        select: {
          outgoingRequests: { where: { status: { in: ["PENDING", "APPROVED", "IN_TRANSIT"] } } },
          incomingRequests: { where: { status: { in: ["PENDING", "APPROVED", "IN_TRANSIT"] } } },
          medicines: true,
          users: true,
        },
      },
      medicines: {
        take: 5,
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  if (!hospital) throw new ApiError(404, "Hospital not found");
  return hospital;
}

module.exports = { listHospitals, getHospital };
