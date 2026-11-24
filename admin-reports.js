// ================================================================
// Refmansy Admin Reports & Analytics (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;
let researchFiles = [];
let filteredResearchFiles = [];
let categoriesList = [];
let cachedDownloads = null;
let cachedUsers = null;

const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const statusFilter = document.getElementById("statusFilter");
const startDateInput = document.getElementById("startDate");
const endDateInput = document.getElementById("endDate");
const clearFiltersButton = document.getElementById("clearFiltersButton");
const reportTable = document.getElementById("reportTable");
const resultCount = document.getElementById("resultCount");
const generatedDate = document.getElementById("generatedDate");

// Auth Guard
window.refmansyAuthGuard.init("admin", function (profile, user) {
    currentUser = user;
    currentProfile = profile;
    initializeReports();
});

async function initializeReports() {
    setupFilters();
    setupReportButtons();
    await loadReportData();
}

async function loadReportData() {
    try {
        if (reportTable) {
            reportTable.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Generating analytics reports...</td></tr>`;
        }

        const [files, categories, downloads, users] = await Promise.all([
            window.refmansyApi.research.getAllFiles(),
            window.refmansyApi.categories.getAll(),
            window.refmansyApi.downloads.getAllDownloads().catch(e => { console.warn("Downloads fetch error:", e); return []; }),
            window.refmansyApi.users.getAll().catch(e => { console.warn("Users fetch error:", e); return []; })
        ]);

        researchFiles = files;
        categoriesList = categories;
        cachedDownloads = downloads;
        cachedUsers = users;

        populateCategoryOptions();
        updateReportSummary();
        updateStatusDistribution();
        updateCategoryDistribution();
        filterReport();
        displayGeneratedDate();
    } catch (err) {
        console.error("Error loading report data:", err);
        if (reportTable) {
            reportTable.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red; padding: 2rem;">Error: ${err.message}</td></tr>`;
        }
    }
}

function updateReportSummary() {
    const total = researchFiles.length;
    const approved = researchFiles.filter(f => f.status === "approved").length;
    const pending = researchFiles.filter(f => f.status === "pending").length;
    const rejected = researchFiles.filter(f => f.status === "rejected").length;

    const totalEl = document.getElementById("totalUploaded");
    if (totalEl) totalEl.textContent = total;

    const approvedEl = document.getElementById("totalApproved");
    if (approvedEl) approvedEl.textContent = approved;

    const pendingEl = document.getElementById("totalPending");
    if (pendingEl) pendingEl.textContent = pending;

    const rejectedEl = document.getElementById("totalRejected");
    if (rejectedEl) rejectedEl.textContent = rejected;
}

function updateStatusDistribution() {
    const total = researchFiles.length || 1;
    const approved = researchFiles.filter(f => f.status === "approved").length;
    const pending = researchFiles.filter(f => f.status === "pending").length;
    const rejected = researchFiles.filter(f => f.status === "rejected").length;

    const approvedPercent = Math.round((approved / total) * 100);
    const pendingPercent = Math.round((pending / total) * 100);
    const rejectedPercent = Math.round((rejected / total) * 100);

    const approvedBar = document.getElementById("approvedChartBar");
    if (approvedBar) approvedBar.style.width = `${approvedPercent}%`;

    const pendingBar = document.getElementById("pendingChartBar");
    if (pendingBar) pendingBar.style.width = `${pendingPercent}%`;

    const rejectedBar = document.getElementById("rejectedChartBar");
    if (rejectedBar) rejectedBar.style.width = `${rejectedPercent}%`;

    const approvedVal = document.getElementById("approvedChartValue");
    if (approvedVal) approvedVal.textContent = `${approvedPercent}% (${approved})`;

    const pendingVal = document.getElementById("pendingChartValue");
    if (pendingVal) pendingVal.textContent = `${pendingPercent}% (${pending})`;

    const rejectedVal = document.getElementById("rejectedChartValue");
    if (rejectedVal) rejectedVal.textContent = `${rejectedPercent}% (${rejected})`;
}

function updateCategoryDistribution() {
    const container = document.getElementById("categoryReport");
    if (!container) return;

    container.innerHTML = "";

    if (categoriesList.length === 0) {
        container.innerHTML = `<p class="empty-message">No categories found.</p>`;
        return;
    }

    categoriesList.forEach(cat => {
        const count = researchFiles.filter(f => f.category === cat.name).length;
        const item = document.createElement("div");
        item.className = "category-stat-item";

        item.innerHTML = `
            <div class="cat-stat-info">
                <strong>${escapeHtml(cat.name)}</strong>
                <span>${count} paper${count === 1 ? "" : "s"}</span>
            </div>
            <div class="cat-progress-bg">
                <div class="cat-progress-fill" style="width: ${researchFiles.length ? Math.round((count / researchFiles.length) * 100) : 0}%;"></div>
            </div>
        `;

        container.appendChild(item);
    });
}

