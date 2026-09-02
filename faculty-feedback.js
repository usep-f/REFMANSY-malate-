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
const feedbackModal = document.getElementById("feedbackModal");

// Auth Guard
window.refmansyAuthGuard.init("faculty", function (profile, user) {
    currentUser = user;
    currentProfile = profile;
    initializePage();
});

async function initializePage() {
    setupForm();
    setupModal();
    await loadFeedbackHistory();
}

async function loadFeedbackHistory() {
    try {
        feedbackHistoryTable.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 1.5rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading feedback history...</td></tr>`;

        feedbackList = await window.refmansyApi.feedback.getMyFeedback(currentProfile.id);

        updateSummary();
        renderFeedbackHistory(feedbackList);
    } catch (err) {
        console.error("Error loading feedback history:", err);
    }
}

function updateSummary() {
    const total = feedbackList.length;
    const answered = feedbackList.filter(f => f.status === "resolved" || f.admin_reply).length;
    const pending = total - answered;

    document.getElementById("totalFeedback").textContent = total;
    document.getElementById("answeredFeedback").textContent = answered;
    document.getElementById("pendingFeedback").textContent = pending;
}

function setupForm() {
    feedbackForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const subject = document.getElementById("subject").value.trim();
        const message = document.getElementById("message").value.trim();
        const rating = document.getElementById("rating") ? document.getElementById("rating").value : null;
        const submitBtn = feedbackForm.querySelector("button[type='submit']");

        if (!subject || !message) {
            showFormMessage("Please provide both a subject and a message.", "error");
            return;
        }

        try {
            submitBtn.disabled = true;
            submitBtn.textContent = "Submitting...";
            showFormMessage("Sending your feedback...", "info");

            await window.refmansyApi.feedback.submitFeedback({
                subject,
                message,
                rating
            });

            showFormMessage("Feedback submitted successfully!", "success");
            feedbackForm.reset();

            await loadFeedbackHistory();
            submitBtn.disabled = false;
            submitBtn.textContent = "Submit Feedback";
        } catch (err) {
            console.error("Feedback submit error:", err);
            showFormMessage(err.message || "Failed to submit feedback.", "error");
            submitBtn.disabled = false;
            submitBtn.textContent = "Submit Feedback";
        }
    });
}

function renderFeedbackHistory(list) {
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
            ? `<span class="badge-resolved"><i class="fa-solid fa-check"></i> Answered</span>`
            : `<span class="badge-pending"><i class="fa-solid fa-clock"></i> Pending Reply</span>`;

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
    document.getElementById("closeModalButton").addEventListener("click", closeModal);
    feedbackModal.addEventListener("click", function (e) {
        if (e.target === feedbackModal) closeModal();
    });
}

function openModal(fb) {
    selectedFeedback = fb;

    document.getElementById("modalFeedbackId").textContent = fb.id;
    document.getElementById("modalDate").textContent = fb.created_at ? new Date(fb.created_at).toLocaleString() : "N/A";
    document.getElementById("modalType").textContent = "General Inquiry";
    document.getElementById("modalStatus").textContent = fb.status === "resolved" ? "Answered" : "Pending Review";
    document.getElementById("modalSubject").textContent = fb.subject;
    document.getElementById("modalMessage").textContent = fb.message;
    document.getElementById("modalAdminResponse").textContent =
        fb.admin_reply || "The administrator has not responded yet.";
    document.getElementById("modalRespondedBy").textContent = fb.admin_reply ? "Administrator" : "N/A";
    document.getElementById("modalResponseDate").textContent = fb.updated_at ? new Date(fb.updated_at).toLocaleDateString() : "N/A";

    feedbackModal.classList.add("active");
}

function closeModal() {
    feedbackModal.classList.remove("active");
    selectedFeedback = null;
}

function showFormMessage(text, type) {
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