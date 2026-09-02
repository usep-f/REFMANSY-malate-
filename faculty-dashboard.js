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

// Auth Guard
window.refmansyAuthGuard.init("faculty", function (profile, user) {
    currentUser = user;
    currentProfile = profile;
    initializeDashboard();
});

async function initializeDashboard() {
    try {
        if (facultyFilesTable) {
            facultyFilesTable.innerHTML = `<tr><td colspan="6" class="empty-table"><i class="fa-solid fa-spinner fa-spin"></i> Loading dashboard data...</td></tr>`;
        }

        const [myFiles, approvedFiles, categories] = await Promise.all([
            window.refmansyApi.research.getMyFiles(currentProfile.id),
            window.refmansyApi.research.getApprovedFiles(),
            window.refmansyApi.categories.getAll()
        ]);

        facultyFiles = myFiles;
        approvedSystemFiles = approvedFiles;
        categoriesList = categories;

        updateDashboardMetrics();
        renderStatusUpdates();
        renderRecentFilesTable();
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

function renderRecentFilesTable() {
    if (!facultyFilesTable) return;
    facultyFilesTable.innerHTML = "";

    const recent = facultyFiles.slice(0, 5);

    if (recent.length === 0) {
        facultyFilesTable.innerHTML = `<tr><td colspan="6" class="empty-table">You have not uploaded any research files yet.</td></tr>`;
        return;
    }

    recent.forEach(file => {
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