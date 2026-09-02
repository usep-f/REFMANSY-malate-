// ================================================================
// Refmansy Admin Pending Files (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;
let pendingFiles = [];
let selectedFile = null;

const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const pendingFilesTable = document.getElementById("pendingFilesTable");
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
    await loadPendingFiles();
}

async function loadPendingFiles() {
    try {
        if (pendingFilesTable) {
            pendingFilesTable.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading pending submissions...</td></tr>`;
        }

        const [allFiles, categories] = await Promise.all([
            window.refmansyApi.research.getAllFiles(),
            window.refmansyApi.categories.getAll()
        ]);

        pendingFiles = allFiles.filter(f => f.status === "pending");

        updateSummary();
        populateCategoryFilter(categories);
        filterPendingFiles();
    } catch (err) {
        console.error("Error loading pending files:", err);
        if (pendingFilesTable) {
            pendingFilesTable.innerHTML = `<tr><td colspan="6" style="text-align: center; color: red; padding: 2rem;">Error: ${err.message}</td></tr>`;
        }
    }
}

function updateSummary() {
    const totalEl = document.getElementById("totalPendingFiles");
    if (totalEl) totalEl.textContent = pendingFiles.length;
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
    if (searchInput) searchInput.addEventListener("input", filterPendingFiles);
    if (categoryFilter) categoryFilter.addEventListener("change", filterPendingFiles);
}

function filterPendingFiles() {
    const term = (searchInput?.value || "").trim().toLowerCase();
    const cat = categoryFilter?.value || "all";

    const filtered = pendingFiles.filter(file => {
        const matchesTerm =
            !term ||
            file.title.toLowerCase().includes(term) ||
            file.researcher.toLowerCase().includes(term) ||
            file.uploadedBy.toLowerCase().includes(term);

        const matchesCat = cat === "all" || file.category === cat;

        return matchesTerm && matchesCat;
    });

    if (resultCount) {
        resultCount.textContent = `Showing ${filtered.length} of ${pendingFiles.length} pending files`;
    }

    renderTable(filtered);
}

function renderTable(files) {
    if (!pendingFilesTable) return;
    pendingFilesTable.innerHTML = "";

    if (!files || files.length === 0) {
        pendingFilesTable.innerHTML = `<tr><td colspan="7" class="empty-table">No pending research files to review.</td></tr>`;
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
                    <br><small style="color: #64748b;">${escapeHtml(file.fileName || "PDF Document")}</small>
                </div>
            </td>
            <td>${escapeHtml(file.researcher)}</td>
            <td>${escapeHtml(file.category)}</td>
            <td>${file.dateUploaded || "N/A"}</td>
            <td><span class="status-label status-pending">Pending Review</span></td>
            <td>
                <button type="button" class="review-button review-btn">
                    <i class="fa-solid fa-magnifying-glass"></i> Review
                </button>
            </td>
        `;

        row.querySelector(".review-btn").addEventListener("click", () => openModal(file));
        pendingFilesTable.appendChild(row);
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

    const viewDocBtn = document.getElementById("viewDocumentButton");
    if (viewDocBtn) {
        viewDocBtn.addEventListener("click", async function () {
            if (selectedFile && selectedFile.filePath) {
                await window.refmansyApi.storage.triggerBrowserDownload(
                    selectedFile.filePath,
                    selectedFile.fileName
                );
            } else {
                alert("No document file is attached to this submission.");
            }
        });
    }

    const appBtn = document.getElementById("approveButton");
    if (appBtn) appBtn.addEventListener("click", () => submitReview("approved"));

    const rejBtn = document.getElementById("rejectButton");
    if (rejBtn) rejBtn.addEventListener("click", () => submitReview("rejected"));
}

function openModal(file) {
    selectedFile = file;

    const mFileId = document.getElementById("modalFileId");
    if (mFileId) mFileId.textContent = file.id;
    const mDate = document.getElementById("modalDate");
    if (mDate) mDate.textContent = file.dateUploaded || "N/A";
    const mTitle = document.getElementById("modalTitle");
    if (mTitle) mTitle.textContent = file.title;
    const mRes = document.getElementById("modalResearcher");
    if (mRes) mRes.textContent = file.researcher;
    const mCat = document.getElementById("modalCategory");
    if (mCat) mCat.textContent = file.category;
    const mDesc = document.getElementById("modalDescription");
    if (mDesc) mDesc.textContent = file.description || "No description provided.";
    const revComment = document.getElementById("reviewComment");
    if (revComment) revComment.value = "";

    if (reviewModal) reviewModal.classList.add("active");
}

function closeModal() {
    if (reviewModal) reviewModal.classList.remove("active");
    selectedFile = null;
}

async function submitReview(newStatus) {
    if (!selectedFile) return;

    const comment = (document.getElementById("reviewComment")?.value || "").trim();

    try {
        await window.refmansyApi.research.updateStatus(
            selectedFile.id,
            newStatus,
            comment,
            currentProfile.id
        );

        closeModal();
        await loadPendingFiles();
    } catch (err) {
        console.error("Review submit error:", err);
        alert("Failed to submit review: " + err.message);
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