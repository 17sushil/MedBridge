import { lazy } from "react";
import {
  LayoutDashboard,
  PackageSearch,
  Repeat2,
  ClipboardList,
  LineChart,
  Bell,
  FileBarChart2,
  Building2,
  Settings as SettingsIcon,
  Sparkles,
  Users as UsersIcon,
} from "lucide-react";

// Lazy-loaded so adding new pages never bloats the initial bundle.
const Dashboard = lazy(() => import("./pages/Dashboard"));
const Inventory = lazy(() => import("./pages/Inventory"));
const ExchangeRequests = lazy(() => import("./pages/ExchangeRequests"));
const MyRequests = lazy(() => import("./pages/MyRequests"));
const DemandForecast = lazy(() => import("./pages/DemandForecast"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Reports = lazy(() => import("./pages/Reports"));
const Hospitals = lazy(() => import("./pages/Hospitals"));
const AIAssistant = lazy(() => import("./pages/AIAssistant"));
const Settings = lazy(() => import("./pages/Settings"));
const Users = lazy(() => import("./pages/Users"));

// ---------------------------------------------------------------------------
// Add a new page to the app by adding ONE entry here.
// `path` + `element` wires the route; `nav` (if present) adds it to the
// sidebar automatically, grouped by `nav.group`.
// ---------------------------------------------------------------------------
export const routes = [
  {
    path: "/",
    element: Dashboard,
    nav: { label: "Dashboard", icon: LayoutDashboard, group: "Overview", roles: ["ADMIN", "STAFF"] },
  },
  {
    path: "/inventory",
    element: Inventory,
    nav: { label: "Inventory", icon: PackageSearch, group: "Operations", roles: ["ADMIN", "INVENTORY_MANAGER", "STAFF"] },
  },
  {
    path: "/exchange-requests",
    element: ExchangeRequests,
    nav: { label: "Exchange Requests", icon: Repeat2, group: "Operations", roles: ["ADMIN", "STAFF"] },
  },
  {
    path: "/my-requests",
    element: MyRequests,
    nav: { label: "My Requests", icon: ClipboardList, group: "Operations", roles: ["ADMIN", "STAFF"] },
  },
  {
    path: "/demand-forecast",
    element: DemandForecast,
    nav: { label: "Demand Forecast", icon: LineChart, group: "Insights", roles: ["ADMIN", "STAFF"] },
  },
  {
    path: "/ai-assistant",
    element: AIAssistant,
    nav: {
      label: "AI Assistant",
      icon: Sparkles,
      group: "Insights",
      roles: ["ADMIN", "STAFF"],
    },
  },
  {
    path: "/reports",
    element: Reports,
    nav: { label: "Reports", icon: FileBarChart2, group: "Insights", roles: ["ADMIN", "STAFF"] },
  },
  {
    path: "/notifications",
    element: Notifications,
    nav: { label: "Notifications", icon: Bell, group: "Network", roles: ["ADMIN", "STAFF"] },
  },
  {
    path: "/hospitals",
    element: Hospitals,
    nav: { label: "Hospitals", icon: Building2, group: "Network", roles: ["ADMIN", "STAFF"] },
  },
  {
    path: "/settings",
    element: Settings,
    nav: { label: "Settings", icon: SettingsIcon, group: "System", roles: ["ADMIN", "INVENTORY_MANAGER", "STAFF"] },
  },
  {
    path: "/users",
    element: Users,
    // Admin-only: user approval + account management.
    nav: { label: "Users", icon: UsersIcon, group: "System", roles: ["ADMIN"] },
  },
];

export const navGroups = ["Overview", "Operations", "Insights", "Network", "System"];
