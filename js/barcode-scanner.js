(function () {
  "use strict";

  let modal = null;
  let modalEl = null;
  let videoEl = null;
  let statusEl = null;
  let torchBtn = null;
  let wired = false;

  let stream = null;
  let codeReader = null;
  let scanning = false;
  let torchOn = false;
  let onDecodeCallback = null;

  function setStatus(text, isError) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle("barcode-status-error", !!isError);
  }

  /** Stops the decode loop and releases the camera. Safe to call more than
   *  once (e.g. both on successful decode and again from the modal's own
   *  hidden.bs.modal cleanup) — every step checks its own state first. */
  function stopScanning() {
    scanning = false;
    if (codeReader) {
      try {
        codeReader.reset();
      } catch (err) {
        // no-op — reader may already be stopped
      }
      codeReader = null;
    }
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      stream = null;
    }
    if (videoEl) videoEl.srcObject = null;
    torchOn = false;
    if (torchBtn) {
      torchBtn.hidden = true;
      torchBtn.classList.remove("active");
    }
  }

  function updateTorchAvailability() {
    if (!stream || !torchBtn) return;
    const track = stream.getVideoTracks()[0];
    const capabilities =
      track && track.getCapabilities ? track.getCapabilities() : {};
    torchBtn.hidden = !capabilities.torch;
  }

  async function toggleTorch() {
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] });
      torchOn = next;
      torchBtn.classList.toggle("active", torchOn);
    } catch (err) {
      console.warn("[BARCODE] torch toggle failed", err);
    }
  }

  async function startScanning() {
    if (!window.ZXing || !window.ZXing.BrowserMultiFormatReader) {
      setStatus("Barcode scanning isn't available (library failed to load).", true);
      return;
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setStatus("Camera not supported in this browser.", true);
      return;
    }
    setStatus("Starting camera...");
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
        audio: false
      });
    } catch (err) {
      console.warn("[BARCODE] getUserMedia failed", err);
      setStatus(
        "Couldn't access the camera — check permissions and try again.",
        true
      );
      return;
    }

    videoEl.srcObject = stream;
    try {
      await videoEl.play();
    } catch (err) {
      // Autoplay can reject if the modal was dismissed mid-start; scanning
      // just won't proceed, nothing else to do here.
    }
    updateTorchAvailability();
    setStatus("Point the camera at a barcode or QR code.");

    codeReader = new window.ZXing.BrowserMultiFormatReader();
    scanning = true;
    try {
      await codeReader.decodeFromStream(stream, videoEl, (result, err) => {
        if (!scanning) return;
        if (result) {
          const text = result.getText();
          scanning = false;
          setStatus(`Scanned: ${text}`);
          const cb = onDecodeCallback;
          stopScanning();
          if (modal) modal.hide();
          if (cb) cb(text);
          return;
        }
        // ZXing calls this callback continuously while scanning; a
        // NotFoundException just means no code is in frame yet — expected
        // on nearly every frame, not a real error.
        if (err && window.ZXing.NotFoundException && err instanceof window.ZXing.NotFoundException) {
          return;
        }
        if (err) {
          console.warn("[BARCODE] decode frame error", err);
        }
      });
    } catch (err) {
      if (scanning) {
        console.warn("[BARCODE] decode loop failed to start", err);
        setStatus("Scanning error — close and try again.", true);
      }
    }
  }

  function wire() {
    if (wired) return;
    modalEl = document.getElementById("barcodeModal");
    videoEl = document.getElementById("barcodeVideo");
    statusEl = document.getElementById("barcodeStatus");
    torchBtn = document.getElementById("barcodeTorchBtn");
    if (!modalEl || !window.bootstrap) return;
    modal = new bootstrap.Modal(modalEl);
    modalEl.addEventListener("hidden.bs.modal", () => stopScanning());
    if (torchBtn) torchBtn.addEventListener("click", toggleTorch);
    wired = true;
  }

  /** Opens the scan modal and starts scanning; calls opts.onDecode(text)
   *  once with the first successfully decoded value, then closes itself.
   *  No-op (with a console warning) if the page markup/library isn't present. */
  function open(opts) {
    wire();
    if (!wired) {
      console.warn("[BARCODE] modal markup or Bootstrap not found");
      return;
    }
    onDecodeCallback = (opts && opts.onDecode) || null;
    setStatus("Point the camera at a barcode or QR code.");
    modal.show();
    startScanning();
  }

  window.BarcodeScanner = { open };
})();
