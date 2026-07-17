// Data access layer.
//
// Every page talks to *this* file, never to mockData.js directly.
// That means when the real backend exists, only this file changes —
// swap each function body for `fetch(...)` / axios and the rest of
// the app keeps working unchanged.

import * as mock from "../data/mockData";

const delay = (ms = 250) => new Promise((res) => setTimeout(res, ms));

export const api = {
  async getCurrentUser() {
    await delay();
    return mock.currentUser;
  },
  async getDashboardStats() {
    await delay();
    return mock.stats;
  },
  async getInventoryOverview() {
    await delay();
    return mock.inventoryOverview;
  },
  async getMedicineCategories() {
    await delay();
    return mock.medicineCategories;
  },
  async getMedicines() {
    await delay();
    return mock.medicines;
  },
  async getExpiryAlerts() {
    await delay();
    return mock.expiryAlerts;
  },
  async getRecentActivity() {
    await delay();
    return mock.recentActivity;
  },
  async getHospitals() {
    await delay();
    return mock.hospitals;
  },
  async getExchangeRequests() {
    await delay();
    return mock.exchangeRequests;
  },
  async getNotifications() {
    await delay();
    return mock.notifications;
  },
  async getDemandForecast() {
    await delay();
    return mock.demandForecast;
  },
  async getReports() {
    await delay();
    return mock.reports;
  },
};
