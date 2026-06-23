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

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [studentMode, setStudentMode] = useState(false);
  const [staffName, setStaffName] = useState("");
  const [staffId, setStaffId] = useState(null);
  const [activePage, setActivePage] = useState("Dashboard");

  const handleLogin = (name, role, id) => {
    setIsAdmin(role?.toLowerCase() === "admin");
    setStaffName(name);
    setStaffId(Number(id)); // ensure it's always a number
    setLoggedIn(true);
    setActivePage("Dashboard");
  };

  const handleLogout = async () => {
    if (staffId) {
      const { data, error } = await supabase
        .from("tbl_staff")
        .update({ status: "Inactive" })
        .eq("staff_id", Number(staffId))
        .select();
    }
    setLoggedIn(false);
    setIsAdmin(false);
    setStaffName("");
    setStaffId(null);
    setActivePage("Dashboard");
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
      <AdminDashboard
        staffName={staffName}
        onLogout={handleLogout}
        activePage={activePage}
        setActivePage={setActivePage}
      >
        {renderAdminPage()}
      </AdminDashboard>
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
    <Dashboard
      staffName={staffName}
      activePage={activePage}
      setActivePage={setActivePage}
      onLogout={handleLogout}
    >
      {renderPage()}
    </Dashboard>
  );
}