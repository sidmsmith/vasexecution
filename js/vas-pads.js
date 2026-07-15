/** Signature / misc photos / markup pad helpers for VAS Execution (Inspection-style). */
(function (global) {
  const SIGNATURE_MIN_INK_PX = 80;
  const sessionPhotos = [];
  const photoListeners = new Set();

  function notifyPhotos() {
    photoListeners.forEach((fn) => {
      try {
        fn(sessionPhotos.slice());
      } catch (_) {
        /* ignore */
      }
    });
  }

  function bindSignaturePad(section) {
    if (!section || section.dataset.sigBound) return;
    section.dataset.sigBound = "1";
    const wrapper = section.querySelector(".signature-pad-wrapper");
    const canvas = section.querySelector("canvas.signature-canvas");
    const clearBtn = section.querySelector(".sig-clear");
    if (!wrapper || !canvas) return;

    const ctx = canvas.getContext("2d");
    let drawing = false;
    let ink = 0;
    let last = null;

    function setEmpty(empty) {
      wrapper.classList.toggle("is-empty", empty);
      canvas.classList.toggle("is-empty", empty);
    }

    let lastCssW = 0;
    let lastCssH = 0;
    let resizing = false;

    function resize() {
      if (resizing) return;
      // Use clientWidth (no fractional subpixel growth loops from getBoundingClientRect)
      const cssW = Math.max(1, wrapper.clientWidth || 1);
      const cssH = Math.max(140, wrapper.clientHeight || 140);
      if (Math.abs(cssW - lastCssW) < 2 && Math.abs(cssH - lastCssH) < 2) return;
      resizing = true;
      lastCssW = cssW;
      lastCssH = cssH;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.floor(cssW * dpr);
      const h = Math.floor(cssH * dpr);
      canvas.width = w;
      canvas.height = h;
      // Keep CSS 100% — never set pixel style widths (that expands the layout forever)
      canvas.style.width = "100%";
      canvas.style.height = "100%";
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 2.25 * dpr;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ink = 0;
      last = null;
      setEmpty(true);
      resizing = false;
    }

    function pos(e) {
      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const src = e.touches && e.touches[0] ? e.touches[0] : e;
      return {
        x: (src.clientX - rect.left) * dpr,
        y: (src.clientY - rect.top) * dpr
      };
    }

    function start(e) {
      e.preventDefault();
      drawing = true;
      last = pos(e);
      setEmpty(false);
      if (e.pointerId != null && canvas.setPointerCapture) {
        try {
          canvas.setPointerCapture(e.pointerId);
        } catch (_) {
          /* ignore */
        }
      }
    }

    function move(e) {
      if (!drawing || !last) return;
      e.preventDefault();
      const p = pos(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ink += Math.hypot(p.x - last.x, p.y - last.y);
      last = p;
    }

    function stop(e) {
      if (!drawing) return;
      drawing = false;
      last = null;
      if (e && e.pointerId != null && canvas.releasePointerCapture) {
        try {
          canvas.releasePointerCapture(e.pointerId);
        } catch (_) {
          /* ignore */
        }
      }
    }

    canvas.addEventListener("pointerdown", start);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerup", stop);
    canvas.addEventListener("pointercancel", stop);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", stop);
    canvas.addEventListener("touchcancel", stop);

    if (clearBtn) {
      clearBtn.onclick = () => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ink = 0;
        setEmpty(true);
      };
    }

    resize();
    requestAnimationFrame(resize);
    if (typeof ResizeObserver !== "undefined") {
      new ResizeObserver(resize).observe(wrapper);
    } else {
      window.addEventListener("resize", resize);
    }

    canvas._vasPad = {
      clear() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ink = 0;
        setEmpty(true);
      },
      hasInk() {
        return ink >= SIGNATURE_MIN_INK_PX;
      },
      toDataUrl() {
        return canvas.toDataURL("image/png");
      },
      resize
    };
  }

  function bindMarkupPad(section) {
    if (!section || section.dataset.markupBound) return;
    section.dataset.markupBound = "1";
    const root = section.querySelector(".damage-pad-wrapper, .markup-pad");
    if (!root) return;
    const bg = root.querySelector(".markup-bg, #damagePadBg, canvas.markup-bg");
    const draw = root.querySelector(".markup-draw, canvas.markup-draw");
    const placeholder = root.querySelector(".damage-pad-empty-placeholder");
    const fileInput = section.querySelector(".markup-file");
    const clearMarksBtn = section.querySelector(".markup-clear, .clear-marks-btn");
    const clearPhotoBtn = section.querySelector(".markup-clear-photo, .clear-photo-btn");
    const cameraBtn = section.querySelector(".markup-camera, .damage-pad-photo-btn");
    if (!bg || !draw) return;

    const bgCtx = bg.getContext("2d");
    const drawCtx = draw.getContext("2d");
    let drawing = false;
    let photo = null;
    let last = null;

    function showEmpty(on) {
      root.classList.toggle("is-empty", on);
      root.classList.toggle("show-empty-placeholder", on);
      root.classList.toggle("has-photo", !on);
      if (clearPhotoBtn) clearPhotoBtn.style.display = on ? "none" : "";
      if (cameraBtn) cameraBtn.classList.toggle("visible", true);
    }

    let lastMarkupW = 0;
    let lastMarkupH = 0;

    function sizeTo(cssW, cssH) {
      const wCss = Math.max(1, Math.floor(cssW));
      const hCss = Math.max(1, Math.floor(cssH));
      if (Math.abs(wCss - lastMarkupW) < 2 && Math.abs(hCss - lastMarkupH) < 2) {
        return;
      }
      lastMarkupW = wCss;
      lastMarkupH = hCss;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.max(1, Math.floor(wCss * dpr));
      const h = Math.max(1, Math.floor(hCss * dpr));
      [bg, draw].forEach((c) => {
        c.width = w;
        c.height = h;
        c.style.width = "100%";
        c.style.height = `${hCss}px`;
      });
      root.style.height = `${hCss}px`;
      drawCtx.strokeStyle = "#dc3545";
      drawCtx.lineWidth = 4 * dpr;
      drawCtx.lineCap = "round";
      drawCtx.lineJoin = "round";
    }

    function paintBg() {
      bgCtx.clearRect(0, 0, bg.width, bg.height);
      if (!photo) {
        bgCtx.fillStyle = getComputedStyle(root).getPropertyValue("--input-bg") || "#2a2a2a";
        bgCtx.fillRect(0, 0, bg.width, bg.height);
        return;
      }
      const scale = Math.min(bg.width / photo.width, bg.height / photo.height);
      const dw = photo.width * scale;
      const dh = photo.height * scale;
      const dx = (bg.width - dw) / 2;
      const dy = (bg.height - dh) / 2;
      bgCtx.drawImage(photo, dx, dy, dw, dh);
    }

    function setPhotoFromDataUrl(dataUrl) {
      const img = new Image();
      img.onload = () => {
        photo = img;
        const parentW =
          (root.parentElement && root.parentElement.clientWidth) ||
          section.clientWidth ||
          480;
        const maxW = Math.min(parentW || 480, root.clientWidth || parentW || 480);
        const ratio = img.height / Math.max(1, img.width);
        sizeTo(maxW, Math.max(180, Math.round(maxW * ratio)));
        paintBg();
        drawCtx.clearRect(0, 0, draw.width, draw.height);
        showEmpty(false);
      };
      img.src = dataUrl;
    }

    function pos(e) {
      const rect = draw.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const src = e.touches && e.touches[0] ? e.touches[0] : e;
      return {
        x: (src.clientX - rect.left) * dpr,
        y: (src.clientY - rect.top) * dpr
      };
    }

    function start(e) {
      if (!photo) {
        if (fileInput) fileInput.click();
        return;
      }
      e.preventDefault();
      drawing = true;
      last = pos(e);
      if (e.pointerId != null && draw.setPointerCapture) {
        try {
          draw.setPointerCapture(e.pointerId);
        } catch (_) {
          /* ignore */
        }
      }
    }

    function move(e) {
      if (!drawing || !last) return;
      e.preventDefault();
      const p = pos(e);
      drawCtx.beginPath();
      drawCtx.moveTo(last.x, last.y);
      drawCtx.lineTo(p.x, p.y);
      drawCtx.stroke();
      last = p;
    }

    function stop(e) {
      drawing = false;
      last = null;
      if (e && e.pointerId != null && draw.releasePointerCapture) {
        try {
          draw.releasePointerCapture(e.pointerId);
        } catch (_) {
          /* ignore */
        }
      }
    }

    draw.addEventListener("pointerdown", start);
    draw.addEventListener("pointermove", move);
    draw.addEventListener("pointerup", stop);
    draw.addEventListener("pointercancel", stop);

    root.addEventListener("click", (e) => {
      if (!photo && (e.target === root || e.target === placeholder || e.target.closest?.(".damage-pad-empty-placeholder"))) {
        if (fileInput) fileInput.click();
      }
    });

    if (clearMarksBtn) {
      clearMarksBtn.onclick = () => drawCtx.clearRect(0, 0, draw.width, draw.height);
    }
    if (clearPhotoBtn) {
      clearPhotoBtn.onclick = () => {
        photo = null;
        const w = root.clientWidth || 480;
        sizeTo(w, 180);
        paintBg();
        drawCtx.clearRect(0, 0, draw.width, draw.height);
        showEmpty(true);
      };
    }
    if (fileInput) {
      fileInput.onchange = () => {
        const file = fileInput.files && fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setPhotoFromDataUrl(reader.result);
        reader.readAsDataURL(file);
        fileInput.value = "";
      };
    }
    if (cameraBtn) {
      cameraBtn.classList.add("visible");
      cameraBtn.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (cameraModalApi?.modal) {
          openLiveCamera({
            purpose: "markup",
            title: "Markup Photo",
            showGallery: false,
            onMarkupCapture: (dataUrl) => setPhotoFromDataUrl(dataUrl)
          });
        } else if (fileInput) {
          fileInput.click();
        }
      };
    }

    sizeTo(root.clientWidth || section.clientWidth || 480, 180);
    paintBg();
    showEmpty(true);

    root._vasMarkup = {
      setPhotoFromDataUrl,
      clearMarks() {
        drawCtx.clearRect(0, 0, draw.width, draw.height);
      },
      hasPhoto() {
        return !!photo;
      },
      toDataUrl() {
        const out = document.createElement("canvas");
        out.width = bg.width;
        out.height = bg.height;
        const octx = out.getContext("2d");
        octx.drawImage(bg, 0, 0);
        octx.drawImage(draw, 0, 0);
        return out.toDataURL("image/jpeg", 0.92);
      }
    };
  }

  function renderPhotoStrip(strip) {
    if (!strip) return;
    strip.innerHTML = sessionPhotos
      .map(
        (p, idx) =>
          `<div class="photo-thumb" data-idx="${idx}">
            <img src="${p.dataUrl}" alt="" />
            <button type="button" class="photo-remove" data-idx="${idx}" aria-label="Remove photo">&times;</button>
          </div>`
      )
      .join("");
    strip.querySelectorAll(".photo-remove").forEach((btn) => {
      btn.onclick = () => {
        sessionPhotos.splice(Number(btn.dataset.idx), 1);
        notifyPhotos();
      };
    });
    strip.classList.toggle("has-photos", sessionPhotos.length > 0);
  }

  function bindPhotoStrip(section) {
    if (!section || section.dataset.photosBound) return;
    section.dataset.photosBound = "1";
    const strip = section.querySelector(".photo-strip");
    if (!strip) return;
    const listener = () => renderPhotoStrip(strip);
    photoListeners.add(listener);
    listener();
  }

  function addSessionPhoto(dataUrl) {
    sessionPhotos.push({
      id: `photo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      dataUrl,
      mimeType: "image/jpeg"
    });
    notifyPhotos();
  }

  let cameraStream = null;
  let cameraModalApi = null;
  let cameraModalPurpose = "session";
  let markupCaptureHandler = null;
  let suppressModalReset = false;

  function stopCameraStream() {
    if (cameraStream) {
      cameraStream.getTracks().forEach((t) => t.stop());
      cameraStream = null;
    }
    if (cameraModalApi?.videoEl) {
      cameraModalApi.videoEl.srcObject = null;
    }
  }

  async function startCameraStream() {
    stopCameraStream();
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera not supported in this browser");
    }
    cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false
    });
    if (cameraModalApi?.videoEl) {
      cameraModalApi.videoEl.srcObject = cameraStream;
      await cameraModalApi.videoEl.play();
    }
  }

  function renderCameraGallery() {
    const { galleryEl, galleryEmptyEl } = cameraModalApi || {};
    if (!galleryEl) return;
    if (!sessionPhotos.length) {
      galleryEl.innerHTML = "";
      if (galleryEmptyEl) {
        galleryEmptyEl.style.display = "";
        galleryEmptyEl.textContent = "No photos captured yet.";
        galleryEl.appendChild(galleryEmptyEl);
      }
      return;
    }
    if (galleryEmptyEl) galleryEmptyEl.style.display = "none";
    galleryEl.innerHTML = sessionPhotos
      .map(
        (p, idx) =>
          `<div class="photo-thumb" data-idx="${idx}">
            <img src="${p.dataUrl}" alt="" />
            <button type="button" class="photo-remove" data-idx="${idx}" aria-label="Remove photo">&times;</button>
          </div>`
      )
      .join("");
    galleryEl.querySelectorAll(".photo-remove").forEach((btn) => {
      btn.onclick = () => {
        sessionPhotos.splice(Number(btn.dataset.idx), 1);
        notifyPhotos();
        renderCameraGallery();
      };
    });
  }

  async function openLiveCamera(opts) {
    const {
      purpose = "session",
      title = "Photos",
      showGallery = true,
      onMarkupCapture = null
    } = opts || {};
    if (!cameraModalApi?.modal) {
      cameraModalApi?.fileInput?.click();
      return;
    }
    cameraModalPurpose = purpose;
    markupCaptureHandler = onMarkupCapture;
    if (cameraModalApi.titleEl) cameraModalApi.titleEl.textContent = title;
    if (cameraModalApi.galleryEl) {
      cameraModalApi.galleryEl.style.display = showGallery ? "" : "none";
    }
    if (showGallery) renderCameraGallery();
    cameraModalApi.modal.show();
    try {
      await startCameraStream();
    } catch (err) {
      console.warn("[CAMERA] getUserMedia failed, using file fallback:", err);
      stopCameraStream();
      suppressModalReset = true;
      cameraModalApi.modal.hide();
      cameraModalApi.fileInput?.click();
      // Allow the next genuine close to reset state
      setTimeout(() => {
        suppressModalReset = false;
      }, 0);
    }
  }

  function wireCameraButton(opts) {
    const cfg =
      opts && typeof opts === "object" && opts.cameraBtn
        ? opts
        : {
            cameraBtn: arguments[0],
            fileInput: arguments[1],
            countEl: arguments[2]
          };
    const {
      cameraBtn,
      fileInput,
      countEl,
      modalEl,
      videoEl,
      canvasEl,
      captureBtn,
      galleryEl,
      galleryEmptyEl,
      fileFallbackBtn
    } = cfg;
    if (!cameraBtn || cameraBtn.dataset.camBound) return;
    cameraBtn.dataset.camBound = "1";

    const titleEl = modalEl?.querySelector(".modal-title") || null;
    cameraModalApi = {
      cameraBtn,
      fileInput,
      countEl,
      modalEl,
      videoEl,
      canvasEl,
      captureBtn,
      galleryEl,
      galleryEmptyEl,
      fileFallbackBtn,
      titleEl,
      modal:
        modalEl && window.bootstrap?.Modal
          ? window.bootstrap.Modal.getOrCreateInstance(modalEl)
          : null
    };

    cameraBtn.onclick = () =>
      openLiveCamera({
        purpose: "session",
        title: "Photos",
        showGallery: true
      });

    if (fileInput && !fileInput.dataset.camFileBound) {
      fileInput.dataset.camFileBound = "1";
      fileInput.onchange = () => {
        const files = Array.from(fileInput.files || []);
        files.forEach((file) => {
          const reader = new FileReader();
          reader.onload = () => {
            if (cameraModalPurpose === "markup" && markupCaptureHandler) {
              const handler = markupCaptureHandler;
              cameraModalPurpose = "session";
              markupCaptureHandler = null;
              handler(reader.result);
              return;
            }
            addSessionPhoto(reader.result);
            renderCameraGallery();
          };
          reader.readAsDataURL(file);
        });
        fileInput.value = "";
      };
    }

    if (fileFallbackBtn && !fileFallbackBtn.dataset.camBound) {
      fileFallbackBtn.dataset.camBound = "1";
      fileFallbackBtn.onclick = () => fileInput?.click();
    }

    if (captureBtn && !captureBtn.dataset.camBound) {
      captureBtn.dataset.camBound = "1";
      captureBtn.onclick = () => {
        const video = videoEl;
        const canvas = canvasEl;
        if (!video || !canvas || !video.videoWidth || !video.videoHeight) return;
        const ctx = canvas.getContext("2d");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        ctx.drawImage(video, 0, 0);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.92);
        if (cameraModalPurpose === "markup" && markupCaptureHandler) {
          markupCaptureHandler(dataUrl);
          markupCaptureHandler = null;
          cameraModalPurpose = "session";
          cameraModalApi.modal?.hide();
          return;
        }
        addSessionPhoto(dataUrl);
        renderCameraGallery();
      };
    }

    if (modalEl && !modalEl.dataset.camBound) {
      modalEl.dataset.camBound = "1";
      modalEl.addEventListener("hidden.bs.modal", () => {
        stopCameraStream();
        if (suppressModalReset) return;
        cameraModalPurpose = "session";
        markupCaptureHandler = null;
        if (galleryEl) galleryEl.style.display = "";
        if (titleEl) titleEl.textContent = "Photos";
      });
    }

    const syncCount = () => {
      const n = sessionPhotos.length;
      cameraBtn.classList.toggle("has-photos", n > 0);
      if (countEl) countEl.textContent = String(n);
      if (cameraModalPurpose === "session") renderCameraGallery();
    };
    photoListeners.add(syncCount);
    syncCount();
  }

  function setCameraVisible(cameraBtn, visible) {
    if (!cameraBtn) return;
    cameraBtn.classList.toggle("visible", !!visible);
  }

  function bindAllPads(container) {
    if (!container) return;
    container
      .querySelectorAll(".capture-section[data-capture='signature'], .signature-section")
      .forEach(bindSignaturePad);
    container
      .querySelectorAll(".capture-section[data-capture='markup'], .damage-pad-section")
      .forEach(bindMarkupPad);
    container
      .querySelectorAll(".capture-section[data-capture='photos'], .photo-capture")
      .forEach(bindPhotoStrip);
  }

  global.VasPads = {
    bindSignaturePad,
    bindMarkupPad,
    bindPhotoStrip,
    bindAllPads,
    wireCameraButton,
    openLiveCamera,
    setCameraVisible,
    addSessionPhoto,
    getSessionPhotos: () => sessionPhotos.slice(),
    clearSessionPhotos() {
      sessionPhotos.length = 0;
      notifyPhotos();
    }
  };
})(typeof window !== "undefined" ? window : globalThis);
