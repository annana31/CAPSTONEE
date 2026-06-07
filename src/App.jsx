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

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [studentMode, setStudentMode] = useState(false);
  const [staffName, setStaffName] = useState("");
  const [activePage, setActivePage] = useState("Dashboard");

  const handleLogin = (name = "Maria Santos") => {
    setIsAdmin(name === "Admin");
    setStaffName(name);
    setLoggedIn(true);
    setActivePage("Dashboard");
  };

  const handleLogout = () => {
    setLoggedIn(false);
    setIsAdmin(false);
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
        case "System Reports":
        case "Audit Logs":
          return (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <h2 className="admin-empty-title">{activePage}</h2>
              <p className="admin-empty-sub">This page is under construction.</p>
              <div className="admin-empty-accent" />
            </div>
          );
        default: return null; // AdminDashboard renders its own dashboard content
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
      case "Students":
        return <Students onViewStudent={() => setActivePage("StudentProfile")} />;
      case "Departments":
        return <Departments onViewStudent={() => setActivePage("StudentProfile")} />;
      case "Requests":
        return <Requests />;
      case "StudentProfile":
        return <StudentProfile staffName={staffName} onLogout={handleLogout} />;
      default:
        return null;
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