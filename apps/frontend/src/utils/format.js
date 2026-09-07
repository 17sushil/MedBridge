export function formatCurrency(value) {
  return new Intl.NumberFormat("en-NP", {
    style: "currency",
    currency: "NPR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatNumber(value) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatDate(dateStr, options = { day: "2-digit", month: "short", year: "numeric" }) {
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString("en-US", options);
}

// Nepali numbering system for money: 1 Crore = 1,00,00,000, 1 Lakh = 1,00,000.
// Big values render as words ("NPR 5.24 Lakh"), smaller ones with Indian-style
// grouping ("NPR 12,34,567" style via en-IN).
export function formatNepaliCurrency(value) {
  const v = Number(value) || 0;
  const abs = Math.abs(v);
  const units = [
    { size: 1e7, name: "Crore" },
    { size: 1e5, name: "Lakh" },
    { size: 1e3, name: "Thousand" },
  ];
  const unit = units.find((u) => abs >= u.size);
  if (!unit) return `NPR ${v.toLocaleString("en-IN")}`;
  const n = v / unit.size;
  const digits = Math.abs(n) >= 100 ? 0 : 2;
  const s = n.toLocaleString("en-IN", { maximumFractionDigits: digits });
  return `NPR ${s} ${unit.name}`;
}
