// ================================================================
// Refmansy Faculty Dashboard (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;
let facultyFiles = [];
let approvedSystemFiles = [];
let categoriesList = [];

const facultyFilesTable = document.getElementById("facultyFilesTable");
const statusUpdatesContainer = document.getElementById("statusUpdates");
const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const statusFilter = document.getElementById("statusFilter");
const startDate = document.getElementById("startDate");
const endDate = document.getElementById("endDate");
const clearFiltersButton = document.getElementById("clearFiltersButton");
const resultCount = document.getElementById("resultCount");

// Auth Guard
window.refmansyAuthGuard.init("faculty", function (profile, user) {
    currentUser = user;
    currentProfile = profile;
    initializeDashboard();
});

async function initializeDashboard() {
    try {
        if (facultyFilesTable) {
            facultyFilesTable.innerHTML = `<tr><td colspan="7" class="empty-table"><i class="fa-solid fa-spinner fa-spin"></i> Loading dashboard data...</td></tr>`;
        }

        const [myFiles, approvedFiles, categories] = await Promise.all([
            window.refmansyApi.research.getMyFiles(currentProfile.id),
            window.refmansyApi.research.getApprovedFiles(),
            window.refmansyApi.categories.getAll()
        ]);

        // Assign stable, permanent displayId to each record based on initial order
        myFiles.forEach((file, index) => {
            file.displayId = "RF-" + String(index + 1).padStart(4, "0");
        });

        facultyFiles = myFiles;
        approvedSystemFiles = approvedFiles;
        categoriesList = categories;

        updateDashboardMetrics();
        renderStatusUpdates();
        populateCategoryFilter();
        setupFilters();
        filterFacultyFiles();
    } catch (err) {
        console.error("Dashboard data load error:", err);
    }
}

function updateDashboardMetrics() {
    const total = facultyFiles.length;
    const pending = facultyFiles.filter(f => f.status === "pending").length;
    const approved = facultyFiles.filter(f => f.status === "approved").length;
    const rejected = facultyFiles.filter(f => f.status === "rejected").length;

    const totalEl = document.getElementById("totalMyFiles");
    if (totalEl) totalEl.textContent = total;

    const pendingEl = document.getElementById("totalPending");
    if (pendingEl) pendingEl.textContent = pending;

    const approvedEl = document.getElementById("totalApproved");
    if (approvedEl) approvedEl.textContent = approved;

    const rejectedEl = document.getElementById("totalRejected");
    if (rejectedEl) rejectedEl.textContent = rejected;
}

function populateCategoryFilter() {
    if (!categoryFilter) return;
    categoryFilter.innerHTML = `<option value="all">All Categories</option>`;
    (categoriesList || []).forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat.name;
        opt.textContent = cat.name;
        categoryFilter.appendChild(opt);
    });
}

function setupFilters() {
    if (searchInput) searchInput.addEventListener("input", filterFacultyFiles);
    if (categoryFilter) categoryFilter.addEventListener("change", filterFacultyFiles);
    if (statusFilter) statusFilter.addEventListener("change", filterFacultyFiles);
    if (startDate) startDate.addEventListener("change", filterFacultyFiles);
    if (endDate) endDate.addEventListener("change", filterFacultyFiles);
    if (clearFiltersButton) clearFiltersButton.addEventListener("click", clearFilters);
}

function filterFacultyFiles() {
    const term = (searchInput?.value || "").trim().toLowerCase();
    const cat = categoryFilter?.value || "all";
    const stat = (statusFilter?.value || "all").toLowerCase();
    const start = startDate?.value || "";
    const end = endDate?.value || "";

    const filtered = facultyFiles.filter(file => {
        const matchesTerm =
            !term ||
            (file.displayId && file.displayId.toLowerCase().includes(term)) ||
            (file.title && file.title.toLowerCase().includes(term)) ||
            (file.category && file.category.toLowerCase().includes(term)) ||
            (file.fileName && file.fileName.toLowerCase().includes(term)) ||
            (file.keywords && file.keywords.toLowerCase().includes(term));

        const matchesCat = cat === "all" || file.category === cat;
        const matchesStat = stat === "all" || (file.status || "").toLowerCase() === stat;

        let matchesDate = true;
        const fileDateStr = file.createdAt || file.dateUploaded;
        if (start && fileDateStr) {
            matchesDate = matchesDate && new Date(fileDateStr) >= new Date(start);
        }
        if (end && fileDateStr) {
            matchesDate = matchesDate && new Date(fileDateStr) <= new Date(end + "T23:59:59");
        }

        return matchesTerm && matchesCat && matchesStat && matchesDate;
    });

    if (resultCount) {
        resultCount.textContent = `Showing ${filtered.length} of ${facultyFiles.length} submissions`;
    }

    renderRecentFilesTable(filtered);
}