function populateCategoryOptions() {
    if (!categoryFilter) return;
    categoryFilter.innerHTML = `<option value="all">All Categories</option>`;
    categoriesList.forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat.name;
        opt.textContent = cat.name;
        categoryFilter.appendChild(opt);
    });
}

function setupFilters() {
    if (searchInput) searchInput.addEventListener("input", filterReport);
    if (categoryFilter) categoryFilter.addEventListener("change", filterReport);
    if (statusFilter) statusFilter.addEventListener("change", filterReport);
    if (startDateInput) startDateInput.addEventListener("change", filterReport);
    if (endDateInput) endDateInput.addEventListener("change", filterReport);

    if (clearFiltersButton) {
        clearFiltersButton.addEventListener("click", function () {
            if (searchInput) searchInput.value = "";
            if (categoryFilter) categoryFilter.value = "all";
            if (statusFilter) statusFilter.value = "all";
            if (startDateInput) startDateInput.value = "";
            if (endDateInput) endDateInput.value = "";
            filterReport();
        });
    }
}

function filterReport() {
    const term = (searchInput?.value || "").trim().toLowerCase();
    const cat = categoryFilter?.value || "all";
    const stat = (statusFilter?.value || "all").toLowerCase();
    const start = startDateInput?.value || "";
    const end = endDateInput?.value || "";

    const filtered = researchFiles.filter(file => {
        const matchesTerm =
            !term ||
            file.title.toLowerCase().includes(term) ||
            file.researcher.toLowerCase().includes(term) ||
            file.uploadedBy.toLowerCase().includes(term);

        const matchesCat = cat === "all" || file.category === cat;
        const matchesStat = stat === "all" || file.status === stat;

        let matchesDate = true;
        if (start && file.createdAt) {
            matchesDate = matchesDate && new Date(file.createdAt) >= new Date(start);
        }
        if (end && file.createdAt) {
            matchesDate = matchesDate && new Date(file.createdAt) <= new Date(end + "T23:59:59");
        }

        return matchesTerm && matchesCat && matchesStat && matchesDate;
    });

    filteredResearchFiles = filtered;

    if (resultCount) {
        resultCount.textContent = `Showing ${filtered.length} research file${filtered.length === 1 ? "" : "s"}`;
    }

    renderReportTable(filtered);
    updateExecutiveInsights(filtered);
}

function updateExecutiveInsights(files) {
    if (!window.refmansyApi || !window.refmansyApi.analytics || !window.refmansyApi.analytics.generateExecutiveFindings) {
        return;
    }

    const scopeBadge = document.getElementById("findingsScopeBadge");
    const isFiltered = (files.length !== researchFiles.length);
    if (scopeBadge) {
        scopeBadge.innerHTML = isFiltered
            ? `<i class="fa-solid fa-filter"></i> Filtered View (${files.length} of ${researchFiles.length} records)`
            : `<i class="fa-solid fa-layer-group"></i> All Repository Records (${files.length} total)`;
    }

    const insights = window.refmansyApi.analytics.generateExecutiveFindings(
        files,
        categoriesList,
        cachedDownloads || [],
        cachedUsers || []
    );

    const headlineEl = document.getElementById("findingsHeadline");
    if (headlineEl) headlineEl.textContent = insights.headline;

    const summaryEl = document.getElementById("findingsSummaryText");
    if (summaryEl) summaryEl.textContent = insights.summaryParagraph;

    // Update 4 finding cards
    if (insights.findings && insights.findings.length >= 4) {
        for (let i = 0; i < 4; i++) {
            const idx = i + 1;
            const titleEl = document.getElementById(`findingTitle${idx}`);
            const descEl = document.getElementById(`findingDesc${idx}`);
            if (titleEl) titleEl.textContent = insights.findings[i].title;
            if (descEl) descEl.textContent = insights.findings[i].desc;
        }
    }

    // Update recommendations
    const recListEl = document.getElementById("findingsRecommendationsList");
    if (recListEl) {
        if (!insights.recommendations || insights.recommendations.length === 0) {
            recListEl.innerHTML = `<li><i class="fa-solid fa-circle-check"></i> Repository metrics are optimal; continue standard monitoring.</li>`;
        } else {
            recListEl.innerHTML = insights.recommendations
                .map(r => `<li><i class="fa-solid fa-arrow-right"></i> <span>${escapeHtml(r)}</span></li>`)
                .join("");
        }
    }
}

