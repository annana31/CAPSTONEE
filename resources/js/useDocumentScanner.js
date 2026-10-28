import { useState, useCallback } from "react";
import { SCANNER_URL, absoluteUrl } from "./scannerUtils";
import { supabase } from "./supabaseClient";
import { matchStudentFromOcr } from "./matchStudent";

/**
 * Reusable document-scanning logic.
 *
 * @param {object}   options
 * @param {string}   options.studentId   When set (scanning from a student's
 *                                       profile) the student is already known,
 *                                       so OCR name matching is skipped.
 * @param {function} options.onScanned   (credential, result) => void
 *                                       Called right after a successful scan.
 * @param {function} options.onConfirmed async (payload, credential) => boolean
 *                                       Called when the OCR confirmation is
 *                                       saved. Return false (or throw) to keep
 *                                       the confirmation dialog open.
 * @param {function} options.onCancelled (credential) => void
 *                                       Called when the confirmation dialog is
 *                                       cancelled (undo any "pending" state).
 */

// If OCR gave a label but no document_id, find the row in tbl_documents.
// "Unknown" is treated as "nothing detected".
async function resolveDocumentId(result) {
  if (result.document_id) return result.document_id;

  const name = (result.document_type || "").trim();
  if (!name || name.toLowerCase() === "unknown") return null;

  const { data } = await supabase
    .from("tbl_documents")
    .select("document_id")
    .ilike("document_name", name)
    .limit(2);

  return data?.length === 1 ? data[0].document_id : null;
}

