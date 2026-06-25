import { useState } from "react";
import "./styles/Students.css";

const departments = ["CEA", "CITC", "CSM", "CSTE", "COT", "COM", "SHS"];

const coursesByDept = {
  CEA: ["BS Architecture", "BS Civil Engineering", "BS Mechanical Engineering", "BS Computer Engineering", "BS Geodetic Engineering", "BS Electrical Engineering", "BS Electronics Engineering", "Masters of Engineering Program", "Master of Science in Electrical Engineering", "Master of Science in Sustainable Development, Major in Urban Planning and Sustainable Development", "Professional Science Masters in Power Systems Engineering and Management", "Doctor of Philosophy in Energy Engineering"],
  CITC: ["BS Computer Science", "BS Data Science", "BS Information Technology", "BS Technology Communication Management"],
  CSM: ["BS Applied Mathematics", "BS Applied Physics", "BS Chemistry", "BS Environmental Science", "BS Food Technology", "Master of Science in Applied Mathematics", "Master of Science in Environmental Science and Technology – Major in Natural Science", "Doctor of Philosophy in Applied Mathematics"],
  CSTE: ["BS Education Major in Science", "BS Education Major in Mathematics", "BS Technology and Livelihood Education", "BS Technical-Vocational Teacher Education", "Master of Science in Mathematics Education", "Master of Science in Science Education (Chemistry)", "Master of Science in Science Education (Physics)", "Master of Arts in Teaching Special Education", "Master of Arts in Teaching English as a Second Language", "Master in Technical and Technology Education", "Doctor of Philosophy in Mathematics Education", "Doctor of Philosophy in Science Education Major in Chemistry", "Doctor of Technology Education"],
  COT: ["BS Electronics Technology", "BS Autotronics", "BS Energy Systems and Management", "BS Electro-Mechanical Technology", "BS Manufacturing Engineering Technology"],
  COM: ["BS Nursing"],
  SHS: ["STEM"],
};

const yearLevels = ["1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year"];
const statuses = ["Active", "LOA", "Inactive", "Graduated"];

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 10 }, (_, i) => currentYear - i);

const initialStudents = [
  { id: "2021301754", name: "Juan dela Cruz", department: "CITC", course: "BS Information Technology", year: "4th Year", status: "Active" },
  { id: "2022401823", name: "Maria Santos", department: "CEA", course: "BS Civil Engineering", year: "3rd Year", status: "Active" },
  { id: "2020201541", name: "Carlo Reyes", department: "COM", course: "BS Nursing", year: "4th Year", status: "Inactive" },
  { id: "2023101987", name: "Ana Villanueva", department: "CSM", course: "BS Chemistry", year: "2nd Year", status: "Active" },
  { id: "2019501302", name: "Leo Fernandez", department: "COT", course: "BS Electronics Technology", year: "5th Year", status: "Graduated" },
  { id: "2022301658", name: "Rosa Lim", department: "CITC", course: "BS Computer Science", year: "3rd Year", status: "Active" },
  { id: "2021401774", name: "Pio Mangubat", department: "CEA", course: "BS Architecture", year: "4th Year", status: "Active" },
  { id: "2023201845", name: "Sheila Gomez", department: "CSM", course: "BS Applied Mathematics", year: "2nd Year", status: "Active" },
];

const statusClass = (status) => {
  if (status === "Active") return "status-badge status-active";
  if (status === "Graduated") return "status-badge status-graduated";
  return "status-badge status-inactive";
};

export default function Students({ onViewStudent }) {
  const [students, setStudents] = useState(initialStudents);
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [filterCourse, setFilterCourse] = useState("");
  const [showModal, setShowModal] = useState(false);

  const [form, setForm] = useState({
    enrollYear: String(currentYear),
    idSuffix: "",
    name: "",
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
  const [fileName, setFileName] = useState("");

  const generatedId = form.enrollYear && form.idSuffix
    ? `${form.enrollYear}-${form.idSuffix.padStart(6, "0")}`
    : `${form.enrollYear}-000000`;

  const filtered = students.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) || s.id.includes(search);
    const matchDept = filterDept ? s.department === filterDept : true;
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

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) setFileName(file.name);
  };

  const handleSubmit = () => {
    if (!form.name || !form.department || !form.course) return;
    setStudents(prev => [...prev, {
      id: generatedId,
      name: form.name,
      department: form.department,
      course: form.course,
      year: form.yearLevel,
      status: form.status,
    }]);
    setForm({
      enrollYear: String(currentYear),
      idSuffix: "",
      name: "",
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
    setShowModal(false);
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
          {departments.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
        <select className="students-select" value={filterCourse} onChange={e => setFilterCourse(e.target.value)}>
          <option value="">All Courses</option>
          {(filterDept ? coursesByDept[filterDept] : Object.values(coursesByDept).flat()).map(c => (
            <option key={c} value={c}>{c}</option>
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
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="students-empty">No students found.</td>
              </tr>
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
            <label className="modal-extract-btn" style={{ display: "block", marginBottom: "20px" }}>
              {fileName ? `📄 ${fileName}` : "Extract Information — Attach a document"}
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>

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

            {/* Full Name & Birthdate */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "14px", marginBottom: "14px" }}>
              <div>
                <label className="modal-label">Full Name</label>
                <input
                  className="modal-input"
                  style={{ marginBottom: 0 }}
                  placeholder="Complete name"
                  value={form.name}
                  onChange={e => handleFormChange("name", e.target.value)}
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
                  {departments.map(d => <option key={d} value={d}>{d}</option>)}
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
                  {(coursesByDept[form.department] || []).map(c => (
                    <option key={c} value={c}>{c}</option>
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
              <button className="modal-submit-btn" onClick={handleSubmit}>
                Save Student
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