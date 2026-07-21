const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database…");

  // Clean slate for repeatable seeding in dev.
  await prisma.inventoryMovement.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.report.deleteMany();
  await prisma.exchangeRequest.deleteMany();
  await prisma.medicine.deleteMany();
  await prisma.user.deleteMany();
  await prisma.hospital.deleteMany();

  const [cityHospital, greenHospital, sunrise, valley, northfield] = await Promise.all(
    [
      { name: "City Hospital", location: "Kathmandu", type: "General", rating: 4.5 },
      { name: "Green Hospital", location: "Lalitpur", type: "General", rating: 4.6 },
      { name: "Sunrise Medical Center", location: "Bhaktapur", type: "Specialty", rating: 4.2 },
      { name: "Valley Community Clinic", location: "Kathmandu", type: "Clinic", rating: 4.8 },
      { name: "Northfield Hospital", location: "Kathmandu", type: "General", rating: 4.0 },
    ].map((data) => prisma.hospital.create({ data }))
  );

  const passwordHash = await bcrypt.hash("password123", 10);
  await prisma.user.create({
    data: {
      name: "Dr. Sarah Johnson",
      email: "sarah.johnson@cityhospital.org",
      passwordHash,
      role: "ADMIN",
      hospitalId: cityHospital.id,
      avatarUrl:
        "https://images.unsplash.com/photo-1594824476967-48c8b964273f?q=80&w=200&auto=format&fit=crop",
    },
  });
  console.log("Demo login -> sarah.johnson@cityhospital.org / password123");

  const medicines = await Promise.all(
    [
      { name: "Amoxicillin 500mg", category: "Antibiotics", batch: "AMX-2405", quantity: 150, unit: "boxes", unitPrice: 12, expiry: "2026-08-25", status: "LOW_STOCK" },
      { name: "Paracetamol 650mg", category: "Pain Relief", batch: "PCM-1187", quantity: 300, unit: "boxes", unitPrice: 4, expiry: "2026-09-01", status: "IN_STOCK" },
      { name: "Cetirizine 10mg", category: "Antihistamine", batch: "CTZ-0932", quantity: 200, unit: "boxes", unitPrice: 5, expiry: "2026-09-07", status: "IN_STOCK" },
      { name: "Vitamin C 500mg", category: "Vitamins", batch: "VTC-4471", quantity: 100, unit: "boxes", unitPrice: 6, expiry: "2026-10-15", status: "IN_STOCK" },
      { name: "Insulin Glargine", category: "Hormones", batch: "INS-7723", quantity: 40, unit: "vials", unitPrice: 35, expiry: "2026-11-02", status: "CRITICAL" },
      { name: "Ibuprofen 400mg", category: "Pain Relief", batch: "IBU-3391", quantity: 260, unit: "boxes", unitPrice: 5.5, expiry: "2026-12-18", status: "IN_STOCK" },
    ].map((data) =>
      prisma.medicine.create({ data: { ...data, expiry: new Date(data.expiry), hospitalId: cityHospital.id } })
    )
  );

  // 7 days of stock movements for the dashboard trend chart.
  const movementRows = [];
  for (let i = 6; i >= 0; i--) {
    const day = new Date();
    day.setDate(day.getDate() - i);
    const medicine = medicines[i % medicines.length];
    movementRows.push({ hospitalId: cityHospital.id, medicineId: medicine.id, type: "IN", quantity: 50 + i * 10, occurredAt: day });
    movementRows.push({ hospitalId: cityHospital.id, medicineId: medicine.id, type: "OUT", quantity: 20 + i * 6, occurredAt: day });
  }
  // 6 months of movements for the demand forecast page.
  for (let m = 5; m >= 0; m--) {
    const day = new Date();
    day.setMonth(day.getMonth() - m);
    const medicine = medicines[m % medicines.length];
    movementRows.push({ hospitalId: cityHospital.id, medicineId: medicine.id, type: "OUT", quantity: 450 + m * 20, occurredAt: day });
  }
  await prisma.inventoryMovement.createMany({ data: movementRows });

  await prisma.exchangeRequest.createMany({
    data: [
      { medicine: "Amoxicillin 500mg", quantity: 60, unit: "boxes", status: "PENDING", fromHospitalId: greenHospital.id, toHospitalId: cityHospital.id },
      { medicine: "Vitamin C 500mg", quantity: 40, unit: "boxes", status: "APPROVED", fromHospitalId: cityHospital.id, toHospitalId: sunrise.id },
      { medicine: "Insulin Glargine", quantity: 15, unit: "vials", status: "IN_TRANSIT", fromHospitalId: valley.id, toHospitalId: cityHospital.id },
      { medicine: "Ibuprofen 400mg", quantity: 80, unit: "boxes", status: "COMPLETED", fromHospitalId: cityHospital.id, toHospitalId: northfield.id },
      { medicine: "Cetirizine 10mg", quantity: 50, unit: "boxes", status: "DECLINED", fromHospitalId: greenHospital.id, toHospitalId: cityHospital.id },
    ],
  });

  await prisma.notification.createMany({
    data: [
      { hospitalId: cityHospital.id, title: "Insulin Glargine is critically low", body: "Only 40 vials left. Consider requesting an exchange.", type: "CRITICAL", read: false },
      { hospitalId: cityHospital.id, title: "New exchange request", body: "Green Hospital requested 60 boxes of Amoxicillin 500mg.", type: "EXCHANGE", read: false },
      { hospitalId: cityHospital.id, title: "Shipment in transit", body: "Insulin Glargine from Valley Community Clinic is on its way.", type: "INFO", read: false },
      { hospitalId: cityHospital.id, title: "Exchange completed", body: "Ibuprofen 400mg exchange with Northfield Hospital is complete.", type: "SUCCESS", read: true },
    ],
  });

  await prisma.report.createMany({
    data: [
      { hospitalId: cityHospital.id, name: "Monthly Inventory Summary", period: "Jun 2026", type: "INVENTORY" },
      { hospitalId: cityHospital.id, name: "Exchange Activity Report", period: "Q2 2026", type: "EXCHANGE" },
      { hospitalId: cityHospital.id, name: "Expiry Risk Report", period: "Jun 2026", type: "COMPLIANCE" },
    ],
  });

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
