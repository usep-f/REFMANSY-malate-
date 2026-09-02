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
const researchTableBody = document.getElementById("researchTableBody");
const emptyState = document.getElementById("emptyState");
const fileModal = document.getElementById("fileModal");

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
        researchTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading research files...</td></tr>`;
        
        facultyFiles = await window.refmansyApi.research.getMyFiles(currentProfile.id);
        
        updateSummary();
        await loadCategoryOptions();
        filterResearchFiles();
    } catch (err) {
        console.error("Error loading faculty files:", err);
        researchTableBody.innerHTML = `<tr><td colspan="7" style="text-align:center; color: red; padding: 2rem;">Error loading files: ${err.message}</td></tr>`;
    }
}

function updateSummary() {
    const total = facultyFiles.length;
    const approved = facultyFiles.filter(f => f.status === "approved").length;
    const pending = facultyFiles.filter(f => f.status === "pending").length;
    const rejected = facultyFiles.filter(f => f.status === "rejected").length;

    document.getElementById("totalCount").textContent = total;
    document.getElementById("approvedCount").textContent = approved;
    document.getElementById("pendingCount").textContent = pending;
    document.getElementById("rejectedCount").textContent = rejected;
}

async function loadCategoryOptions() {
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
    searchInput.addEventListener("input", filterResearchFiles);
    categoryFilter.addEventListener("change", filterResearchFiles);
    statusFilter.addEventListener("change", filterResearchFiles);
}

function filterResearchFiles() {
    const term = searchInput.value.trim().toLowerCase();
    const cat = categoryFilter.value;
    const stat = statusFilter.value.toLowerCase();

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

    renderTable(filtered);
}

function renderTable(files) {
    researchTableBody.innerHTML = "";

    if (!files || files.length === 0) {
        emptyState.style.display = "block";
        return;
    }

    emptyState.style.display = "none";

    files.forEach((file, index) => {
        const row = document.createElement("tr");

        const statusBadge = getStatusBadge(file.status);
        const displayId = "RF-" + String(index + 1).padStart(4, "0");

        row.innerHTML = `
            <td><strong>${displayId}</strong></td>
            <td>
                <div class="file-title-cell">
                    <strong>${escapeHtml(file.title)}</strong>
                    <small>${escapeHtml(file.fileName || "PDF Document")}</small>
                </div>
            </td>
            <td>${escapeHtml(file.category)}</td>
            <td>${escapeHtml(file.publicationYear)}</td>
            <td>${file.dateUploaded || "N/A"}</td>
            <td>${statusBadge}</td>
            <td>
                <div class="table-actions">
                    <button type="button" class="action-btn view-btn" title="View Details">
                        <i class="fa-regular fa-eye"></i>
                    </button>
                    ${
                        file.filePath
                            ? `<button type="button" class="action-btn download-btn" title="Download File">
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
            dlBtn.addEventListener("click", async () => {
                await window.refmansyApi.storage.triggerBrowserDownload(file.filePath, file.fileName);
            });
        }

        researchTableBody.appendChild(row);
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
    document.getElementById("closeModalButton").addEventListener("click", closeModal);
    fileModal.addEventListener("click", function (e) {
        if (e.target === fileModal) closeModal();
    });

    document.getElementById("editFileButton").addEventListener("click", function () {
        if (selectedFile) {
            localStorage.setItem("refmansyEditFileId", selectedFile.id);
            window.location.href = "upload-research.html";
        }
    });

    document.getElementById("viewFileButton").addEventListener("click", async function () {
        if (selectedFile && selectedFile.filePath) {
            await window.refmansyApi.storage.triggerBrowserDownload(selectedFile.filePath, selectedFile.fileName);
        } else {
            alert("No file attached to this research submission.");
        }
    });
}

function openModal(file) {
    selectedFile = file;

    document.getElementById("modalFileId").textContent = file.id;
    document.getElementById("modalDate").textContent = file.dateUploaded || "N/A";
    document.getElementById("modalTitle").textContent = file.title;
    document.getElementById("modalCategory").textContent = file.category;
    document.getElementById("modalStatus").innerHTML = getStatusBadge(file.status);
    document.getElementById("modalDescription").textContent = file.description || "No description provided.";
    document.getElementById("modalComment").textContent = file.reviewComment || "No administrator review comment yet.";

    const editBtn = document.getElementById("editFileButton");
    if (file.status === "pending" || file.status === "rejected") {
        editBtn.style.display = "inline-flex";
    } else {
        editBtn.style.display = "none";
    }

    fileModal.classList.add("active");
}

function closeModal() {
    fileModal.classList.remove("active");
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