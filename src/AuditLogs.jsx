import { useState, useMemo } from "react";
import "./styles/AuditLogs.css";

const allLogs = [
  { timestamp: "2026-05-25 09:12:04", name: "Ana Maria Reyes",    type: "Upload",  description: "Uploaded Form 137 for student 2024-00001",       module: "Student Records",  status: "Success" },
  { timestamp: "2026-05-25 08:55:31", name: "Jose Domingo Santos", type: "View",    description: "Viewed student record for 2023-00042",            module: "Student Records",  status: "Success" },
  { timestamp: "2026-05-25 08:40:17", name: "Maria Clara Valdez",  type: "Update",  description: "Updated student contact info for 2025-00019",     module: "Students",         status: "Success" },
  { timestamp: "2026-05-25 08:15:44", name: "Roberto Lim Chua",    type: "Login",   description: "Login attempt failed — wrong password",           module: "Authentication",   status: "Failed"  },
  { timestamp: "2026-05-25 08:01:22", name: "Cristina Belle Tan",  type: "Archive", description: "Archived Birth Certificate for 2022-00087",       module: "Documents",        status: "Success" },
  { timestamp: "2026-05-24 17:30:05", name: "Ana Maria Reyes",     type: "Request", description: "Approved TOR request REQ-2026-004",               module: "Requests",         status: "Success" },
  { timestamp: "2026-05-24 16:45:33", name: "Jose Domingo Santos", type: "Delete",  description: "Attempted to delete locked record",               module: "Student Records",  status: "Warning" },
  { timestamp: "2026-05-24 15:22:11", name: "Maria Clara Valdez",  type: "Export",  description: "Exported audit logs for April 2026",              module: "Reports",          status: "Success" },
];

const activityTypes = ["Upload", "View", "Update", "Login", "Archive", "Request", "Delete", "Export"];
const today = "2026-05-25";

const todayCount = allLogs.filter(l => l.timestamp.startsWith(today)).length;
const failedCount = allLogs.filter(l => l.status === "Failed").length;

const badgeClass = (status) => {
  if (status === "Success") return "al-badge-success";
  if (status === "Failed")  return "al-badge-failed";
  return "al-badge-warning";
};

export default function AuditLogs() {
  const [filterType,   setFilterType]   = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const filtered = useMemo(() => {
    return allLogs.filter(l => {
      const matchType   = filterType   ? l.type   === filterType   : true;
      const matchStatus = filterStatus ? l.status === filterStatus : true;
      return matchType && matchStatus;
    });
  }, [filterType, filterStatus]);

  return (
    <>
      {/* Header */}
      <div className="mb-6">
        <h2 className="al-page-title">Audit Logs</h2>
        <p className="al-page-sub">System activity tracking</p>
      </div>

      {/* Stat Cards */}
      <div className="al-stats-grid">
        <div className="al-stat-card">
          <p className="al-stat-label">Total Activities</p>
          <p className="al-stat-value">{allLogs.length}</p>
          <div className="al-stat-accent" />
        </div>
        <div className="al-stat-card">
          <p className="al-stat-label">Today's Activities</p>
          <p className="al-stat-value">{todayCount}</p>
          <div className="al-stat-accent" />
        </div>
        <div className="al-stat-card">
          <p className="al-stat-label">Failed Actions</p>
          <p className="al-stat-value">{failedCount}</p>
          <div className="al-stat-accent" />
        </div>
      </div>

      {/* Filter Bar */}
      <div className="al-filter-bar">
        <div className="al-search">&#9906;</div>
        <select
          className="al-select"
          value={filterType}
          onChange={e => setFilterType(e.target.value)}
        >
          <option value="">All Types</option>
          {activityTypes.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select
          className="al-select"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="Success">Success</option>
          <option value="Failed">Failed</option>
          <option value="Warning">Warning</option>
        </select>
      </div>

      {/* Table */}
      <div className="al-table-wrapper">
        <table className="al-table">
          <thead className="al-thead">
            <tr>
              <th className="al-th-first">Timestamp</th>
              <th className="al-th">Full Name</th>
              <th className="al-th">Activity Type</th>
              <th className="al-th">Description</th>
              <th className="al-th">Module</th>
              <th className="al-th">Status</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="al-empty">No logs found.</td>
              </tr>
            ) : (
              filtered.map((log, i) => (
                <tr key={i} className={i % 2 === 0 ? "al-row-even" : "al-row-odd"}>
                  <td className="al-td-timestamp">{log.timestamp}</td>
                  <td className="al-td-name">{log.name}</td>
                  <td className="al-td">{log.type}</td>
                  <td className="al-td-desc">{log.description}</td>
                  <td className="al-td-module">{log.module}</td>
                  <td className="al-td-status">
                    <span className={badgeClass(log.status)}>{log.status}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}