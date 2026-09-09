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
            feedbackHistoryTable.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 1.5rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading feedback history...</td></tr>`;
        }

        if (!currentProfile?.id) {
            console.warn("No user profile id available.");
            return;
        }

        feedbackList = await window.refmansyApi.feedback.getMyFeedback(currentProfile.id);

        updateSummary();
        filterFeedback();
    } catch (err) {
        console.error("Error loading feedback history:", err);
        if (feedbackHistoryTable) {
            feedbackHistoryTable.innerHTML = `<tr><td colspan="7" style="text-align:center; color: #dc2626; padding: 1.5rem;">Failed to load feedback history. Please try refreshing the page.</td></tr>`;
        }
    }
}

function updateSummary() {
    const total = feedbackList.length;
    const resolved = feedbackList.filter(f => f.status === "resolved").length;
    const pending = feedbackList.filter(f => f.status !== "resolved").length;

    const totalEl = document.getElementById("totalFeedback");
    if (totalEl) totalEl.textContent = total;
    const resolvedEl = document.getElementById("resolvedFeedback");
    if (resolvedEl) resolvedEl.textContent = resolved;
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
            (fb.subject && fb.subject.toLowerCase().includes(term)) ||
            (fb.message && fb.message.toLowerCase().includes(term)) ||
            (fb.type && fb.type.toLowerCase().includes(term));

        let matchesStat = true;
        if (stat === "new") {
            matchesStat = fb.status === "new";
        } else if (stat === "in_progress" || stat === "in-progress") {
            matchesStat = fb.status === "in_progress" || fb.status === "in-progress";
        } else if (stat === "resolved") {
            matchesStat = fb.status === "resolved";
        }

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

        const typeSelect = document.getElementById("feedbackType");
        const type = (typeSelect?.value || "general").trim();
        const subject = (document.getElementById("feedbackSubject")?.value || "").trim();
        const message = (document.getElementById("feedbackMessage")?.value || "").trim();
        const submitBtn = document.getElementById("submitFeedbackButton") || feedbackForm.querySelector("button[type='submit']");

        if (!type) {
            showFormMessage("Please select a feedback type.", "error");
            return;
        }

        if (!subject || !message) {
            showFormMessage("Please provide both a subject and a message.", "error");
            return;
        }

        try {
            if (submitBtn) {
                submitBtn.disabled = true;
                submitBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Submitting...`;
            }
            showFormMessage("Sending your feedback...", "info");

            await window.refmansyApi.feedback.submitFeedback({
                type,
                subject,
                message,
                rating: null
            });

            showFormMessage("Feedback submitted successfully!", "success");
            feedbackForm.reset();

            await loadFeedbackHistory();
        } catch (err) {
            console.error("Feedback submit error:", err);
            showFormMessage(err.message || "Failed to submit feedback.", "error");
        } finally {
            if (submitBtn) {
                submitBtn.disabled = false;
                submitBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Submit Feedback`;
            }
        }
    });
}

function renderFeedbackHistory(list) {
    if (!feedbackHistoryTable) return;
    feedbackHistoryTable.innerHTML = "";

    if (!list || list.length === 0) {
        feedbackHistoryTable.innerHTML = `<tr><td colspan="7" class="empty-message">You have not submitted any feedback yet.</td></tr>`;
        return;
    }

    list.forEach((fb, index) => {
        const row = document.createElement("tr");
        const displayId = "FB-" + String(index + 1).padStart(4, "0");
        const dateStr = fb.created_at ? new Date(fb.created_at).toLocaleDateString() : "N/A";

        const rawType = (fb.type || "general").toLowerCase();
        const formattedType = formatTypeLabel(rawType);
        const typeBadge = `<span class="feedback-type type-${rawType}">${escapeHtml(formattedType)}</span>`;

        let statusClass = "status-new";
        let statusText = "New";
        if (fb.status === "resolved") {
            statusClass = "status-resolved";
            statusText = "Resolved";
        } else if (fb.status === "in_progress" || fb.status === "in-progress") {
            statusClass = "status-in-progress";
            statusText = "In Progress";
        }
        const statusBadge = `<span class="status-label ${statusClass}">${statusText}</span>`;

        const replyHtml = fb.admin_reply
            ? `<span class="response-preview" title="${escapeHtml(fb.admin_reply)}">${escapeHtml(fb.admin_reply)}</span>`
            : `<em style="color: #94a3b8;">Pending reply</em>`;

        row.innerHTML = `
            <td><strong>${displayId}</strong></td>
            <td>${typeBadge}</td>
            <td><strong>${escapeHtml(fb.subject)}</strong></td>
            <td>${dateStr}</td>
            <td>${statusBadge}</td>
            <td>${replyHtml}</td>
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
    if (mType) mType.textContent = formatTypeLabel(fb.type || "general");
    const mStatus = document.getElementById("modalStatus");
    if (mStatus) {
        if (fb.status === "resolved") mStatus.textContent = "Resolved";
        else if (fb.status === "in_progress" || fb.status === "in-progress") mStatus.textContent = "In Progress";
        else mStatus.textContent = "New";
    }
    const mSubj = document.getElementById("modalSubject");
    if (mSubj) mSubj.textContent = fb.subject;
    const mMsg = document.getElementById("modalMessage");
    if (mMsg) mMsg.textContent = fb.message;
    const mAdmin = document.getElementById("modalAdminResponse");
    if (mAdmin) mAdmin.textContent = fb.admin_reply || "The administrator has not responded yet.";
    const mRespBy = document.getElementById("modalRespondedBy");
    if (mRespBy) mRespBy.textContent = fb.admin_name || (fb.admin_reply ? "Administrator" : "N/A");
    const mRespDate = document.getElementById("modalResponseDate");
    if (mRespDate) mRespDate.textContent = fb.updated_at && fb.admin_reply ? new Date(fb.updated_at).toLocaleDateString() : "N/A";

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

function formatTypeLabel(type) {
    switch ((type || "").toLowerCase()) {
        case "suggestion":
            return "Suggestion";
        case "concern":
            return "Concern";
        case "technical":
            return "Technical Issue";
        case "general":
        default:
            return "General Feedback";
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