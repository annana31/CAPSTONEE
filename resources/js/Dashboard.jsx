import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import "./styles/Dashboard.css";

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

  // ── BACKEND STATE ──
  const [stats, setStats] = useState([
    { label: "Total Colleges", value: 0 },
    { label: "Total Courses", value: 0 },
    { label: "Total Students", value: 0 },
    { label: "Credentials Stored", value: 0 },
    { label: "Total Requests", value: 0 },
    { label: "Current Requests", value: 0 },
  ]);
  const [activityLog, setActivityLog] = useState([]);
  const [loadingStats, setLoadingStats] = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(true);

  // ── BACKEND: Fetch all stat counts ──
  useEffect(() => {
    const fetchStats = async () => {
      setLoadingStats(true);
      try {
        const [
          { count: colleges },
          { count: courses },
          { count: students },
          { count: credentials },
          { count: totalRequests },
        ] = await Promise.all([
          supabase.from("tbl_college").select("*", { count: "exact", head: true }),
          supabase.from("tbl_program").select("*", { count: "exact", head: true }),
          supabase.from("tbl_student").select("*", { count: "exact", head: true }),
          supabase.from("tbl_student_documents").select("*", { count: "exact", head: true }),
          supabase.from("tbl_request").select("*", { count: "exact", head: true }),
        ]);

        setStats([
          { label: "Total Colleges", value: colleges ?? 0 },
          { label: "Total Courses", value: courses ?? 0 },
          { label: "Total Students", value: students ?? 0 },
          { label: "Credentials Stored", value: credentials ?? 0 },
          { label: "Total Requests", value: totalRequests ?? 0 },
          { label: "Current Requests", value: totalRequests ?? 0 },
        ]);
      } catch (err) {
        console.error("Error fetching stats:", err);
      } finally {
        setLoadingStats(false);
      }
    };

    fetchStats();
  }, []);

  // ── BACKEND: Fetch activity log joined with staff name ──
  useEffect(() => {
    const fetchActivity = async () => {
      setLoadingActivity(true);
      try {
        const { data, error } = await supabase
          .from("tbl_system_activity")
          .select(`
            activity_id,
            activity_type,
            activity_description,
            module_name,
            date_time,
            status,
            tbl_staff (username)
          `)
          .order("date_time", { ascending: false })
          .limit(20);

        if (error) {
          console.error("Error fetching activity log:", error);
          return;
        }

        const formatted = data.map((log) => ({
          id: log.activity_id,
          user: log.tbl_staff?.username ?? "Unknown",
          action: log.activity_description ?? "Performed an action",
          subject: log.module_name ?? "",
          type: log.activity_type ?? "Student Record",
          date: log.date_time
            ? new Date(log.date_time).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })
            : "—",
        }));

        setActivityLog(formatted);
      } catch (err) {
        console.error("Error fetching activity log:", err);
      } finally {
        setLoadingActivity(false);
      }
    };

    fetchActivity();
  }, []);

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
            <button className="topbar-dropdown-logout" onClick={async () => { setDropdownOpen(false); await onLogout(); }}>
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
                {loadingStats
                  ? Array(6).fill(null).map((_, i) => (
                      <div key={i} className="stat-card stat-card-default">
                        <p className="stat-label">Loading...</p>
                        <p className="stat-value">—</p>
                        <div className="stat-accent" />
                      </div>
                    ))
                  : stats.map((stat, i) => {
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

                {loadingActivity ? (
                  <p style={{ padding: "1rem", color: "#888", fontSize: "0.9rem" }}>Loading activity log...</p>
                ) : activityLog.length === 0 ? (
                  <p style={{ padding: "1rem", color: "#888", fontSize: "0.9rem" }}>No activity recorded yet.</p>
                ) : (
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
                )}
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