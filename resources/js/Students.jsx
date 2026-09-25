import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import StudentProfile from "./StudentProfile";
import "./styles/Students.css";

const yearLevels = [
  { value: 1, label: "1st Year" },
  { value: 2, label: "2nd Year" },
  { value: 3, label: "3rd Year" },
  { value: 4, label: "4th Year" },
  { value: 5, label: "5th Year" },
];

const statusClass = (status) => {
  if (status === "Active") return "status-badge status-active";
  if (status === "Graduated") return "status-badge status-graduated";
  return "status-badge status-inactive";
};

// ------------------------------------------------------------
// Table styling (inline so it doesn't depend on extra CSS classes)
// ------------------------------------------------------------
const NAVY = "#1a1a6e";
const GREY = "#6b7280";

const headerRowStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const addBtnStyle = {
  background: NAVY,
  color: "#fff",
  fontWeight: 700,
  fontSize: "1rem",
  border: "none",
  borderRadius: "10px",
  padding: "14px 28px",
  cursor: "pointer",
};

const tableStyle = {
  width: "100%",
  borderCollapse: "collapse",
  textAlign: "left",
};

const thStyle = {
  padding: "26px 16px",
  fontSize: "0.78rem",
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#8a8fa3",
  textAlign: "left",
  verticalAlign: "middle",
};

const tdBase = {
  padding: "22px 16px",
  verticalAlign: "middle",
  textAlign: "left",
  borderBottom: "1px solid #eef0f4",
};

const tdStyle = { ...tdBase, color: GREY };
const tdIdStyle = { ...tdBase, color: NAVY, fontWeight: 700, paddingLeft: "32px" };
const tdNameStyle = { ...tdBase, color: "#141446", fontWeight: 700 };

