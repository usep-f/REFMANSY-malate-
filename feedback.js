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
const modalMessageBox = document.getElementById("modalMessageBox");
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
            feedbackTable.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading feedback inquiries...</td></tr>`;
        }

        feedbackList = await window.refmansyApi.feedback.getAllFeedback();

        updateSummary();
        filterFeedback();
    } catch (err) {
        console.error("Error loading feedback list:", err);
        if (feedbackTable) {
            feedbackTable.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #dc2626; padding: 2rem;">Error loading feedback: ${err.message}</td></tr>`;
        }
    }
}

function updateSummary() {
    const total = feedbackList.length;
    const newCount = feedbackList.filter(f => f.status === "new").length;
    const inProgressCount = feedbackList.filter(f => f.status === "in_progress" || f.status === "in-progress").length;
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
    const selectedType = (typeFilter?.value || "all").toLowerCase();
    const selectedStat = (statusFilter?.value || "all").toLowerCase();

    const filtered = feedbackList.filter(fb => {
        const matchesTerm =
            !term ||
            (fb.user_name && fb.user_name.toLowerCase().includes(term)) ||
            (fb.user_email && fb.user_email.toLowerCase().includes(term)) ||
            (fb.subject && fb.subject.toLowerCase().includes(term)) ||
            (fb.message && fb.message.toLowerCase().includes(term)) ||
            (fb.type && fb.type.toLowerCase().includes(term));

        const matchesType =
            selectedType === "all" ||
            (fb.type && fb.type.toLowerCase() === selectedType) ||
            (!fb.type && selectedType === "general");

        let matchesStat = true;
        if (selectedStat === "new") {
            matchesStat = fb.status === "new";
        } else if (selectedStat === "in_progress" || selectedStat === "in-progress") {
            matchesStat = fb.status === "in_progress" || fb.status === "in-progress";
        } else if (selectedStat === "resolved") {
            matchesStat = fb.status === "resolved";
        }

        return matchesTerm && matchesType && matchesStat;
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
        feedbackTable.innerHTML = `<tr><td colspan="7" class="empty-table">No feedback messages found.</td></tr>`;
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

        row.innerHTML = `
            <td><strong>${displayId}</strong></td>
            <td>
                <strong>${escapeHtml(fb.user_name || "Faculty")}</strong>
                <br><small style="color: #64748b;">${escapeHtml(fb.user_email || "")}</small>
            </td>
            <td>${typeBadge}</td>
            <td>${escapeHtml(fb.subject)}</td>
            <td>${dateStr}</td>
            <td>${statusBadge}</td>
            <td>
                <div class="table-actions">
                    <button type="button" class="btn-action view-btn" title="View & Reply">
                        <i class="fa-regular fa-comment-dots"></i> View / Reply
                    </button>
                    <button type="button" class="btn-action delete-fb-btn" title="Delete Feedback" style="background-color: #ef4444; color: #fff; margin-left: 5px;">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        `;

        row.querySelector(".view-btn").addEventListener("click", () => openModal(fb));

        const delRowBtn = row.querySelector(".delete-fb-btn");
        if (delRowBtn) {
            delRowBtn.addEventListener("click", async () => {
                if (confirm(`Are you sure you want to delete this feedback message from "${fb.user_name || 'Faculty'}"?`)) {
                    try {
                        await window.refmansyApi.feedback.deleteFeedback(fb.id);
                        await loadFeedback();
                    } catch (err) {
                        alert("Failed to delete feedback: " + (err.message || err));
                    }
                }
            });
        }

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

    const delModalBtn = document.getElementById("deleteFeedbackButton");
    if (delModalBtn) {
        delModalBtn.addEventListener("click", async function () {
            if (!selectedFeedback) return;
            if (confirm(`Are you sure you want to delete this feedback message from "${selectedFeedback.user_name || 'Faculty'}"?`)) {
                try {
                    await window.refmansyApi.feedback.deleteFeedback(selectedFeedback.id);
                    closeModal();
                    await loadFeedback();
                } catch (err) {
                    alert("Failed to delete feedback: " + (err.message || err));
                }
            }
        });
    }
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
    if (mType) mType.textContent = formatTypeLabel(fb.type || "general");
    const mSubj = document.getElementById("modalSubject");
    if (mSubj) mSubj.textContent = fb.subject;
    const mMsg = document.getElementById("modalMessage");
    if (mMsg) mMsg.textContent = fb.message;

    if (adminResponse) adminResponse.value = fb.admin_reply || "";

    if (feedbackStatus) {
        const safeStatus = (fb.status === "in-progress") ? "in_progress" : (fb.status || "new");
        feedbackStatus.value = safeStatus;
    }

    if (modalMessageBox) {
        modalMessageBox.textContent = "";
        modalMessageBox.className = "form-message";
    }

    if (feedbackModal) feedbackModal.classList.add("active");
}

function closeModal() {
    if (feedbackModal) feedbackModal.classList.remove("active");
    selectedFeedback = null;
}

async function saveResponse() {
    if (!selectedFeedback) return;

    const reply = (adminResponse?.value || "").trim();
    let status = feedbackStatus?.value || "resolved";
    if (status === "in-progress") {
        status = "in_progress";
    }

    const saveBtn = document.getElementById("saveResponseButton");

    try {
        if (saveBtn) {
            saveBtn.disabled = true;
            saveBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Saving...`;
        }

        await window.refmansyApi.feedback.replyFeedback(selectedFeedback.id, reply, status);

        if (modalMessageBox) {
            modalMessageBox.textContent = "Response saved successfully!";
            modalMessageBox.className = "form-message success";
        }

        await loadFeedback();

        setTimeout(() => {
            closeModal();
        }, 600);
    } catch (err) {
        console.error("Save reply error:", err);
        if (modalMessageBox) {
            modalMessageBox.textContent = "Failed to save response: " + (err.message || "Unknown error");
            modalMessageBox.className = "form-message error";
        } else {
            alert("Failed to save response: " + err.message);
        }
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Save Response`;
        }
    }
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