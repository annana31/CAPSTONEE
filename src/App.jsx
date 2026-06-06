import { useState } from "react";
import Login from "./Login";
import Dashboard from "./Dashboard";
import Students from "./Students";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [staffName, setStaffName] = useState("");
  const [activePage, setActivePage] = useState("Dashboard");

  const handleLogin = (name = "Maria Santos") => {
    setStaffName(name);
    setLoggedIn(true);
  };

  if (!loggedIn) {
    return <Login onLogin={handleLogin} />;
  }

  const renderPage = () => {
    switch (activePage) {
      case "Students": return <Students />;
      case "Departments": return <div className="flex flex-col items-center justify-center h-full text-center"><h2 className="empty-title">Departments</h2><p className="empty-sub">This page is under construction.</p><div className="empty-accent" /></div>;
      case "Requests": return <div className="flex flex-col items-center justify-center h-full text-center"><h2 className="empty-title">Requests</h2><p className="empty-sub">This page is under construction.</p><div className="empty-accent" /></div>;
      default: return null;
    }
  };

  return (
    <Dashboard
      staffName={staffName}
      activePage={activePage}
      setActivePage={setActivePage}
      onLogout={() => { setLoggedIn(false); setActivePage("Dashboard"); }}
    >
      {renderPage()}
    </Dashboard>
  );
}