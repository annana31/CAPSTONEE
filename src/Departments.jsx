import { useState, useMemo } from "react";
import "./styles/Departments.css";

const departmentData = {
  CEA: {
    full: "College of Engineering & Architecture",
    courses: ["BS Architecture", "BS Civil Engineering", "BS Mechanical Engineering", "BS Computer Engineering", "BS Geodetic Engineering", "BS Electrical Engineering", "BS Electronics Engineering", "Masters of Engineering Program", "Master of Science in Electrical Engineering", "Master of Science in Sustainable Development, Major in Urban Planning and Sustainable Development", "Professional Science Masters in Power Systems Engineering and Management", "Doctor of Philosophy in Energy Engineering"],
    completion: 68,
  },
  CITC: {
    full: "College of IT & Computing",
    courses: ["BS Computer Science", "BS Data Science", "BS Information Technology", "BS Technology Communication Management"],
    completion: 74,
  },
  CSM: {
    full: "College of Science & Mathematics",
    courses: ["BS Applied Mathematics", "BS Applied Physics", "BS Chemistry", "BS Environmental Science", "BS Food Technology", "Master of Science in Applied Mathematics", "Master of Science in Environmental Science and Technology – Major in Natural Science", "Doctor of Philosophy in Applied Mathematics"],
    completion: 71,
  },
  CSTE: {
    full: "College of Science & Technology Education",
    courses: ["BS Education Major in Science", "BS Education Major in Mathematics", "BS Technology and Livelihood Education", "BS Technical-Vocational Teacher Education", "Master of Science in Mathematics Education", "Master of Science in Science Education (Chemistry)", "Master of Science in Science Education (Physics)", "Master of Arts in Teaching Special Education", "Master of Arts in Teaching English as a Second Language", "Master in Technical and Technology Education", "Doctor of Philosophy in Mathematics Education", "Doctor of Philosophy in Science Education Major in Chemistry", "Doctor of Technology Education"],
    completion: 63,
  },
  COT: {
    full: "College of Technology",
    courses: ["BS Electronics Technology", "BS Autotronics", "BS Energy Systems and Management", "BS Electro-Mechanical Technology", "BS Manufacturing Engineering Technology"],
    completion: 69,
  },
  COM: {
    full: "College of Management",
    courses: ["BS Nursing"],
    completion: 77,
  },
  SHS: {
    full: "Senior High School",
    courses: ["STEM"],
    completion: 82,
  },
};

// Generate mock students per department
const generateStudents = (dept) => {
  const courses = departmentData[dept].courses;
  const statuses = ["Active", "Active", "Active", "LOA", "Graduated", "Inactive"];
  const firstNames = ["Juan", "Maria", "Carlo", "Ana", "Leo", "Rosa", "Pio", "Sheila", "Mark", "Luz", "Jose", "Clara"];
  const lastNames = ["dela Cruz", "Santos", "Reyes", "Villanueva", "Fernandez", "Lim", "Mangubat", "Gomez", "Uy", "Garcia", "Bautista", "Torres"];
  const years = ["1st Year", "2nd Year", "3rd Year", "4th Year"];

  return Array.from({ length: 20 }, (_, i) => ({
    id: `20${20 + (i % 5)}${Math.floor(100000 + Math.random() * 900000)}`.slice(0, 10),
    name: `${firstNames[i % firstNames.length]} ${lastNames[(i + 3) % lastNames.length]}`,
    course: courses[i % courses.length],
    year: years[i % years.length],
    status: statuses[i % statuses.length],
    documents: Math.floor(3 + Math.random() * 5),
  }));
};

const allStudents = Object.fromEntries(
  Object.keys(departmentData).map(dept => [dept, generateStudents(dept)])
);

const statusClass = (status) => {
  switch (status) {
    case "Active": return "dept-status-active";
    case "LOA": return "dept-status-loa";
    case "Graduated": return "dept-status-graduated";
    default: return "dept-status-inactive";
  }
};

export default function Departments({ onViewStudent }) {
  const [selectedDept, setSelectedDept] = useState(null);
  const [filterCourse, setFilterCourse] = useState("");
  const [search, setSearch] = useState("");

  const students = selectedDept ? allStudents[selectedDept] : [];

  const filtered = useMemo(() => {
    return students.filter(s => {
      const matchSearch = s.name.toLowerCase().includes(search.toLowerCase()) || s.id.includes(search);
      const matchCourse = filterCourse ? s.course === filterCourse : true;
      return matchSearch && matchCourse;
    });
  }, [students, search, filterCourse]);

  const totalStudents = filtered.length;
  const totalDocs = filtered.reduce((sum, s) => sum + s.documents, 0);
  const completionRate = selectedDept
    ? filterCourse
      ? Math.round(50 + (filterCourse.length % 30))
      : departmentData[selectedDept].completion
    : 0;

  const handleDeptClick = (dept) => {
    setSelectedDept(dept);
    setFilterCourse("");
    setSearch("");
  };

  const handleBack = () => {
    setSelectedDept(null);
    setFilterCourse("");
    setSearch("");
  };

  // ── OVERVIEW ──
  if (!selectedDept) {
    return (
      <>
        <div className="dept-page-header">
          <h2 className="dept-page-title">Departments</h2>
          <p className="dept-page-sub">College overview and student records</p>
        </div>

        <div className="dept-grid">
          {Object.entries(departmentData).map(([abbr, data]) => (
            <div key={abbr} className="dept-card" onClick={() => handleDeptClick(abbr)}>
              <div className="dept-card-top">
                <div className="dept-card-icon">
                  <div className="dept-card-icon-inner" />
                </div>
                <span className="dept-card-abbr">{abbr}</span>
              </div>
              <p className="dept-card-name">{data.full}</p>
              <div className="dept-card-stats">
                <div className="dept-card-stat-row">
                  <span className="dept-card-stat-label">Students</span>
                  <span className="dept-card-stat-value">{allStudents[abbr].length.toLocaleString()}</span>
                </div>
                <div className="dept-card-stat-row">
                  <span className="dept-card-stat-label">Credentials</span>
                  <span className="dept-card-stat-value">
                    {allStudents[abbr].reduce((s, st) => s + st.documents, 0).toLocaleString()}
                  </span>
                </div>
                <div className="dept-card-stat-row">
                  <span className="dept-card-stat-label">Completion</span>
                  <span className="dept-card-stat-value-gold">{data.completion}%</span>
                </div>
              </div>
              <div className="dept-progress-bar-bg">
                <div className="dept-progress-bar-fill" style={{ width: `${data.completion}%` }} />
              </div>
            </div>
          ))}
        </div>
      </>
    );
  }

  // ── BREAKDOWN ──
  const dept = departmentData[selectedDept];

  return (
    <>
      {/* Back */}
      <button className="dept-back-btn" onClick={handleBack}>
        &larr; Back to Departments
      </button>

      {/* Header */}
      <div className="dept-breakdown-header">
        <div>
          <h2 className="dept-breakdown-abbr">{selectedDept}</h2>
          <p className="dept-breakdown-name">{dept.full}</p>
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
          {dept.courses.map(c => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      {/* Table */}
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
      {filtered.length === 0 ? (
        <tr>
          <td colSpan={5} className="dept-empty">No students found.</td>
        </tr>
      ) : (
        filtered.map((s, i) => {
          const pct = Math.round((s.documents / 8) * 100);
          return (
            <tr key={s.id} className={i % 2 === 0 ? "dept-row-even" : "dept-row-odd"}>
              <td className="dept-td-first">{s.id}</td>
              <td className="dept-td-name">{s.name}</td>
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
    </>
  );
}