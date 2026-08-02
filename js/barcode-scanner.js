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
  let videoReadyHandler = null;

  // Requesting a higher resolution than the getUserMedia default gives the
  // decoder more pixel detail to work with — denser 2D formats (DataMatrix,
  // PDF417) need meaningfully more resolution to resolve than QR does, so
  // the default (often 640x480-ish) frequently isn't enough for them.
  const VIDEO_CONSTRAINTS = {
    video: {
      facingMode: { ideal: "environment" },
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    },
    audio: false
  };

  function setStatus(text, isError) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.classList.toggle("barcode-status-error", !!isError);
  }

  function buildHints() {
    const hints = new Map();
    // Spends more effort per frame (multiple rotations/binarization
    // strategies) — the modal isn't a real-time overlay competing for
    // frame budget elsewhere, so trading a bit of speed for a much higher
    // hit rate on harder formats is the right call here.
    hints.set(window.ZXing.DecodeHintType.TRY_HARDER, true);
    return hints;
  }

  /** Stops the decode loop and releases the camera. Safe to call more than
   *  once (e.g. both on successful decode and again from the modal's own
   *  hidden.bs.modal cleanup) — every step checks its own state first. */
  function stopScanning() {
    scanning = false;
    if (videoEl && videoReadyHandler) {
      videoEl.removeEventListener("loadedmetadata", videoReadyHandler);
      videoReadyHandler = null;
    }
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

  function cameraErrorMessage(err) {
    const name = err && err.name;
    if (name === "NotAllowedError" || name === "SecurityError") {
      return "Camera access denied — check your browser's site permissions and try again.";
    }
    if (name === "NotFoundError" || name === "OverconstrainedError") {
      return "No usable camera found on this device.";
    }
    if (name === "NotReadableError") {
      return "The camera is already in use by another app.";
    }
    return "Couldn't access the camera — check permissions and try again.";
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

    // decodeFromConstraints lets ZXing own the whole getUserMedia + video
    // attachment + play() lifecycle itself, instead of this module handing
    // it an already-attached stream/video — one fewer place for the two to
    // race or double-attach the stream.
    videoReadyHandler = () => {
      if (!scanning) return;
      stream = videoEl.srcObject;
      updateTorchAvailability();
      setStatus("Point the camera at a barcode or QR code.");
    };
    videoEl.addEventListener("loadedmetadata", videoReadyHandler);

    codeReader = new window.ZXing.BrowserMultiFormatReader();
    codeReader.hints = buildHints();
    scanning = true;
    try {
      await codeReader.decodeFromConstraints(
        VIDEO_CONSTRAINTS,
        videoEl,
        (result, err) => {
          if (!scanning) return;
          if (result) {
            const text = result.getText();
            scanning = false;
            setStatus(`Scanned: ${text}`);
            const cb = onDecodeCallback;
            // Deferred: this callback runs from inside ZXing's own frame-
            // processing call stack, and calling modal.hide() /
            // stopScanning() synchronously from in there was observed to
            // leave the Bootstrap modal visually stuck open (its internal
            // _isShown flips false, .hide() called manually afterward works
            // fine — just not from this exact call stack). Breaking out to
            // a fresh task avoids whatever interaction that is.
            setTimeout(() => {
              stopScanning();
              if (modal) modal.hide();
              if (cb) cb(text);
            }, 0);
            return;
          }
          // ZXing calls this callback continuously while scanning; a
          // NotFoundException just means no code is in frame yet —
          // expected on nearly every frame, not a real error.
          if (
            err &&
            window.ZXing.NotFoundException &&
            err instanceof window.ZXing.NotFoundException
          ) {
            return;
          }
          if (err) {
            console.warn("[BARCODE] decode frame error", err);
          }
        }
      );
    } catch (err) {
      if (scanning) {
        console.warn("[BARCODE] camera/decode failed to start", err);
        setStatus(cameraErrorMessage(err), true);
        stopScanning();
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
