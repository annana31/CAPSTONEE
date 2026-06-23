import { useState } from "react";
import "./styles/AdminDashboard.css";


const navItems = ["Dashboard", "Staff Accounts", "System Reports", "Audit Logs"];

const stats = [
  { label: "Total Registrar Staff", value: "5", sub: "+1 this month" },
  { label: "Total Student Records", value: "11,953", sub: "+87 this month" },
  { label: "Completed Requests", value: "1,284", sub: "96.2% resolution rate" },
  { label: "Archived Documents", value: "42,717", sub: "Last: 24 min ago" },
];

const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const barData = [
  { uploads: 28, archived: 45 },
  { uploads: 38, archived: 55 },
  { uploads: 42, archived: 62 },
  { uploads: 48, archived: 70 },
  { uploads: 55, archived: 82 },
  { uploads: 60, archived: 88 },
  { uploads: 65, archived: 95 },
  { uploads: 90, archived: 110 },
  { uploads: 72, archived: 92 },
  { uploads: 80, archived: 100 },
  { uploads: 68, archived: 85 },
  { uploads: 75, archived: 90 },
];

const credentialDist = [
  { label: "Birth Certificate", value: 312, color: "#6366f1" },
  { label: "Form 138", value: 298, color: "#22c55e" },
  { label: "Form 137", value: 245, color: "#f59e0b" },
  { label: "Good Moral", value: 287, color: "#ec4899" },
  { label: "Grades", value: 331, color: "#3b82f6" },
  { label: "TOR", value: 178, color: "#e6a817" },
  { label: "LOA", value: 54, color: "#a78bfa" },
  { label: "Withdrawal", value: 32, color: "#f87171" },
];

const totalCreds = credentialDist.reduce((s, c) => s + c.value, 0);

const activities = [
  { staff: "Juan dela Cruz", action: "Uploaded Form 137", student: "Maria Luisa Santos", date: "Jun 7, 2025", time: "9:14 AM" },
  { staff: "Ana Reyes",      action: "Archived Birth Certificate", student: "Carlo Antonio Reyes", date: "Jun 7, 2025", time: "8:54 AM" },
  { staff: "Juan dela Cruz", action: "Approved TOR Request", student: "Angela Faith Tan", date: "Jun 7, 2025", time: "8:28 AM" },
  { staff: "Lorna Bautista", action: "Added Student Record", student: "Pio Mangubat", date: "Jun 7, 2025", time: "7:42 AM" },
  { staff: "Marco Santos",   action: "Rejected Request", student: "Leo Fernandez", date: "Jun 7, 2025", time: "6:58 AM" },
  { staff: "Ana Reyes",      action: "Updated Profile", student: "Rosa Lim", date: "Jun 7, 2025", time: "4:32 AM" },
];

// ── BAR CHART ──
function BarChart({ data, months }) {
  const svgWidth = 580;
  const svgHeight = 220;
  const paddingLeft = 40;
  const paddingRight = 16;
  const paddingTop = 16;
  const paddingBottom = 36;
  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;
  const maxVal = Math.max(...data.map(d => d.archived)) * 1.15;
  const barGroupWidth = chartWidth / data.length;
  const barWidth = barGroupWidth * 0.28;
  const yTicks = [0, 30, 60, 90, 120];

  return (
    <svg
      viewBox={`0 0 ${svgWidth} ${svgHeight}`}
      className="admin-bar-chart-svg-wrapper"
      preserveAspectRatio="xMidYMid meet"
    >
      {yTicks.map(tick => {
        const y = paddingTop + chartHeight - (tick / maxVal) * chartHeight;
        return (
          <g key={tick}>
            <line x1={paddingLeft} y1={y} x2={svgWidth - paddingRight} y2={y} stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
            <text x={paddingLeft - 8} y={y + 4} textAnchor="end" fontSize="10" fill="rgba(255,255,255,0.25)">{tick}</text>
          </g>
        );
      })}

      {data.map((d, i) => {
        const groupX = paddingLeft + i * barGroupWidth;
        const centerX = groupX + barGroupWidth / 2;
        const uploadH = (d.uploads / maxVal) * chartHeight;
        const archivedH = (d.archived / maxVal) * chartHeight;
        const uploadX = centerX - barWidth - 2;
        const archivedX = centerX + 2;
        return (
          <g key={i}>
            <rect x={uploadX} y={paddingTop + chartHeight - uploadH} width={barWidth} height={uploadH} fill="#e6a817" opacity="0.85" rx="2" />
            <rect x={archivedX} y={paddingTop + chartHeight - archivedH} width={barWidth} height={archivedH} fill="#3b82f6" opacity="0.65" rx="2" />
            <text x={centerX} y={svgHeight - 8} textAnchor="middle" fontSize="10" fill="rgba(255,255,255,0.3)">{months[i]}</text>
          </g>
        );
      })}

      <line x1={paddingLeft} y1={paddingTop + chartHeight} x2={svgWidth - paddingRight} y2={paddingTop + chartHeight} stroke="rgba(255,255,255,0.08)" strokeWidth="1" />
    </svg>
  );
}

