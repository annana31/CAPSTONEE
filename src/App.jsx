import { useState } from "react";
import Login from "./Login";
import Dashboard from "./Dashboard";
import Students from "./Students";
import Departments from "./Departments";
import StudentPreview from "./StudentPreview";
import StudentProfile from "./StudentProfile";
import Requests from "./Requests";

export default function App() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [studentMode, setStudentMode] = useState(false);
  const [staffName, setStaffName] = useState("");
  const [activePage, setActivePage] = useState("Dashboard");

  const handleLogin = (name = "Maria Santos") => {
    setStaffName(name);
    setLoggedIn(true);
  };

  const handleStudentAccess = () => {
    setStudentMode(true);
  };

  if (studentMode) {
    return (
      <StudentPreview
        onBack={() => setStudentMode(false)}
      />
    );
  }

  if (!loggedIn) {
    return (
      <Login
        onLogin={handleLogin}
        onStudentAccess={handleStudentAccess}
      />
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
        return (
          <StudentProfile
            staffName={staffName}
            onLogout={() => setLoggedIn(false)}
          />
        );

      default:
        return null;
    }
  };

  return (
    <Dashboard
      staffName={staffName}
      activePage={activePage}
      setActivePage={setActivePage}
      onLogout={() => {
        setLoggedIn(false);
        setActivePage("Dashboard");
      }}
    >
      {renderPage()}
    </Dashboard>
  );
}