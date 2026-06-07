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

const activityLog = [
  { id: 1, user: "Maria Santos", action: "Uploaded transcript for", subject: "Juan dela Cruz", type: "Credential Upload", date: "Jun 6, 2026 · 10:42 AM" },
  { id: 2, user: "Carlo Reyes", action: "Approved request from", subject: "Ana Villanueva", type: "Request Approval", date: "Jun 6, 2026 · 10:15 AM" },
  { id: 3, user: "Maria Santos", action: "Added new student record for", subject: "Pio Mangubat", type: "Student Record", date: "Jun 6, 2026 · 09:58 AM" },
  { id: 4, user: "Admin", action: "Created new department", subject: "BS Data Science", type: "Department", date: "Jun 6, 2026 · 09:30 AM" },
  { id: 5, user: "Carlo Reyes", action: "Rejected request from", subject: "Leo Fernandez", type: "Request Rejection", date: "Jun 5, 2026 · 04:47 PM" },
  { id: 6, user: "Maria Santos", action: "Updated profile of", subject: "Rosa Lim", type: "Student Record", date: "Jun 5, 2026 · 03:20 PM" },
  { id: 7, user: "Admin", action: "Deleted duplicate credential for", subject: "Mark Uy", type: "Credential Upload", date: "Jun 5, 2026 · 02:05 PM" },
  { id: 8, user: "Carlo Reyes", action: "Approved request from", subject: "Sheila Gomez", type: "Request Approval", date: "Jun 5, 2026 · 01:33 PM" },
];

const badgeClass = (type) => {
  const map = {
    "Credential Upload": "badge badge-credential",
    "Request Approval": "badge badge-approval",
    "Request Rejection": "badge badge-rejection",
    "Student Record": "badge badge-student",
    "Department": "badge badge-department",
  };
  return map[type] || "badge badge-student";
};

export default function Dashboard({ staffName, activePage, setActivePage, onLogout, children }) {
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

              {/* Activity Log */}
              <div className="activity-wrapper">
                <div className="activity-header">
                  <div>
                    <h3 className="activity-header-title">Activity History</h3>
                    <p className="activity-header-sub">All actions performed across the system</p>
                  </div>
                  <span className="activity-header-label">Latest First</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="activity-thead">
                      <th className="activity-th-first">Staff</th>
                      <th className="activity-th">Action</th>
                      <th className="activity-th">Type</th>
                      <th className="activity-th">Date & Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {activityLog.map((log, i) => (
                      <tr key={log.id} className={i % 2 === 0 ? "activity-row-even" : "activity-row-odd"}>
                        <td className="activity-td-staff">{log.user}</td>
                        <td className="activity-td-action">
                          {log.action} <span className="activity-td-subject">{log.subject}</span>
                        </td>
                        <td className="activity-td-type">
                          <span className={badgeClass(log.type)}>{log.type}</span>
                        </td>
                        <td className="activity-td-date">{log.date}</td>
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