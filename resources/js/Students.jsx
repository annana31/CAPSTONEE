import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import "./styles/Students.css";

const yearLevels = ["1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year"];
const statuses = ["Active", "LOA", "Inactive", "Graduated"];
const intToYearLevel = { 1: "1st Year", 2: "2nd Year", 3: "3rd Year", 4: "4th Year", 5: "5th Year" };
const yearLevelToInt = { "1st Year": 1, "2nd Year": 2, "3rd Year": 3, "4th Year": 4, "5th Year": 5 };

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 10 }, (_, i) => currentYear - i);

const statusClass = (status) => {
  if (status === "Active") return "status-badge status-active";
  if (status === "Graduated") return "status-badge status-graduated";
  return "status-badge status-inactive";
};

// ── OCR: Extract name fields via Laravel + Surya OCR backend ──
const extractNameFromFile = async (file) => {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("http://127.0.0.1:8000/api/ocr/extract", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.message || "OCR request failed");
  }

  const data = await response.json();
  if (!data.success) throw new Error(data.message || "OCR failed");

  return {
    first_name: data.first_name || "",
    last_name: data.last_name || "",
    middle_name: data.middle_name || "",
  };
};

export default function Students({ onViewStudent }) {
  const [students, setStudents] = useState([]);
  const [departments, setDepartments] = useState([]);
  const [coursesByDept, setCoursesByDept] = useState({});
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [filterCourse, setFilterCourse] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [extractError, setExtractError] = useState("");
  const [fileName, setFileName] = useState("");

  const [form, setForm] = useState({
    enrollYear: String(currentYear),
    idSuffix: "",
    first_name: "",
    last_name: "",
    middle_name: "",
    birthdate: "",
    gender: "Female",
    email: "",
    contact: "",
    department: "",
    course: "",
    yearLevel: "1st Year",
    status: "Active",
    address: "",
  });

  const generatedId = form.enrollYear && form.idSuffix
    ? `${form.enrollYear}${form.idSuffix.padStart(6, "0")}`
    : `${form.enrollYear}000000`;

  // ── BACKEND: Fetch colleges ──
  useEffect(() => {
    const fetchColleges = async () => {
      const { data, error } = await supabase
        .from("tbl_college")
        .select("college_id, college_name")
        .order("college_name");
      if (!error && data) setDepartments(data);
    };
    fetchColleges();
  }, []);

  // ── BACKEND: Fetch programs grouped by college_id ──
  useEffect(() => {
    const fetchPrograms = async () => {
      const { data, error } = await supabase
        .from("tbl_program")
        .select("program_id, program_name, college_id")
        .order("program_name");
      if (!error && data) {
        const grouped = {};
        data.forEach(p => {
          if (!grouped[p.college_id]) grouped[p.college_id] = [];
          grouped[p.college_id].push({ program_id: p.program_id, program_name: p.program_name });
        });
        setCoursesByDept(grouped);
      }
    };
    fetchPrograms();
  }, []);

  // ── BACKEND: Fetch students ──
  const fetchStudents = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tbl_student")
      .select(`
        student_id, first_name, last_name, middle_name,
        birthdate, gender, email, contact_number, address,
        year_level, status,
        tbl_college (college_id, college_name),
        tbl_program (program_id, program_name)
      `)
      .order("last_name");

    if (!error && data) {
      setStudents(data.map(s => ({
        id: s.student_id,
        name: `${s.first_name ?? ""} ${s.last_name ?? ""}`.trim(),
        first_name: s.first_name ?? "",
        last_name: s.last_name ?? "",
        middle_name: s.middle_name ?? "",
        birthdate: s.birthdate ?? "",
        gender: s.gender ?? "",
        email: s.email ?? "",
        contact: s.contact_number ?? "",
        address: s.address ?? "",
        department: s.tbl_college?.college_name ?? "—",
        college_id: s.tbl_college?.college_id ?? null,
        course: s.tbl_program?.program_name ?? "—",
        program_id: s.tbl_program?.program_id ?? null,
        year: intToYearLevel[s.year_level] ?? `Year ${s.year_level}`,
        status: s.status ?? "Active",
      })));
    }
    setLoading(false);
  };

  useEffect(() => { fetchStudents(); }, []);

  // ── FILTER ──
  const filtered = students.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      String(s.id).includes(search);
    const matchDept = filterDept ? s.college_id === Number(filterDept) : true;
    const matchYear = filterYear ? s.year === filterYear : true;
    const matchCourse = filterCourse ? s.course === filterCourse : true;
    return matchSearch && matchDept && matchYear && matchCourse;
  });

  const handleFormChange = (field, value) => {
    setForm(prev => ({
      ...prev,
      [field]: value,
      ...(field === "department" ? { course: "" } : {}),
    }));
  };

  // ── OCR: Handle file attach and auto-extract name ──
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setExtractError("");
    setExtracting(true);
    setForm(prev => ({ ...prev, first_name: "", last_name: "", middle_name: "" }));

    try {
      const extracted = await extractNameFromFile(file);
      setForm(prev => ({
        ...prev,
        first_name: extracted.first_name || prev.first_name,
        last_name: extracted.last_name || prev.last_name,
        middle_name: extracted.middle_name || prev.middle_name,
      }));
    } catch (err) {
      console.error("OCR extraction failed:", err);
      setExtractError("Could not extract name. Please fill in manually.");
    } finally {
      setExtracting(false);
    }
  };

  // ── BACKEND: Insert new student ──
  const handleSubmit = async () => {
    if (!form.first_name || !form.last_name || !form.department || !form.course) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("tbl_student")
        .insert({
          student_id: Number(generatedId),
          first_name: form.first_name,
          last_name: form.last_name,
          middle_name: form.middle_name || null,
          birthdate: form.birthdate || null,
          gender: form.gender || null,
          email: form.email || null,
          contact_number: form.contact || null,
          address: form.address || null,
          college_id: Number(form.department),
          program_id: Number(form.course),
          year_level: yearLevelToInt[form.yearLevel] || 1,
          status: form.status,
        });

      if (error) {
        console.error("Insert error:", error);
        alert("Failed to save student: " + error.message);
        return;
      }

      await fetchStudents();
      setForm({
        enrollYear: String(currentYear),
        idSuffix: "",
        first_name: "",
        last_name: "",
        middle_name: "",
        birthdate: "",
        gender: "Female",
        email: "",
        contact: "",
        department: "",
        course: "",
        yearLevel: "1st Year",
        status: "Active",
        address: "",
      });
      setFileName("");
      setExtractError("");
      setShowModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      {/* Header */}
      <div className="students-header">
        <h2 className="students-title">Student Records</h2>
        <button className="students-add-btn" onClick={() => setShowModal(true)}>
          Add Student
        </button>
      </div>

      {/* Filter Bar */}
      <div className="students-filter-bar">
        <input
          type="text"
          placeholder="Search by name or student ID..."
          className="students-search"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select className="students-select" value={filterDept} onChange={e => { setFilterDept(e.target.value); setFilterCourse(""); }}>
          <option value="">All Departments</option>
          {departments.map(d => (
            <option key={d.college_id} value={d.college_id}>{d.college_name}</option>
          ))}
        </select>
        <select className="students-select" value={filterCourse} onChange={e => setFilterCourse(e.target.value)}>
          <option value="">All Courses</option>
          {(filterDept ? (coursesByDept[Number(filterDept)] || []) : Object.values(coursesByDept).flat())
            .map(c => (
              <option key={c.program_id} value={c.program_name}>{c.program_name}</option>
            ))}
        </select>
        <select className="students-select" value={filterYear} onChange={e => setFilterYear(e.target.value)}>
          <option value="">All Year Levels</option>
          {yearLevels.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="students-table-wrapper">
        <table className="students-table">
          <thead>
            <tr className="students-thead">
              <th className="students-th-first">Student ID</th>
              <th className="students-th">Full Name</th>
              <th className="students-th">Department</th>
              <th className="students-th">Course</th>
              <th className="students-th">Year Level</th>
              <th className="students-th">Status</th>
              <th className="students-th">Record</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="students-empty">Loading students...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="students-empty">No students found.</td></tr>
            ) : (
              filtered.map((s, i) => (
                <tr key={s.id} className={i % 2 === 0 ? "students-row-even" : "students-row-odd"}>
                  <td className="students-td-first">{s.id}</td>
                  <td className="students-td-name">{s.name}</td>
                  <td className="students-td">{s.department}</td>
                  <td className="students-td">{s.course}</td>
                  <td className="students-td">{s.year}</td>
                  <td className="students-td">
                    <span className={statusClass(s.status)}>{s.status}</span>
                  </td>
                  <td className="students-td">
                    <button className="students-view-btn" onClick={() => onViewStudent && onViewStudent(s)}>
                      View
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add Student Modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div
            className="modal-card"
            style={{ maxWidth: "600px", maxHeight: "90vh", overflowY: "auto" }}
            onClick={e => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "20px" }}>
              <h3 className="modal-title" style={{ margin: 0 }}>Add New Student</h3>
              <button
                onClick={() => setShowModal(false)}
                style={{ background: "none", border: "none", color: "#9ca3af", fontSize: "18px", cursor: "pointer", lineHeight: 1 }}
              >
                ✕
              </button>
            </div>

            {/* Extract Information */}
            <label
              className="modal-extract-btn"
              style={{ display: "block", marginBottom: "8px", opacity: extracting ? 0.7 : 1, cursor: extracting ? "not-allowed" : "pointer" }}
            >
              {extracting
                ? "⏳ Extracting name from document... (this may take a few minutes)"
                : fileName
                  ? `📄 ${fileName}`
                  : "Extract Information — Attach a document"}
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                disabled={extracting}
                onChange={handleFileChange}
              />
            </label>

            {extractError && (
              <p style={{ color: "red", fontSize: "0.8rem", marginBottom: "12px" }}>{extractError}</p>
            )}

            {/* Student ID Generator */}
            <div style={{ background: "rgba(230,168,23,0.08)", border: "1px solid rgba(230,168,23,0.2)", borderRadius: "10px", padding: "14px 16px", marginBottom: "20px" }}>
              <p className="modal-label" style={{ marginBottom: "10px", color: "#e6a817" }}>Student ID Generator</p>
              <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <select
                  className="modal-select"
                  style={{ flex: 1, marginBottom: 0 }}
                  value={form.enrollYear}
                  onChange={e => handleFormChange("enrollYear", e.target.value)}
                >
                  {yearOptions.map(y => <option key={y} value={String(y)}>{y}</option>)}
                </select>
                <span style={{ color: "#9ca3af", fontWeight: "bold", fontSize: "16px" }}>—</span>
                <input
                  className="modal-input"
                  style={{ flex: 2, marginBottom: 0 }}
                  placeholder="123456"
                  maxLength={6}
                  value={form.idSuffix}
                  onChange={e => handleFormChange("idSuffix", e.target.value.replace(/\D/g, ""))}
                />
                <div style={{
                  background: "rgba(26,26,110,0.08)",
                  border: "1px solid rgba(26,26,110,0.2)",
                  borderRadius: "8px",
                  padding: "10px 14px",
                  fontSize: "13px",
                  fontWeight: "bold",
                  color: "#1a1a6e",
                  whiteSpace: "nowrap",
                }}>
                  {generatedId}
                </div>
              </div>
            </div>

            {/* First Name & Last Name */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
              <div>
                <label className="modal-label">First Name</label>
                <input
                  className="modal-input"
                  style={{ marginBottom: 0 }}
                  placeholder={extracting ? "Extracting..." : "First name"}
                  value={form.first_name}
                  disabled={extracting}
                  onChange={e => handleFormChange("first_name", e.target.value)}
                />
              </div>
              <div>
                <label className="modal-label">Last Name</label>
                <input
                  className="modal-input"
                  style={{ marginBottom: 0 }}
                  placeholder={extracting ? "Extracting..." : "Last name"}
                  value={form.last_name}
                  disabled={extracting}
                  onChange={e => handleFormChange("last_name", e.target.value)}
                />
              </div>
            </div>

            {/* Middle Name & Birthdate */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
              <div>
                <label className="modal-label">Middle Name <span style={{ fontWeight: 400, color: "#999" }}>(optional)</span></label>
                <input
                  className="modal-input"
                  style={{ marginBottom: 0 }}
                  placeholder={extracting ? "Extracting..." : "Middle name"}
                  value={form.middle_name}
                  disabled={extracting}
                  onChange={e => handleFormChange("middle_name", e.target.value)}
                />
              </div>
              <div>
                <label className="modal-label">Birthdate</label>
                <input
                  type="date"
                  className="modal-input"
                  style={{ marginBottom: 0 }}
                  value={form.birthdate}
                  onChange={e => handleFormChange("birthdate", e.target.value)}
                />
              </div>
            </div>

            {/* Gender & Email */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
              <div>
                <label className="modal-label">Gender</label>
                <select
                  className="modal-select"
                  style={{ marginBottom: 0 }}
                  value={form.gender}
                  onChange={e => handleFormChange("gender", e.target.value)}
                >
                  <option>Female</option>
                  <option>Male</option>
                  <option>Prefer not to say</option>
                </select>
              </div>
              <div>
                <label className="modal-label">Email</label>
                <input
                  type="email"
                  className="modal-input"
                  style={{ marginBottom: 0 }}
                  placeholder="Email address"
                  value={form.email}
                  onChange={e => handleFormChange("email", e.target.value)}
                />
              </div>
            </div>

            {/* Contact & Department */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
              <div>
                <label className="modal-label">Contact Number</label>
                <input
                  className="modal-input"
                  style={{ marginBottom: 0 }}
                  placeholder="09XXXXXXXXX"
                  value={form.contact}
                  onChange={e => handleFormChange("contact", e.target.value)}
                />
              </div>
              <div>
                <label className="modal-label">Department</label>
                <select
                  className="modal-select"
                  style={{ marginBottom: 0 }}
                  value={form.department}
                  onChange={e => handleFormChange("department", e.target.value)}
                >
                  <option value="">Select Department</option>
                  {departments.map(d => (
                    <option key={d.college_id} value={d.college_id}>{d.college_name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Course & Year Level */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
              <div>
                <label className="modal-label">Course</label>
                <select
                  className="modal-select"
                  style={{ marginBottom: 0 }}
                  value={form.course}
                  onChange={e => handleFormChange("course", e.target.value)}
                  disabled={!form.department}
                >
                  <option value="">Select Course</option>
                  {(coursesByDept[Number(form.department)] || []).map(c => (
                    <option key={c.program_id} value={c.program_id}>{c.program_name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="modal-label">Year Level</label>
                <select
                  className="modal-select"
                  style={{ marginBottom: 0 }}
                  value={form.yearLevel}
                  onChange={e => handleFormChange("yearLevel", e.target.value)}
                >
                  {yearLevels.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </div>

            {/* Status */}
            <div style={{ marginBottom: "14px" }}>
              <label className="modal-label">Status</label>
              <select
                className="modal-select"
                style={{ marginBottom: 0 }}
                value={form.status}
                onChange={e => handleFormChange("status", e.target.value)}
              >
                {statuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Address */}
            <div style={{ marginBottom: "20px" }}>
              <label className="modal-label">Address</label>
              <input
                className="modal-input"
                style={{ marginBottom: 0 }}
                placeholder="Complete address"
                value={form.address}
                onChange={e => handleFormChange("address", e.target.value)}
              />
            </div>

            {/* Footer */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <button
                className="modal-submit-btn"
                onClick={handleSubmit}
                disabled={submitting || extracting}
              >
                {submitting ? "Saving..." : "Save Student"}
              </button>
              <button
                className="modal-cancel-btn"
                style={{ border: "1px solid #e5e7eb", borderRadius: "8px", padding: "10px" }}
                onClick={() => setShowModal(false)}
              >
                Cancel
              </button>
            </div>

          </div>
        </div>
      )}
    </>
  );
}