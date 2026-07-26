const prisma = require("../config/db");

async function listForHospital(hospitalId) {
  return prisma.report.findMany({
    where: { hospitalId },
    orderBy: { generatedOn: "desc" },
  });
}

async function create(hospitalId, { name, period, type }) {
  return prisma.report.create({ data: { hospitalId, name, period, type } });
}

module.exports = { listForHospital, create };
