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
})();
