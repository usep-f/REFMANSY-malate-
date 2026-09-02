// ================================================================
// Refmansy Faculty Submission Status (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;
let facultySubmissions = [];
let selectedSubmission = null;

const searchInput = document.getElementById("searchInput");
const statusFilter = document.getElementById("statusFilter");
const submissionsGrid = document.getElementById("submissionsGrid");
const emptyState = document.getElementById("emptyState");
const statusModal = document.getElementById("statusModal");

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
        submissionsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading submission statuses...</div>`;
        
        facultySubmissions = await window.refmansyApi.research.getMyFiles(currentProfile.id);
        
        updateSummary();
        filterSubmissions();
    } catch (err) {
        console.error("Error loading submissions:", err);
        submissionsGrid.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: red; padding: 2rem;">Error: ${err.message}</div>`;
    }
}

function updateSummary() {
    const total = facultySubmissions.length;
    const pending = facultySubmissions.filter(f => f.status === "pending").length;
    const approved = facultySubmissions.filter(f => f.status === "approved").length;
    const rejected = facultySubmissions.filter(f => f.status === "rejected").length;

    document.getElementById("totalSubmissions").textContent = total;
    document.getElementById("pendingCount").textContent = pending;
    document.getElementById("approvedCount").textContent = approved;
    document.getElementById("rejectedCount").textContent = rejected;
}

function setupFilters() {
    searchInput.addEventListener("input", filterSubmissions);
    statusFilter.addEventListener("change", filterSubmissions);
}

function filterSubmissions() {
    const term = searchInput.value.trim().toLowerCase();
    const stat = statusFilter.value.toLowerCase();

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
    submissionsGrid.innerHTML = "";

    if (!files || files.length === 0) {
        emptyState.style.display = "block";
        return;
    }

    emptyState.style.display = "none";

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
        submissionsGrid.appendChild(card);
    });
}

function setupModal() {
    document.getElementById("closeModalButton").addEventListener("click", closeModal);
    statusModal.addEventListener("click", function (e) {
        if (e.target === statusModal) closeModal();
    });

    document.getElementById("editSubmissionButton").addEventListener("click", function () {
        if (selectedSubmission) {
            localStorage.setItem("refmansyEditFileId", selectedSubmission.id);
            window.location.href = "upload-research.html";
        }
    });

    document.getElementById("viewDocumentButton").addEventListener("click", async function () {
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

function openModal(file) {
    selectedSubmission = file;

    document.getElementById("modalSubmissionId").textContent = file.id;
    document.getElementById("modalTitle").textContent = file.title;
    document.getElementById("modalCategory").textContent = file.category;
    document.getElementById("modalSubmittedDate").textContent = file.dateUploaded || "N/A";
    document.getElementById("modalDescription").textContent = file.description || "No description provided.";
    document.getElementById("modalReviewComment").textContent =
        file.reviewComment || "No administrator comment provided yet.";

    const editBtn = document.getElementById("editSubmissionButton");
    if (file.status === "pending" || file.status === "rejected") {
        editBtn.style.display = "inline-flex";
    } else {
        editBtn.style.display = "none";
    }

    // Update timeline steps
    updateTimeline(file.status);

    statusModal.classList.add("active");
}

function updateTimeline(status) {
    const submissionStep = document.getElementById("submissionStep");
    const reviewStep = document.getElementById("reviewStep");
    const decisionStep = document.getElementById("decisionStep");
    const decisionText = document.getElementById("decisionText");

    // Reset classes
    [submissionStep, reviewStep, decisionStep].forEach(step => {
        step.className = "timeline-step";
    });

    submissionStep.classList.add("completed");

    if (status === "pending") {
        reviewStep.classList.add("active");
        decisionText.textContent = "Pending";
    } else if (status === "approved") {
        reviewStep.classList.add("completed");
        decisionStep.classList.add("completed", "approved");
        decisionText.textContent = "Approved";
    } else if (status === "rejected") {
        reviewStep.classList.add("completed");
        decisionStep.classList.add("completed", "rejected");
        decisionText.textContent = "Changes Requested / Rejected";
    }
}

function closeModal() {
    statusModal.classList.remove("active");
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