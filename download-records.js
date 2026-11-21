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
const startDate = document.getElementById("startDate");
const endDate = document.getElementById("endDate");
const clearFiltersButton = document.getElementById("clearFiltersButton");
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
            downloadFilesTable.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 1.5rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading available files...</td></tr>`;
        }
        if (downloadHistoryTable) {
            downloadHistoryTable.innerHTML = `<tr><td colspan="4" style="text-align:center; padding: 1.5rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading download history...</td></tr>`;
        }

        const [files, history, categories] = await Promise.all([
            window.refmansyApi.research.getApprovedFiles(),
            window.refmansyApi.downloads.getMyDownloads(currentProfile.id),
            window.refmansyApi.categories.getAll()
        ]);

        // Assign stable, permanent displayId to each record based on initial order
        (files || []).forEach((file, index) => {
            file.displayId = "RF-" + String(index + 1).padStart(4, "0");
        });

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
    (categories || []).forEach(cat => {
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
    if (startDate) startDate.addEventListener("change", filterAvailableFiles);
    if (endDate) endDate.addEventListener("change", filterAvailableFiles);
    if (clearFiltersButton) clearFiltersButton.addEventListener("click", clearFilters);
}

function filterAvailableFiles() {
    const term = (searchInput?.value || "").trim().toLowerCase();
    const cat = categoryFilter?.value || "all";
    const yr = yearFilter?.value || "all";
    const start = startDate?.value || "";
    const end = endDate?.value || "";

    const filtered = approvedFiles.filter(file => {
        const matchTerm =
            !term ||
            (file.displayId && file.displayId.toLowerCase().includes(term)) ||
            (file.title && file.title.toLowerCase().includes(term)) ||
            (file.researcher && file.researcher.toLowerCase().includes(term)) ||
            (file.coResearchers && file.coResearchers.toLowerCase().includes(term)) ||
            (file.keywords && file.keywords.toLowerCase().includes(term)) ||
            (file.category && file.category.toLowerCase().includes(term));

        const matchCat = cat === "all" || file.category === cat;
        const matchYr = yr === "all" || String(file.publicationYear) === String(yr);

        let matchesDate = true;
        const fileDateStr = file.createdAt || file.dateUploaded;
        if (start && fileDateStr) {
            matchesDate = matchesDate && new Date(fileDateStr) >= new Date(start);
        }
        if (end && fileDateStr) {
            matchesDate = matchesDate && new Date(fileDateStr) <= new Date(end + "T23:59:59");
        }

        return matchTerm && matchCat && matchYr && matchesDate;
    });

    if (resultCount) {
        resultCount.textContent = `Showing ${filtered.length} of ${approvedFiles.length} files`;
    }

    renderAvailableFiles(filtered);
}

function clearFilters() {
    if (searchInput) searchInput.value = "";
    if (categoryFilter) categoryFilter.value = "all";
    if (yearFilter) yearFilter.value = "all";
    if (startDate) startDate.value = "";
    if (endDate) endDate.value = "";
    filterAvailableFiles();
}

function renderAvailableFiles(files) {
    if (!downloadFilesTable) return;
    downloadFilesTable.innerHTML = "";

    if (!files || files.length === 0) {
        downloadFilesTable.innerHTML = `<tr><td colspan="8" class="empty-message">No research files match your search or filter criteria.</td></tr>`;
        return;
    }

    files.forEach((file, index) => {
        const row = document.createElement("tr");

        row.innerHTML = `
            <td><strong>${escapeHtml(file.displayId || "RF-0001")}</strong></td>
            <td><strong>${escapeHtml(file.title)}</strong></td>
            <td>${escapeHtml(file.researcher)}</td>
            <td>${escapeHtml(file.category)}</td>
            <td>${escapeHtml(file.publicationYear || "N/A")}</td>
            <td><small style="color: #64748b;">${escapeHtml(file.fileName || "PDF Document")}</small></td>
            <td>${file.fileSize || "PDF"}</td>
            <td>
                <button type="button" class="btn-download-action download-action-btn">
                    <i class="fa-regular fa-file-pdf"></i> View
                </button>
            </td>
        `;

        row.querySelector(".download-action-btn").addEventListener("click", async () => {
            if (file.filePath) {
                await window.refmansyApi.downloads.logDownload(file.id, file.title, file.category);
                await window.refmansyApi.storage.openDocumentInNewTab(file.filePath);
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