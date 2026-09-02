require("dotenv").config({
  path: require("path").resolve(__dirname, "../.env"),
});

const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();
const password = "MedBridge@2026";

const codes = [
  "HOSP-BG-001",
  "HOSP-BG-002",
  "HOSP-BG-003",
  "HOSP-BG-004",
  "HOSP-BG-005",
  "HOSP-GD-001",
  "HOSP-KP-002",
  "HOSP-KR-002",
];

async function main() {
  let failures = 0;

  for (const code of codes) {
    const email = `admin@${code.toLowerCase()}.medbridge.local`;

    const user = await prisma.user.findUnique({
      where: { email },
      include: { hospital: true },
    });

    const passwordMatches = user
      ? await bcrypt.compare(password, user.passwordHash)
      : false;

    const hospitalMatches =
      user?.hospital?.externalCode === code;

    const passed =
      Boolean(user) &&
      passwordMatches &&
      hospitalMatches;

    console.log(
      `${passed ? "PASS" : "FAIL"}  ${email}  ` +
      `user=${user ? "yes" : "no"}  ` +
      `password=${passwordMatches ? "yes" : "no"}  ` +
      `hospital=${user?.hospital?.externalCode || "missing"}`
    );

    if (!passed) failures++;
  }

  if (failures > 0) {
    console.error(`\n${failures} account(s) failed verification.`);
    process.exitCode = 1;
  } else {
    console.log("\nAll 8 demo accounts are valid.");
  }
}

main()
  .catch((error) => {
    console.error("Verification failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
