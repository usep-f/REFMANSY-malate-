// ================================================================
// Refmansy Admin Pending Files (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;
let pendingFiles = [];
let selectedFile = null;

const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const pendingTableBody = document.getElementById("pendingTableBody");
const reviewModal = document.getElementById("reviewModal");

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
        pendingTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading pending submissions...</td></tr>`;

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
        pendingTableBody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: red; padding: 2rem;">Error: ${err.message}</td></tr>`;
    }
}

function updateSummary() {
    const totalEl = document.getElementById("totalPendingCount");
    if (totalEl) totalEl.textContent = pendingFiles.length;

    const summaryCountEl = document.getElementById("pendingSummaryCount");
    if (summaryCountEl) summaryCountEl.textContent = pendingFiles.length;
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
    searchInput.addEventListener("input", filterPendingFiles);
    categoryFilter.addEventListener("change", filterPendingFiles);
}

function filterPendingFiles() {
    const term = searchInput.value.trim().toLowerCase();
    const cat = categoryFilter.value;

    const filtered = pendingFiles.filter(file => {
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
    pendingTableBody.innerHTML = "";

    if (!files || files.length === 0) {
        pendingTableBody.innerHTML = `<tr><td colspan="6" class="empty-table">No pending research files to review.</td></tr>`;
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
                <button type="button" class="btn-review review-btn">
                    <i class="fa-solid fa-magnifying-glass"></i> Review File
                </button>
            </td>
        `;

        row.querySelector(".review-btn").addEventListener("click", () => openModal(file));
        pendingTableBody.appendChild(row);
    });
}

function setupModal() {
    document.getElementById("closeModalButton").addEventListener("click", closeModal);
    reviewModal.addEventListener("click", function (e) {
        if (e.target === reviewModal) closeModal();
    });

    document.getElementById("viewFileButton").addEventListener("click", async function () {
        if (selectedFile && selectedFile.filePath) {
            await window.refmansyApi.storage.triggerBrowserDownload(selectedFile.filePath, selectedFile.fileName);
        } else {
            alert("No document file is attached.");
        }
    });

    document.getElementById("approveButton").addEventListener("click", () => submitReview("approved"));
    document.getElementById("rejectButton").addEventListener("click", () => submitReview("rejected"));
}

function openModal(file) {
    selectedFile = file;

    document.getElementById("modalTitle").textContent = file.title;
    document.getElementById("modalResearcher").textContent = file.researcher;
    document.getElementById("modalCoResearchers").textContent = file.coResearchers || "None";
    document.getElementById("modalCategory").textContent = file.category;
    document.getElementById("modalDepartment").textContent = file.department || "N/A";
    document.getElementById("modalYear").textContent = file.publicationYear || "N/A";
    document.getElementById("modalSubmittedBy").textContent = `${file.uploadedBy} (${file.uploadedByEmail || ""})`;
    document.getElementById("modalDate").textContent = file.dateUploaded || "N/A";
    document.getElementById("modalDescription").textContent = file.description || "No description provided.";
    document.getElementById("reviewComment").value = "";

    reviewModal.classList.add("active");
}

function closeModal() {
    reviewModal.classList.remove("active");
    selectedFile = null;
}

async function submitReview(newStatus) {
    if (!selectedFile) return;

    const comment = document.getElementById("reviewComment").value.trim();

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