function renderReportTable(files) {
    if (!reportTable) return;
    reportTable.innerHTML = "";

    if (!files || files.length === 0) {
        reportTable.innerHTML = `<tr><td colspan="7" class="empty-message">No research data matching selected filters.</td></tr>`;
        return;
    }

    files.forEach((file, index) => {
        const row = document.createElement("tr");
        const displayId = "RF-" + String(index + 1).padStart(4, "0");

        const statusBadge =
            file.status === "approved"
                ? `<span class="status-badge status-approved">Approved</span>`
                : file.status === "rejected"
                    ? `<span class="status-badge status-rejected">Rejected</span>`
                    : `<span class="status-badge status-pending">Pending</span>`;

        row.innerHTML = `
            <td><strong>${displayId}</strong></td>
            <td><strong>${escapeHtml(file.title)}</strong></td>
            <td>${escapeHtml(file.researcher)}</td>
            <td>${escapeHtml(file.category)}</td>
            <td>${file.dateUploaded || "N/A"}</td>
            <td>${statusBadge}</td>
            <td>${file.reviewedDate ? `Reviewed (${file.reviewedDate})` : "Pending Review"}</td>
        `;

        reportTable.appendChild(row);
    });
}

function displayGeneratedDate() {
    if (generatedDate) {
        generatedDate.textContent = new Date().toLocaleString();
    }
}

function setupReportButtons() {
        const exportCsvBtn = document.getElementById("exportCsvButton");
        if (exportCsvBtn) {
            exportCsvBtn.addEventListener("click", exportToCSV);
        }

        const exportPdfBtn = document.getElementById("openExportPdfModalButton") || document.getElementById("exportPdfButton");
        if (exportPdfBtn) {
            exportPdfBtn.addEventListener("click", exportConsolidatedPDF);
        }
    }

        async function exportConsolidatedPDF() {
            const exportPdfBtn = document.getElementById("openExportPdfModalButton") || document.getElementById("exportPdfButton");
            if (!exportPdfBtn) return;

            const originalHtml = exportPdfBtn.innerHTML;
            exportPdfBtn.disabled = true;
            exportPdfBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Exporting PDF...`;

                    try {
                        if (!window.refmansyPdfGenerator || !window.refmansyPdfGenerator.generateModularPdfReport) {
                            throw new Error("PDF Generator module is not available. Please refresh the page.");
                        }

                                // Fetch supplemental analytics data if not yet cached
                                if (!cachedDownloads) {
                                    try {
                                        cachedDownloads = await window.refmansyApi.downloads.getAllDownloads();
                                    } catch (e) {
                                        console.warn("Could not fetch downloads for PDF:", e);
                                        cachedDownloads = [];
                                    }
                }

                            if (!cachedUsers) {
                                try {
                                    cachedUsers = await window.refmansyApi.users.getAll();
                                } catch (e) {
                                    console.warn("Could not fetch users for PDF:", e);
                                    cachedUsers = [];
                                }
                            }

                            const adminName = currentProfile?.full_name || currentProfile?.username || "Administrator";
                            const adminRole = currentProfile?.role || "admin";

                            // Check if any report filters are currently active on the page
                            const isFilterActive =
                                (searchInput && searchInput.value.trim() !== "") ||
                                (categoryFilter && categoryFilter.value !== "all") ||
                                (statusFilter && statusFilter.value !== "all") ||
                                (startDateInput && startDateInput.value !== "") ||
                                (endDateInput && endDateInput.value !== "");

                                await window.refmansyPdfGenerator.generateModularPdfReport(
                                    {
                                        modules: {
                                            executive: true,
                                            catalog: true,
                                            downloads: true,
                                            faculty: true
                                        },
                                        catalogScope: isFilterActive ? "filtered" : "all",
                                        adminName,
                                        adminRole
                                    },
                                    {
                                        allFiles: researchFiles,
                                        filteredFiles: filteredResearchFiles,
                                        categoriesList: categoriesList,
                                        downloadsList: cachedDownloads || [],
                                        usersList: cachedUsers || []
                                    }
        );
                } catch (err) {
                    console.error("PDF generation failed:", err);
                    alert(`PDF Generation Error: ${err.message || "An unexpected error occurred."}`);
                } finally {
                    exportPdfBtn.disabled = false;
                    exportPdfBtn.innerHTML = originalHtml;
                }
            }

            function exportToCSV() {
                if (!researchFiles || researchFiles.length === 0) {
                    alert("No research data available to export.");
                    return;
                }

                const headers = ["ID", "Title", "Researcher", "Category", "Publication Year", "Department", "Status", "Uploaded By", "Date Uploaded"];
                const rows = researchFiles.map((f, i) => [
                    `"RF-${String(i + 1).padStart(4, "0")}"`,
                    `"${(f.title || "").replace(/"/g, '""')}"`,
                    `"${(f.researcher || "").replace(/"/g, '""')}"`,
                    `"${(f.category || "").replace(/"/g, '""')}"`,
                    `"${f.publicationYear || ""}"`,
                    `"${(f.department || "").replace(/"/g, '""')}"`,
                    `"${f.status || ""}"`,
                    `"${(f.uploadedBy || "").replace(/"/g, '""')}"`,
                    `"${f.dateUploaded || ""}"`
                ]);

                const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
                const encodedUri = encodeURI(csvContent);
                const link = document.createElement("a");
                link.setAttribute("href", encodedUri);
                link.setAttribute("download", `refmansy_report_${new Date().toISOString().split("T")[0]}.csv`);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
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