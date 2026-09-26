import { useState } from "react";
import Login from "./Login";
import Dashboard from "./Dashboard";
import Students from "./Students";
import Departments from "./Departments";
import StudentPreview from "./StudentPreview";
import StudentProfile from "./StudentProfile";
import Requests from "./Requests";
import AdminDashboard from "./AdminDashboard";
import StaffAccounts from "./StaffAccounts";
import SystemReports from "./SystemReports";
import AuditLogs from "./AuditLogs";
import { supabase } from "./supabaseClient";
// ── RBAC ──
import { AuthProvider, ProtectedPage } from "./AuthContext";
import { normalizeRole, canAccessPage, getDefaultPage, clearAuthToken, revokeApiToken } from "./rbac";

const API_BASE = import.meta.env?.VITE_API_BASE_URL || "http://localhost:8000/api";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [studentMode, setStudentMode] = useState(false);
  const [staffName, setStaffName] = useState("");
  const [staffId, setStaffId] = useState(null);
  const [userRole, setUserRole] = useState(null); // RBAC: canonical role ("Admin" | "Registrar Staff")
  const [activePage, setActivePage] = useState("Dashboard");

  const handleLogin = (name, role, id) => {
    // RBAC: refuse accounts whose role is not one of the known roles
    const normalizedRole = normalizeRole(role);
    if (!normalizedRole) {
      alert("Your account role is not recognized. Please contact the administrator.");
      return;
    }
    setUserRole(normalizedRole); // RBAC
    setIsAdmin(role?.toLowerCase() === "admin");
    setStaffName(name);
    setStaffId(Number(id)); // ensure it's always a number
    setLoggedIn(true);
    setActivePage("Dashboard");
  };

  const handleLogout = async () => {
    await revokeApiToken(); // RBAC: invalidate the API token on the server
    clearAuthToken();       // RBAC: forget the token in this browser
    if (staffId) {
      // Set status to Inactive on logout.
      // Routed through Laravel (service role) instead of the anon key,
      // since tbl_staff has RLS enabled with no anon write policy.
      try {
        await fetch(`${API_BASE}/staff/${staffId}/logout`, { method: "POST" });
      } catch (statusErr) {
        console.error("Failed to set staff status to Inactive:", statusErr);
      }
    }
    setLoggedIn(false);
    setIsAdmin(false);
    setStaffName("");
    setStaffId(null);
    setUserRole(null); // RBAC
    setActivePage("Dashboard");
  };

  // ── RBAC: navigation guard — only pages this role may open ──
  const navigate = (page) => {
    if (canAccessPage(userRole, page)) setActivePage(page);
    else setActivePage(getDefaultPage());
  };

  if (studentMode) {
    return <StudentPreview onBack={() => setStudentMode(false)} />;
  }

  if (!loggedIn) {
    return (
      <Login
        onLogin={handleLogin}
        onStudentAccess={() => setStudentMode(true)}
      />
    );
  }

  if (isAdmin) {
    const renderAdminPage = () => {
      switch (activePage) {
        case "Staff Accounts": return <StaffAccounts />;
        case "System Reports": return <SystemReports />;
        case "Audit Logs": return <AuditLogs />;
        default: return null;
      }
    };

    return (
      <AuthProvider role={userRole} staffId={staffId} staffName={staffName}>
        <AdminDashboard
          staffName={staffName}
          onLogout={handleLogout}
          activePage={activePage}
          setActivePage={navigate}
        >
          <ProtectedPage page={activePage}>
            {renderAdminPage()}
          </ProtectedPage>
        </AdminDashboard>
      </AuthProvider>
    );
  }

  const renderPage = () => {
    switch (activePage) {
      case "Students": return <Students onViewStudent={() => setActivePage("StudentProfile")} />;
      case "Departments": return <Departments onViewStudent={() => setActivePage("StudentProfile")} />;
      case "Requests": return <Requests />;
      case "StudentProfile": return <StudentProfile staffName={staffName} onLogout={handleLogout} />;
      default: return null;
    }
  };

  return (
    <AuthProvider role={userRole} staffId={staffId} staffName={staffName}>
      <Dashboard
        staffName={staffName}
        activePage={activePage}
        setActivePage={navigate}
        onLogout={handleLogout}
      >
        <ProtectedPage page={activePage}>
          {renderPage()}
        </ProtectedPage>
      </Dashboard>
    </AuthProvider>
  );
}