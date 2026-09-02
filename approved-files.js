// ================================================================
// Refmansy Admin Approved Files (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;
let approvedFiles = [];
let selectedFile = null;

const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const approvedTableBody = document.getElementById("approvedTableBody");
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
    await loadApprovedFiles();
}

async function loadApprovedFiles() {
    try {
        approvedTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading approved files...</td></tr>`;

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
        approvedTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: red; padding: 2rem;">Error: ${err.message}</td></tr>`;
    }
}

function updateSummary() {
    const countEl = document.getElementById("approvedSummaryCount");
    if (countEl) countEl.textContent = approvedFiles.length;
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
    searchInput.addEventListener("input", filterApprovedFiles);
    categoryFilter.addEventListener("change", filterApprovedFiles);
}

function filterApprovedFiles() {
    const term = searchInput.value.trim().toLowerCase();
    const cat = categoryFilter.value;

    const filtered = approvedFiles.filter(file => {
        const matchesTerm =
            !term ||
            file.title.toLowerCase().includes(term) ||
            file.researcher.toLowerCase().includes(term) ||
            file.uploadedBy.toLowerCase().includes(term);

        const matchesCat = cat === "all" || file.category === cat;

        return matchesTerm && matchesCat;
    });

    renderTable(filtered);
}

function renderTable(files) {
    approvedTableBody.innerHTML = "";

    if (!files || files.length === 0) {
        approvedTableBody.innerHTML = `<tr><td colspan="6" class="empty-table">No approved research files found.</td></tr>`;
        return;
    }

    files.forEach((file, index) => {
        const row = document.createElement("tr");
        const displayId = "RF-" + String(index + 1).padStart(4, "0");

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

        approvedTableBody.appendChild(row);
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

    document.getElementById("markPendingButton").addEventListener("click", () => changeStatus("pending"));
    document.getElementById("rejectButton").addEventListener("click", () => changeStatus("rejected"));
}

function openModal(file) {
    selectedFile = file;

    document.getElementById("modalFileId").textContent = file.id;
    document.getElementById("modalTitle").textContent = file.title;
    document.getElementById("modalResearcher").textContent = file.researcher;
    document.getElementById("modalCategory").textContent = file.category;
    document.getElementById("modalUploadedBy").textContent = `${file.uploadedBy} (${file.uploadedByEmail || ""})`;
    document.getElementById("modalDate").textContent = file.dateUploaded || "N/A";
    document.getElementById("modalDescription").textContent = file.description || "No description provided.";
    document.getElementById("modalComment").textContent = file.reviewComment || "No review comment.";

    fileModal.classList.add("active");
}

function closeModal() {
    fileModal.classList.remove("active");
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