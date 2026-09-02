// ================================================================
// Refmansy Admin Approved Files (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;
let approvedFiles = [];
let selectedFile = null;

const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const approvedFilesTable = document.getElementById("approvedFilesTable");
const detailsModal = document.getElementById("detailsModal");
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
    await loadApprovedFiles();
}

async function loadApprovedFiles() {
    try {
        if (approvedFilesTable) {
            approvedFilesTable.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading approved files...</td></tr>`;
        }

        const [allFiles, categories] = await Promise.all([
            window.refmansyApi.research.getApprovedFiles(),
            window.refmansyApi.categories.getAll()
        ]);

        approvedFiles = allFiles;

        updateSummary();
        populateCategoryFilter(categories);
        filterApprovedFiles();
    } catch (err) {
        console.error("Error loading approved files:", err);
        if (approvedFilesTable) {
            approvedFilesTable.innerHTML = `<tr><td colspan="6" style="text-align: center; color: red; padding: 2rem;">Error: ${err.message}</td></tr>`;
        }
    }
}

function updateSummary() {
    const countEl = document.getElementById("totalApprovedFiles");
    if (countEl) countEl.textContent = approvedFiles.length;
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
    if (searchInput) searchInput.addEventListener("input", filterApprovedFiles);
    if (categoryFilter) categoryFilter.addEventListener("change", filterApprovedFiles);
}

function filterApprovedFiles() {
    const term = (searchInput?.value || "").trim().toLowerCase();
    const cat = categoryFilter?.value || "all";

    const filtered = approvedFiles.filter(file => {
        const matchesTerm =
            !term ||
            file.title.toLowerCase().includes(term) ||
            file.researcher.toLowerCase().includes(term) ||
            file.uploadedBy.toLowerCase().includes(term);

        const matchesCat = cat === "all" || file.category === cat;

        return matchesTerm && matchesCat;
    });

    if (resultCount) {
        resultCount.textContent = `Showing ${filtered.length} of ${approvedFiles.length} approved files`;
    }

    renderTable(filtered);
}

function renderTable(files) {
    if (!approvedFilesTable) return;
    approvedFilesTable.innerHTML = "";

    if (!files || files.length === 0) {
        approvedFilesTable.innerHTML = `<tr><td colspan="6" class="empty-table">No approved research files found.</td></tr>`;
        return;
    }

    files.forEach(file => {
        const row = document.createElement("tr");

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
            <td><span class="status-badge status-approved"><i class="fa-solid fa-circle-check"></i> Approved</span></td>
            <td>
                <div class="table-actions">
                    <button type="button" class="btn-action view-btn" title="View Details">
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

        approvedFilesTable.appendChild(row);
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

    const viewBtn = document.getElementById("viewFileButton");
    if (viewBtn) {
        viewBtn.addEventListener("click", async function () {
            if (selectedFile && selectedFile.filePath) {
                await window.refmansyApi.storage.triggerBrowserDownload(selectedFile.filePath, selectedFile.fileName);
            } else {
                alert("No document file is attached.");
            }
        });
    }

    const pendBtn = document.getElementById("markPendingButton");
    if (pendBtn) pendBtn.addEventListener("click", () => changeStatus("pending"));

    const rejBtn = document.getElementById("rejectButton");
    if (rejBtn) rejBtn.addEventListener("click", () => changeStatus("rejected"));
}

function openModal(file) {
    selectedFile = file;

    const mFileId = document.getElementById("modalFileId");
    if (mFileId) mFileId.textContent = file.id;
    const mAppDate = document.getElementById("modalApprovedDate");
    if (mAppDate) mAppDate.textContent = file.reviewedDate || file.dateUploaded || "N/A";
    const mTitle = document.getElementById("modalTitle");
    if (mTitle) mTitle.textContent = file.title;
    const mRes = document.getElementById("modalResearcher");
    if (mRes) mRes.textContent = file.researcher;
    const mCat = document.getElementById("modalCategory");
    if (mCat) mCat.textContent = file.category;
    const mRevBy = document.getElementById("modalReviewedBy");
    if (mRevBy) mRevBy.textContent = "Administrator";
    const mDesc = document.getElementById("modalDescription");
    if (mDesc) mDesc.textContent = file.description || "No description provided.";
    const mComment = document.getElementById("modalComment");
    if (mComment) mComment.textContent = file.reviewComment || "No review comment.";

    if (detailsModal) detailsModal.classList.add("active");
}

function closeModal() {
    if (detailsModal) detailsModal.classList.remove("active");
    selectedFile = null;
}

async function changeStatus(newStatus) {
    if (!selectedFile) return;

    const reason = prompt(`Reason for changing status to ${newStatus}:`, selectedFile.reviewComment || "");
    if (reason === null) return;

    try {
        await window.refmansyApi.research.updateStatus(
            selectedFile.id,
            newStatus,
            reason,
            currentProfile.id
        );

        closeModal();
        await loadApprovedFiles();
    } catch (err) {
        console.error("Change status error:", err);
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