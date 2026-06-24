import { useState, useMemo, useEffect } from "react";
import { supabase } from "./supabaseClient";
import "./styles/AuditLogs.css";

const activityTypes = ["Upload", "View", "Update", "Login", "Archive", "Request", "Delete", "Export"];

const badgeClass = (status) => {
  if (status === "Success") return "al-badge-success";
  if (status === "Failed")  return "al-badge-failed";
  return "al-badge-warning";
};

export default function AuditLogs() {
  const [logs, setLogs]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState("");
  const [filterType,   setFilterType]   = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  useEffect(() => {
    let isMounted = true;

    async function fetchLogs() {
      setLoading(true);
      const { data, error } = await supabase
        .from("tbl_system_activity")
        .select(`
          activity_id,
          activity_type,
          activity_description,
          module_name,
          date_time,
          status,
          tbl_staff ( username )
        `)
        .order("date_time", { ascending: false });

      if (!isMounted) return;

      if (error) {
        setErrorMsg(error.message);
        setLogs([]);
      } else {
        const mapped = (data || []).map((row) => ({
          id: row.activity_id,
          timestamp: row.date_time,
          name: row.tbl_staff?.username || "Unknown Staff",
          type: row.activity_type,
          description: row.activity_description,
          module: row.module_name,
          status: row.status,
        }));
        setLogs(mapped);
        setErrorMsg("");
      }
      setLoading(false);
    }

    fetchLogs();
    return () => { isMounted = false; };
  }, []);

  const todayStr = new Date().toISOString().slice(0, 10);
  const todayCount  = logs.filter(l => (l.timestamp || "").startsWith(todayStr)).length;
  const failedCount = logs.filter(l => l.status === "Failed").length;

  const filtered = useMemo(() => {
    return logs.filter(l => {
      const matchType   = filterType   ? l.type   === filterType   : true;
      const matchStatus = filterStatus ? l.status === filterStatus : true;
      return matchType && matchStatus;
    });
  }, [logs, filterType, filterStatus]);

  const formatTimestamp = (ts) => {
    if (!ts) return "—";
    const d = new Date(ts);
    if (isNaN(d.getTime())) return ts;
    return d.toLocaleString("en-PH", {
      year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  };

  return (
    <>
      <div className="mb-6">
        <h2 className="al-page-title">Audit Logs</h2>
        <p className="al-page-sub">System activity tracking</p>
      </div>

      <div className="al-stats-grid">
        <div className="al-stat-card">
          <p className="al-stat-label">Total Activities</p>
          <p className="al-stat-value">{logs.length}</p>
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

      <div className="al-filter-bar">
        <div className="al-search">&#9906;</div>
        <select className="al-select" value={filterType} onChange={e => setFilterType(e.target.value)}>
          <option value="">All Types</option>
          {activityTypes.map(t => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <select className="al-select" value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All Status</option>
          <option value="Success">Success</option>
          <option value="Failed">Failed</option>
          <option value="Warning">Warning</option>
        </select>
      </div>

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
            {loading ? (
              <tr><td colSpan={6} className="al-empty">Loading audit logs…</td></tr>
            ) : errorMsg ? (
              <tr><td colSpan={6} className="al-empty">Couldn't load logs: {errorMsg}</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="al-empty">No logs found.</td></tr>
            ) : (
              filtered.map((log, i) => (
                <tr key={log.id ?? i} className={i % 2 === 0 ? "al-row-even" : "al-row-odd"}>
                  <td className="al-td-timestamp">{formatTimestamp(log.timestamp)}</td>
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