import { useState } from "react";
import axios from "axios";

const requestTypes = [
  { label: "Authentication (₱5/page)", value: "Authentication", price: 5 },
  { label: "CAV Certification (₱125)", value: "CAV Certification", price: 125 },
  { label: "Certification (₱80)", value: "Certification", price: 80 },
  { label: "Correction of Name (₱100)", value: "Correction of Name", price: 100 },
  { label: "Diploma Replacement (₱100)", value: "Diploma Replacement", price: 100 },
  { label: "Evaluation (₱50)", value: "Evaluation", price: 50 },
  { label: "Form 137 (₱100)", value: "Form 137", price: 100 },
  { label: "Honorable Dismissal (₱100)", value: "Honorable Dismissal", price: 100 },
  { label: "Permit to Study (₱100)", value: "Permit to Study", price: 100 },
  { label: "Transcript of Records (₱125/page)", value: "Transcript of Records", price: 125 },
];

const cavChoices = ["BFP", "BJMP", "CHED", "DEP-ED", "DFA", "PNP", "POEA"];

const certificationChoices = [
  "Authorization Letter", "CAR", "Earned Units", "Endorsement",
  "English: Medium of Instruction", "GPA", "Grading System", "Graduated",
  "Letter of No Objection", "Officially Enrolled", "Subjects Enrolled",
  "Subjects with Grade", "USTP Conversion", "Others",
];

const documentIdMap = {
  "Authentication":        1,
  "CAV Certification":     2,
  "Certification":         3,
  "Correction of Name":    4,
  "Diploma Replacement":   5,
  "Evaluation":            6,
  "Form 137":              7,
  "Honorable Dismissal":   8,
  "Permit to Study":       9,
  "Transcript of Records": 10,
};

const yearLevelMap = {
  1: "1st Year", 2: "2nd Year", 3: "3rd Year", 4: "4th Year", 5: "5th Year",
};

