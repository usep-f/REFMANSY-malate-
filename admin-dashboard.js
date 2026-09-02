// ================================================================
// Refmansy Admin Dashboard (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;
let allFiles = [];
let allUsers = [];
let allCategories = [];
let allDownloads = [];

const recentFilesTable = document.getElementById("recentFilesTable");

// Auth Guard
window.refmansyAuthGuard.init("admin", function (profile, user) {
    currentUser = user;
    currentProfile = profile;
    initializeDashboard();
});

async function initializeDashboard() {
    try {
        recentFilesTable.innerHTML = `<tr><td colspan="6" class="empty-message"><i class="fa-solid fa-spinner fa-spin"></i> Loading system statistics...</td></tr>`;

        const [files, users, categories, downloads] = await Promise.all([
            window.refmansyApi.research.getAllFiles(),
            window.refmansyApi.users.getAll(),
            window.refmansyApi.categories.getAll(),
            window.refmansyApi.downloads.getAllDownloads()
        ]);

        allFiles = files;
        allUsers = users;
        allCategories = categories;
        allDownloads = downloads;

        updateDashboardMetrics();
        renderRecentFiles();
    } catch (err) {
        console.error("Admin dashboard load error:", err);
    }
}

function updateDashboardMetrics() {
    const totalFiles = allFiles.length;
    const pending = allFiles.filter(f => f.status === "pending").length;
    const approved = allFiles.filter(f => f.status === "approved").length;
    const rejected = allFiles.filter(f => f.status === "rejected").length;

    const totalUsersEl = document.getElementById("totalUsers");
    if (totalUsersEl) totalUsersEl.textContent = allUsers.length;

    const totalCategoriesEl = document.getElementById("totalCategories");
    if (totalCategoriesEl) totalCategoriesEl.textContent = allCategories.length;

    const totalResearchFilesEl = document.getElementById("totalResearchFiles");
    if (totalResearchFilesEl) totalResearchFilesEl.textContent = totalFiles;

    const pendingFilesEl = document.getElementById("pendingFiles");
    if (pendingFilesEl) pendingFilesEl.textContent = pending;

    const approvedFilesEl = document.getElementById("approvedFiles");
    if (approvedFilesEl) approvedFilesEl.textContent = approved;

    const rejectedFilesEl = document.getElementById("rejectedFiles");
    if (rejectedFilesEl) rejectedFilesEl.textContent = rejected;

    const totalDownloadsEl = document.getElementById("totalDownloads");
    if (totalDownloadsEl) totalDownloadsEl.textContent = allDownloads.length;
}

function renderRecentFiles() {
    recentFilesTable.innerHTML = "";

    const recent = allFiles.slice(0, 5);

    if (recent.length === 0) {
        recentFilesTable.innerHTML = `<tr><td colspan="6" class="empty-message">No research files have been uploaded yet.</td></tr>`;
        return;
    }

    recent.forEach((file, index) => {
        const row = document.createElement("tr");

        const statusBadge =
            file.status === "approved"
                ? `<span class="status-badge status-approved">Approved</span>`
                : file.status === "rejected"
                ? `<span class="status-badge status-rejected">Rejected</span>`
                : `<span class="status-badge status-pending">Pending</span>`;

        row.innerHTML = `
            <td>
                <strong>${escapeHtml(file.title)}</strong>
                <br><small style="color: #64748b;">${escapeHtml(file.fileName || "PDF Document")}</small>
            </td>
            <td>${escapeHtml(file.researcher)}</td>
            <td>${escapeHtml(file.category)}</td>
            <td>${file.dateUploaded || "N/A"}</td>
            <td>${statusBadge}</td>
            <td>
                <button type="button" class="btn-action view-btn">
                    <i class="fa-regular fa-eye"></i> View
                </button>
            </td>
        `;

        row.querySelector(".view-btn").addEventListener("click", () => {
            if (file.status === "pending") {
                window.location.href = "pending-files.html";
            } else if (file.status === "approved") {
                window.location.href = "approved-files.html";
            } else {
                window.location.href = "rejected-files.html";
            }
        });

        recentFilesTable.appendChild(row);
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