// ── DONUT CHART ──
function DonutChart({ data, total }) {
  const size = 160;
  const cx = size / 2;
  const cy = size / 2;
  const r = 58;
  const innerR = 38;
  let cumulativePercent = 0;

  const slices = data.map((item) => {
    const percent = item.value / total;
    const startAngle = cumulativePercent * 2 * Math.PI - Math.PI / 2;
    const endAngle = (cumulativePercent + percent) * 2 * Math.PI - Math.PI / 2;
    const x1 = cx + r * Math.cos(startAngle);
    const y1 = cy + r * Math.sin(startAngle);
    const x2 = cx + r * Math.cos(endAngle);
    const y2 = cy + r * Math.sin(endAngle);
    const ix1 = cx + innerR * Math.cos(startAngle);
    const iy1 = cy + innerR * Math.sin(startAngle);
    const ix2 = cx + innerR * Math.cos(endAngle);
    const iy2 = cy + innerR * Math.sin(endAngle);
    const largeArc = percent > 0.5 ? 1 : 0;
    const d = [`M ${x1} ${y1}`, `A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2}`, `L ${ix2} ${iy2}`, `A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1}`, "Z"].join(" ");
    cumulativePercent += percent;
    return { d, color: item.color };
  });

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map((slice, i) => (
        <path key={i} d={slice.d} fill={slice.color} opacity={0.85} />
      ))}
    </svg>
  );
}

