import { useState } from "react";
import "./styles/OCRConfirmation.css";

const documentTypes = [
  "Birth Certificate", "Form 137", "Form 138", "Good Moral",
  "Grades", "Transcript of Records", "Leave of Absence", "Withdrawal",
];

const sampleData = {
  "Birth Certificate": {
    name: "Maria Luisa Santos",
    rawText: `REPUBLIC OF THE PHILIPPINES\nOffice of the Civil Registrar General\n\nCERTIFICATE OF LIVE BIRTH\n\nName: SANTOS, MARIA LUISA C.\nSex: Female\nDate of Birth: April 15, 2002\nPlace of Birth: Cagayan de Oro City, Misamis Oriental\n\nName of Mother: Carmela Santos\nCitizenship: Filipino\nOccupation: Teacher\n\nName of Father: Juan Santos\nCitizenship: Filipino\nOccupation: Engineer\n\nDate of Marriage of Parents: January 10, 1998\nPlace of Marriage: Cagayan de Oro City\n\nThis is to certify that the above is a true and correct copy of the record on file in this office.\n\nIssued on: June 9, 2026\nOffice of the Civil Registrar General`,
  },
  "Form 137": {
    name: "Maria Luisa Santos",
    rawText: `REPUBLIC OF THE PHILIPPINES\nDepartment of Education\n\nFORM 137 — Permanent Record\n\nName: SANTOS, MARIA LUISA C.\nLRN: 136245789012\nDate of Birth: April 15, 2002\nSex: Female\n\nSchool Year: 2023 - 2024\nGrade Level: Grade 12\nStrand: STEM\n\nSubjects and Final Grades:\nGeneral Mathematics — 92\nOral Communication — 90\nPhysical Science — 88\nEarth Science — 91\nIntroduction to Philosophy — 89\nUnderstanding Culture, Society and Politics — 93\n\nGeneral Average: 90.5\n\nRemarks: Promoted to Senior High School Grade 12`,
  },
  "Form 138": {
    name: "Maria Luisa Santos",
    rawText: `REPUBLIC OF THE PHILIPPINES\nDepartment of Education\n\nFORM 138 — Report Card\n\nName: SANTOS, MARIA LUISA C.\nGrade Level: Grade 12\nSection: STEM-A\nSchool Year: 2023 - 2024\n\nFirst Quarter Grades:\nGeneral Mathematics — 90\nOral Communication — 88\nPhysical Science — 87\n\nSecond Quarter Grades:\nGeneral Mathematics — 93\nOral Communication — 91\nPhysical Science — 89\n\nFinal Average: 91.3\n\nAttendance: 178/180 days\nRemarks: With Honors`,
  },
  "Good Moral": {
    name: "Maria Luisa Santos",
    rawText: `UNIVERSITY OF SCIENCE AND TECHNOLOGY OF SOUTHERN PHILIPPINES\nCagayan de Oro Campus\n\nCERTIFICATE OF GOOD MORAL CHARACTER\n\nThis is to certify that SANTOS, MARIA LUISA C., with Student ID 2023301715, is a bona fide student of this university taking up Bachelor of Science in Information Technology.\n\nFurther, this is to certify that the above-named student has not been involved in any case, whether administrative, civil, or criminal, that would render her unfit to be issued this certificate.\n\nThis certification is issued upon the request of the above-named student for whatever legal purpose it may serve.\n\nIssued this 9th day of June 2026 at Cagayan de Oro City, Philippines.`,
  },
  "Grades": {
    name: "Maria Luisa Santos",
    rawText: `UNIVERSITY OF SCIENCE AND TECHNOLOGY OF SOUTHERN PHILIPPINES\nOFFICIAL TRANSCRIPT OF RECORDS\n\nName: SANTOS, MARIA LUISA C.\nStudent ID: 2023301715\nCourse: BS Information Technology\nDate Admitted: August 2023\n\nFirst Year — First Semester (2023-2024)\nIT 101 Introduction to Computing — 1.50\nMath 101 College Algebra — 1.75\nEng 101 Purposive Communication — 1.25\n\nFirst Year — Second Semester (2023-2024)\nIT 102 Computer Programming 1 — 1.50\nMath 102 Trigonometry — 2.00\nPE 101 Physical Fitness — 1.00\n\nGeneral Weighted Average: 1.75\n\nThis transcript is issued for whatever legal purpose it may serve.`,
  },
  "Transcript of Records": {
    name: "Maria Luisa Santos",
    rawText: `UNIVERSITY OF SCIENCE AND TECHNOLOGY OF SOUTHERN PHILIPPINES\nCERTIFICATE OF ENROLLMENT\n\nThis is to certify that SANTOS, MARIA LUISA C., with Student ID 2023301715, is officially enrolled in this university for the Academic Year 2025-2026, Second Semester, taking up Bachelor of Science in Information Technology, currently on her 3rd Year level.\n\nThis certification is issued upon the request of the above-named student for whatever legal purpose it may serve.\n\nIssued this 9th day of June 2026.`,
  },
  "Leave of Absence": {
    name: "Maria Luisa Santos",
    rawText: `UNIVERSITY OF SCIENCE AND TECHNOLOGY OF SOUTHERN PHILIPPINES\n\nDIPLOMA\n\nThe Board of Regents of the University of Science and Technology of Southern Philippines, upon recommendation of the Faculty, confers upon\n\nMARIA LUISA C. SANTOS\n\nthe degree of\n\nBACHELOR OF SCIENCE IN INFORMATION TECHNOLOGY\n\nwith all the rights, honors, and privileges thereunto appertaining.\n\nGiven at Cagayan de Oro City, Philippines, this 30th day of May 2026.`,
  },
  "Withdrawal": {
    name: "Maria Luisa Santos",
    rawText: `UNIVERSITY OF SCIENCE AND TECHNOLOGY OF SOUTHERN PHILIPPINES\nWITHDRAWAL FORM\n\nName: SANTOS, MARIA LUISA C.\nStudent ID: 2023301715\nCourse: BS Information Technology\nYear Level: 3rd Year\n\nDate Filed: June 9, 2026\n\nReason for Withdrawal: Transferred to another university\n\nThis is to certify that the above-named student has officially withdrawn from this institution as of the date stated above. All clearances and financial obligations have been settled.\n\nProcessed by: Office of the Registrar`,
  },
};

