// ================================================================
// Refmansy Admin Feedback (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;
let feedbackList = [];
let selectedFeedback = null;

const searchInput = document.getElementById("searchInput");
const typeFilter = document.getElementById("typeFilter");
const statusFilter = document.getElementById("statusFilter");
const feedbackTable = document.getElementById("feedbackTable");
const feedbackModal = document.getElementById("feedbackModal");
const adminResponse = document.getElementById("adminResponse");
const feedbackStatus = document.getElementById("feedbackStatus");
const resultCount = document.getElementById("resultCount");

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
        if (feedbackTable) {
            feedbackTable.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading feedback inquiries...</td></tr>`;
        }

        feedbackList = await window.refmansyApi.feedback.getAllFeedback();

        updateSummary();
        filterFeedback();
    } catch (err) {
        console.error("Error loading feedback list:", err);
        if (feedbackTable) {
            feedbackTable.innerHTML = `<tr><td colspan="6" style="text-align: center; color: red; padding: 2rem;">Error: ${err.message}</td></tr>`;
        }
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
    if (searchInput) searchInput.addEventListener("input", filterFeedback);
    if (typeFilter) typeFilter.addEventListener("change", filterFeedback);
    if (statusFilter) statusFilter.addEventListener("change", filterFeedback);
}

function filterFeedback() {
    const term = (searchInput?.value || "").trim().toLowerCase();
    const stat = (statusFilter?.value || "all").toLowerCase();

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

    if (resultCount) {
        resultCount.textContent = `Showing ${filtered.length} of ${feedbackList.length} feedback messages`;
    }

    renderTable(filtered);
}

function renderTable(list) {
    if (!feedbackTable) return;
    feedbackTable.innerHTML = "";

    if (!list || list.length === 0) {
        feedbackTable.innerHTML = `<tr><td colspan="6" class="empty-table">No feedback messages found.</td></tr>`;
        return;
    }

    list.forEach(fb => {
        const row = document.createElement("tr");
        const dateStr = fb.created_at ? new Date(fb.created_at).toLocaleDateString() : "N/A";

        const statusBadge =
            fb.status === "resolved"
                ? `<span class="badge-resolved"><i class="fa-solid fa-circle-check"></i> Resolved</span>`
                : fb.status === "in_progress"
                ? `<span class="badge-progress"><i class="fa-solid fa-spinner"></i> In Progress</span>`
                : `<span class="badge-new"><i class="fa-solid fa-bell"></i> New</span>`;

        row.innerHTML = `
            <td>
                <strong>${escapeHtml(fb.user_name || "Faculty")}</strong>
                <br><small style="color: #64748b;">${escapeHtml(fb.user_email || "")}</small>
            </td>
            <td>General Inquiry</td>
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
        feedbackTable.appendChild(row);
    });
}

function setupModal() {
    const closeBtn = document.getElementById("closeModalButton");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    const cancelBtn = document.getElementById("cancelButton");
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

    if (feedbackModal) {
        feedbackModal.addEventListener("click", function (e) {
            if (e.target === feedbackModal) closeModal();
        });
    }

    const saveBtn = document.getElementById("saveResponseButton");
    if (saveBtn) saveBtn.addEventListener("click", saveResponse);
}

function openModal(fb) {
    selectedFeedback = fb;

    const mId = document.getElementById("modalFeedbackId");
    if (mId) mId.textContent = fb.id;
    const mDate = document.getElementById("modalDate");
    if (mDate) mDate.textContent = fb.created_at ? new Date(fb.created_at).toLocaleString() : "N/A";
    const mUser = document.getElementById("modalUser");
    if (mUser) mUser.textContent = `${fb.user_name || "Faculty"} (${fb.user_email || ""})`;
    const mType = document.getElementById("modalType");
    if (mType) mType.textContent = "General Inquiry";
    const mSubj = document.getElementById("modalSubject");
    if (mSubj) mSubj.textContent = fb.subject;
    const mMsg = document.getElementById("modalMessage");
    if (mMsg) mMsg.textContent = fb.message;

    if (adminResponse) adminResponse.value = fb.admin_reply || "";
    if (feedbackStatus) feedbackStatus.value = fb.status || "new";

    if (feedbackModal) feedbackModal.classList.add("active");
}

function closeModal() {
    if (feedbackModal) feedbackModal.classList.remove("active");
    selectedFeedback = null;
}

async function saveResponse() {
    if (!selectedFeedback) return;

    const reply = (adminResponse?.value || "").trim();
    const status = feedbackStatus?.value || "resolved";
    const saveBtn = document.getElementById("saveResponseButton");

    try {
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
        }

        await window.refmansyApi.feedback.replyFeedback(selectedFeedback.id, reply, status);

        closeModal();
        await loadFeedback();
    } catch (err) {
        console.error("Save reply error:", err);
        alert("Failed to save response: " + err.message);
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Save Response`;
        }
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