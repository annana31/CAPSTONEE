import { useState, useCallback } from "react";
import { SCANNER_URL, absoluteUrl } from "./scannerUtils";

/**
 * Reusable document-scanning logic.
 *
 * @param {object}   options
 * @param {string}   options.studentId   Student the scan belongs to
 * @param {function} options.onScanned   (credential, result) => void
 *                                       Called right after a successful scan.
 * @param {function} options.onConfirmed (payload, credential) => void | Promise
 *                                       Called when the OCR confirmation is saved.
 *
 * Usage:
 *   const scanner = useDocumentScanner({ studentId, onScanned, onConfirmed });
 *   <button onClick={() => scanner.open(credential)}>Scan</button>
 *   <DocumentScanner scanner={scanner} studentId={id} studentName={name} />
 */
export default function useDocumentScanner({
  studentId,
  onScanned,
  onConfirmed,
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

      const response = await fetch(`${SCANNER_URL}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: studentId,
          device_uid: scanner.id,
        }),
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

      const fileUrl = absoluteUrl(data.file_url);

      // Keep the entire scanner response, normalising property names
      const result = {
        ...data,
        file_url: fileUrl,

        document_type:
          data.document_type ||
          data.detected_document_type ||
          data.detectedDocType ||
          "",

        document_type_key:
          data.document_type_key || data.documentTypeKey || "",

        document_type_confidence:
          data.document_type_confidence ??
          data.documentTypeConfidence ??
          null,

        document_type_matches:
          data.document_type_matches || data.documentTypeMatches || [],
      };

      // Let the host page react (e.g. mark a credential row as Pending)
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
    setShowOCRConfirmation(false);
    setOcrResult(null);
  };

  const saveOCR = async (payload) => {
    try {
      await onConfirmed?.(payload, selectedCredential);

      setShowOCRConfirmation(false);
      setOcrResult(null);
      setSelectedCredential(null);
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