export default function OCRConfirmation({
  fileName = "scanned_document.pdf",
  fileSize = "1.2 MB",
  dateScanned = "June 9, 2026",
  detectedDocType = "Form 137",
  onCancel,
  onSave,
}) {
  const [documentType, setDocumentType] = useState(detectedDocType);
  const [studentName, setStudentName] = useState(sampleData[detectedDocType]?.name || "");
  const confidenceScore = 94;

  const handleDocTypeChange = (newType) => {
    setDocumentType(newType);
    setStudentName(sampleData[newType]?.name || "");
  };

  const handleSave = () => {
    onSave && onSave({ documentType, studentName });
  };

  const rawText = sampleData[documentType]?.rawText || "No extracted text available.";

  return (
    <div className="ocr-overlay">
      <div className="ocr-card">

        {/* Header */}
        <div className="ocr-header">
          <div>
            <h3 className="ocr-title">Document Scan Result</h3>
            <p className="ocr-sub">Review detected information before saving</p>
          </div>
          <span className="ocr-complete-badge">
            <span className="ocr-complete-dot" />
            OCR Complete
          </span>
        </div>

        {/* Body */}
        <div className="ocr-body">

          {/* File Preview Panel */}
          <div className="ocr-panel">
            <div className="ocr-panel-header">
              <span className="ocr-panel-title">File Preview</span>
              <span className="ocr-file-type-badge">PDF</span>
            </div>

            <div className="ocr-preview-box">
              <div className="ocr-preview-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.8">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="ocr-preview-filename">{fileName}</p>
              <button className="ocr-view-btn">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" strokeLinecap="round" strokeLinejoin="round" />
                  <circle cx="12" cy="12" r="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                View Full File
              </button>
            </div>

            <div className="ocr-meta-row">
              <span className="ocr-meta-label">File name</span>
              <span className="ocr-meta-value">{fileName}</span>
            </div>
            <div className="ocr-meta-row">
              <span className="ocr-meta-label">File size</span>
              <span className="ocr-meta-value">{fileSize}</span>
            </div>
            <div className="ocr-meta-row">
              <span className="ocr-meta-label">Date scanned</span>
              <span className="ocr-meta-value">{dateScanned}</span>
            </div>
          </div>

          {/* Detected Information Panel */}
          <div className="flex flex-col gap-5">
            <div className="ocr-panel">
              <div className="ocr-panel-header">
                <span className="ocr-panel-title">Detected Information</span>
              </div>

              <div className="ocr-field-group">
                <label className="ocr-field-label">Document Type</label>
                <select
                  className="ocr-field-select"
                  value={documentType}
                  onChange={e => handleDocTypeChange(e.target.value)}
                >
                  {documentTypes.map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                <p className="ocr-field-hint">Auto-detected via OCR — correct if needed</p>
              </div>

              <div className="ocr-field-group">
                <label className="ocr-field-label">Student Name</label>
                <input
                  type="text"
                  className="ocr-field-input"
                  value={studentName}
                  onChange={e => setStudentName(e.target.value)}
                />
              </div>

              <div className="ocr-field-group" style={{ marginBottom: 0 }}>
                <label className="ocr-field-label">Confidence Score</label>
                <div className="ocr-confidence-row">
                  <span className="ocr-confidence-value">{confidenceScore}% match</span>
                </div>
              </div>
            </div>

            {/* Extracted Text */}
            <div className="ocr-panel" style={{ flex: 1 }}>
              <div className="ocr-extracted-header">
                <span className="ocr-extracted-label">Extracted Text (OCR)</span>
                <span className="ocr-raw-output-tag">Raw Output</span>
              </div>
              <div className="ocr-extracted-text">{rawText}</div>
            </div>
          </div>

        </div>

        {/* Footer */}
        <div className="ocr-footer">
          <button className="ocr-download-btn" title="Download">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          <div className="ocr-footer-actions">
            <button className="ocr-cancel-btn" onClick={onCancel}>Cancel</button>
            <button className="ocr-save-btn" onClick={handleSave}>Save to Student Profile</button>
          </div>
        </div>

      </div>
    </div>
  );
}