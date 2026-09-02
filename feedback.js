// ================================================================
// Refmansy Admin Feedback (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;
let feedbackList = [];
let selectedFeedback = null;

const searchFeedbackInput = document.getElementById("searchFeedbackInput");
const statusFilter = document.getElementById("statusFilter");
const feedbackTableBody = document.getElementById("feedbackTableBody");
const feedbackModal = document.getElementById("feedbackModal");
const feedbackResponseInput = document.getElementById("feedbackResponseInput");
const feedbackStatusSelect = document.getElementById("feedbackStatusSelect");

// Auth Guard
window.refmansyAuthGuard.init("admin", function (profile, user) {
    currentUser = user;
    currentProfile = profile;
    initializePage();
});

async function initializePage() {
    setupFilters();
    setupModal();
    await loadFeedback();
}

async function loadFeedback() {
    try {
        feedbackTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading feedback inquiries...</td></tr>`;

        feedbackList = await window.refmansyApi.feedback.getAllFeedback();

        updateSummary();
        filterFeedback();
    } catch (err) {
        console.error("Error loading feedback list:", err);
        feedbackTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: red; padding: 2rem;">Error: ${err.message}</td></tr>`;
    }
}

function updateSummary() {
    const total = feedbackList.length;
    const newCount = feedbackList.filter(f => f.status === "new").length;
    const inProgressCount = feedbackList.filter(f => f.status === "in_progress").length;
    const resolvedCount = feedbackList.filter(f => f.status === "resolved").length;

    const totalEl = document.getElementById("totalFeedback");
    if (totalEl) totalEl.textContent = total;

    const newEl = document.getElementById("newFeedback");
    if (newEl) newEl.textContent = newCount;

    const inProgressEl = document.getElementById("inProgressFeedback");
    if (inProgressEl) inProgressEl.textContent = inProgressCount;

    const resolvedEl = document.getElementById("resolvedFeedback");
    if (resolvedEl) resolvedEl.textContent = resolvedCount;
}

function setupFilters() {
    searchFeedbackInput.addEventListener("input", filterFeedback);
    statusFilter.addEventListener("change", filterFeedback);
}

function filterFeedback() {
    const term = searchFeedbackInput.value.trim().toLowerCase();
    const stat = statusFilter.value.toLowerCase();

    const filtered = feedbackList.filter(fb => {
        const matchesTerm =
            !term ||
            (fb.user_name && fb.user_name.toLowerCase().includes(term)) ||
            (fb.user_email && fb.user_email.toLowerCase().includes(term)) ||
            fb.subject.toLowerCase().includes(term) ||
            fb.message.toLowerCase().includes(term);

        const matchesStat = stat === "all" || fb.status === stat;

        return matchesTerm && matchesStat;
    });

    renderTable(filtered);
}

function renderTable(list) {
    feedbackTableBody.innerHTML = "";

    if (!list || list.length === 0) {
        feedbackTableBody.innerHTML = `<tr><td colspan="6" class="empty-table">No feedback messages found.</td></tr>`;
        return;
    }

    list.forEach((fb, index) => {
        const row = document.createElement("tr");
        const displayId = "FB-" + String(index + 1).padStart(4, "0");
        const dateStr = fb.created_at ? new Date(fb.created_at).toLocaleDateString() : "N/A";

        const statusBadge =
            fb.status === "resolved"
                ? `<span class="badge-resolved"><i class="fa-solid fa-circle-check"></i> Resolved</span>`
                : fb.status === "in_progress"
                ? `<span class="badge-progress"><i class="fa-solid fa-spinner"></i> In Progress</span>`
                : `<span class="badge-new"><i class="fa-solid fa-bell"></i> New</span>`;

        row.innerHTML = `
            <td><strong>${displayId}</strong></td>
            <td>
                <strong>${escapeHtml(fb.user_name || "Faculty")}</strong>
                <br><small style="color: #64748b;">${escapeHtml(fb.user_email || "")}</small>
            </td>
            <td>${escapeHtml(fb.subject)}</td>
            <td>${dateStr}</td>
            <td>${statusBadge}</td>
            <td>
                <button type="button" class="btn-action view-btn" title="View & Reply">
                    <i class="fa-regular fa-comment-dots"></i> View / Reply
                </button>
            </td>
        `;

        row.querySelector(".view-btn").addEventListener("click", () => openModal(fb));
        feedbackTableBody.appendChild(row);
    });
}

function setupModal() {
    document.getElementById("closeModalButton").addEventListener("click", closeModal);
    document.getElementById("cancelButton").addEventListener("click", closeModal);

    feedbackModal.addEventListener("click", function (e) {
        if (e.target === feedbackModal) closeModal();
    });

    document.getElementById("saveResponseButton").addEventListener("click", saveResponse);
}

function openModal(fb) {
    selectedFeedback = fb;

    document.getElementById("modalFeedbackId").textContent = fb.id;
    document.getElementById("modalUserName").textContent = `${fb.user_name || "Faculty"} (${fb.user_email || ""})`;
    document.getElementById("modalDate").textContent = fb.created_at ? new Date(fb.created_at).toLocaleString() : "N/A";
    document.getElementById("modalRating").textContent = fb.rating ? `${fb.rating} / 5 Stars` : "Not provided";
    document.getElementById("modalSubject").textContent = fb.subject;
    document.getElementById("modalMessage").textContent = fb.message;

    feedbackResponseInput.value = fb.admin_reply || "";
    feedbackStatusSelect.value = fb.status || "new";

    feedbackModal.classList.add("active");
}

function closeModal() {
    feedbackModal.classList.remove("active");
    selectedFeedback = null;
}

async function saveResponse() {
    if (!selectedFeedback) return;

    const reply = feedbackResponseInput.value.trim();
    const status = feedbackStatusSelect.value;
    const saveBtn = document.getElementById("saveResponseButton");

    try {
        saveBtn.disabled = true;
        saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;

        await window.refmansyApi.feedback.replyFeedback(selectedFeedback.id, reply, status);

        closeModal();
        await loadFeedback();
    } catch (err) {
        console.error("Save reply error:", err);
        alert("Failed to save response: " + err.message);
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Save Response`;
    }
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}