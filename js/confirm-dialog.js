/**
 * Promise-based replacement for window.confirm(), backed by a Bootstrap
 * modal instead of a native dialog. Native confirm()/alert() block all
 * further CDP/automation events (including keyboard input aimed at the
 * dialog itself), which freezes browser-automation tooling — this avoids
 * that entirely while keeping the same call-site shape.
 */
(function () {
  function ensureModal() {
    let el = document.getElementById("genericConfirmModal");
    if (el) return el;
    el = document.createElement("div");
    el.className = "modal fade";
    el.id = "genericConfirmModal";
    el.tabIndex = -1;
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="genericConfirmTitle">Confirm</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body" id="genericConfirmBody"></div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-success" id="genericConfirmOkBtn">OK</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    return el;
  }

  window.confirmDialog = function confirmDialog(message, opts) {
    const options = opts || {};
    const el = ensureModal();
    el.querySelector("#genericConfirmTitle").textContent = options.title || "Confirm";
    el.querySelector("#genericConfirmBody").textContent = message || "";
    const okBtn = el.querySelector("#genericConfirmOkBtn");
    okBtn.textContent = options.okLabel || "OK";
    okBtn.className = `btn ${options.okClass || "btn-success"}`;
    const modal = new bootstrap.Modal(el);
    return new Promise((resolve) => {
      let decided = false;
      const onOk = () => {
        decided = true;
        modal.hide();
        resolve(true);
      };
      const onHidden = () => {
        okBtn.removeEventListener("click", onOk);
        el.removeEventListener("hidden.bs.modal", onHidden);
        if (!decided) resolve(false);
      };
      okBtn.addEventListener("click", onOk);
      el.addEventListener("hidden.bs.modal", onHidden);
      modal.show();
    });
  };

  function ensurePromptModal() {
    let el = document.getElementById("genericPromptModal");
    if (el) return el;
    el = document.createElement("div");
    el.className = "modal fade";
    el.id = "genericPromptModal";
    el.tabIndex = -1;
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `
      <div class="modal-dialog modal-dialog-centered">
        <div class="modal-content">
          <div class="modal-header">
            <h5 class="modal-title" id="genericPromptTitle">Enter a value</h5>
            <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
          </div>
          <div class="modal-body">
            <input type="text" class="form-control" id="genericPromptInput" />
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Cancel</button>
            <button type="button" class="btn btn-success" id="genericPromptOkBtn">OK</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(el);
    return el;
  }

  /**
   * Promise-based replacement for window.prompt() — same native-dialog
   * freezing issue as confirm()/alert(), see note above. Resolves with the
   * trimmed input string, or null if cancelled/dismissed (matching
   * window.prompt()'s null-on-cancel contract).
   */
  window.promptDialog = function promptDialog(message, defaultValue, opts) {
    const options = opts || {};
    const el = ensurePromptModal();
    el.querySelector("#genericPromptTitle").textContent = options.title || message || "Enter a value";
    const input = el.querySelector("#genericPromptInput");
    input.value = defaultValue || "";
    input.placeholder = options.placeholder || "";
    const okBtn = el.querySelector("#genericPromptOkBtn");
    okBtn.textContent = options.okLabel || "OK";
    const modal = new bootstrap.Modal(el);
    return new Promise((resolve) => {
      let decided = false;
      const onOk = () => {
        decided = true;
        modal.hide();
        resolve(input.value);
      };
      const onKeydown = (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          onOk();
        }
      };
      const onHidden = () => {
        okBtn.removeEventListener("click", onOk);
        input.removeEventListener("keydown", onKeydown);
        el.removeEventListener("hidden.bs.modal", onHidden);
        if (!decided) resolve(null);
      };
      okBtn.addEventListener("click", onOk);
      input.addEventListener("keydown", onKeydown);
      el.addEventListener("hidden.bs.modal", onHidden);
      modal.show();
      el.addEventListener(
        "shown.bs.modal",
        () => {
          input.focus();
          input.select();
        },
        { once: true }
      );
    });
  };
})();