export default function Students({ onAddStudent }) {
  const [students, setStudents] = useState([]);
  const [colleges, setColleges] = useState([]);
  const [programs, setPrograms] = useState([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [filterCollege, setFilterCollege] = useState("");
  const [filterProgram, setFilterProgram] = useState("");
  const [filterYear, setFilterYear] = useState("");

  const [selectedStudentId, setSelectedStudentId] = useState(null);

  // ============================================================
  // LOAD STUDENTS, COLLEGES AND PROGRAMS FROM SUPABASE
  // ============================================================

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setError("");

        const [studentRes, collegeRes, programRes] = await Promise.all([
          supabase.from("tbl_student").select("*").order("last_name"),
          supabase.from("tbl_college").select("*").order("college_name"),
          supabase.from("tbl_program").select("*").order("program_name"),
        ]);

        if (studentRes.error) throw studentRes.error;
        if (collegeRes.error) throw collegeRes.error;
        if (programRes.error) throw programRes.error;

        setStudents(studentRes.data || []);
        setColleges(collegeRes.data || []);
        setPrograms(programRes.data || []);
      } catch (err) {
        console.error("Load error:", err);
        setError(err.message || "Failed to load students.");
      } finally {
        setLoading(false);
      }
    };

    // Reload whenever we come back from a profile so edits show in the list
    if (selectedStudentId === null) load();
  }, [selectedStudentId]);

  // ============================================================
  // HELPERS
  // ============================================================

  const collegeOf = (s) =>
    colleges.find((c) => Number(c.college_id) === Number(s.college_id));

  const programOf = (s) =>
    programs.find((p) => Number(p.program_id) === Number(s.program_id));

  // List shows "First Last" (middle name is only shown on the profile)
  const listNameOf = (s) =>
    [s.first_name, s.last_name].filter(Boolean).join(" ");

  const yearLabel = (value) =>
    yearLevels.find((y) => Number(y.value) === Number(value))?.label || "—";

  const programOptions = filterCollege
    ? programs.filter((p) => Number(p.college_id) === Number(filterCollege))
    : programs;

  const filtered = students.filter((s) => {
    const term = search.trim().toLowerCase();

    const matchSearch =
      !term ||
      [s.first_name, s.middle_name, s.last_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(term) ||
      String(s.student_id).includes(term);

    const matchCollege = filterCollege
      ? Number(s.college_id) === Number(filterCollege)
      : true;

    const matchProgram = filterProgram
      ? Number(s.program_id) === Number(filterProgram)
      : true;

    const matchYear = filterYear
      ? Number(s.year_level) === Number(filterYear)
      : true;

    return matchSearch && matchCollege && matchProgram && matchYear;
  });

  // ============================================================
  // OPEN PROFILE PAGE
  // ============================================================

  if (selectedStudentId !== null) {
    return (
      <StudentProfile
        studentId={selectedStudentId}
        onBack={() => setSelectedStudentId(null)}
      />
    );
  }

  // ============================================================
  // LIST
  // ============================================================

  return (
    <>
      <div className="students-header" style={headerRowStyle}>
        <h2 className="students-title">Student Records</h2>

        <button
          type="button"
          style={addBtnStyle}
          onClick={() => onAddStudent && onAddStudent()}
        >
          Add Student
        </button>
      </div>

      {error && (
        <div className="mb-4 p-3 rounded bg-red-100 text-red-700">{error}</div>
      )}

      <div className="students-filter-bar">
        <input
          type="text"
          placeholder="Search by name or student ID..."
          className="students-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          className="students-select"
          value={filterCollege}
          onChange={(e) => {
            setFilterCollege(e.target.value);
            setFilterProgram("");
          }}
        >
          <option value="">All Departments</option>
          {colleges.map((c) => (
            <option key={c.college_id} value={c.college_id}>
              {c.college_name}
            </option>
          ))}
        </select>

        <select
          className="students-select"
          value={filterProgram}
          onChange={(e) => setFilterProgram(e.target.value)}
        >
          <option value="">All Courses</option>
          {programOptions.map((p) => (
            <option key={p.program_id} value={p.program_id}>
              {p.program_name}
            </option>
          ))}
        </select>

        <select
          className="students-select"
          value={filterYear}
          onChange={(e) => setFilterYear(e.target.value)}
        >
          <option value="">All Year Levels</option>
          {yearLevels.map((y) => (
            <option key={y.value} value={y.value}>
              {y.label}
            </option>
          ))}
        </select>
      </div>

      <div className="students-table-wrapper">
        <table className="students-table" style={tableStyle}>
          <thead>
            <tr className="students-thead">
              <th style={{ ...thStyle, paddingLeft: "32px" }}>Student ID</th>
              <th style={thStyle}>Full Name</th>
              <th style={thStyle}>Department</th>
              <th style={thStyle}>Course</th>
              <th style={{ ...thStyle, width: "110px" }}>Year Level</th>
              <th style={thStyle}>Status</th>
              <th style={thStyle}>Record</th>
            </tr>
          </thead>

          <tbody>
            {loading && (
              <tr>
                <td colSpan={7} style={tdStyle}>
                  Loading students...
                </td>
              </tr>
            )}

            {!loading && filtered.length === 0 && (
              <tr>
                <td colSpan={7} style={tdStyle}>
                  No students found.
                </td>
              </tr>
            )}

            {!loading &&
              filtered.map((student) => (
                <tr key={student.student_id} style={{ background: "#fff" }}>
                  <td style={tdIdStyle}>{student.student_id}</td>
                  <td style={tdNameStyle}>{listNameOf(student)}</td>
                  <td style={tdStyle}>
                    {collegeOf(student)?.college_name || "—"}
                  </td>
                  <td style={tdStyle}>
                    {programOf(student)?.program_name || "—"}
                  </td>
                  <td style={tdStyle}>{yearLabel(student.year_level)}</td>

                  <td style={tdBase}>
                    <span className={statusClass(student.status)}>
                      {student.status}
                    </span>
                  </td>

                  <td style={tdBase}>
                    <button
                      className="students-view-btn"
                      onClick={() => setSelectedStudentId(student.student_id)}
                    >
                      View
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </>
  );
}