export default function StudentPreview({ onBack }) {
  // ── Search state ──────────────────────────────────────────────
  const [studentId, setStudentId] = useState("");
  const [requests,  setRequests]  = useState([]);
  const [showForm,  setShowForm]  = useState(false);

  // ── Form state ────────────────────────────────────────────────
  const [formStudentId, setFormStudentId] = useState("");
  const [fullName,      setFullName]      = useState("");
  const [email,         setEmail]         = useState("");
  const [course,        setCourse]        = useState("");
  const [yearLevel,     setYearLevel]     = useState("");
  const [purpose,       setPurpose]       = useState("");
  const [studentFound,  setStudentFound]  = useState(false);

  const [requestType, setRequestType] = useState("CAV Certification");
  const [cavChoice,   setCavChoice]   = useState("");
  const [cavOther,    setCavOther]    = useState("");
  const [certChoice,  setCertChoice]  = useState("");
  const [certOther,   setCertOther]   = useState("");
  const [subjectSem,  setSubjectSem]  = useState("");
  const [subjectSY1,  setSubjectSY1]  = useState("");
  const [subjectSY2,  setSubjectSY2]  = useState("");

  const [submitting,    setSubmitting]    = useState(false);
  const [fetchingStudent, setFetchingStudent] = useState(false);

  // ── Style helpers ─────────────────────────────────────────────
  const inputClass     = "border border-gray-300 p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4A017] text-sm w-full";
  const readOnlyClass  = "border border-gray-200 p-3 rounded-lg text-sm w-full bg-gray-50 text-gray-500 cursor-not-allowed";
  const selectClass    = "w-full border border-gray-300 p-3 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-[#D4A017] text-sm bg-white";
  const labelClass     = "block text-xs font-bold text-[#0A2342] uppercase tracking-widest mb-1.5";

  // ── Helpers ───────────────────────────────────────────────────
  const resetForm = () => {
    setFormStudentId(""); setFullName(""); setEmail("");
    setCourse(""); setYearLevel(""); setPurpose("");
    setStudentFound(false);
    setRequestType("CAV Certification");
    setCavChoice(""); setCavOther("");
    setCertChoice(""); setCertOther("");
    setSubjectSem(""); setSubjectSY1(""); setSubjectSY2("");
  };

  // ── Fetch student info ────────────────────────────────────────
  const fetchStudent = async (id) => {
    if (!id.trim()) return;
    setFetchingStudent(true);
    try {
      const res = await axios.get(`/api/student/${id}`);
      const s = res.data;
      const name = [s.first_name, s.middle_name, s.last_name].filter(Boolean).join(" ");
      setFullName(name);
      setEmail(s.email ?? "");
      setCourse(s.program_name ?? "");
      setYearLevel(yearLevelMap[s.year_level] ?? "");
      setStudentFound(true);
    } catch {
      setFullName(""); setEmail(""); setCourse(""); setYearLevel("");
      setStudentFound(false);
      alert("Student not found. Please check the Student ID.");
    } finally {
      setFetchingStudent(false);
    }
  };

  // ── API calls ─────────────────────────────────────────────────
  const searchRequest = async () => {
    if (!studentId.trim()) return;
    try {
      const res = await axios.get(`/api/request/student/${studentId}`);
      setRequests(res.data);
    } catch (error) {
      console.error(error.response?.data ?? error.message);
      alert("Could not fetch requests. Check your Student ID.");
    }
  };

  const submitRequest = async () => {
    if (!formStudentId.trim()) return alert("Please enter a Student ID.");
    if (!studentFound)         return alert("Please enter a valid Student ID to auto-fill your details.");
    if (!purpose.trim())       return alert("Please state the purpose of your request.");

    const docId = documentIdMap[requestType];
    if (!docId) return alert("Unknown request type.");

    const data = {
      student_id:  parseInt(formStudentId, 10),
      document_id: docId,
      documents:   [docId],
      purpose:     purpose,
    };

    setSubmitting(true);
    try {
      await axios.post("/api/request", data);
      alert("Request submitted successfully!");
      resetForm();
      setShowForm(false);
      if (studentId === formStudentId) searchRequest();
    } catch (error) {
      console.error(error.response?.data ?? error.message);
      alert("Error: " + (error.response?.data?.message ?? "Something went wrong"));
    } finally {
      setSubmitting(false);
    }
  };

  // ── Derived ───────────────────────────────────────────────────
  const studentRequests = requests.filter(
    r => String(r.student_id) === String(studentId)
  );

  // ── Render ────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-100 px-6 py-12">
      <div className="max-w-4xl mx-auto">

        {/* Back */}
        {onBack && (
          <button
            onClick={onBack}
            className="mb-6 text-sm font-semibold text-[#0A2342] hover:text-[#D4A017] transition"
          >
            &larr; Back to Login
          </button>
        )}

        {/* Title */}
        <h1 className="text-4xl font-bold text-center text-[#0A2342] mb-10">
          Track Requests
        </h1>

        {/* Search Card */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-md p-6">
          <label className={labelClass}>Student ID</label>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Enter Student ID"
              value={studentId}
              onChange={e => setStudentId(e.target.value)}
              onKeyDown={e => e.key === "Enter" && searchRequest()}
              className="flex-1 border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#D4A017] text-sm"
            />
            <button
              onClick={searchRequest}
              className="bg-[#0A2342] text-white px-6 py-3 rounded-xl font-semibold hover:bg-[#0d2e57] transition"
            >
              Search
            </button>
          </div>
          <button
            onClick={() => setShowForm(!showForm)}
            className="mt-4 text-[#D4A017] font-semibold text-sm hover:underline"
          >
            {showForm ? "— Hide Form" : "+ Submit Request"}
          </button>
        </div>

        {/* Request Form */}
        {showForm && (
          <div className="mt-6 bg-white border border-gray-200 rounded-2xl shadow-md p-8">
            <h2 className="text-xl font-black text-[#0A2342] mb-6 tracking-tight">
              Request Form
            </h2>

            <div className="grid md:grid-cols-2 gap-5">

              {/* Student ID (form) */}
              <div className="md:col-span-2">
                <label className={labelClass}>Student ID</label>
                <div className="flex gap-3">
                  <input
                    className={inputClass}
                    placeholder="e.g. 2023301715"
                    value={formStudentId}
                    onChange={e => {
                      setFormStudentId(e.target.value);
                      setStudentFound(false);
                      setFullName(""); setEmail(""); setCourse(""); setYearLevel("");
                    }}
                    onBlur={() => fetchStudent(formStudentId)}
                    onKeyDown={e => e.key === "Enter" && fetchStudent(formStudentId)}
                  />
                  {fetchingStudent && (
                    <span className="self-center text-xs text-gray-400 whitespace-nowrap">
                      Looking up…
                    </span>
                  )}
                  {studentFound && (
                    <span className="self-center text-xs text-green-600 font-semibold whitespace-nowrap">
                      ✓ Found
                    </span>
                  )}
                </div>
              </div>

              {/* Full Name — read only */}
              <div>
                <label className={labelClass}>Full Name</label>
                <input
                  className={readOnlyClass}
                  value={fullName}
                  placeholder="Auto-filled from Student ID"
                  readOnly
                />
              </div>

              {/* Email — read only */}
              <div>
                <label className={labelClass}>Email Address</label>
                <input
                  className={readOnlyClass}
                  value={email}
                  placeholder="Auto-filled from Student ID"
                  readOnly
                />
              </div>

              {/* Course — read only */}
              <div>
                <label className={labelClass}>Course</label>
                <input
                  className={readOnlyClass}
                  value={course}
                  placeholder="Auto-filled from Student ID"
                  readOnly
                />
              </div>

              {/* Year Level — read only */}
              <div>
                <label className={labelClass}>Year Level</label>
                <input
                  className={readOnlyClass}
                  value={yearLevel}
                  placeholder="Auto-filled from Student ID"
                  readOnly
                />
              </div>

              {/* Request Type */}
              <div className="md:col-span-2">
                <label className={labelClass}>Request Type</label>
                <div className="relative">
                  <select
                    className={selectClass}
                    value={requestType}
                    onChange={e => {
                      setRequestType(e.target.value);
                      setCavChoice(""); setCavOther("");
                      setCertChoice(""); setCertOther("");
                      setSubjectSem(""); setSubjectSY1(""); setSubjectSY2("");
                    }}
                  >
                    {requestTypes.map(r => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-xs">▼</div>
                </div>
              </div>

              {/* CAV sub-choice */}
              {requestType === "CAV Certification" && (
                <div className="md:col-span-2">
                  <label className={labelClass}>Requesting Agency</label>
                  <div className="relative">
                    <select
                      className={selectClass}
                      value={cavChoice}
                      onChange={e => { setCavChoice(e.target.value); setCavOther(""); }}
                    >
                      <option value="">Select Agency</option>
                      {cavChoices.map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="Other">Other (Please Specify)</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-xs">▼</div>
                  </div>
                  {cavChoice === "Other" && (
                    <div className="mt-3">
                      <label className={labelClass}>Please Specify</label>
                      <input
                        className={inputClass}
                        placeholder="Specify agency"
                        value={cavOther}
                        onChange={e => setCavOther(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Certification sub-choice */}
              {requestType === "Certification" && (
                <div className="md:col-span-2">
                  <label className={labelClass}>Certification Type</label>
                  <div className="relative">
                    <select
                      className={selectClass}
                      value={certChoice}
                      onChange={e => {
                        setCertChoice(e.target.value); setCertOther("");
                        setSubjectSem(""); setSubjectSY1(""); setSubjectSY2("");
                      }}
                    >
                      <option value="">Select Type</option>
                      {certificationChoices.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-xs">▼</div>
                  </div>

                  {certChoice === "Subjects with Grade" && (
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelClass}>Semester</label>
                        <input className={inputClass} placeholder="e.g. 1st" value={subjectSem} onChange={e => setSubjectSem(e.target.value)} />
                      </div>
                      <div>
                        <label className={labelClass}>S.Y. Start</label>
                        <input className={inputClass} placeholder="e.g. 2023" value={subjectSY1} onChange={e => setSubjectSY1(e.target.value)} />
                      </div>
                      <div>
                        <label className={labelClass}>S.Y. End</label>
                        <input className={inputClass} placeholder="e.g. 2024" value={subjectSY2} onChange={e => setSubjectSY2(e.target.value)} />
                      </div>
                    </div>
                  )}

                  {certChoice === "Others" && (
                    <div className="mt-3">
                      <label className={labelClass}>Please Specify</label>
                      <input
                        className={inputClass}
                        placeholder="Specify certification type"
                        value={certOther}
                        onChange={e => setCertOther(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Purpose */}
              <div className="md:col-span-2">
                <label className={labelClass}>Purpose of Request</label>
                <textarea
                  className={inputClass}
                  rows="4"
                  placeholder="State the purpose of your request"
                  value={purpose}
                  onChange={e => setPurpose(e.target.value)}
                />
              </div>

            </div>

            <button
              onClick={submitRequest}
              disabled={submitting || !studentFound}
              className="mt-6 bg-[#D4A017] text-white px-8 py-3 rounded-xl font-semibold hover:bg-[#b8891a] transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {submitting ? "Submitting…" : "Submit Request"}
            </button>
          </div>
        )}

        {/* Results */}
        <div className="mt-8">
          {studentId && (
            <>
              <h2 className="text-xl font-black text-[#0A2342] mb-4 tracking-tight">
                Current Requests
              </h2>

              {studentRequests.length > 0 ? (
                <div className="space-y-4">
                  {studentRequests.map((request, index) => (
                    <div
                      key={index}
                      className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 flex justify-between items-center"
                    >
                      <div>
                        <p className="font-bold text-[#0A2342] text-sm">{request.document_name}</p>
                        <p className="text-gray-400 text-xs mt-0.5">
                          Submitted: {new Date(request.date_request).toLocaleDateString()}
                        </p>
                      </div>
                      <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide ${
                        request.status === "Approved"
                          ? "bg-green-100 text-green-700"
                          : "bg-yellow-100 text-yellow-700"
                      }`}>
                        {request.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-10 text-center">
                  <p className="text-gray-400 text-sm">No requests found for this Student ID.</p>
                </div>
              )}
            </>
          )}
        </div>

      </div>
    </div>
  );
}