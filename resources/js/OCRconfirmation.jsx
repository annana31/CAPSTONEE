import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "./supabaseClient";
import "./styles/OCRConfirmation.css";

const isPdf = (url) => /\.pdf(\?|#|$)/i.test(url || "");

export default function OCRConfirmation({
  ocrResult = null,          // NEW: the whole scan result
  studentId = "",            // still used by the Student Profile scan
  studentName = "",
  fileName = "",
  fileUrl = "",
  detectedDocType = "",
  documentTypeConfidence = null,
  onCancel,
  onSave,
}) {
  const [docs, setDocs] = useState([]);
  const [docsError, setDocsError] = useState("");
  const [documentId, setDocumentId] = useState("");
  const [suggested, setSuggested] = useState(false);

  const [pickedStudent, setPickedStudent] = useState(null);
  const [saving, setSaving] = useState(false);

  const ocrName = {
    first: ocrResult?.first_name || "",
    middle: ocrResult?.middle_name || "",
    last: ocrResult?.last_name || "",
  };
  const ocrFullName = [ocrName.first, ocrName.middle, ocrName.last]
    .filter(Boolean).join(" ");
  const candidates = ocrResult?.student_candidates || [];

  // 1. Load the real document types (value = document_id)
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("tbl_documents")
        .select("document_id, document_name")
        .order("document_name");
      if (error || !data?.length) {
        setDocsError("Could not load document types from the database.");
        return;
      }
      setDocs(data);
    })();
  }, []);

  // 2. Auto-select the document type once the list is loaded
  useEffect(() => {
    if (!docs.length) return;

    const label = (ocrResult?.document_type || detectedDocType || "")
      .trim().toLowerCase();

    // a) ID straight from the classifier
    let match = ocrResult?.document_id
      ? docs.find((d) => d.document_id === ocrResult.document_id)
      : null;

    // b) exact name match
    if (!match && label && label !== "unknown") {
      match = docs.find((d) => d.document_name.toLowerCase() === label);
    }

    if (match) {
      setDocumentId(String(match.document_id));
      setSuggested(false);
      return;
    }

    // c) best suggestion from the classifier (registrar just confirms)
    const top = ocrResult?.document_type_suggestions?.[0];
    if (top && docs.some((d) => d.document_id === top.document_id)) {
      setDocumentId(String(top.document_id));
      setSuggested(true);
    }
  }, [docs, ocrResult, detectedDocType]);

  
  // 3. Auto-select the student matched by the current scan
  useEffect(() => {
    if (studentId) {
      setPickedStudent(null);
      return;
    }

    setPickedStudent(ocrResult?.matched_student ?? null);
  }, [ocrResult, studentId]);


  const finalStudentId = studentId || pickedStudent?.student_id || "";
  const finalStudentName =
    studentName ||
    (pickedStudent
      ? [pickedStudent.first_name, pickedStudent.middle_name, pickedStudent.last_name]
          .filter(Boolean).join(" ")
      : ocrFullName);

const handleSave = async () => {
  if (!documentId) return;

  if (!studentId && !finalStudentId) {
    alert("No student matched. Please select the correct student before saving.");
    return;
  }

  try {
    setSaving(true);

    const doc = docs.find(
      (d) => String(d.document_id) === documentId
    );

    await onSave?.({
      studentId: finalStudentId,
      studentName: finalStudentName,
      ocrName,
      documentId: Number(documentId),
      documentType: doc?.document_name || "",
      fileName,
      fileUrl,
    });
  } finally {
    setSaving(false);
  }
};

  const content = (
    <div className="ocr-overlay">
      <div className="ocr-card">

        {/* HEADER */}
        <div className="ocr-header">
          <div>
            <h3 className="ocr-title">
              DOCUMENT CONFIRMATION
            </h3>

            <p className="ocr-sub">
              Review detected information before saving
            </p>
          </div>
        </div>


        {/* BODY */}
        <div className="ocr-body">

          {/* ==================================================
              FILE PREVIEW
              ================================================== */}
          <div className="ocr-panel">

            <div className="ocr-panel-header">
              <span className="ocr-panel-title">
                File preview
              </span>

              <span className="ocr-file-type-badge">
                {isPdf(fileUrl) ? "PDF" : "IMAGE"}
              </span>
            </div>


            <div className="ocr-preview-box">

              {fileUrl ? (
                isPdf(fileUrl) ? (
                  <iframe
                    title="Scanned document preview"
                    src={fileUrl}
                    className="ocr-preview-iframe"
                  />
                ) : (
                  <img
                    src={fileUrl}
                    alt="Scanned document"
                    className="ocr-preview-image"
                  />
                )
              ) : (
                <div className="ocr-no-preview">
                  <p className="ocr-no-preview-title">
                    No preview available
                  </p>

                  <p className="ocr-no-preview-text">
                    The scanned file could not be displayed.
                  </p>
                </div>
              )}

            </div>


            {fileName && (
              <div className="ocr-meta-row">
                <span className="ocr-meta-label">
                  File name
                </span>

                <span className="ocr-meta-value">
                  {fileName}
                </span>
              </div>
            )}

          </div>


          {/* ==================================================
              DETECTED INFORMATION
              ================================================== */}
          <div>

            <div className="ocr-panel">

              <div className="ocr-panel-header">
                <span className="ocr-panel-title">
                  Detected information
                </span>
              </div>


              {/* DOCUMENT TYPE */}
              <div className="ocr-field-group">

                <label className="ocr-field-label">
                  Document type
                </label>

              <select
  className="ocr-field-select"
  value={documentId}
  onChange={(e) => { setDocumentId(e.target.value); setSuggested(false); }}
  disabled={saving || !docs.length}
>
  <option value="">Select Document Type</option>
  {docs.map((d) => (
    <option key={d.document_id} value={String(d.document_id)}>
      {d.document_name}
    </option>
  ))}
</select>

<p className="ocr-field-hint">
  {docsError ||
    (documentId
      ? suggested
        ? "✣ Best guess from OCR. Please confirm."
        : "✣ Auto-detected via OCR. Correct if needed."
      : "Could not detect the type. Please choose one.")}
</p>

                <p className="ocr-field-hint">
                  ✣ Auto-detected via OCR — correct if needed
                </p>

              </div>


              <div className="ocr-info-row">
  <span className="ocr-info-label">Student name</span>
  <span className="ocr-info-value">{finalStudentName || "—"}</span>
</div>

<div className="ocr-info-row">
  <span className="ocr-info-label">Student ID</span>
  <span className="ocr-info-value">{finalStudentId || "—"}</span>
</div>

{!studentId && !pickedStudent && candidates.length > 0 && (
  <div className="ocr-field-group">
    <p className="ocr-field-hint">No confident match. Is it one of these?</p>
    {candidates.map((c) => (
      <button
        key={c.student_id}
        type="button"
        className="ocr-cancel-btn"
        onClick={() => setPickedStudent(c)}
      >
        {c.student_id} · {c.last_name}, {c.first_name}
      </button>
    ))}
  </div>
)}

            </div>

          </div>

        </div>


        {/* FOOTER */}
        <div className="ocr-footer">

          <div />

          <div className="ocr-footer-actions">

            <button
              type="button"
              className="ocr-cancel-btn"
              onClick={onCancel}
              disabled={saving}
            >
              Cancel
            </button>

            <button
              type="button"
              className="ocr-save-btn"
              onClick={handleSave}
              disabled={!documentId || saving}
            >
              {saving
                ? "Saving..."
                : "NEW SAVE BUTTON"}
            </button>

          </div>

        </div>

      </div>
    </div>
  );

  return createPortal(content, document.body);
}