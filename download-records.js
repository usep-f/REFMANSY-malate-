// ================================================================
// Refmansy Faculty Download Records (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;
let approvedFiles = [];
let downloadHistory = [];

const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const yearFilter = document.getElementById("yearFilter");
const downloadFilesTable = document.getElementById("downloadFilesTable");
const downloadHistoryTable = document.getElementById("downloadHistoryTable");
const clearHistoryButton = document.getElementById("clearHistoryButton");
const resultCount = document.getElementById("resultCount");

// Auth Guard
window.refmansyAuthGuard.init("faculty", function (profile, user) {
    currentUser = user;
    currentProfile = profile;
    initializePage();
});

async function initializePage() {
    setupFilters();
    setupClearHistory();
    await loadPageData();
}

async function loadPageData() {
    try {
        if (downloadFilesTable) {
            downloadFilesTable.innerHTML = `<tr><td colspan="5" style="text-align:center; padding: 1.5rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading available files...</td></tr>`;
        }
        if (downloadHistoryTable) {
            downloadHistoryTable.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 1.5rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading download history...</td></tr>`;
        }

        const [files, history, categories] = await Promise.all([
            window.refmansyApi.research.getApprovedFiles(),
            window.refmansyApi.downloads.getMyDownloads(currentProfile.id),
            window.refmansyApi.categories.getAll()
        ]);

        approvedFiles = files;
        downloadHistory = history;

        populateCategoryFilter(categories);
        populateYearFilter();
        updateSummary();
        filterAvailableFiles();
        renderDownloadHistory(downloadHistory);
    } catch (err) {
        console.error("Error loading download records page:", err);
    }
}

function updateSummary() {
    const today = new Date().toISOString().split("T")[0];
    const recentToday = downloadHistory.filter(h => h.downloaded_at && h.downloaded_at.startsWith(today)).length;

    const availEl = document.getElementById("availableFiles");
    if (availEl) availEl.textContent = approvedFiles.length;
    const totDlEl = document.getElementById("totalDownloads");
    if (totDlEl) totDlEl.textContent = downloadHistory.length;
    const recDlEl = document.getElementById("recentDownloads");
    if (recDlEl) recDlEl.textContent = recentToday;
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

function populateYearFilter() {
    if (!yearFilter) return;
    const years = [...new Set(approvedFiles.map(f => f.publicationYear).filter(Boolean))].sort((a, b) => b - a);
    yearFilter.innerHTML = `<option value="all">All Years</option>`;
    years.forEach(yr => {
        const opt = document.createElement("option");
        opt.value = yr;
        opt.textContent = yr;
        yearFilter.appendChild(opt);
    });
}

function setupFilters() {
    if (searchInput) searchInput.addEventListener("input", filterAvailableFiles);
    if (categoryFilter) categoryFilter.addEventListener("change", filterAvailableFiles);
    if (yearFilter) yearFilter.addEventListener("change", filterAvailableFiles);
}

function filterAvailableFiles() {
    const term = (searchInput?.value || "").trim().toLowerCase();
    const cat = categoryFilter?.value || "all";
    const yr = yearFilter?.value || "all";

    const filtered = approvedFiles.filter(file => {
        const matchTerm =
            !term ||
            file.title.toLowerCase().includes(term) ||
            file.researcher.toLowerCase().includes(term);

        const matchCat = cat === "all" || file.category === cat;
        const matchYr = yr === "all" || String(file.publicationYear) === String(yr);
        return matchTerm && matchCat && matchYr;
    });

    if (resultCount) {
        resultCount.textContent = `Showing ${filtered.length} of ${approvedFiles.length} files`;
    }

    renderAvailableFiles(filtered);
}

function renderAvailableFiles(files) {
    if (!downloadFilesTable) return;
    downloadFilesTable.innerHTML = "";

    if (!files || files.length === 0) {
        downloadFilesTable.innerHTML = `<tr><td colspan="5" class="empty-message">No research files available for download.</td></tr>`;
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
            <td>${escapeHtml(file.category)}</td>
            <td>${escapeHtml(file.researcher)} (${file.publicationYear})</td>
            <td>
                <button type="button" class="btn-download-action download-action-btn">
                    <i class="fa-solid fa-download"></i> Download
                </button>
            </td>
        `;

        row.querySelector(".download-action-btn").addEventListener("click", async () => {
            if (file.filePath) {
                await window.refmansyApi.downloads.logDownload(file.id, file.title, file.category);
                await window.refmansyApi.storage.triggerBrowserDownload(file.filePath, file.fileName);
                downloadHistory = await window.refmansyApi.downloads.getMyDownloads(currentProfile.id);
                updateSummary();
                renderDownloadHistory(downloadHistory);
            } else {
                alert("No downloadable file is attached.");
            }
        });

        downloadFilesTable.appendChild(row);
    });
}

function renderDownloadHistory(history) {
    if (!downloadHistoryTable) return;
    downloadHistoryTable.innerHTML = "";

    if (!history || history.length === 0) {
        downloadHistoryTable.innerHTML = `<tr><td colspan="4" class="empty-message">You have no download history.</td></tr>`;
        return;
    }

    history.forEach(record => {
        const row = document.createElement("tr");
        const dateStr = record.downloaded_at ? new Date(record.downloaded_at).toLocaleString() : "N/A";

        row.innerHTML = `
            <td><strong>${escapeHtml(record.file_title || "Research Document")}</strong></td>
            <td>${escapeHtml(record.file_category || "General")}</td>
            <td>${escapeHtml(record.user_name || "Faculty")}</td>
            <td>${dateStr}</td>
        `;
        downloadHistoryTable.appendChild(row);
    });
}

function setupClearHistory() {
    if (clearHistoryButton) {
        clearHistoryButton.addEventListener("click", async function () {
            if (confirm("Clear your download history display?")) {
                downloadHistory = [];
                updateSummary();
                renderDownloadHistory([]);
            }
        });
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