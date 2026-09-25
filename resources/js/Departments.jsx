import { useState, useEffect, useMemo } from "react";
import "./styles/Departments.css";

const API_BASE = "http://127.0.0.1:8000/api"; 

const statusClass = (status) => {
  switch (status) {
    case "Active": return "dept-status-active";
    case "LOA": return "dept-status-loa";
    case "Graduated": return "dept-status-graduated";
    default: return "dept-status-inactive";
  }
};

export default function Departments({ onViewStudent }) {
  const [colleges, setColleges] = useState([]);
  const [selectedDept, setSelectedDept] = useState(null); 
  const [students, setStudents] = useState([]);
  const [filterCourse, setFilterCourse] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const rowsPerPage = 10;

  const token = localStorage.getItem("token");
  const authHeaders = { Authorization: `Bearer ${token}` };

  useEffect(() => {
    fetch(`${API_BASE}/colleges`, { headers: authHeaders })
      .then(res => res.json())
      .then(data => setColleges(data))
      .catch(err => console.error("Failed to load colleges:", err))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedDept) return;
    fetch(`${API_BASE}/colleges/${selectedDept}/students`, { headers: authHeaders })
      .then(res => res.json())
      .then(data => setStudents(data))
      .catch(err => console.error("Failed to load students:", err));
  }, [selectedDept]);

  const dept = colleges.find(c => c.college_id === selectedDept);

  const enrichedStudents = useMemo(() => {
    return students.map(s => ({
      ...s,
      course: dept?.programs?.find(p => p.program_id === s.program_id)?.program_name ?? "",
      year: s.year_level,
      documents: s.documents ?? 0, // real count from the API
    }));
  }, [students, dept]);

  const filtered = useMemo(() => {
    return enrichedStudents.filter(s => {
      const fullName = `${s.first_name} ${s.last_name}`.toLowerCase();
      const matchSearch = fullName.includes(search.toLowerCase()) || String(s.student_id).includes(search);
      const matchCourse = filterCourse ? s.course === filterCourse : true;
      return matchSearch && matchCourse;
    });
  }, [enrichedStudents, search, filterCourse]);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, filterCourse, selectedDept]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / rowsPerPage));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * rowsPerPage;
    return filtered.slice(start, start + rowsPerPage);
  }, [filtered, currentPage]);

  const totalStudents = filtered.length;
  const totalDocs = filtered.reduce((sum, s) => sum + s.documents, 0);
  const completionRate = selectedDept
    ? filterCourse
      ? Math.round(50 + (filterCourse.length % 30))
      : (dept?.completion ?? 0)
    : 0;

  const handleDeptClick = (collegeId) => {
    setSelectedDept(collegeId);
    setFilterCourse("");
    setSearch("");
  };

  const handleBack = () => {
    setSelectedDept(null);
    setFilterCourse("");
    setSearch("");
  };

  if (loading) return <p>Loading departments...</p>;

  if (!selectedDept) {
    return (
      <>
        <div className="dept-page-header">
          <h2 className="dept-page-title">Departments</h2>
          <p className="dept-page-sub">College overview and student records</p>
        </div>

        <div className="dept-grid">
          {colleges.map((c) => (
            <div key={c.college_id} className="dept-card" onClick={() => handleDeptClick(c.college_id)}>
              <div className="dept-card-top">
                <div className="dept-card-icon">
                  <div className="dept-card-icon-inner" />
                </div>
                <span className="dept-card-abbr">{c.college_name}</span>
              </div>
              <div className="dept-card-stats">
                <div className="dept-card-stat-row">
                  <span className="dept-card-stat-label">Students</span>
                  <span className="dept-card-stat-value">{(c.students_count ?? 0).toLocaleString()}</span>
                </div>
                <div className="dept-card-stat-row">
                  <span className="dept-card-stat-label">Credentials</span>
                  <span className="dept-card-stat-value">
                    {(c.documents_count ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="dept-card-stat-row">
                  <span className="dept-card-stat-label">Completion</span>
                  <span className="dept-card-stat-value-gold">{c.completion ?? 0}%</span>
                </div>
              </div>
              <div className="dept-progress-bar-bg">
                <div className="dept-progress-bar-fill" style={{ width: `${c.completion ?? 0}%` }} />
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  return (
    <>
      {/* Back */}
      <button className="dept-back-btn" onClick={handleBack}>
        &larr; Back to Departments
      </button>

      {/* Header */}
      <div className="dept-breakdown-header">
        <div>
          <h2 className="dept-breakdown-abbr">{dept?.college_name}</h2>
          <p className="dept-breakdown-name">{dept?.full_name ?? dept?.college_name}</p>
        </div>
        <div className="dept-progress-bar-bg" style={{ width: "200px" }}>
          <div className="dept-progress-bar-fill" style={{ width: `${completionRate}%` }} />
        </div>
      </div>

      {/* Summary Stats */}
      <div className="dept-summary-grid">
        <div className="dept-summary-card">
          <p className="dept-summary-label">Total Students</p>
          <p className="dept-summary-value">{totalStudents.toLocaleString()}</p>
          <div className="dept-summary-accent" />
        </div>
        <div className="dept-summary-card">
          <p className="dept-summary-label">Documents Uploaded</p>
          <p className="dept-summary-value">{totalDocs.toLocaleString()}</p>
          <div className="dept-summary-accent" />
        </div>
        <div className="dept-summary-card">
          <p className="dept-summary-label">Completion Rate</p>
          <p className="dept-summary-value-gold">{completionRate}%</p>
          <div className="dept-summary-accent" />
        </div>
      </div>

      {/* Filter Bar */}
      <div className="dept-filter-bar">
        <input
          type="text"
          placeholder="Search by name or student ID..."
          className="dept-search"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="dept-select"
          value={filterCourse}
          onChange={e => setFilterCourse(e.target.value)}
        >
          <option value="">All Courses</option>
          {dept?.programs?.map(p => (
            <option key={p.program_id} value={p.program_name}>{p.program_name}</option>
          ))}
        </select>
      </div>

      {/* Table */}
      <div className="dept-table-wrapper">
        <table className="dept-table">
          <thead>
            <tr className="dept-thead">
              <th className="dept-th-first">Student ID</th>
              <th className="dept-th">Full Name</th>
              <th className="dept-th">Course</th>
              <th className="dept-th">Year Level</th>
              <th className="dept-th">Credential Completion</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={5} className="dept-empty">No students found.</td>
              </tr>
            ) : (
              paginated.map((s, i) => {
                const pct = Math.round((s.documents / 8) * 100);
                return (
                  <tr key={s.student_id} className={i % 2 === 0 ? "dept-row-even" : "dept-row-odd"}>
                    <td className="dept-td-first">{s.student_id}</td>
                    <td className="dept-td-name">{s.first_name} {s.last_name}</td>
                    <td className="dept-td">{s.course}</td>
                    <td className="dept-td">{s.year}</td>
                    <td className="dept-td">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className="h-1.5 bg-[#e6a817] rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs font-bold text-gray-500 w-8 text-right">{pct}%</span>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {filtered.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: "16px", padding: "0 4px" }}>
          <span style={{ fontSize: "0.85rem", color: "#6b7280" }}>
            Showing <strong style={{ color: "#111827" }}>{(currentPage - 1) * rowsPerPage + 1}</strong>
            {" "}–{" "}
            <strong style={{ color: "#111827" }}>{Math.min(currentPage * rowsPerPage, filtered.length)}</strong>
            {" "}of{" "}
            <strong style={{ color: "#111827" }}>{filtered.length}</strong>
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              style={{
                border: "none",
                background: "transparent",
                fontSize: "0.85rem",
                fontWeight: 500,
                color: currentPage === 1 ? "#c7cad1" : "#6b7280",
                cursor: currentPage === 1 ? "not-allowed" : "pointer",
                padding: "6px 10px",
              }}
            >
              Prev
            </button>

            <span
              style={{
                border: "none",
                borderRadius: "8px",
                minWidth: "32px",
                height: "32px",
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "0.85rem",
                fontWeight: 600,
                background: "#1a1a5e",
                color: "#fff",
              }}
            >
              {currentPage}
            </span>

            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              style={{
                border: "none",
                background: "transparent",
                fontSize: "0.85rem",
                fontWeight: 500,
                color: currentPage === totalPages ? "#c7cad1" : "#6b7280",
                cursor: currentPage === totalPages ? "not-allowed" : "pointer",
                padding: "6px 10px",
              }}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </>
  );
}