// ================================================================
// Refmansy Faculty Research Files (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;
let facultyFiles = [];
let selectedFile = null;

const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const statusFilter = document.getElementById("statusFilter");
const researchFilesTable = document.getElementById("researchFilesTable");
const fileModal = document.getElementById("fileModal");
const resultCount = document.getElementById("resultCount");

// Auth Guard
window.refmansyAuthGuard.init("faculty", function (profile, user) {
    currentUser = user;
    currentProfile = profile;
    initializePage();
});

async function initializePage() {
    setupFilters();
    setupModal();
    await loadFacultyFiles();
}

async function loadFacultyFiles() {
    try {
        if (researchFilesTable) {
            researchFilesTable.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading research files...</td></tr>`;
        }

        facultyFiles = await window.refmansyApi.research.getMyFiles(currentProfile.id);

        updateSummary();
        await loadCategoryOptions();
        filterResearchFiles();
    } catch (err) {
        console.error("Error loading faculty files:", err);
        if (researchFilesTable) {
            researchFilesTable.innerHTML = `<tr><td colspan="7" style="text-align:center; color: red; padding: 2rem;">Error loading files: ${err.message}</td></tr>`;
        }
    }
}

function updateSummary() {
    const total = facultyFiles.length;
    const approved = facultyFiles.filter(f => f.status === "approved").length;
    const pending = facultyFiles.filter(f => f.status === "pending").length;
    const rejected = facultyFiles.filter(f => f.status === "rejected").length;

    const totalEl = document.getElementById("totalFiles");
    if (totalEl) totalEl.textContent = total;
    const approvedEl = document.getElementById("approvedFiles");
    if (approvedEl) approvedEl.textContent = approved;
    const pendingEl = document.getElementById("pendingFiles");
    if (pendingEl) pendingEl.textContent = pending;
    const rejectedEl = document.getElementById("rejectedFiles");
    if (rejectedEl) rejectedEl.textContent = rejected;
}

async function loadCategoryOptions() {
    if (!categoryFilter) return;
    try {
        const categories = await window.refmansyApi.categories.getAll();
        const existingVal = categoryFilter.value;
        categoryFilter.innerHTML = `<option value="all">All Categories</option>`;

        categories.forEach(cat => {
            const opt = document.createElement("option");
            opt.value = cat.name;
            opt.textContent = cat.name;
            categoryFilter.appendChild(opt);
        });
        categoryFilter.value = existingVal || "all";
    } catch (err) {
        console.error("Error loading categories:", err);
    }
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

    const filtered = facultyFiles.filter(file => {
        const matchesTerm =
            !term ||
            file.title.toLowerCase().includes(term) ||
            file.researcher.toLowerCase().includes(term) ||
            (file.keywords && file.keywords.toLowerCase().includes(term));

        const matchesCat = cat === "all" || file.category === cat;
        const matchesStat = stat === "all" || file.status === stat;

        return matchesTerm && matchesCat && matchesStat;
    });

    if (resultCount) {
        resultCount.textContent = `Showing ${filtered.length} of ${facultyFiles.length} files`;
    }

    renderTable(filtered);
}

function renderTable(files) {
    if (!researchFilesTable) return;
    researchFilesTable.innerHTML = "";

    if (!files || files.length === 0) {
        researchFilesTable.innerHTML = `<tr><td colspan="7" class="empty-table">No research files found matching selected criteria.</td></tr>`;
        return;
    }

    files.forEach((file, index) => {
        const row = document.createElement("tr");
        const displayId = "RF-" + String(index + 1).padStart(4, "0");
        const statusBadge = getStatusBadge(file.status);

        row.innerHTML = `
            <td><strong>${displayId}</strong></td>
            <td>
                <div class="file-title-cell">
                    <strong>${escapeHtml(file.title)}</strong>
                    <br><small style="color: #64748b;">${escapeHtml(file.fileName || "PDF Document")}</small>
                </div>
            </td>
            <td>${escapeHtml(file.category)}</td>
            <td>${file.dateUploaded || "N/A"}</td>
            <td>${statusBadge}</td>
            <td>${file.reviewComment ? escapeHtml(file.reviewComment) : "<em>No comment</em>"}</td>
            <td>
                <div class="table-actions">
                    <button type="button" class="view-button view-btn" title="Details">
                        <i class="fa-solid fa-circle-info"></i> Details
                    </button>
                    ${
                        file.filePath
                            ? `<button type="button" class="view-button download-btn" title="View File" style="background-color: var(--dark-blue); margin-left: 5px;">
                                <i class="fa-regular fa-file-pdf"></i> View
                               </button>`
                            : ""
                    }
                    ${(file.status === "pending" || file.status === "rejected")
                ? `<button type="button" class="view-button delete-row-btn" title="Delete Submission" style="background-color: #ef4444; margin-left: 5px;">
                                <i class="fa-solid fa-trash"></i>
                               </button>`
                : ""
            }
                </div>
            </td>
        `;

        row.querySelector(".view-btn").addEventListener("click", () => openModal(file));

        const dlBtn = row.querySelector(".download-btn");
        if (dlBtn) {
            dlBtn.addEventListener("click", async () => {
                await window.refmansyApi.storage.openDocumentInNewTab(file.filePath);
            });
        }

        const delRowBtn = row.querySelector(".delete-row-btn");
        if (delRowBtn) {
            delRowBtn.addEventListener("click", async () => {
                if (confirm(`Are you sure you want to delete "${file.title}"? This cannot be undone.`)) {
                    try {
                        await window.refmansyApi.research.deleteFile(file.id);
                        await loadResearchFiles();
                    } catch (err) {
                        alert("Failed to delete research file: " + (err.message || err));
                    }
                }
            });
        }

        researchFilesTable.appendChild(row);
    });
}

function getStatusBadge(status) {
    const s = (status || "pending").toLowerCase();
    if (s === "approved") {
        return `<span class="status-badge status-approved"><i class="fa-solid fa-circle-check"></i> Approved</span>`;
    } else if (s === "rejected") {
        return `<span class="status-badge status-rejected"><i class="fa-solid fa-circle-xmark"></i> Rejected</span>`;
    }
    return `<span class="status-badge status-pending"><i class="fa-solid fa-clock"></i> Pending</span>`;
}

function setupModal() {
    const closeBtn = document.getElementById("closeModalButton");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    if (fileModal) {
        fileModal.addEventListener("click", function (e) {
            if (e.target === fileModal) closeModal();
        });
    }

    const editBtn = document.getElementById("editFileButton");
    if (editBtn) {
        editBtn.addEventListener("click", function () {
            if (selectedFile) {
                localStorage.setItem("refmansyEditFileId", selectedFile.id);
                window.location.href = "upload-research.html";
            }
        });
    }

    const delBtn = document.getElementById("deleteFileButton");
    if (delBtn) {
        delBtn.addEventListener("click", async function () {
            if (!selectedFile) return;
            if (confirm(`Are you sure you want to delete "${selectedFile.title}"? This cannot be undone.`)) {
                try {
                    await window.refmansyApi.research.deleteFile(selectedFile.id);
                    closeModal();
                    await loadResearchFiles();
                } catch (err) {
                    alert("Failed to delete research file: " + (err.message || err));
                }
            }
        });
    }
}

function openModal(file) {
    selectedFile = file;

    const modalFileId = document.getElementById("modalFileId");
    if (modalFileId) modalFileId.textContent = file.id;
    const modalDate = document.getElementById("modalDate");
    if (modalDate) modalDate.textContent = file.dateUploaded || "N/A";
    const modalTitle = document.getElementById("modalTitle");
    if (modalTitle) modalTitle.textContent = file.title;
    const modalCategory = document.getElementById("modalCategory");
    if (modalCategory) modalCategory.textContent = file.category;
    const modalStatus = document.getElementById("modalStatus");
    if (modalStatus) modalStatus.innerHTML = getStatusBadge(file.status);
    const modalDescription = document.getElementById("modalDescription");
    if (modalDescription) modalDescription.textContent = file.description || "No description provided.";
    const modalComment = document.getElementById("modalComment");
    if (modalComment) modalComment.textContent = file.reviewComment || "No administrator review comment yet.";

    const editBtn = document.getElementById("editFileButton");
    if (editBtn) {
        if (file.status === "pending" || file.status === "rejected") {
            editBtn.style.display = "inline-flex";
        } else {
            editBtn.style.display = "none";
        }
    }

    const delBtn = document.getElementById("deleteFileButton");
    if (delBtn) {
        if (file.status === "pending" || file.status === "rejected") {
            delBtn.style.display = "inline-flex";
        } else {
            delBtn.style.display = "none";
        }
    }

    if (fileModal) fileModal.classList.add("active");
}

function closeModal() {
    if (fileModal) fileModal.classList.remove("active");
    selectedFile = null;
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