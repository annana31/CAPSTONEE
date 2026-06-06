import { useState } from "react";
import "./styles/Students.css";

const departments = ["CEA", "CITC", "CSM", "CSTE", "COT", "COM", "SHS"];

const coursesByDept = {
  CEA: ["BS Architecture", "BS Civil Engineering", "BS Mechanical Engineering", "BS Computer Engineering", "BS Geodetic Engineering", "BS Electrical Engineering", "BS Electronics Engineering", "Masters of Engineering Program", "Master of Science in Electrical Engineering", "Master of Science in Sustainable Development, Major in Urban Planning and Sustainable Development", "Professional Science Masters in Power Systems Engineering and Management", "Doctor of Philosophy in Energy Engineering"],
  CITC: ["BS Computer Science", "BS Data Science", "BS Information Technology", "BS Technology Communication Management"],
  CSM: ["BS Applied Mathematics", "BS Applied Physics", "BS Chemistry", "BS Environmental Science", "BS Food Technology", "Master of Science in Applied Mathematics", "Master of Science in Environmental Science and Technology – Major in Natural Science", "Doctor of Philosophy in Applied Mathematics" ],
  CSTE: ["BS Education Major in Science", "BS Education Major in Mathematics", "BS Technology and Livelihood Education", "BS Technical-Vocational Teacher Education", "Master of Science in Mathematics Education", "Master of Science in Science Education (Chemistry)", "Master of Science in Science Education (Physics)", "Master of Arts in Teaching Special Education", "Master of Arts in Teaching English as a Second Language", "Master in Technical and Technology Education", "Doctor of Philosophy in Mathematics Education", "Doctor of Philosophy in Science Education Major in Chemistry", "Doctor of Technology Education"],
  COT: ["BS Electronics Technology", "BS Autotronics", "BS Energy Systems and Management", "BS Electro-Mechanical Technology", "BS Manufacturing Engineering Technology"],
  COM: ["BS Nursing"],
  SHS: ["STEM"],
};

const yearLevels = ["1st Year", "2nd Year", "3rd Year", "4th Year", "5th Year"];

const initialStudents = [
  { id: "2021301754", name: "Juan dela Cruz", department: "CITC", course: "BS Information Technology", year: "4th Year", status: "Active" },
  { id: "2022401823", name: "Maria Santos", department: "CEA", course: "BS Civil Engineering", year: "3rd Year", status: "Active" },
  { id: "2020201541", name: "Carlo Reyes", department: "COM", course: "BS Accountancy", year: "4th Year", status: "Inactive" },
  { id: "2023101987", name: "Ana Villanueva", department: "CSM", course: "BS Biology", year: "2nd Year", status: "Active" },
  { id: "2019501302", name: "Leo Fernandez", department: "COT", course: "BS Industrial Technology", year: "5th Year", status: "Graduated" },
  { id: "2022301658", name: "Rosa Lim", department: "CITC", course: "BS Computer Science", year: "3rd Year", status: "Active" },
  { id: "2021401774", name: "Pio Mangubat", department: "CEA", course: "BS Architecture", year: "4th Year", status: "Active" },
  { id: "2023201845", name: "Sheila Gomez", department: "CSM", course: "BS Chemistry", year: "2nd Year", status: "Active" },
];

const statusClass = (status) => {
  if (status === "Active") return "status-badge status-active";
  if (status === "Graduated") return "status-badge status-graduated";
  return "status-badge status-inactive";
};

export default function Students() {
  const [students, setStudents] = useState(initialStudents);
  const [search, setSearch] = useState("");
  const [filterDept, setFilterDept] = useState("");
  const [filterYear, setFilterYear] = useState("");
  const [filterCourse, setFilterCourse] = useState("");
  const [showModal, setShowModal] = useState(false);

  // Add Student form state
  const [form, setForm] = useState({
    id: "", department: "", course: "", email: "", name: "",
  });
  const [fileName, setFileName] = useState("");

  const filtered = students.filter(s => {
    const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) ||
      s.id.includes(search);
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
    if (!form.id || !form.department || !form.course || !form.name) return;
    setStudents(prev => [...prev, {
      id: form.id,
      name: form.name,
      department: form.department,
      course: form.course,
      year: "1st Year",
      status: "Active",
    }]);
    setForm({ id: "", department: "", course: "", email: "", name: "" });
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
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>

            <label className="modal-label">Course</label>
            <select
              className="modal-select"
              value={form.course}
              onChange={e => handleFormChange("course", e.target.value)}
              disabled={!form.department}
            >
              <option value="">Select Course</option>
              {(coursesByDept[form.department] || []).map(c => (
                <option key={c} value={c}>{c}</option>
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

            <label className="modal-label">Extract Information</label>
            <label className="modal-extract-btn">
              {fileName ? fileName : "Attach a document to extract student information"}
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png"
                className="hidden"
                onChange={handleFileChange}
              />
            </label>

            {fileName && (
              <>
                <label className="modal-label">Full Name (extracted)</label>
                <input
                  className="modal-input"
                  placeholder="Extracted name will appear here"
                  value={form.name}
                  onChange={e => handleFormChange("name", e.target.value)}
                />
              </>
            )}

            <div className="modal-footer">
              <button className="modal-cancel-btn" onClick={() => setShowModal(false)}>Cancel</button>
              <button className="modal-submit-btn" onClick={handleSubmit}>Save Student</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}