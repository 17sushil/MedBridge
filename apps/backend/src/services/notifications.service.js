const prisma = require("../config/db");

/**
 * Checks if a notification represents an account registration / join request.
 * Join requests should only be visible to hospital administrators.
 */
function isJoinRequestNotification(n) {
  const title = (n.title || "").toLowerCase();
  const body = (n.body || "").toLowerCase();
  return (
    title.includes("join request") ||
    title.includes("join") ||
    body.includes("requested to join") ||
    body.includes("under users") ||
    body.includes("join as")
  );
}

async function listForHospital(hospitalId, role = "ADMIN") {
  const all = await prisma.notification.findMany({
    where: { hospitalId },
    orderBy: { createdAt: "desc" },
  });

  if (role === "ADMIN") {
    return all;
  }

  // Non-admins (e.g. Staff) only see operational/inventory/exchange notifications,
  // never member join requests or user approval requests.
  return all.filter((n) => !isJoinRequestNotification(n));
}

async function markAllRead(hospitalId, role = "ADMIN") {
  if (role === "ADMIN") {
    await prisma.notification.updateMany({
      where: { hospitalId, read: false },
      data: { read: true },
    });
  } else {
    // For staff, only mark non-join notifications as read
    const staffNotifications = await listForHospital(hospitalId, role);
    const unreadIds = staffNotifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length > 0) {
      await prisma.notification.updateMany({
        where: { id: { in: unreadIds }, hospitalId },
        data: { read: true },
      });
    }
  }
  return listForHospital(hospitalId, role);
}

async function markOneRead(hospitalId, id) {
  return prisma.notification.updateMany({
    where: { id, hospitalId },
    data: { read: true },
  });
}

async function create(hospitalId, { title, body, type }) {
  return prisma.notification.create({ data: { hospitalId, title, body, type } });
}

module.exports = {
  listForHospital,
  markAllRead,
  markOneRead,
  create,
  isJoinRequestNotification,
};
