import { useState, useMemo } from "react";
import "./styles/Requests.css";

const today = "2026-06-07";

const initialRequests = [
  {
    id: "REQ-2026-001",
    studentId: "2024400001",
    studentName: "Maria Luisa Santos",
    docs: ["TOR", "Good Moral"],
    requestDate: "2026-05-20",
    receivedDate: "2026-05-22",
    remarks: "Waiting for verification",
    status: "Pending",
    dueToday: true,
  },
  {
    id: "REQ-2026-002",
    studentId: "2023300042",
    studentName: "Juan Miguel dela Cruz",
    docs: ["Form 137", "Birth Certificate"],
    requestDate: "2026-05-18",
    receivedDate: "2026-05-19",
    remarks: "Lacking Form 137",
    status: "Pending",
    dueToday: true,
  },
  {
    id: "REQ-2026-003",
    studentId: "2022200087",
    studentName: "Carlo Antonio Reyes",
    docs: ["TOR", "Grades", "Good Moral"],
    requestDate: "2026-05-15",
    receivedDate: "2026-05-16",
    remarks: "Ready for claiming",
    status: "Completed",
    dueToday: false,
  },
  {
    id: "REQ-2026-004",
    studentId: "2025500019",
    studentName: "Riza Mae Gonzales",
    docs: ["Good Moral"],
    requestDate: "2026-05-12",
    receivedDate: "2026-05-13",
    remarks: "Ready for claiming",
    status: "Completed",
    dueToday: false,
  },
  {
    id: "REQ-2026-005",
    studentId: "2024400633",
    studentName: "Angela Faith Tan",
    docs: ["Birth Certificate", "Form 138"],
    requestDate: "2026-05-10",
    receivedDate: "2026-05-11",
    remarks: "Missing Birth Certificate",
    status: "Pending",
    dueToday: true,
  },
  {
    id: "REQ-2026-006",
    studentId: "2023300158",
    studentName: "Ramil Joseph Lim",
    docs: ["Form 137"],
    requestDate: "2026-06-01",
    receivedDate: "2026-06-02",
    remarks: "Under review",
    status: "Pending",
    dueToday: false,
  },
  {
    id: "REQ-2026-007",
    studentId: "2022200301",
    studentName: "Sheila Mae Gomez",
    docs: ["TOR", "Birth Certificate"],
    requestDate: "2026-06-05",
    receivedDate: "2026-06-06",
    remarks: "Awaiting signature",
    status: "Pending",
    dueToday: false,
  },
];

const statusClass = (status) => {
  switch (status) {
    case "Pending": return "req-status-pending";
    case "Completed": return "req-status-completed";
    case "Cancelled": return "req-status-cancelled";
    default: return "req-status-pending";
  }
};

export default function Requests() {
  const [requests, setRequests] = useState(initialRequests);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("");

  const filtered = useMemo(() => {
    return requests.filter(r => {
      const matchSearch =
        r.id.toLowerCase().includes(search.toLowerCase()) ||
        r.studentName.toLowerCase().includes(search.toLowerCase()) ||
        r.studentId.includes(search);
      const matchStatus = filterStatus ? r.status === filterStatus : true;
      return matchSearch && matchStatus;
    });
  }, [requests, search, filterStatus]);

  const totalRequests = requests.length;
  const pendingRequests = requests.filter(r => r.status === "Pending").length;
  const dueTodayRequests = requests.filter(r => r.dueToday && r.status === "Pending").length;

  const handleComplete = (id) => {
    setRequests(prev =>
      prev.map(r => r.id === id ? { ...r, status: "Completed", dueToday: false } : r)
    );
  };

  return (
    <>
      {/* Header */}
      <div className="req-page-header">
        <div>
          <h2 className="req-page-title">Requests</h2>
          <p className="req-page-sub">Document request management</p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="req-summary-grid">
        <div className="req-summary-card">
          <p className="req-summary-label">Total Requests</p>
          <p className="req-summary-value">{totalRequests}</p>
          <div className="req-summary-accent" />
        </div>
        <div className="req-summary-card">
          <p className="req-summary-label">Pending Requests</p>
          <p className="req-summary-value">{pendingRequests}</p>
          <div className="req-summary-accent" />
        </div>
        <div className="req-summary-card-gold">
          <p className="req-summary-label-gold">Due Today</p>
          <p className="req-summary-value-white">{dueTodayRequests}</p>
          <div className="req-summary-accent-white" />
        </div>
      </div>

      {/* Filter Bar */}
      <div className="req-filter-bar">
        <input
          type="text"
          placeholder="Search by request ID, student name or ID..."
          className="req-search"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="req-select"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value)}
        >
          <option value="">All Status</option>
          <option value="Pending">Pending</option>
          <option value="Completed">Completed</option>
          <option value="Cancelled">Cancelled</option>
        </select>
      </div>

      {/* Table */}
      <div className="req-table-wrapper">
        <table className="req-table">
          <thead>
            <tr className="req-thead">
              <th className="req-th-first">Request ID</th>
              <th className="req-th">Student ID</th>
              <th className="req-th">Student Name</th>
              <th className="req-th">Requested Docs</th>
              <th className="req-th">Request Date</th>
              <th className="req-th">Received Date</th>
              <th className="req-th">Remarks</th>
              <th className="req-th">Status</th>
              <th className="req-th">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={9} className="req-empty">No requests found.</td>
              </tr>
            ) : (
              filtered.map((r, i) => (
                <tr key={r.id} className={i % 2 === 0 ? "req-row-even" : "req-row-odd"}>
                  <td className="req-td-first">{r.id}</td>
                  <td className="req-td-id">{r.studentId}</td>
                  <td className="req-td-name">{r.studentName}</td>
                  <td className="req-td-docs">
                    {r.docs.map(doc => (
                      <span key={doc} className="req-doc-tag">{doc}</span>
                    ))}
                  </td>
                  <td className="req-td">{r.requestDate}</td>
                  <td className="req-td">{r.receivedDate}</td>
                  <td className="req-td-remarks">{r.remarks}</td>
                  <td className="req-td">
                    <span className={statusClass(r.status)}>{r.status}</span>
                  </td>
                  <td className="req-td">
                    {r.status === "Pending" ? (
                      <button
                        className="req-complete-btn"
                        onClick={() => handleComplete(r.id)}
                      >
                        Complete
                      </button>
                    ) : (
                      <span className="req-completed-label">—</span>
                    )}
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