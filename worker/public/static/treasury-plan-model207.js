/* Scenario arithmetic only. No bank feed, settings, storage, dates or dispatch. */
export const TREASURY_GOAL207 = 1000000;
export const TREASURY_DAYS207 = 90;
export const TREASURY_DEFAULTS207 = Object.freeze({
  openingGold: 0,
  activePlayers: 1000,
  donorPercent: 60,
  weeklyGift: 75,
  goodsSales: 100000,
  goodsMarginPercent: 30,
  serviceSales: 100000,
  serviceMarginPercent: 25,
  weeklyCosts: 5000,
  reserveGold: 50000
});

export const TREASURY_FIELDS207 = Object.freeze([
  { key: "openingGold", label: "Scenario opening gold", unit: "g", max: 1000000000, help: "An editable starting assumption, separate from the owner's dated 0g report." },
  { key: "activePlayers", label: "Weekly active unique players", unit: "players", max: 100000, integer: true, help: "Assumed people, not roster characters, alts or Discord membership." },
  { key: "donorPercent", label: "Voluntary donor participation", unit: "%", max: 100, help: "An assumption, never a member quota or compulsory tithe." },
  { key: "weeklyGift", label: "Average gift per donor per mature week", unit: "g", max: 1000000000, help: "Voluntary gifts; declining never affects membership, justice or access." },
  { key: "goodsSales", label: "Goods sales per mature week", unit: "g", max: 1000000000, help: "Sales receipts before the net margin below, not Treasury profit." },
  { key: "goodsMarginPercent", label: "Goods net contribution margin", unit: "%", max: 100, help: "After materials, fulfilment, commissions, fees and refunds; before other costs below." },
  { key: "serviceSales", label: "Permitted services sales per mature week", unit: "g", max: 1000000000, help: "Only actual permitted work; no paid discipline, authority or admission." },
  { key: "serviceMarginPercent", label: "Services net contribution margin", unit: "%", max: 100, help: "After providers, coordination payouts, fees and refunds; before other costs below." },
  { key: "weeklyCosts", label: "Other costs per mature week", unit: "g", max: 1000000000, help: "Other approved spending. This scenario scales costs with the same activity ramp; add fixed costs separately before relying on a forecast." },
  { key: "reserveGold", label: "Additional operating reserve", unit: "g", max: 1000000000, help: "Set aside in addition to the 1,000,000g spendable target." }
].map(Object.freeze));

export function treasuryRampWeeks207(days) {
  if (!Number.isFinite(days) || days < 0 || days > TREASURY_DAYS207) throw new RangeError("Days must be between 0 and 90.");
  return Math.min(days, 7) / 7 * 0.25
    + Math.max(0, Math.min(days - 7, 7)) / 7 * 0.5
    + Math.max(0, Math.min(days - 14, 7)) / 7 * 0.75
    + Math.max(0, days - 21) / 7;
}

export function calculateTreasury207(raw) {
  const values = {}, errors = {};
  for (const field of TREASURY_FIELDS207) {
    const input = raw?.[field.key];
    const text = typeof input === "number" ? String(input) : typeof input === "string" ? input.trim() : "";
    const number = /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN;
    if (!Number.isFinite(number) || number < 0 || number > field.max || (field.integer && !Number.isInteger(number))) {
      errors[field.key] = field.label + " must be " + (field.integer ? "a whole number" : "a number") + " from 0 to " + field.max.toLocaleString("en-US") + ".";
    } else values[field.key] = number;
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  const donors = values.activePlayers * values.donorPercent / 100;
  const weeklyDonations = donors * values.weeklyGift;
  const weeklyGoods = values.goodsSales * values.goodsMarginPercent / 100;
  const weeklyServices = values.serviceSales * values.serviceMarginPercent / 100;
  const weeklyNet = weeklyDonations + weeklyGoods + weeklyServices - values.weeklyCosts;
  const rampWeeks = treasuryRampWeeks207(TREASURY_DAYS207);
  const projectedCash = values.openingGold + weeklyNet * rampWeeks;
  const spendableCash = projectedCash - values.reserveGold;
  const requiredWeeklyNet = (TREASURY_GOAL207 + values.reserveGold - values.openingGold) / rampWeeks;
  const neededDonations = Math.max(0, requiredWeeklyNet - weeklyGoods - weeklyServices + values.weeklyCosts);
  const requiredWeeklyGift = neededDonations === 0 ? 0 : donors > 0 ? neededDonations / donors : null;
  return {
    ok: true, values, donors, weeklyDonations, weeklyGoods, weeklyServices, weeklyNet,
    rampWeeks, projectedCash, spendableCash, goalGap: spendableCash - TREASURY_GOAL207,
    requiredWeeklyNet, requiredWeeklyGift,
    milestones: [7, 14, 30, 60, 90].map(day => ({ day,
      cash: values.openingGold + weeklyNet * treasuryRampWeeks207(day),
      afterReserve: values.openingGold + weeklyNet * treasuryRampWeeks207(day) - values.reserveGold
    })),
    negativeCash: projectedCash < 0,
    reserveUnfunded: projectedCash < values.reserveGold,
    goalMet: spendableCash >= TREASURY_GOAL207
  };
}
