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
const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");
const clearFiltersButton = document.getElementById("clearFiltersButton");
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

        // Assign stable, permanent displayId to each record based on initial order
        files.forEach((file, index) => {
            file.displayId = "RF-" + String(index + 1).padStart(4, "0");
        });

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
    if (startDateInput) startDateInput.addEventListener("change", filterResearchFiles);
    if (endDateInput) endDateInput.addEventListener("change", filterResearchFiles);
    if (clearFiltersButton) clearFiltersButton.addEventListener("click", clearFilters);
}

function clearFilters() {
    if (searchInput) searchInput.value = "";
    if (categoryFilter) categoryFilter.value = "all";
    if (statusFilter) statusFilter.value = "all";
    if (startDateInput) startDateInput.value = "";
    if (endDateInput) endDateInput.value = "";
    filterResearchFiles();
}

function filterResearchFiles() {
    const term = (searchInput?.value || "").trim().toLowerCase();
    const cat = categoryFilter?.value || "all";
    const stat = (statusFilter?.value || "all").toLowerCase();
    const start = startDateInput?.value || "";
    const end = endDateInput?.value || "";

    const filtered = researchFiles.filter(file => {
        // Multi-field search: Research ID, Title, Researcher, Co-Researchers, Uploader, Keywords
        const matchesTerm =
            !term ||
            (file.displayId && file.displayId.toLowerCase().includes(term)) ||
            (file.id && file.id.toLowerCase().includes(term)) ||
            file.title.toLowerCase().includes(term) ||
            file.researcher.toLowerCase().includes(term) ||
            (file.coResearchers && file.coResearchers.toLowerCase().includes(term)) ||
            file.uploadedBy.toLowerCase().includes(term) ||
            (file.keywords && file.keywords.toLowerCase().includes(term));

        const matchesCat = cat === "all" || file.category === cat;
        const matchesStat = stat === "all" || file.status === stat;

        // Date range filtering
        let matchesDate = true;
        if (start && file.createdAt) {
            matchesDate = matchesDate && new Date(file.createdAt) >= new Date(start);
        }
        if (end && file.createdAt) {
            matchesDate = matchesDate && new Date(file.createdAt) <= new Date(end + "T23:59:59");
        }

        return matchesTerm && matchesCat && matchesStat && matchesDate;
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
        const displayId = file.displayId || ("RF-" + String(index + 1).padStart(4, "0"));

        const statusBadge =
            file.status === "approved"
                ? `<span class="status-label status-approved"><i class="fa-solid fa-circle-check"></i> Approved</span>`
                : file.status === "rejected"
                    ? `<span class="status-label status-rejected"><i class="fa-solid fa-circle-xmark"></i> Rejected</span>`
                    : `<span class="status-label status-pending"><i class="fa-solid fa-clock"></i> Pending</span>`;

        row.innerHTML = `
            <td><strong>${displayId}</strong></td>
            <td>
                <div class="file-title-cell">
                    <strong>${escapeHtml(file.title)}</strong>
                    <br><small style="color: #64748b;">${escapeHtml(file.fileName || "PDF Document")}</small>
                </div>
            </td>
            <td>${escapeHtml(file.researcher)}</td>
            <td>${escapeHtml(file.category)}</td>
            <td>${file.dateUploaded || "N/A"}</td>
            <td>${statusBadge}</td>
            <td>
                <div class="table-actions">
                    <button type="button" class="view-button view-btn" title="Details">
                        <i class="fa-solid fa-circle-info"></i> Details
                    </button>
                    <button type="button" class="view-button delete-btn" title="Delete Research File" style="background-color: #ef4444; margin-left: 5px;">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        `;

        row.querySelector(".view-btn").addEventListener("click", () => openModal(file));

        const deleteRowBtn = row.querySelector(".delete-btn");
        if (deleteRowBtn) {
            deleteRowBtn.addEventListener("click", async () => {
                if (confirm(`Are you sure you want to permanently delete "${file.title}"? This cannot be undone.`)) {
                    try {
                        await window.refmansyApi.research.deleteFile(file.id);
                        await loadResearchFiles();
                    } catch (err) {
                        alert("Error deleting file: " + (err.message || err));
                    }
                }
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

    const delBtn = document.getElementById("deleteResearchButton");
    if (delBtn) {
        delBtn.addEventListener("click", async function () {
            if (!selectedFile) return;
            if (confirm(`Are you sure you want to permanently delete "${selectedFile.title}"? This cannot be undone.`)) {
                try {
                    await window.refmansyApi.research.deleteFile(selectedFile.id);
                    closeModal();
                    await loadResearchFiles();
                } catch (err) {
                    alert("Error deleting file: " + (err.message || err));
                }
            }
        });
    }
}

function openModal(file) {
    selectedFile = file;

    const mFileId = document.getElementById("modalFileId");
    if (mFileId) mFileId.textContent = file.displayId ? `${file.displayId} (${file.id})` : file.id;
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