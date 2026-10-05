import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { useAuth } from "./AuthContext"; // RBAC
import DocumentScanner from "./DocumentScanner.jsx";
import useDocumentScanner from "./useDocumentScanner";
import "./styles/Dashboard.css";

const ROWS_PER_PAGE = 10;

// Handles year_level stored as a number (1) or text ("1st Year")
const formatYear = (y) => {
  if (y === null || y === undefined || y === "") return "—";
  const n = Number(y);
  if (Number.isNaN(n)) return String(y);
  const suffix =
    n % 100 >= 11 && n % 100 <= 13
      ? "th"
      : { 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th";
  return `${n}${suffix} Year`;
};

export default function Dashboard({
  staffName,
  activePage,
  setActivePage,
  onLogout,
  children,
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);

  const { canAccess } = useAuth(); // RBAC

  // ── SCANNER (reusable hook) ──
  const scanner = useDocumentScanner({
    onScanned: (credential, result) => {
      console.log("Dashboard scan complete:", result.filename);
    },

    onConfirmed: async ({
      studentId,
      studentName,
      documentType,
      fileName,
      fileUrl,
    }) => {
      // Save the confirmed document to your database/API here.
      // OCRConfirmation passes the (possibly corrected) student and type.
      console.log("Dashboard OCR confirmed:", {
        studentId,
        studentName,
        documentType,
        fileName,
        fileUrl,
      });
    },
  });

  // ── STATS STATE ──
  const [stats, setStats] = useState([
    { label: "Total Colleges", value: 0 },
    { label: "Total Courses", value: 0 },
    { label: "Total Students", value: 0 },
    { label: "Credentials Stored", value: 0 },
    { label: "Total Requests", value: 0 },
    { label: "Current Requests", value: 0 },
  ]);
  const [loadingStats, setLoadingStats] = useState(true);

  // ── NEW STUDENTS STATE ──
  const [students, setStudents] = useState([]);
  const [totalStudents, setTotalStudents] = useState(0);
  const [loadingStudents, setLoadingStudents] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);

  // ── BACKEND: Fetch all stat counts ──
  useEffect(() => {
    const fetchStats = async () => {
      setLoadingStats(true);

      try {
        const [
          { count: colleges },
          { count: courses },
          { count: studentCount },
          { count: credentials },
          { count: totalRequests },
          { count: currentRequests },
        ] = await Promise.all([
          supabase
            .from("tbl_college")
            .select("*", { count: "exact", head: true }),

          supabase
            .from("tbl_program")
            .select("*", { count: "exact", head: true }),

          supabase
            .from("tbl_student")
            .select("*", { count: "exact", head: true }),

          supabase
            .from("tbl_student_documents")
            .select("*", { count: "exact", head: true }),

          supabase
            .from("tbl_request")
            .select("*", { count: "exact", head: true }),

          // Current requests = requested documents still pending
          supabase
            .from("tbl_request_document")
            .select("*", { count: "exact", head: true })
            .eq("status", "Pending"),
        ]);

        setStats([
          { label: "Total Colleges", value: colleges ?? 0 },
          { label: "Total Courses", value: courses ?? 0 },
          { label: "Total Students", value: studentCount ?? 0 },
          { label: "Credentials Stored", value: credentials ?? 0 },
          { label: "Total Requests", value: totalRequests ?? 0 },
          { label: "Current Requests", value: currentRequests ?? 0 },
        ]);
      } catch (err) {
        console.error("Error fetching stats:", err);
      } finally {
        setLoadingStats(false);
      }
    };

    fetchStats();
  }, []);

  // ── BACKEND: Fetch newest students (server-side pagination) ──
  useEffect(() => {
    const fetchStudents = async () => {
      setLoadingStudents(true);

      const from = (currentPage - 1) * ROWS_PER_PAGE;
      const to = from + ROWS_PER_PAGE - 1;

      try {
        const { data, count, error } = await supabase
          .from("tbl_student")
          .select(
            `student_id, first_name, middle_name, last_name, year_level,
             tbl_college ( college_name ),
             tbl_program ( program_name )`,
            { count: "exact" }
          )
          .order("student_id", { ascending: false })
          .range(from, to);

        if (error) throw error;

        setStudents(
          (data ?? []).map((s) => ({
            id: s.student_id,
            name: [s.first_name, s.middle_name, s.last_name]
              .filter(Boolean)
              .join(" "),
            department: s.tbl_college?.college_name ?? "—",
            course: s.tbl_program?.program_name ?? "—",
            year: formatYear(s.year_level),
          }))
        );
        setTotalStudents(count ?? 0);
      } catch (err) {
        console.error("Error fetching students:", err);
        setStudents([]);
      } finally {
        setLoadingStudents(false);
      }
    };

    fetchStudents();
  }, [currentPage]);

  const totalPages = Math.max(1, Math.ceil(totalStudents / ROWS_PER_PAGE));
  const showingFrom =
    totalStudents === 0 ? 0 : (currentPage - 1) * ROWS_PER_PAGE + 1;
  const showingTo = Math.min(currentPage * ROWS_PER_PAGE, totalStudents);

  // RBAC: only show the menu items this role may open
  const navItems = [
    "Dashboard",
    "Students",
    "Departments",
    "Requests",
  ].filter((item) => canAccess(item));

  return (
    <div className="dash-layout">

      {/* SIDEBAR */}
      <aside
        className="sidebar"
        style={{
          width: sidebarOpen ? "240px" : "0px",
        }}
      >
        <div className="sidebar-brand">
          <h1 className="sidebar-brand-title">RegisScan</h1>
          <p className="sidebar-brand-sub">Management System</p>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item}
              onClick={() => setActivePage(item)}
              className={
                activePage === item
                  ? "sidebar-nav-item-active"
                  : "sidebar-nav-item"
              }
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
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="topbar-toggle"
            >
              <span className="topbar-hamburger-line" />
              <span className="topbar-hamburger-line" />
              <span className="topbar-hamburger-line" />
            </button>

            <span className="topbar-page-title">{activePage}</span>
          </div>

          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="topbar-staff-btn"
            >
              <div className="text-right">
                <p className="topbar-staff-name">{staffName}</p>
                <p className="topbar-staff-role">Registrar Staff</p>
              </div>

              <div className="topbar-avatar">
                {(staffName || "")
                  .split(" ")
                  .map((n) => n[0])
                  .join("")
                  .slice(0, 2)}
              </div>
            </button>

            {dropdownOpen && (
              <div className="topbar-dropdown">
                <button
                  className="topbar-dropdown-logout"
                  onClick={async () => {
                    setDropdownOpen(false);
                    await onLogout();
                  }}
                >
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

              {/* STAT CARDS */}
              <div className="grid grid-cols-3 gap-5 mb-10">
                {loadingStats
                  ? Array(6)
                      .fill(null)
                      .map((_, i) => (
                        <div key={i} className="stat-card stat-card-default">
                          <p className="stat-label">Loading...</p>
                          <p className="stat-value">—</p>
                          <div className="stat-accent" />
                        </div>
                      ))
                  : stats.map((stat, i) => {
                      const highlighted = i === 5;

                      return (
                        <div
                          key={i}
                          className={`stat-card ${
                            highlighted
                              ? "stat-card-highlighted"
                              : "stat-card-default"
                          }`}
                        >
                          <p
                            className={
                              highlighted
                                ? "stat-label-highlighted"
                                : "stat-label"
                            }
                          >
                            {stat.label}
                          </p>

                          <p
                            className={
                              highlighted
                                ? "stat-value-highlighted"
                                : "stat-value"
                            }
                          >
                            {stat.value.toLocaleString()}
                          </p>

                          <div
                            className={
                              highlighted
                                ? "stat-accent-highlighted"
                                : "stat-accent"
                            }
                          />
                        </div>
                      );
                    })}
              </div>

              {/* NEW STUDENTS */}
              <div className="activity-wrapper">
                <div className="activity-header">
                  <div>
                    <h3 className="activity-header-title">New Students</h3>
                    <p className="activity-header-sub">
                      Recently added student records
                    </p>
                  </div>

                  <button className="scan-btn" onClick={() => scanner.open()}>
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
                    {loadingStudents ? (
                      <tr>
                        <td
                          colSpan={5}
                          style={{
                            textAlign: "center",
                            padding: "24px",
                            color: "#6b7280",
                          }}
                        >
                          Loading students...
                        </td>
                      </tr>
                    ) : students.length === 0 ? (
                      <tr>
                        <td
                          colSpan={5}
                          style={{
                            textAlign: "center",
                            padding: "24px",
                            color: "#6b7280",
                          }}
                        >
                          No students found.
                        </td>
                      </tr>
                    ) : (
                      students.map((student, i) => (
                        <tr
                          key={student.id}
                          className={
                            i % 2 === 0
                              ? "activity-row-even"
                              : "activity-row-odd"
                          }
                        >
                          <td className="activity-td-staff">{student.id}</td>
                          <td className="activity-td-name">{student.name}</td>
                          <td className="activity-td-action">
                            {student.department}
                          </td>
                          <td className="activity-td-action">
                            {student.course}
                          </td>
                          <td className="activity-td-year">{student.year}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>

                {/* PAGINATION */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginTop: "16px",
                    padding: "0 4px",
                  }}
                >
                  <span style={{ fontSize: "0.85rem", color: "#6b7280" }}>
                    Showing{" "}
                    <strong style={{ color: "#111827" }}>{showingFrom}</strong>
                    {" "}–{" "}
                    <strong style={{ color: "#111827" }}>{showingTo}</strong>
                    {" "}of{" "}
                    <strong style={{ color: "#111827" }}>
                      {totalStudents}
                    </strong>
                  </span>

                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                    }}
                  >
                    <button
                      onClick={() =>
                        setCurrentPage((p) => Math.max(1, p - 1))
                      }
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
                      onClick={() =>
                        setCurrentPage((p) => Math.min(totalPages, p + 1))
                      }
                      disabled={currentPage === totalPages}
                      style={{
                        border: "none",
                        background: "transparent",
                        fontSize: "0.85rem",
                        fontWeight: 500,
                        color:
                          currentPage === totalPages ? "#c7cad1" : "#6b7280",
                        cursor:
                          currentPage === totalPages
                            ? "not-allowed"
                            : "pointer",
                        padding: "6px 10px",
                      }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            children
          )}
        </main>
      </div>

      {/* SCAN MODAL + OCR CONFIRMATION (reusable) */}
      <DocumentScanner scanner={scanner} />
    </div>
  );
}