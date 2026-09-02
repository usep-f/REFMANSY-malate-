// ================================================================
// Refmansy Admin Dashboard (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;
let allFiles = [];

const recentFilesTable = document.getElementById("recentFilesTable");

// Auth Guard
window.refmansyAuthGuard.init("admin", function (profile, user) {
    currentUser = user;
    currentProfile = profile;
    initializeDashboard();
});

async function initializeDashboard() {
    try {
        if (recentFilesTable) {
            recentFilesTable.innerHTML = `<tr><td colspan="6" class="empty-message"><i class="fa-solid fa-spinner fa-spin"></i> Loading system statistics...</td></tr>`;
        }

        const files = await window.refmansyApi.research.getAllFiles();
        allFiles = files;

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

    const totalUploadedEl = document.getElementById("totalUploaded");
    if (totalUploadedEl) totalUploadedEl.textContent = totalFiles;

    const totalPendingEl = document.getElementById("totalPending");
    if (totalPendingEl) totalPendingEl.textContent = pending;

    const totalApprovedEl = document.getElementById("totalApproved");
    if (totalApprovedEl) totalApprovedEl.textContent = approved;

    const totalRejectedEl = document.getElementById("totalRejected");
    if (totalRejectedEl) totalRejectedEl.textContent = rejected;

    const chartTotalEl = document.getElementById("chartTotal");
    if (chartTotalEl) chartTotalEl.textContent = totalFiles;

    const legAppr = document.getElementById("legendApproved");
    if (legAppr) legAppr.textContent = approved;

    const legPend = document.getElementById("legendPending");
    if (legPend) legPend.textContent = pending;

    const legRej = document.getElementById("legendRejected");
    if (legRej) legRej.textContent = rejected;

    const donutChart = document.getElementById("statusDonutChart") || document.querySelector(".donut-chart");
    if (donutChart) {
        if (totalFiles === 0) {
            donutChart.style.background = "var(--border-color, #e4e9ee)";
        } else {
            const approvedPct = (approved / totalFiles) * 100;
            const pendingPct = approvedPct + (pending / totalFiles) * 100;
            donutChart.style.background = `conic-gradient(
                var(--approved-blue, #68a9e1) 0% ${approvedPct}%,
                var(--pending-blue, #bed8ed) ${approvedPct}% ${pendingPct}%,
                var(--rejected-gray, #d7e0e5) ${pendingPct}% 100%
            )`;
        }
    }
}

function renderRecentFiles() {
    if (!recentFilesTable) return;
    recentFilesTable.innerHTML = "";

    const recent = allFiles.slice(0, 5);

    if (recent.length === 0) {
        recentFilesTable.innerHTML = `<tr><td colspan="6" class="empty-message">No research files have been uploaded yet.</td></tr>`;
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