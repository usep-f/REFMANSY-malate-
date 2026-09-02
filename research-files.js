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
const researchFilesTable = document.getElementById("researchFilesTable");
const reviewModal = document.getElementById("reviewModal");
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
    await loadResearchFiles();
}

async function loadResearchFiles() {
    try {
        if (researchFilesTable) {
            researchFilesTable.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading research papers...</td></tr>`;
        }

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
        if (researchFilesTable) {
            researchFilesTable.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red; padding: 2rem;">Error: ${err.message}</td></tr>`;
        }
    }
}

function updateSummary() {
    const total = researchFiles.length;
    const approved = researchFiles.filter(f => f.status === "approved").length;
    const pending = researchFiles.filter(f => f.status === "pending").length;
    const rejected = researchFiles.filter(f => f.status === "rejected").length;

    const totalEl = document.getElementById("totalFiles");
    if (totalEl) totalEl.textContent = total;
    const approvedEl = document.getElementById("approvedFiles");
    if (approvedEl) approvedEl.textContent = approved;
    const pendingEl = document.getElementById("pendingFiles");
    if (pendingEl) pendingEl.textContent = pending;
    const rejectedEl = document.getElementById("rejectedFiles");
    if (rejectedEl) rejectedEl.textContent = rejected;
}

function populateCategoryFilter(categories) {
    if (!categoryFilter) return;
    categoryFilter.innerHTML = `<option value="all">All Categories</option>`;
    categories.forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat.name;
        opt.textContent = cat.name;
        categoryFilter.appendChild(opt);
    });
}

function setupFilters() {
    if (searchInput) searchInput.addEventListener("input", filterResearchFiles);
    if (categoryFilter) categoryFilter.addEventListener("change", filterResearchFiles);
    if (statusFilter) statusFilter.addEventListener("change", filterResearchFiles);
}

function filterResearchFiles() {
    const term = (searchInput?.value || "").trim().toLowerCase();
    const cat = categoryFilter?.value || "all";
    const stat = (statusFilter?.value || "all").toLowerCase();

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

    if (resultCount) {
        resultCount.textContent = `Showing ${filtered.length} of ${researchFiles.length} files`;
    }

    renderTable(filtered);
}

function renderTable(files) {
    if (!researchFilesTable) return;
    researchFilesTable.innerHTML = "";

    if (!files || files.length === 0) {
        researchFilesTable.innerHTML = `<tr><td colspan="7" class="empty-table">No research files found matching criteria.</td></tr>`;
        return;
    }

    files.forEach((file, index) => {
        const row = document.createElement("tr");

        const statusBadge =
            file.status === "approved"
                ? `<span class="status-badge status-approved"><i class="fa-solid fa-circle-check"></i> Approved</span>`
                : file.status === "rejected"
                ? `<span class="status-badge status-rejected"><i class="fa-solid fa-circle-xmark"></i> Rejected</span>`
                : `<span class="status-badge status-pending"><i class="fa-solid fa-clock"></i> Pending</span>`;

        row.innerHTML = `
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
                        <i class="fa-regular fa-eye"></i> View
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

        researchFilesTable.appendChild(row);
    });
}

function setupModal() {
    const closeBtn = document.getElementById("closeModalButton");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    if (reviewModal) {
        reviewModal.addEventListener("click", function (e) {
            if (e.target === reviewModal) closeModal();
        });
    }

    const appBtn = document.getElementById("approveButton");
    if (appBtn) appBtn.addEventListener("click", () => updateFileStatus("approved"));

    const rejBtn = document.getElementById("rejectButton");
    if (rejBtn) rejBtn.addEventListener("click", () => updateFileStatus("rejected"));

    const pendBtn = document.getElementById("pendingButton");
    if (pendBtn) pendBtn.addEventListener("click", () => updateFileStatus("pending"));
}

function openModal(file) {
    selectedFile = file;

    const mFileId = document.getElementById("modalFileId");
    if (mFileId) mFileId.textContent = file.id;
    const mTitle = document.getElementById("modalTitle");
    if (mTitle) mTitle.textContent = file.title;
    const mRes = document.getElementById("modalResearcher");
    if (mRes) mRes.textContent = file.researcher;
    const mCat = document.getElementById("modalCategory");
    if (mCat) mCat.textContent = file.category;
    const mDate = document.getElementById("modalDate");
    if (mDate) mDate.textContent = file.dateUploaded || "N/A";
    const mStatus = document.getElementById("modalStatus");
    if (mStatus) mStatus.textContent = file.status.toUpperCase();
    const mDesc = document.getElementById("modalDescription");
    if (mDesc) mDesc.textContent = file.description || "No description provided.";

    if (reviewModal) reviewModal.classList.add("active");
}

function closeModal() {
    if (reviewModal) reviewModal.classList.remove("active");
    selectedFile = null;
}

async function updateFileStatus(newStatus) {
    if (!selectedFile) return;

    const comment = prompt(`Add review comment for status change to ${newStatus}:`, selectedFile.reviewComment || "");
    if (comment === null) return;

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