export default function useDocumentScanner({
  studentId,
  onScanned,
  onConfirmed,
  onCancelled,
} = {}) {
  const [showScanModal, setShowScanModal] = useState(false);
  const [selectedCredential, setSelectedCredential] = useState(null);

  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");

  // Available physical scanners
  const [scanners, setScanners] = useState([]);
  const [selectedScanner, setSelectedScanner] = useState(null);
  const [loadingScanners, setLoadingScanners] = useState(false);
  const [scannerError, setScannerError] = useState("");

  // OCR Confirmation
  const [ocrResult, setOcrResult] = useState(null);
  const [showOCRConfirmation, setShowOCRConfirmation] = useState(false);

  // ============================================================
  // SCANNER DISCOVERY
  // ============================================================

  const loadScanners = useCallback(async (force = false) => {
    try {
      setLoadingScanners(true);
      setScannerError("");

      const url = force
        ? `${SCANNER_URL}/scanners?force=1`
        : `${SCANNER_URL}/scanners`;

      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok || !data.success) {
        throw new Error(data.message || "Unable to load scanners.");
      }

      setScanners(data.scanners || []);

      // Keep currently selected scanner if it is still available
      setSelectedScanner((current) => {
        if (
          current &&
          (data.scanners || []).some((s) => s.id === current.id)
        ) {
          return current;
        }
        return null;
      });
    } catch (err) {
      console.error("Scanner discovery error:", err);

      const unreachable = err instanceof TypeError;

      setScannerError(
        unreachable
          ? `Can't reach the scanner service at ${SCANNER_URL}. Make sure it is running and allows requests from this site (CORS).`
          : err.message || "Unable to connect to the scanner service."
      );

      setScanners([]);
    } finally {
      setLoadingScanners(false);
    }
  }, []);

  // ============================================================
  // OPEN / CLOSE MODAL
  // ============================================================

  const open = useCallback(
    (cred = null) => {
      setSelectedCredential(cred);
      setScanError("");
      setScannerError("");

      // Clear previous OCR confirmation
      setOcrResult(null);
      setShowOCRConfirmation(false);

      setShowScanModal(true);
      loadScanners();
    },
    [loadScanners]
  );

  const close = useCallback(() => {
    if (scanning) return;

    setShowScanModal(false);
    setSelectedCredential(null);
    setSelectedScanner(null);
    setScanError("");
    setScannerError("");
  }, [scanning]);

  // ============================================================
  // SCAN
  // ============================================================

  const scan = async () => {
    const credential = selectedCredential;
    const scanner = selectedScanner;

    if (!scanner) {
      setScanError("Please select a scanner first.");
      return;
    }

    try {
      setScanning(true);
      setScanError("");

      // Scanning only needs the chosen scanner (no student ID)
      const response = await fetch(`${SCANNER_URL}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ device_uid: scanner.id }),
      });

      let data = null;

      try {
        data = await response.json();
      } catch {
        throw new Error("The scanner service returned an invalid response.");
      }

      if (!response.ok || !data.success) {
        throw new Error(data?.message || "Failed to scan the document.");
      }

      console.log("[RAW SCAN RESPONSE]", data); // what the scanner service forwards

      const fileUrl = absoluteUrl(data.file_url);

      const result = {
        ...data,
        file_url: fileUrl,

        document_type:
          data.document_type ||
          data.detected_document_type ||
          data.detectedDocType ||
          "",
        document_type_key: data.document_type_key || data.documentTypeKey || "",
        document_type_confidence:
          data.document_type_confidence ?? data.documentTypeConfidence ?? null,
        document_type_matches:
          data.document_type_matches || data.documentTypeMatches || [],
        document_type_suggestions: data.document_type_suggestions || [],

        document_id: data.document_id ?? data.documentId ?? null,

        first_name: data.first_name ?? data.firstName ?? "",
        middle_name: data.middle_name ?? data.middleName ?? "",
        last_name: data.last_name ?? data.lastName ?? "",
      };

      // Auto-fill: document type ID + student ID
      try {
        result.document_id = await resolveDocumentId(result);

        // The OCR may return the name in Last-First-Middle order.
        const fullName =
          result.full_name ||
          result.fullName ||
          result.student_name ||
          result.studentName ||
          [result.first_name, result.middle_name, result.last_name]
            .filter(Boolean)
            .join(" ");

        if (studentId) {
          // Scanning from a student's profile: the student is already known,
          // so there is nothing to match.
          result.matched_student = null;
          result.student_candidates = [];
          result.matched_student_id = studentId;
        } else if (fullName.trim()) {
          const match = await matchStudentFromOcr({
            first: result.first_name,
            middle: result.middle_name,
            last: result.last_name,
            fullName,
          });

          result.matched_student = match.student;
          result.student_candidates = match.candidates || [];

          // Keep the actual database student ID available to the UI.
          result.matched_student_id = match.student?.student_id ?? null;

          console.log("[OCR NAME]", fullName);
          console.log("[STUDENT MATCH]", match.student);
          console.log("[STUDENT CANDIDATES]", match.candidates);
        } else {
          result.matched_student = null;
          result.student_candidates = [];
          result.matched_student_id = null;

          console.warn("OCR returned no usable name for student matching.");
        }
      } catch (e) {
        console.error("Auto-fill lookup failed:", e);
        result.matched_student = null;
        result.student_candidates = [];
        result.matched_student_id = studentId || null;
      }

      onScanned?.(credential, result);

      setOcrResult(result);
      setShowScanModal(false);
      setShowOCRConfirmation(true);
    } catch (err) {
      console.error("Scanner error:", err);

      const unreachable = err instanceof TypeError;

      setScanError(
        unreachable
          ? `Can't reach the scanner service at ${SCANNER_URL}. Make sure it is running and allows requests from this site (CORS).`
          : err.message || "Unable to connect to the selected scanner."
      );
    } finally {
      setScanning(false);
    }
  };

  // ============================================================
  // SCAN AGAIN
  // ============================================================

  const scanAgain = () => {
    const credential = selectedCredential;

    // The first scan was discarded: let the page undo its "pending" state.
    onCancelled?.(credential);

    setOcrResult(null);
    setShowOCRConfirmation(false);

    setScanError("");
    setScannerError("");

    setSelectedScanner(null);
    setSelectedCredential(credential);

    setShowScanModal(true);
    loadScanners();
  };

  // ============================================================
  // OCR CONFIRMATION
  // ============================================================

  const cancelOCR = () => {
    const credential = selectedCredential;

    setShowOCRConfirmation(false);
    setOcrResult(null);
    setSelectedCredential(null);

    onCancelled?.(credential);
  };

  const saveOCR = async (payload) => {
    try {
      const ok = await onConfirmed?.(payload, selectedCredential);

      // onConfirmed returns false when saving failed: keep the dialog open
      // so the registrar can retry.
      if (ok === false) return false;

      setShowOCRConfirmation(false);
      setOcrResult(null);
      setSelectedCredential(null);
      return true;
    } catch (err) {
      console.error("OCR save error:", err);
      throw err;
    }
  };

  return {
    // modal state
    showScanModal,
    selectedCredential,
    scanning,
    scanError,

    // scanner list
    scanners,
    selectedScanner,
    setSelectedScanner,
    loadingScanners,
    scannerError,
    loadScanners,

    // OCR state
    ocrResult,
    showOCRConfirmation,

    // actions
    open,
    close,
    scan,
    scanAgain,
    cancelOCR,
    saveOCR,
  };
}