import { useState } from "react";

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

const credentialChoices = [
  "Authentication", "CAV Certification", "Certification", "Correction of Name",
  "Diploma Replacement", "Evaluation", "Form 137", "Honorable Dismissal",
  "Permit to Study", "Transcript of Records",
];

const cavChoices = ["BFP", "BJMP", "CHED", "DEP-ED", "DFA", "PNP", "POEA"];

const certificationChoices = [
  "Authorization Letter", "CAR", "Earned Units", "Endorsement",
  "English: Medium of Instruction", "GPA", "Grading System", "Graduated",
  "Letter of No Objection", "Officially Enrolled", "Subjects Enrolled",
  "Subjects with Grade", "USTP Conversion", "Others",
];

export default function StudentPreview({ onBack }) {
  const [studentId, setStudentId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [step, setStep] = useState("pre");

  const [preForm, setPreForm] = useState({
    contactNumber: "",
    isGraduate: null,
    graduateYear: "",
    lastSem: "",
    lastSY1: "",
    lastSY2: "",
    requestedBefore: null,
    previousCredential: "",
    previousRequestDate: "",
    isCleared: null,
  });

  const [preErrors, setPreErrors] = useState({});

  const [mainForm, setMainForm] = useState({
    studentId: "", name: "", email: "", course: "", yearLevel: "1st Year", purpose: "",
  });
  const [mainErrors, setMainErrors] = useState({});

  const [requestType, setRequestType] = useState("CAV Certification");
  const [cavChoice, setCavChoice] = useState("");
  const [cavOther, setCavOther] = useState("");
  const [certChoice, setCertChoice] = useState("");
  const [certOther, setCertOther] = useState("");
  const [subjectSem, setSubjectSem] = useState("");
  const [subjectSY1, setSubjectSY1] = useState("");
  const [subjectSY2, setSubjectSY2] = useState("");

  const requests = [
    { id: "20230001", requestType: "Transcript of Records", status: "Pending", date: "June 6, 2026" },
    { id: "20230001", requestType: "Certification", status: "Approved", date: "June 2, 2026" },
  ];

  const studentRequests = requests.filter(r => r.id === studentId);

  const inputClass = (hasError) =>
    `border ${hasError ? "border-red-400 bg-red-50" : "border-gray-300"} p-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#D4A017] text-sm w-full`;
  const selectClass = (hasError) =>
    `w-full border ${hasError ? "border-red-400 bg-red-50" : "border-gray-300"} p-3 rounded-lg appearance-none focus:outline-none focus:ring-2 focus:ring-[#D4A017] text-sm bg-white`;
  const labelClass = "block text-xs font-bold text-[#0A2342] uppercase tracking-widest mb-1.5";
  const sectionClass = "bg-gray-50 border border-gray-200 rounded-xl p-5 mb-5";

  const Req = () => <span className="text-[#D4A017] ml-0.5">*</span>;
  const ErrMsg = ({ show }) => show
    ? <p className="text-xs text-red-500 mt-1 font-semibold">This field is required.</p>
    : null;

  const handlePreFormChange = (field, value) => {
    setPreForm(prev => ({ ...prev, [field]: value }));
    setPreErrors(prev => ({ ...prev, [field]: false }));
  };

  const validatePreForm = () => {
    const e = {};
    if (!preForm.contactNumber.trim()) e.contactNumber = true;
    if (preForm.isGraduate === null) e.isGraduate = true;
    if (preForm.isGraduate === true && !preForm.graduateYear.trim()) e.graduateYear = true;
    if (preForm.isGraduate === false && !preForm.lastSem) e.lastSem = true;
    if (preForm.isGraduate === false && !preForm.lastSY1.trim()) e.lastSY1 = true;
    if (preForm.isGraduate === false && !preForm.lastSY2.trim()) e.lastSY2 = true;
    if (preForm.requestedBefore === null) e.requestedBefore = true;
    if (preForm.requestedBefore === true && !preForm.previousCredential) e.previousCredential = true;
    if (preForm.requestedBefore === true && !preForm.previousRequestDate) e.previousRequestDate = true;
    if (preForm.isCleared === null) e.isCleared = true;
    return e;
  };

  const handleProceed = () => {
    const e = validatePreForm();
    if (Object.keys(e).length > 0) { setPreErrors(e); return; }
    setPreErrors({});
    setStep("main");
  };

  const validateMainForm = () => {
    const e = {};
    if (!mainForm.studentId.trim()) e.studentId = true;
    if (!mainForm.name.trim()) e.name = true;
    if (!mainForm.email.trim()) e.email = true;
    if (!mainForm.course.trim()) e.course = true;
    if (!mainForm.purpose.trim()) e.purpose = true;
    if (requestType === "CAV Certification" && !cavChoice) e.cavChoice = true;
    if (requestType === "CAV Certification" && cavChoice === "Other" && !cavOther.trim()) e.cavOther = true;
    if (requestType === "Certification" && !certChoice) e.certChoice = true;
    if (requestType === "Certification" && certChoice === "Others" && !certOther.trim()) e.certOther = true;
    if ((requestType === "Certification" && (certChoice === "Subjects with Grade" || certChoice === "Subjects Enrolled")) || requestType === "Transcript of Records") {
      if (!subjectSem.trim()) e.subjectSem = true;
      if (!subjectSY1.trim()) e.subjectSY1 = true;
      if (!subjectSY2.trim()) e.subjectSY2 = true;
    }
    return e;
  };

  const handleSubmit = () => {
    const e = validateMainForm();
    if (Object.keys(e).length > 0) { setMainErrors(e); return; }
    setMainErrors({});
    alert("Request submitted successfully!");
  };

  return (
    <div className="min-h-screen bg-gray-100 px-6 py-12">
      <div className="max-w-4xl mx-auto">

        {onBack && (
          <button onClick={onBack} className="mb-6 text-sm font-semibold text-[#0A2342] hover:text-[#D4A017] transition">
            &larr; Back to Login
          </button>
        )}

        <h1 className="text-4xl font-bold text-center text-[#0A2342] mb-10">Track Requests</h1>

        {/* Search Card */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-md p-6">
          <label className={labelClass}>Student ID</label>
          <div className="flex gap-3">
            <input
              type="text"
              placeholder="Enter Student ID"
              value={studentId}
              onChange={e => setStudentId(e.target.value)}
              className="flex-1 border border-gray-300 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-[#D4A017] text-sm"
            />
            <button className="bg-[#0A2342] hover:bg-[#081b34] text-white px-6 py-3 rounded-xl font-medium transition text-sm">
              Search
            </button>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); setStep("pre"); }}
            className="mt-4 text-[#D4A017] font-semibold text-sm hover:underline"
          >
            {showForm ? "— Hide Form" : "+ Submit Request"}
          </button>
        </div>

        {/* ── PRE-FORM ── */}
        {showForm && step === "pre" && (
          <div className="mt-6 bg-white border border-gray-200 rounded-2xl shadow-md p-8">
            <h2 className="text-xl font-black text-[#0A2342] mb-1 tracking-tight">Before You Proceed</h2>
            <p className="text-xs text-gray-400 mb-6 uppercase tracking-widest font-semibold">
              All fields marked <span className="text-[#D4A017]">*</span> are required
            </p>

            {/* Contact Number */}
            <div className={sectionClass}>
              <label className={labelClass}>Contact Number <Req /></label>
              <input
                className={inputClass(preErrors.contactNumber)}
                placeholder="e.g. 09171234567"
                value={preForm.contactNumber}
                onChange={e => handlePreFormChange("contactNumber", e.target.value)}
              />
              <ErrMsg show={preErrors.contactNumber} />
            </div>

            {/* Graduate or Not */}
            <div className={sectionClass}>
              <p className="text-sm font-black text-[#0A2342] mb-3">Are you a graduate? <Req /></p>
              <div className="flex items-center gap-6 mb-4">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-[#0A2342]">
                  <input
                    type="checkbox"
                    checked={preForm.isGraduate === true}
                    onChange={() => handlePreFormChange("isGraduate", preForm.isGraduate === true ? null : true)}
                    className="w-4 h-4 accent-[#D4A017]"
                  />
                  Yes
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-[#0A2342]">
                  <input
                    type="checkbox"
                    checked={preForm.isGraduate === false}
                    onChange={() => handlePreFormChange("isGraduate", preForm.isGraduate === false ? null : false)}
                    className="w-4 h-4 accent-[#D4A017]"
                  />
                  No
                </label>
              </div>
              <ErrMsg show={preErrors.isGraduate} />

              {preForm.isGraduate === true && (
                <div>
                  <label className={labelClass}>Year of Graduation <Req /></label>
                  <input
                    className={inputClass(preErrors.graduateYear)}
                    placeholder="e.g. 2024"
                    value={preForm.graduateYear}
                    onChange={e => handlePreFormChange("graduateYear", e.target.value)}
                  />
                  <ErrMsg show={preErrors.graduateYear} />
                </div>
              )}

              {preForm.isGraduate === false && (
                <div>
                  <label className={labelClass}>Last Semester and School Year of Attendance in USTP <Req /></label>
                  <div className="grid grid-cols-3 gap-3 mt-1">
                    <div>
                      <label className={labelClass}>Semester <Req /></label>
                      <div className="relative">
                        <select
                          className={selectClass(preErrors.lastSem)}
                          value={preForm.lastSem}
                          onChange={e => handlePreFormChange("lastSem", e.target.value)}
                        >
                          <option value="">Select</option>
                          <option>1st Semester</option>
                          <option>2nd Semester</option>
                          <option>Summer</option>
                        </select>
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-xs">▼</div>
                      </div>
                      <ErrMsg show={preErrors.lastSem} />
                    </div>
                    <div>
                      <label className={labelClass}>S.Y. Start <Req /></label>
                      <input
                        className={inputClass(preErrors.lastSY1)}
                        placeholder="e.g. 2023"
                        value={preForm.lastSY1}
                        onChange={e => handlePreFormChange("lastSY1", e.target.value)}
                      />
                      <ErrMsg show={preErrors.lastSY1} />
                    </div>
                    <div>
                      <label className={labelClass}>S.Y. End <Req /></label>
                      <input
                        className={inputClass(preErrors.lastSY2)}
                        placeholder="e.g. 2024"
                        value={preForm.lastSY2}
                        onChange={e => handlePreFormChange("lastSY2", e.target.value)}
                      />
                      <ErrMsg show={preErrors.lastSY2} />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Previously Requested */}
            <div className={sectionClass}>
              <p className="text-sm font-black text-[#0A2342] mb-3">
                Have you previously requested credentials? <Req />
              </p>
              <div className="flex items-center gap-6 mb-4">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-[#0A2342]">
                  <input
                    type="checkbox"
                    checked={preForm.requestedBefore === true}
                    onChange={() => handlePreFormChange("requestedBefore", preForm.requestedBefore === true ? null : true)}
                    className="w-4 h-4 accent-[#D4A017]"
                  />
                  Yes
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-[#0A2342]">
                  <input
                    type="checkbox"
                    checked={preForm.requestedBefore === false}
                    onChange={() => handlePreFormChange("requestedBefore", preForm.requestedBefore === false ? null : false)}
                    className="w-4 h-4 accent-[#D4A017]"
                  />
                  No
                </label>
              </div>
              <ErrMsg show={preErrors.requestedBefore} />

              {preForm.requestedBefore === true && (
                <div className="grid grid-cols-2 gap-4 mt-2">
                  <div>
                    <label className={labelClass}>Please Specify <Req /></label>
                    <div className="relative">
                      <select
                        className={selectClass(preErrors.previousCredential)}
                        value={preForm.previousCredential}
                        onChange={e => handlePreFormChange("previousCredential", e.target.value)}
                      >
                        <option value="">Select Credential</option>
                        {credentialChoices.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-xs">▼</div>
                    </div>
                    <ErrMsg show={preErrors.previousCredential} />
                  </div>
                  <div>
                    <label className={labelClass}>Date of Request <Req /></label>
                    <input
                      type="date"
                      className={inputClass(preErrors.previousRequestDate)}
                      value={preForm.previousRequestDate}
                      onChange={e => handlePreFormChange("previousRequestDate", e.target.value)}
                    />
                    <ErrMsg show={preErrors.previousRequestDate} />
                  </div>
                </div>
              )}
            </div>

            {/* Cleared */}
            <div className={sectionClass} style={{ marginBottom: 0 }}>
              <p className="text-sm font-black text-[#0A2342] mb-3">Cleared? <Req /></p>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-[#0A2342]">
                  <input
                    type="checkbox"
                    checked={preForm.isCleared === true}
                    onChange={() => handlePreFormChange("isCleared", preForm.isCleared === true ? null : true)}
                    className="w-4 h-4 accent-[#D4A017]"
                  />
                  Yes
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-sm font-semibold text-[#0A2342]">
                  <input
                    type="checkbox"
                    checked={preForm.isCleared === false}
                    onChange={() => handlePreFormChange("isCleared", preForm.isCleared === false ? null : false)}
                    className="w-4 h-4 accent-[#D4A017]"
                  />
                  No
                </label>
              </div>
              <ErrMsg show={preErrors.isCleared} />
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleProceed}
                className="bg-[#0A2342] hover:bg-[#081b34] text-white px-8 py-3 rounded-xl font-semibold text-sm transition"
              >
                Proceed to Request Form &rarr;
              </button>
            </div>
          </div>
        )}

        {/* ── MAIN REQUEST FORM ── */}
        {showForm && step === "main" && (
          <div className="mt-6 bg-white border border-gray-200 rounded-2xl shadow-md p-8">
            <button onClick={() => setStep("pre")} className="mb-5 text-sm font-semibold text-[#0A2342] hover:text-[#D4A017] transition">
              &larr; Back
            </button>
            <h2 className="text-xl font-black text-[#0A2342] mb-1 tracking-tight">Request Form</h2>
            <p className="text-xs text-gray-400 mb-6 uppercase tracking-widest font-semibold">
              All fields marked <span className="text-[#D4A017]">*</span> are required
            </p>

            <div className="grid md:grid-cols-2 gap-5">

              <div>
                <label className={labelClass}>Student ID <Req /></label>
                <input
                  className={inputClass(mainErrors.studentId)}
                  placeholder="e.g. 2023301715"
                  value={mainForm.studentId}
                  onChange={e => { setMainForm(p => ({ ...p, studentId: e.target.value })); setMainErrors(p => ({ ...p, studentId: false })); }}
                />
                <ErrMsg show={mainErrors.studentId} />
              </div>

              <div>
                <label className={labelClass}>Full Name <Req /></label>
                <input
                  className={inputClass(mainErrors.name)}
                  placeholder="Full Name"
                  value={mainForm.name}
                  onChange={e => { setMainForm(p => ({ ...p, name: e.target.value })); setMainErrors(p => ({ ...p, name: false })); }}
                />
                <ErrMsg show={mainErrors.name} />
              </div>

              <div className="md:col-span-2">
                <label className={labelClass}>Email Address <Req /></label>
                <input
                  type="email"
                  className={inputClass(mainErrors.email)}
                  placeholder="e.g. juan@ustp.edu.ph"
                  value={mainForm.email}
                  onChange={e => { setMainForm(p => ({ ...p, email: e.target.value })); setMainErrors(p => ({ ...p, email: false })); }}
                />
                <ErrMsg show={mainErrors.email} />
              </div>

              <div>
                <label className={labelClass}>Course <Req /></label>
                <input
                  className={inputClass(mainErrors.course)}
                  placeholder="e.g. BS Information Technology"
                  value={mainForm.course}
                  onChange={e => { setMainForm(p => ({ ...p, course: e.target.value })); setMainErrors(p => ({ ...p, course: false })); }}
                />
                <ErrMsg show={mainErrors.course} />
              </div>

              <div>
                <label className={labelClass}>Year Level <Req /></label>
                <div className="relative">
                  <select
                    className={selectClass(false)}
                    value={mainForm.yearLevel}
                    onChange={e => setMainForm(p => ({ ...p, yearLevel: e.target.value }))}
                  >
                    <option>1st Year</option>
                    <option>2nd Year</option>
                    <option>3rd Year</option>
                    <option>4th Year</option>
                    <option>5th Year</option>
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-xs">▼</div>
                </div>
              </div>

              {/* Request Type */}
              <div className="md:col-span-2">
                <label className={labelClass}>Request Type <Req /></label>
                <div className="relative">
                  <select
                    className={selectClass(false)}
                    value={requestType}
                    onChange={e => {
                      setRequestType(e.target.value);
                      setCavChoice(""); setCavOther("");
                      setCertChoice(""); setCertOther("");
                      setSubjectSem(""); setSubjectSY1(""); setSubjectSY2("");
                      setMainErrors({});
                    }}
                  >
                    {requestTypes.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-xs">▼</div>
                </div>
              </div>

              {/* CAV Certification */}
              {requestType === "CAV Certification" && (
                <div className="md:col-span-2">
                  <label className={labelClass}>Requesting Agency <Req /></label>
                  <div className="relative">
                    <select
                      className={selectClass(mainErrors.cavChoice)}
                      value={cavChoice}
                      onChange={e => { setCavChoice(e.target.value); setCavOther(""); setMainErrors(p => ({ ...p, cavChoice: false })); }}
                    >
                      <option value="">Select Agency</option>
                      {cavChoices.map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="Other">Other (Please Specify)</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-xs">▼</div>
                  </div>
                  <ErrMsg show={mainErrors.cavChoice} />
                  {cavChoice === "Other" && (
                    <div className="mt-3">
                      <label className={labelClass}>Please Specify <Req /></label>
                      <input
                        className={inputClass(mainErrors.cavOther)}
                        placeholder="Specify agency"
                        value={cavOther}
                        onChange={e => { setCavOther(e.target.value); setMainErrors(p => ({ ...p, cavOther: false })); }}
                      />
                      <ErrMsg show={mainErrors.cavOther} />
                    </div>
                  )}
                </div>
              )}

              {/* Certification */}
              {requestType === "Certification" && (
                <div className="md:col-span-2">
                  <label className={labelClass}>Certification Type <Req /></label>
                  <div className="relative">
                    <select
                      className={selectClass(mainErrors.certChoice)}
                      value={certChoice}
                      onChange={e => { setCertChoice(e.target.value); setCertOther(""); setSubjectSem(""); setSubjectSY1(""); setSubjectSY2(""); setMainErrors(p => ({ ...p, certChoice: false })); }}
                    >
                      <option value="">Select Type</option>
                      {certificationChoices.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400 text-xs">▼</div>
                  </div>
                  <ErrMsg show={mainErrors.certChoice} />

                  {(certChoice === "Subjects with Grade" || certChoice === "Subjects Enrolled") && (
                    <div className="mt-3 grid grid-cols-3 gap-3">
                      <div>
                        <label className={labelClass}>Semester <Req /></label>
                        <input className={inputClass(mainErrors.subjectSem)} placeholder="e.g. 1st" value={subjectSem} onChange={e => { setSubjectSem(e.target.value); setMainErrors(p => ({ ...p, subjectSem: false })); }} />
                        <ErrMsg show={mainErrors.subjectSem} />
                      </div>
                      <div>
                        <label className={labelClass}>S.Y. Start <Req /></label>
                        <input className={inputClass(mainErrors.subjectSY1)} placeholder="e.g. 2023" value={subjectSY1} onChange={e => { setSubjectSY1(e.target.value); setMainErrors(p => ({ ...p, subjectSY1: false })); }} />
                        <ErrMsg show={mainErrors.subjectSY1} />
                      </div>
                      <div>
                        <label className={labelClass}>S.Y. End <Req /></label>
                        <input className={inputClass(mainErrors.subjectSY2)} placeholder="e.g. 2024" value={subjectSY2} onChange={e => { setSubjectSY2(e.target.value); setMainErrors(p => ({ ...p, subjectSY2: false })); }} />
                        <ErrMsg show={mainErrors.subjectSY2} />
                      </div>
                    </div>
                  )}

                  {certChoice === "Others" && (
                    <div className="mt-3">
                      <label className={labelClass}>Please Specify <Req /></label>
                      <input className={inputClass(mainErrors.certOther)} placeholder="Specify certification type" value={certOther} onChange={e => { setCertOther(e.target.value); setMainErrors(p => ({ ...p, certOther: false })); }} />
                      <ErrMsg show={mainErrors.certOther} />
                    </div>
                  )}
                </div>
              )}

              {/* Transcript of Records */}
              {requestType === "Transcript of Records" && (
                <div className="md:col-span-2">
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={labelClass}>Semester <Req /></label>
                      <input className={inputClass(mainErrors.subjectSem)} placeholder="e.g. 1st" value={subjectSem} onChange={e => { setSubjectSem(e.target.value); setMainErrors(p => ({ ...p, subjectSem: false })); }} />
                      <ErrMsg show={mainErrors.subjectSem} />
                    </div>
                    <div>
                      <label className={labelClass}>S.Y. Start <Req /></label>
                      <input className={inputClass(mainErrors.subjectSY1)} placeholder="e.g. 2023" value={subjectSY1} onChange={e => { setSubjectSY1(e.target.value); setMainErrors(p => ({ ...p, subjectSY1: false })); }} />
                      <ErrMsg show={mainErrors.subjectSY1} />
                    </div>
                    <div>
                      <label className={labelClass}>S.Y. End <Req /></label>
                      <input className={inputClass(mainErrors.subjectSY2)} placeholder="e.g. 2024" value={subjectSY2} onChange={e => { setSubjectSY2(e.target.value); setMainErrors(p => ({ ...p, subjectSY2: false })); }} />
                      <ErrMsg show={mainErrors.subjectSY2} />
                    </div>
                  </div>
                </div>
              )}

              {/* Purpose */}
              <div className="md:col-span-2">
                <label className={labelClass}>Purpose of Request <Req /></label>
                <textarea
                  className={inputClass(mainErrors.purpose)}
                  rows="4"
                  placeholder="State the purpose of your request"
                  value={mainForm.purpose}
                  onChange={e => { setMainForm(p => ({ ...p, purpose: e.target.value })); setMainErrors(p => ({ ...p, purpose: false })); }}
                />
                <ErrMsg show={mainErrors.purpose} />
              </div>

            </div>

            <button
              onClick={handleSubmit}
              className="mt-6 bg-[#D4A017] hover:bg-[#be9114] text-white px-8 py-3 rounded-xl font-semibold text-sm transition"
            >
              Submit Request
            </button>
          </div>
        )}

        {/* Results */}
        <div className="mt-8">
          {studentId && (
            <>
              <h2 className="text-xl font-black text-[#0A2342] mb-4 tracking-tight">Current Requests</h2>
              {studentRequests.length > 0 ? (
                <div className="space-y-4">
                  {studentRequests.map((request, index) => (
                    <div key={index} className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5 flex justify-between items-center">
                      <div>
                        <p className="font-bold text-[#0A2342] text-sm">{request.requestType}</p>
                        <p className="text-gray-400 text-xs mt-0.5">Submitted: {request.date}</p>
                      </div>
                      <span className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wide ${
                        request.status === "Approved" ? "bg-green-100 text-green-700" : "bg-yellow-100 text-yellow-700"
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