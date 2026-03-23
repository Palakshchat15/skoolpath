import ParentApp from "./apps/parent-app/App";
import DriverApp from "./apps/driver-app/App";
import AdminDashboard from "./apps/admin-dashboard/App";

const target = process.env.EXPO_PUBLIC_APP_TARGET ?? "parent";

const appMap = {
  parent: ParentApp,
  driver: DriverApp,
  admin: AdminDashboard
};

const SelectedApp = appMap[target] ?? ParentApp;

export default SelectedApp;
