// ================================================================
// Refmansy Faculty Submission Status (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;
let facultySubmissions = [];
let selectedSubmission = null;

const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const submissionList = document.getElementById("submissionList");
const submissionModal = document.getElementById("submissionModal");

// Auth Guard
window.refmansyAuthGuard.init("faculty", function (profile, user) {
    currentUser = user;
    currentProfile = profile;
    initializePage();
});

async function initializePage() {
    setupFilters();
    setupModal();
    await loadSubmissions();
}

async function loadSubmissions() {
    try {
        if (submissionList) {
            submissionList.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading submission statuses...</div>`;
        }

        facultySubmissions = await window.refmansyApi.research.getMyFiles(currentProfile.id);

        updateSummary();
        filterSubmissions();
    } catch (err) {
        console.error("Error loading submissions:", err);
        if (submissionList) {
            submissionList.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: red; padding: 2rem;">Error: ${err.message}</div>`;
        }
    }
}

function updateSummary() {
    const total = facultySubmissions.length;
    const pending = facultySubmissions.filter(f => f.status === "pending").length;
    const approved = facultySubmissions.filter(f => f.status === "approved").length;
    const rejected = facultySubmissions.filter(f => f.status === "rejected").length;

    const totalEl = document.getElementById("totalSubmissions");
    if (totalEl) totalEl.textContent = total;
    const pendingEl = document.getElementById("pendingSubmissions");
    if (pendingEl) pendingEl.textContent = pending;
    const approvedEl = document.getElementById("approvedSubmissions");
    if (approvedEl) approvedEl.textContent = approved;
    const rejectedEl = document.getElementById("rejectedSubmissions");
    if (rejectedEl) rejectedEl.textContent = rejected;
}

function setupFilters() {
    if (searchInput) searchInput.addEventListener("input", filterSubmissions);
    if (statusFilter) statusFilter.addEventListener("change", filterSubmissions);
}

function filterSubmissions() {
    const term = (searchInput?.value || "").trim().toLowerCase();
    const stat = (statusFilter?.value || "all").toLowerCase();

    const filtered = facultySubmissions.filter(file => {
        const matchesTerm =
            !term ||
            file.title.toLowerCase().includes(term) ||
            file.category.toLowerCase().includes(term) ||
            (file.keywords && file.keywords.toLowerCase().includes(term));

        const matchesStat = stat === "all" || file.status === stat;

        return matchesTerm && matchesStat;
    });

    renderSubmissions(filtered);
}

function renderSubmissions(files) {
    if (!submissionList) return;
    submissionList.innerHTML = "";

    if (!files || files.length === 0) {
        submissionList.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 2rem; color: #64748b;">No research submissions found matching selected filters.</div>`;
        return;
    }

    files.forEach((file, index) => {
        const card = document.createElement("article");
        card.className = "submission-card";

        const statusClass = `status-${file.status}`;
        const statusLabel =
            file.status === "approved"
                ? "Approved"
                : file.status === "rejected"
                ? "Rejected"
                : "Pending Review";

        const displayId = "RF-" + String(index + 1).padStart(4, "0");

        card.innerHTML = `
            <div class="submission-card-header">
                <span class="submission-id">${displayId}</span>
                <span class="status-badge ${statusClass}">${statusLabel}</span>
            </div>
            <h3 class="submission-card-title">${escapeHtml(file.title)}</h3>
            <div class="submission-meta">
                <p><strong>Category:</strong> ${escapeHtml(file.category)}</p>
                <p><strong>Submitted:</strong> ${file.dateUploaded || "N/A"}</p>
                ${
                    file.reviewComment
                        ? `<p class="review-preview"><strong>Reviewer Note:</strong> ${escapeHtml(file.reviewComment)}</p>`
                        : ""
                }
            </div>
            <div class="submission-card-footer">
                <button type="button" class="btn-card view-details-btn">
                    <i class="fa-regular fa-eye"></i> View Timeline & Details
                </button>
            </div>
        `;

        card.querySelector(".view-details-btn").addEventListener("click", () => openModal(file));
        submissionList.appendChild(card);
    });
}

function setupModal() {
    const closeBtn = document.getElementById("closeModalButton");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    if (submissionModal) {
        submissionModal.addEventListener("click", function (e) {
            if (e.target === submissionModal) closeModal();
        });
    }

    const editBtn = document.getElementById("editSubmissionButton");
    if (editBtn) {
        editBtn.addEventListener("click", function () {
            if (selectedSubmission) {
                localStorage.setItem("refmansyEditFileId", selectedSubmission.id);
                window.location.href = "upload-research.html";
            }
        });
    }

    const viewBtn = document.getElementById("viewDocumentButton");
    if (viewBtn) {
        viewBtn.addEventListener("click", async function () {
            if (selectedSubmission && selectedSubmission.filePath) {
                await window.refmansyApi.storage.triggerBrowserDownload(
                    selectedSubmission.filePath,
                    selectedSubmission.fileName
                );
            } else {
                alert("No document file is attached.");
            }
        });
    }
}

function openModal(file) {
    selectedSubmission = file;

    const mTitle = document.getElementById("modalTitle");
    if (mTitle) mTitle.textContent = file.title;
    const mFileId = document.getElementById("modalFileId");
    if (mFileId) mFileId.textContent = file.id;
    const mCat = document.getElementById("modalCategory");
    if (mCat) mCat.textContent = file.category;
    const mUploadDate = document.getElementById("modalUploadDate");
    if (mUploadDate) mUploadDate.textContent = file.dateUploaded || "N/A";
    const mStatus = document.getElementById("modalStatus");
    if (mStatus) mStatus.textContent = file.status.toUpperCase();
    const mReviewedBy = document.getElementById("modalReviewedBy");
    if (mReviewedBy) mReviewedBy.textContent = file.reviewedBy ? "Administrator" : "Pending";
    const mReviewedDate = document.getElementById("modalReviewedDate");
    if (mReviewedDate) mReviewedDate.textContent = file.reviewedDate || "N/A";
    const mComment = document.getElementById("modalComment");
    if (mComment) mComment.textContent = file.reviewComment || "No administrator comment provided yet.";
    const subDate = document.getElementById("submittedDate");
    if (subDate) subDate.textContent = file.dateUploaded || "Submitted";

    const editBtn = document.getElementById("editSubmissionButton");
    if (editBtn) {
        if (file.status === "pending" || file.status === "rejected") {
            editBtn.style.display = "inline-flex";
        } else {
            editBtn.style.display = "none";
        }
    }

    // Update timeline steps
    updateTimeline(file.status);

    if (submissionModal) submissionModal.classList.add("active");
}

function updateTimeline(status) {
    const reviewStep = document.getElementById("reviewStep");
    const decisionStep = document.getElementById("decisionStep");
    const decisionText = document.getElementById("decisionText");

    if (reviewStep) reviewStep.className = "timeline-step";
    if (decisionStep) decisionStep.className = "timeline-step";

    if (status === "pending") {
        if (reviewStep) reviewStep.classList.add("active");
        if (decisionText) decisionText.textContent = "Pending";
    } else if (status === "approved") {
        if (reviewStep) reviewStep.classList.add("completed");
        if (decisionStep) decisionStep.classList.add("completed", "approved");
        if (decisionText) decisionText.textContent = "Approved";
    } else if (status === "rejected") {
        if (reviewStep) reviewStep.classList.add("completed");
        if (decisionStep) decisionStep.classList.add("completed", "rejected");
        if (decisionText) decisionText.textContent = "Rejected";
    }
}

function closeModal() {
    if (submissionModal) submissionModal.classList.remove("active");
    selectedSubmission = null;
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