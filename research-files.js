// ================================================================
// Refmansy Admin Research Files (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;
let researchFiles = [];
let selectedFile = null;

const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const statusFilter = document.getElementById("statusFilter");
const researchTableBody = document.getElementById("researchTableBody");
const fileModal = document.getElementById("fileModal");

// Auth Guard
window.refmansyAuthGuard.init("admin", function (profile, user) {
    currentUser = user;
    currentProfile = profile;
    initializePage();
});

async function initializePage() {
    setupFilters();
    setupModal();
    await loadResearchFiles();
}

async function loadResearchFiles() {
    try {
        researchTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading research papers...</td></tr>`;

        const [files, categories] = await Promise.all([
            window.refmansyApi.research.getAllFiles(),
            window.refmansyApi.categories.getAll()
        ]);

        researchFiles = files;

        updateSummary();
        populateCategoryFilter(categories);
        filterResearchFiles();
    } catch (err) {
        console.error("Error loading research files:", err);
        researchTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red; padding: 2rem;">Error: ${err.message}</td></tr>`;
    }
}

function updateSummary() {
    const total = researchFiles.length;
    const approved = researchFiles.filter(f => f.status === "approved").length;
    const pending = researchFiles.filter(f => f.status === "pending").length;
    const rejected = researchFiles.filter(f => f.status === "rejected").length;

    document.getElementById("totalFiles").textContent = total;
    document.getElementById("approvedCount").textContent = approved;
    document.getElementById("pendingCount").textContent = pending;
    document.getElementById("rejectedCount").textContent = rejected;
}

function populateCategoryFilter(categories) {
    categoryFilter.innerHTML = `<option value="all">All Categories</option>`;
    categories.forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat.name;
        opt.textContent = cat.name;
        categoryFilter.appendChild(opt);
    });
}

function setupFilters() {
    searchInput.addEventListener("input", filterResearchFiles);
    categoryFilter.addEventListener("change", filterResearchFiles);
    statusFilter.addEventListener("change", filterResearchFiles);
}

function filterResearchFiles() {
    const term = searchInput.value.trim().toLowerCase();
    const cat = categoryFilter.value;
    const stat = statusFilter.value.toLowerCase();

    const filtered = researchFiles.filter(file => {
        const matchesTerm =
            !term ||
            file.title.toLowerCase().includes(term) ||
            file.researcher.toLowerCase().includes(term) ||
            file.uploadedBy.toLowerCase().includes(term) ||
            (file.keywords && file.keywords.toLowerCase().includes(term));

        const matchesCat = cat === "all" || file.category === cat;
        const matchesStat = stat === "all" || file.status === stat;

        return matchesTerm && matchesCat && matchesStat;
    });

    renderTable(filtered);
}

function renderTable(files) {
    researchTableBody.innerHTML = "";

    if (!files || files.length === 0) {
        researchTableBody.innerHTML = `<tr><td colspan="7" class="empty-table">No research files found matching criteria.</td></tr>`;
        return;
    }

    files.forEach((file, index) => {
        const row = document.createElement("tr");
        const displayId = "RF-" + String(index + 1).padStart(4, "0");

        const statusBadge =
            file.status === "approved"
                ? `<span class="status-badge status-approved"><i class="fa-solid fa-circle-check"></i> Approved</span>`
                : file.status === "rejected"
                ? `<span class="status-badge status-rejected"><i class="fa-solid fa-circle-xmark"></i> Rejected</span>`
                : `<span class="status-badge status-pending"><i class="fa-solid fa-clock"></i> Pending</span>`;

        row.innerHTML = `
            <td><strong>${displayId}</strong></td>
            <td>
                <div class="file-title-cell">
                    <strong>${escapeHtml(file.title)}</strong>
                    <small>${escapeHtml(file.fileName || "PDF Document")}</small>
                </div>
            </td>
            <td>${escapeHtml(file.researcher)}</td>
            <td>${escapeHtml(file.category)}</td>
            <td>${file.dateUploaded || "N/A"}</td>
            <td>${statusBadge}</td>
            <td>
                <div class="table-actions">
                    <button type="button" class="btn-action view-btn" title="Review & Details">
                        <i class="fa-regular fa-eye"></i>
                    </button>
                    ${
                        file.filePath
                            ? `<button type="button" class="btn-action download-btn" title="Download Document">
                                <i class="fa-solid fa-download"></i>
                               </button>`
                            : ""
                    }
                </div>
            </td>
        `;

        row.querySelector(".view-btn").addEventListener("click", () => openModal(file));

        const dlBtn = row.querySelector(".download-btn");
        if (dlBtn) {
            dlBtn.addEventListener("click", () => {
                window.refmansyApi.storage.triggerBrowserDownload(file.filePath, file.fileName);
            });
        }

        researchTableBody.appendChild(row);
    });
}

function setupModal() {
    document.getElementById("closeModalButton").addEventListener("click", closeModal);
    fileModal.addEventListener("click", function (e) {
        if (e.target === fileModal) closeModal();
    });

    document.getElementById("viewFileButton").addEventListener("click", async function () {
        if (selectedFile && selectedFile.filePath) {
            await window.refmansyApi.storage.triggerBrowserDownload(selectedFile.filePath, selectedFile.fileName);
        } else {
            alert("No document file is attached.");
        }
    });

    document.getElementById("approveButton").addEventListener("click", () => updateFileStatus("approved"));
    document.getElementById("rejectButton").addEventListener("click", () => updateFileStatus("rejected"));
    document.getElementById("pendingButton").addEventListener("click", () => updateFileStatus("pending"));
}

function openModal(file) {
    selectedFile = file;

    document.getElementById("modalFileId").textContent = file.id;
    document.getElementById("modalTitle").textContent = file.title;
    document.getElementById("modalResearcher").textContent = file.researcher;
    document.getElementById("modalCoResearchers").textContent = file.coResearchers || "None";
    document.getElementById("modalCategory").textContent = file.category;
    document.getElementById("modalDepartment").textContent = file.department || "N/A";
    document.getElementById("modalYear").textContent = file.publicationYear || "N/A";
    document.getElementById("modalUploadedBy").textContent = `${file.uploadedBy} (${file.uploadedByEmail || ""})`;
    document.getElementById("modalDate").textContent = file.dateUploaded || "N/A";
    document.getElementById("modalDescription").textContent = file.description || "No description provided.";
    document.getElementById("reviewCommentInput").value = file.reviewComment || "";

    fileModal.classList.add("active");
}

function closeModal() {
    fileModal.classList.remove("active");
    selectedFile = null;
}

async function updateFileStatus(newStatus) {
    if (!selectedFile) return;

    const comment = document.getElementById("reviewCommentInput").value.trim();

    try {
        await window.refmansyApi.research.updateStatus(
            selectedFile.id,
            newStatus,
            comment,
            currentProfile.id
        );

        closeModal();
        await loadResearchFiles();
    } catch (err) {
        console.error("Status update error:", err);
        alert("Failed to update status: " + err.message);
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