import { useState } from "react";
import "./styles/Dashboard.css";

const stats = [
  { label: "Total Colleges", value: 8 },
  { label: "Total Courses", value: 42 },
  { label: "Total Students", value: 3847 },
  { label: "Credentials Stored", value: 12504 },
  { label: "Total Requests", value: 986 },
  { label: "Current Requests", value: 23 },
];

const newStudents = [
  { id: "2026-00123", name: "Juan dela Cruz", department: "College of Information Technology", course: "BS Information Technology", year: "1st Year" },
  { id: "2026-00124", name: "Ana Villanueva", department: "College of Engineering", course: "BS Civil Engineering", year: "1st Year" },
  { id: "2026-00125", name: "Pio Mangubat", department: "College of Science", course: "BS Data Science", year: "1st Year" },
  { id: "2026-00126", name: "Rosa Lim", department: "College of Business", course: "BS Accountancy", year: "2nd Year" },
  { id: "2026-00127", name: "Mark Uy", department: "College of Information Technology", course: "BS Computer Science", year: "2nd Year" },
  { id: "2026-00128", name: "Sheila Gomez", department: "College of Education", course: "BSEd English", year: "3rd Year" },
  { id: "2026-00129", name: "Leo Fernandez", department: "College of Engineering", course: "BS Electrical Engineering", year: "1st Year" },
  { id: "2026-00130", name: "Carla Mendoza", department: "College of Business", course: "BS Marketing", year: "4th Year" },
];

export default function Dashboard({ staffName, activePage, setActivePage, onLogout, onScanDocument, children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const navItems = ["Dashboard", "Students", "Departments", "Requests"];

  return (
    <div className="dash-layout">

      {/* SIDEBAR */}
      <aside className="sidebar" style={{ width: sidebarOpen ? "240px" : "0px" }}>
        <div className="sidebar-brand">
          <h1 className="sidebar-brand-title">RegisScan</h1>
          <p className="sidebar-brand-sub">Management System</p>
        </div>
        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item}
              onClick={() => setActivePage(item)}
              className={activePage === item ? "sidebar-nav-item-active" : "sidebar-nav-item"}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <p className="sidebar-footer-text">USTP · Registrar</p>
        </div>
      </aside>

      {/* MAIN */}
      <div className="dash-main">

        {/* TOPBAR */}
        <header className="topbar">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="topbar-toggle">
              <span className="topbar-hamburger-line" />
              <span className="topbar-hamburger-line" />
              <span className="topbar-hamburger-line" />
            </button>
            <span className="topbar-page-title">{activePage}</span>
          </div>

          <div className="relative">
            <button onClick={() => setDropdownOpen(!dropdownOpen)} className="topbar-staff-btn">
              <div className="text-right">
                <p className="topbar-staff-name">{staffName}</p>
                <p className="topbar-staff-role">Registrar Staff</p>
              </div>
              <div className="topbar-avatar">
                {staffName.split(" ").map(n => n[0]).join("").slice(0, 2)}
              </div>
            </button>

            {dropdownOpen && (
              <div className="topbar-dropdown">
                <button className="topbar-dropdown-logout" onClick={() => { setDropdownOpen(false); onLogout(); }}>
                  Logout
                </button>
              </div>
            )}
          </div>
        </header>

        {/* CONTENT */}
        <main className="dash-content">
          {activePage === "Dashboard" ? (
            <>
              <div className="mb-8" />

              {/* Stat Cards */}
              <div className="grid grid-cols-3 gap-5 mb-10">
                {stats.map((stat, i) => {
                  const highlighted = i === 5;
                  return (
                    <div key={i} className={`stat-card ${highlighted ? "stat-card-highlighted" : "stat-card-default"}`}>
                      <p className={highlighted ? "stat-label-highlighted" : "stat-label"}>{stat.label}</p>
                      <p className={highlighted ? "stat-value-highlighted" : "stat-value"}>{stat.value.toLocaleString()}</p>
                      <div className={highlighted ? "stat-accent-highlighted" : "stat-accent"} />
                    </div>
                  );
                })}
              </div>

              {/* New Students */}
              <div className="activity-wrapper">
                <div className="activity-header">
                  <div>
                    <h3 className="activity-header-title">New Students</h3>
                    <p className="activity-header-sub">Recently added student records</p>
                  </div>
                  <button className="scan-btn" onClick={onScanDocument}>
                    Scan Document
                  </button>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="activity-thead">
                      <th className="activity-th-first">Student ID</th>
                      <th className="activity-th">Full Name</th>
                      <th className="activity-th">Department</th>
                      <th className="activity-th">Course</th>
                      <th className="activity-th">Year Level</th>
                    </tr>
                  </thead>
                  <tbody>
                    {newStudents.map((s, i) => (
                      <tr key={s.id} className={i % 2 === 0 ? "activity-row-even" : "activity-row-odd"}>
                        <td className="activity-td-staff">{s.id}</td>
                        <td className="activity-td-name">{s.name}</td>
                        <td className="activity-td-action">{s.department}</td>
                        <td className="activity-td-action">{s.course}</td>
                        <td className="activity-td-year">{s.year}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            children
          )}
        </main>
      </div>
    </div>
  );
}