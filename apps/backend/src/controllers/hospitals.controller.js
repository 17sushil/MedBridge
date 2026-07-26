const { asyncHandler } = require("../utils/asyncHandler");
const service = require("../services/hospitals.service");

const list = asyncHandler(async (req, res) => {
  const hospitals = await service.listHospitals();
  const shaped = hospitals.map((h) => ({
    id: h.id,
    name: h.name,
    location: h.location,
    type: h.type,
    rating: h.rating,
    activeExchanges: h._count.outgoingRequests + h._count.incomingRequests,
  }));
  res.json(shaped);
});

const getOne = asyncHandler(async (req, res) => {
  const hospital = await service.getHospital(req.params.id);
  res.json(hospital);
});

module.exports = { list, getOne };
