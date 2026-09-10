// Role-based permission helpers. `roleKey` is the raw enum value carried on
// the mapped user object (ADMIN / INVENTORY_MANAGER / STAFF).

export const ROLES = {
  ADMIN: "ADMIN",
  INVENTORY_MANAGER: "INVENTORY_MANAGER",
  STAFF: "STAFF",
};

export function isAdmin(roleKey) {
  return roleKey === ROLES.ADMIN;
}

export function isInventoryManager(roleKey) {
  return roleKey === ROLES.INVENTORY_MANAGER;
}

// Admin + Inventory Manager may add and edit medicines (incl. Excel import).
export function canManageInventory(roleKey) {
  return roleKey === ROLES.ADMIN || roleKey === ROLES.INVENTORY_MANAGER;
}

// Only Admin may delete medicines from inventory.
export function canDeleteInventory(roleKey) {
  return roleKey === ROLES.ADMIN;
}

// Only Admin may generate or delete reports.
export function canGenerateReports(roleKey) {
  return roleKey === ROLES.ADMIN;
}

// Only Admin may access notifications and view request activity.
export function canAccessNotifications(roleKey) {
  return roleKey === ROLES.ADMIN;
}

// Only Admin may manage users (approve / delete accounts).
export function canManageUsers(roleKey) {
  return roleKey === ROLES.ADMIN;
}
