// ================================================================
// Refmansy Faculty Feedback (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;
let feedbackList = [];
let selectedFeedback = null;

const feedbackForm = document.getElementById("feedbackForm");
const formMessage = document.getElementById("formMessage");
const feedbackHistoryTable = document.getElementById("feedbackHistoryTable");
const detailsModal = document.getElementById("detailsModal");
const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const resultCount = document.getElementById("resultCount");

// Auth Guard
window.refmansyAuthGuard.init("faculty", function (profile, user) {
    currentUser = user;
    currentProfile = profile;
    initializePage();
});

async function initializePage() {
    setupForm();
    setupFilters();
    setupModal();
    await loadFeedbackHistory();
}

async function loadFeedbackHistory() {
    try {
        if (feedbackHistoryTable) {
            feedbackHistoryTable.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 1.5rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading feedback history...</td></tr>`;
        }

        feedbackList = await window.refmansyApi.feedback.getMyFeedback(currentProfile.id);

        updateSummary();
        filterFeedback();
    } catch (err) {
        console.error("Error loading feedback history:", err);
    }
}

function updateSummary() {
    const total = feedbackList.length;
    const answered = feedbackList.filter(f => f.status === "resolved" || f.admin_reply).length;
    const pending = total - answered;

    const totalEl = document.getElementById("totalFeedback");
    if (totalEl) totalEl.textContent = total;
    const resolvedEl = document.getElementById("resolvedFeedback");
    if (resolvedEl) resolvedEl.textContent = answered;
    const openEl = document.getElementById("openFeedback");
    if (openEl) openEl.textContent = pending;
}

function setupFilters() {
    if (searchInput) searchInput.addEventListener("input", filterFeedback);
    if (statusFilter) statusFilter.addEventListener("change", filterFeedback);
}

function filterFeedback() {
    const term = (searchInput?.value || "").trim().toLowerCase();
    const stat = (statusFilter?.value || "all").toLowerCase();

    const filtered = feedbackList.filter(fb => {
        const matchesTerm =
            !term ||
            fb.subject.toLowerCase().includes(term) ||
            fb.message.toLowerCase().includes(term);

        const isResolved = fb.status === "resolved" || Boolean(fb.admin_reply);
        let matchesStat = true;
        if (stat === "open") matchesStat = !isResolved;
        if (stat === "resolved") matchesStat = isResolved;

        return matchesTerm && matchesStat;
    });

    if (resultCount) {
        resultCount.textContent = `Showing ${filtered.length} of ${feedbackList.length} inquiries`;
    }

    renderFeedbackHistory(filtered);
}

function setupForm() {
    if (!feedbackForm) return;

    feedbackForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const subject = (document.getElementById("feedbackSubject")?.value || "").trim();
        const message = (document.getElementById("feedbackMessage")?.value || "").trim();
        const submitBtn = document.getElementById("submitFeedbackButton") || feedbackForm.querySelector("button[type='submit']");

        if (!subject || !message) {
            showFormMessage("Please provide both a subject and a message.", "error");
            return;
        }

        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.textContent = "Submitting...";
            }
            showFormMessage("Sending your feedback...", "info");

            await window.refmansyApi.feedback.submitFeedback({
                subject,
                message,
                rating: null
            });

            showFormMessage("Feedback submitted successfully!", "success");
            feedbackForm.reset();

            await loadFeedbackHistory();
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Submit Feedback";
            }
        } catch (err) {
            console.error("Feedback submit error:", err);
            showFormMessage(err.message || "Failed to submit feedback.", "error");
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.textContent = "Submit Feedback";
            }
        }
    });
}

function renderFeedbackHistory(list) {
    if (!feedbackHistoryTable) return;
    feedbackHistoryTable.innerHTML = "";

    if (!list || list.length === 0) {
        feedbackHistoryTable.innerHTML = `<tr><td colspan="5" class="empty-message">You have not submitted any feedback yet.</td></tr>`;
        return;
    }

    list.forEach((fb, index) => {
        const row = document.createElement("tr");
        const displayId = "FB-" + String(index + 1).padStart(4, "0");
        const dateStr = fb.created_at ? new Date(fb.created_at).toLocaleDateString() : "N/A";
        const isResolved = fb.status === "resolved" || Boolean(fb.admin_reply);

        const statusBadge = isResolved
            ? `<span class="badge-resolved"><i class="fa-solid fa-check"></i> Resolved</span>`
            : `<span class="badge-pending"><i class="fa-solid fa-clock"></i> Open</span>`;

        row.innerHTML = `
            <td><strong>${displayId}</strong></td>
            <td><strong>${escapeHtml(fb.subject)}</strong></td>
            <td>${dateStr}</td>
            <td>${statusBadge}</td>
            <td>
                <button type="button" class="btn-view-feedback">
                    <i class="fa-regular fa-eye"></i> View
                </button>
            </td>
        `;

        row.querySelector(".btn-view-feedback").addEventListener("click", () => openModal(fb));
        feedbackHistoryTable.appendChild(row);
    });
}

function setupModal() {
    const closeBtn = document.getElementById("closeModalButton");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    if (detailsModal) {
        detailsModal.addEventListener("click", function (e) {
            if (e.target === detailsModal) closeModal();
        });
    }
}

function openModal(fb) {
    selectedFeedback = fb;

    const mId = document.getElementById("modalFeedbackId");
    if (mId) mId.textContent = fb.id;
    const mDate = document.getElementById("modalDate");
    if (mDate) mDate.textContent = fb.created_at ? new Date(fb.created_at).toLocaleString() : "N/A";
    const mType = document.getElementById("modalType");
    if (mType) mType.textContent = "General Feedback";
    const mStatus = document.getElementById("modalStatus");
    if (mStatus) mStatus.textContent = fb.status === "resolved" || fb.admin_reply ? "Resolved" : "Open";
    const mSubj = document.getElementById("modalSubject");
    if (mSubj) mSubj.textContent = fb.subject;
    const mMsg = document.getElementById("modalMessage");
    if (mMsg) mMsg.textContent = fb.message;
    const mAdmin = document.getElementById("modalAdminResponse");
    if (mAdmin) mAdmin.textContent = fb.admin_reply || "The administrator has not responded yet.";
    const mRespBy = document.getElementById("modalRespondedBy");
    if (mRespBy) mRespBy.textContent = fb.admin_reply ? "Administrator" : "N/A";
    const mRespDate = document.getElementById("modalResponseDate");
    if (mRespDate) mRespDate.textContent = fb.updated_at ? new Date(fb.updated_at).toLocaleDateString() : "N/A";

    if (detailsModal) detailsModal.classList.add("active");
}

function closeModal() {
    if (detailsModal) detailsModal.classList.remove("active");
    selectedFeedback = null;
}

function showFormMessage(text, type) {
    if (!formMessage) return;
    formMessage.textContent = text;
    formMessage.className = "form-message " + type;
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