import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import LoginPage from "./pages/LoginPage";
import MonitoringPage from "./pages/MonitoringPage";
import MonitoringPageBackup from "./pages/MonitoringPageBackup";
import DashboardPage from "./pages/DashboardPage";
import RegisterPage from "./pages/RegisterPage";
import AdminPage from "./pages/AdminPage.jsx";
import CartonBoxPrintCursor from "./pages/CartonBoxPrintCursor.jsx";
import DevicePrintCursor from "./pages/DevicePrintCursor.jsx";
import GiftBoxPrintCursor from "./pages/GiftBoxPrintCursor.jsx";
import MonitorDetailUnified from "./pages/MonitorDetailUnified.jsx";
import MonitorDetailUnifiedBackup from "./pages/MonitorDetailUnifiedBackup.jsx";
import "./index.css";

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<MonitoringPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/admin/menu" element={<AdminPage />} />
        <Route path="/admin" element={<DashboardPage />} />
        <Route path="/backup" element={<MonitoringPageBackup />} />
        <Route
          path="/cartonbox-print-cursor"
          element={<CartonBoxPrintCursor />}
        />
        <Route path="/device-print-cursor" element={<DevicePrintCursor />} />
        <Route path="/giftbox-print-cursor" element={<GiftBoxPrintCursor />} />
        <Route
          path="/monitor-detail/:generatorName"
          element={<MonitorDetailUnified />}
        />
        <Route
          path="/monitor/detail-advanced"
          element={<MonitorDetailUnified />}
        />
        <Route
          path="/backup/monitor-detail/:generatorName"
          element={<MonitorDetailUnifiedBackup />}
        />
        <Route
          path="/backup/monitor/detail-advanced"
          element={<MonitorDetailUnifiedBackup />}
        />
      </Routes>
    </Router>
  );
}

export default App;
