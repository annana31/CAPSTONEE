import os

# Disable PIR and MKL-DNN because of the CPU compatibility issue
os.environ["FLAGS_enable_pir_api"] = "0"
os.environ["FLAGS_use_mkldnn"] = "0"

from paddleocr import PaddleOCR

ocr = PaddleOCR(
    lang="en",
    device="cpu",

    # Faster OCR pipeline
    use_doc_orientation_classify=False,
    use_doc_unwarping=False,
    use_textline_orientation=False,

    # Use smaller/faster OCR models
    text_detection_model_name="PP-OCRv6_small_det",
    text_recognition_model_name="PP-OCRv6_small_rec",

    # Disable MKL-DNN
    enable_mkldnn=False,
)

print("Starting OCR...")

result = ocr.predict("birth.jpg")

print("\n===== OCR RESULT =====")

for res in result:
    res.print()