function clearFilters() {
    if (searchInput) searchInput.value = "";
    if (categoryFilter) categoryFilter.value = "all";
    if (statusFilter) statusFilter.value = "all";
    if (startDate) startDate.value = "";
    if (endDate) endDate.value = "";
    filterFacultyFiles();
}

function renderStatusUpdates() {
    if (!statusUpdatesContainer) return;
    statusUpdatesContainer.innerHTML = "";

    const recentlyUpdated = facultyFiles
        .filter(f => f.reviewComment || f.status !== "pending")
        .slice(0, 4);

    if (recentlyUpdated.length === 0) {
        statusUpdatesContainer.innerHTML = `<p class="empty-message">No submission status updates.</p>`;
        return;
    }

    recentlyUpdated.forEach(file => {
        const item = document.createElement("div");
        item.className = "status-update-item";

        const isApproved = file.status === "approved";
        const iconClass = isApproved ? "fa-circle-check" : "fa-circle-xmark";
        const iconBgClass = isApproved ? "icon-approved" : "icon-rejected";

        const badge = isApproved
            ? `<span class="status-badge status-approved"><i class="fa-solid fa-circle-check"></i> Approved</span>`
            : `<span class="status-badge status-rejected"><i class="fa-solid fa-circle-xmark"></i> Rejected</span>`;

        item.innerHTML = `
            <div class="update-icon ${iconBgClass}">
                <i class="fa-solid ${iconClass}"></i>
            </div>
            <div class="update-info">
                <h4>${escapeHtml(file.title)}</h4>
                <p>${file.reviewComment ? escapeHtml(file.reviewComment) : "Status updated by administrator."}</p>
                <small><i class="fa-regular fa-clock"></i> ${file.reviewedDate || file.dateUploaded || "Recently"}</small>
            </div>
            <div class="update-badge">${badge}</div>
        `;

        statusUpdatesContainer.appendChild(item);
    });
}

function renderRecentFilesTable(filesToRender) {
    if (!facultyFilesTable) return;
    facultyFilesTable.innerHTML = "";

    const list = Array.isArray(filesToRender) ? filesToRender : facultyFiles;

    if (list.length === 0) {
        facultyFilesTable.innerHTML = `<tr><td colspan="7" class="empty-table">No research files match your search or filter criteria.</td></tr>`;
        return;
    }

    list.forEach(file => {
        const row = document.createElement("tr");

        const statusBadge =
            file.status === "approved"
                ? `<span class="status-badge status-approved">Approved</span>`
                : file.status === "rejected"
                ? `<span class="status-badge status-rejected">Rejected</span>`
                : `<span class="status-badge status-pending">Pending</span>`;

        row.innerHTML = `
            <td><strong>${escapeHtml(file.displayId || "RF-0001")}</strong></td>
            <td>
                <strong>${escapeHtml(file.title)}</strong>
                <br><small style="color: #64748b;">${escapeHtml(file.fileName || "Document.pdf")}</small>
            </td>
            <td>${escapeHtml(file.category)}</td>
            <td>${file.dateUploaded || "N/A"}</td>
            <td>${statusBadge}</td>
            <td>${file.reviewComment ? escapeHtml(file.reviewComment) : "<em>No comment</em>"}</td>
            <td>
                <button type="button" class="btn-table-action view-btn">
                    <i class="fa-regular fa-eye"></i> View
                </button>
            </td>
        `;

        row.querySelector(".view-btn").addEventListener("click", () => {
            window.location.href = "my-research-files.html";
        });

        facultyFilesTable.appendChild(row);
    });
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