// ── ADMIN DASHBOARD ──
export default function AdminDashboard({
  staffName = "Admin",
  onLogout,
  activePage,
  setActivePage,
  children
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "short", year: "numeric", month: "short", day: "numeric",
  });

  return (
    <div className="admin-layout">

      {/* SIDEBAR */}
      <aside className="admin-sidebar" style={{ width: sidebarOpen ? "240px" : "0px" }}>
        <div className="admin-sidebar-brand">
          <h1 className="admin-sidebar-brand-title">RegisScan</h1>
          <p className="admin-sidebar-brand-sub">Registrar System</p>
        </div>
        <p className="admin-sidebar-section-label">Admin Panel</p>
        <nav className="admin-sidebar-nav">
          {navItems.map(item => (
            <button
              key={item}
              onClick={() => setActivePage(item)}
              className={activePage === item ? "admin-sidebar-nav-item-active" : "admin-sidebar-nav-item"}
            >
              {item}
            </button>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <p className="admin-sidebar-footer-text">USTP · Admin</p>
        </div>
      </aside>

      {/* MAIN */}
      <div className="admin-main">

        {/* TOPBAR */}
        <header className="admin-topbar">
          <div className="admin-topbar-left">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="admin-topbar-toggle">
              <span className="admin-topbar-hamburger-line" />
              <span className="admin-topbar-hamburger-line" />
              <span className="admin-topbar-hamburger-line" />
            </button>
            <span className="admin-topbar-date">{today}</span>
          </div>

          <div className="admin-topbar-right">
            <div className="relative">
              <button onClick={() => setDropdownOpen(!dropdownOpen)} className="admin-topbar-staff-btn">
                <div className="admin-topbar-avatar">
                  {staffName.split(" ").map(n => n[0]).join("").slice(0, 2)}
                </div>
                <span className="admin-topbar-staff-name">{staffName}</span>
              </button>
              {dropdownOpen && (
                <div className="admin-topbar-dropdown" style={{ top: "48px" }}>
              <button 
                className="admin-topbar-dropdown-logout" 
                onMouseDown={async (e) => { 
                  e.preventDefault();
                  await onLogout();      
                }}
              >
                Logout
              </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* CONTENT */}
        <main className="admin-content">
          {activePage === "Dashboard" && (
            <>
              <div>
                <h2 className="admin-page-title">Admin Dashboard</h2>
                <p className="admin-page-sub">System overview and analytics</p>
              </div>

              {/* Stat Cards */}
              <div className="admin-stats-grid">
                {stats.map((s, i) => (
                  <div key={i} className="admin-stat-card">
                    <p className="admin-stat-label">{s.label}</p>
                    <p className="admin-stat-value">{s.value}</p>
                    <p className="admin-stat-sub">{s.sub}</p>
                    <div className="admin-stat-accent" />
                  </div>
                ))}
              </div>

              {/* Charts Row */}
              <div className="admin-charts-row">
                <div className="admin-chart-card">
                  <h3 className="admin-chart-title">Monthly Document Activity</h3>
                  <BarChart data={barData} months={months} />
                  <div className="admin-bar-legend">
                    <span className="admin-bar-legend-item"><span className="admin-legend-dot-gold" /> Uploads</span>
                    <span className="admin-bar-legend-item"><span className="admin-legend-dot-blue" /> Archived</span>
                  </div>
                </div>

                <div className="admin-chart-card">
                  <h3 className="admin-chart-title">Credential Distribution</h3>
                  <div className="admin-donut-wrapper">
                    <DonutChart data={credentialDist} total={totalCreds} />
                  </div>
                  <div className="admin-donut-legend">
                    {credentialDist.map((item, i) => (
                      <div key={i} className="admin-donut-legend-row">
                        <span className="admin-donut-legend-label">
                          <span className="admin-donut-legend-dot" style={{ backgroundColor: item.color }} />
                          {item.label}
                        </span>
                        <span className="admin-donut-legend-value">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Recent Activities Table */}
              <div className="admin-activity-card">
                <h3 className="admin-activity-title">Recent Activities</h3>
                <div className="admin-activity-table-wrapper">
                  <table className="admin-activity-table">
                    <thead>
                      <tr>
                        <th className="admin-activity-th">Staff Name</th>
                        <th className="admin-activity-th">Activity</th>
                        <th className="admin-activity-th admin-activity-th-right">Date & Time</th>
                      </tr>
                    </thead>
                    <tbody>
                      {activities.map((a, i) => (
                        <tr key={i} className="admin-activity-tr">
                          <td className="admin-activity-td">
                            <div className="admin-activity-staff-cell">
                              <div className="admin-activity-staff-avatar">
                                {a.staff.split(" ").map(n => n[0]).join("").slice(0, 2)}
                              </div>
                              <span className="admin-activity-staff-name">{a.staff}</span>
                            </div>
                          </td>
                          <td className="admin-activity-td">
                            <div className="admin-activity-action-cell">
                              <div className="admin-activity-dot-sm">
                                <div className="admin-activity-dot-inner" />
                              </div>
                              <div>
                                <p className="admin-activity-action">{a.action}</p>
                                <p className="admin-activity-student">{a.student}</p>
                              </div>
                            </div>
                          </td>
                          <td className="admin-activity-td admin-activity-td-right">
                            <p className="admin-activity-date">{a.date}</p>
                            <p className="admin-activity-time">{a.time}</p>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}

          {activePage !== "Dashboard" && (
  children ? (
    children
  ) : (
    <div className="flex flex-col items-center justify-center h-full text-center">
      <h2 className="admin-empty-title">{activePage}</h2>
      <p className="admin-empty-sub">This page is under construction.</p>
      <div className="admin-empty-accent" />
    </div>
  )
)}
        </main>
      </div>
    </div>
  );
}