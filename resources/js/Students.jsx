import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import "./styles/Students.css";

const yearLevels = ["1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year"];
const intToYearLevel = { 1: "1st Year", 2: "2nd Year", 3: "3rd Year", 4: "4th Year", 5: "5th Year" };

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

export default function Students() {
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

  const [form, setForm] = useState({
    id: "", department: "", course: "", email: "",
    first_name: "", last_name: "", middle_name: "",
  });
  const [fileName, setFileName] = useState("");

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
        email, year_level, status,
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
        email: s.email ?? "",
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

  // ── OCR: Handle file attach and auto-extract name via Laravel + Surya ──
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setFileName(file.name);
    setExtractError("");
    setExtracting(true);

    // Reset name fields while extracting
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
      setExtractError("Could not extract name from document. Please fill in manually.");
    } finally {
      setExtracting(false);
    }
  };

  // ── BACKEND: Insert new student ──
  const handleSubmit = async () => {
    if (!form.id || !form.department || !form.course || !form.first_name || !form.last_name) return;
    setSubmitting(true);
    try {
      const { error } = await supabase
        .from("tbl_student")
        .insert({
          student_id: Number(form.id),
          first_name: form.first_name,
          last_name: form.last_name,
          middle_name: form.middle_name || null,
          email: form.email || null,
          college_id: Number(form.department),
          program_id: Number(form.course),
          year_level: 1,
          status: "Active",
        });

      if (error) {
        console.error("Insert error:", error);
        alert("Failed to save student. Please check the details and try again.");
        return;
      }

      await fetchStudents();
      setForm({ id: "", department: "", course: "", email: "", first_name: "", last_name: "", middle_name: "" });
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
        <select
          className="students-select"
          value={filterDept}
          onChange={e => { setFilterDept(e.target.value); setFilterCourse(""); }}
        >
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
                    <button className="students-view-btn">View</button>
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
          <div className="modal-card" onClick={e => e.stopPropagation()}>
            <h3 className="modal-title">Add Student</h3>
            <p className="modal-sub">Fill in the details or extract information from a document.</p>

            <label className="modal-label">Student ID</label>
            <input
              className="modal-input"
              placeholder="e.g. 2021301754"
              value={form.id}
              onChange={e => handleFormChange("id", e.target.value)}
            />

            <label className="modal-label">Department</label>
            <select
              className="modal-select"
              value={form.department}
              onChange={e => handleFormChange("department", e.target.value)}
            >
              <option value="">Select Department</option>
              {departments.map(d => (
                <option key={d.college_id} value={d.college_id}>{d.college_name}</option>
              ))}
            </select>

            <label className="modal-label">Course</label>
            <select
              className="modal-select"
              value={form.course}
              onChange={e => handleFormChange("course", e.target.value)}
              disabled={!form.department}
            >
              <option value="">Select Course</option>
              {(coursesByDept[Number(form.department)] || []).map(c => (
                <option key={c.program_id} value={c.program_id}>{c.program_name}</option>
              ))}
            </select>

            <label className="modal-label">Email Address</label>
            <input
              className="modal-input"
              placeholder="e.g. juan.delacruz@ustp.edu.ph"
              type="email"
              value={form.email}
              onChange={e => handleFormChange("email", e.target.value)}
            />

            {/* ── OCR File Attachment ── */}
            <label className="modal-label">Extract Information</label>
            <label
              className="modal-extract-btn"
              style={{ opacity: extracting ? 0.7 : 1, cursor: extracting ? "not-allowed" : "pointer" }}
            >
              {extracting
                ? "⏳ Extracting name from document... (this may take a few minutes)"
                : fileName
                  ? `📄 ${fileName}`
                  : "Attach a document to extract student information"}
              <input
                type="file"
                accept=".jpg,.jpeg,.png,.pdf"
                className="hidden"
                disabled={extracting}
                onChange={handleFileChange}
              />
            </label>

            {extractError && (
              <p style={{ color: "red", fontSize: "0.8rem", marginTop: "0.4rem" }}>{extractError}</p>
            )}

            {/* Name fields shown after file is attached — pre-filled by OCR */}
            {fileName && (
              <>
                <label className="modal-label">First Name</label>
                <input
                  className="modal-input"
                  placeholder={extracting ? "Extracting..." : "First name"}
                  value={form.first_name}
                  disabled={extracting}
                  onChange={e => handleFormChange("first_name", e.target.value)}
                />
                <label className="modal-label">Last Name</label>
                <input
                  className="modal-input"
                  placeholder={extracting ? "Extracting..." : "Last name"}
                  value={form.last_name}
                  disabled={extracting}
                  onChange={e => handleFormChange("last_name", e.target.value)}
                />
                <label className="modal-label">
                  Middle Name <span style={{ fontWeight: 400, color: "#999" }}>(optional)</span>
                </label>
                <input
                  className="modal-input"
                  placeholder={extracting ? "Extracting..." : "Middle name"}
                  value={form.middle_name}
                  disabled={extracting}
                  onChange={e => handleFormChange("middle_name", e.target.value)}
                />
              </>
            )}

            <div className="modal-footer">
              <button className="modal-cancel-btn" onClick={() => setShowModal(false)}>Cancel</button>
              <button
                className="modal-submit-btn"
                onClick={handleSubmit}
                disabled={submitting || extracting}
              >
                {submitting ? "Saving..." : "Save Student"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}