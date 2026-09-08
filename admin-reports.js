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

        const [files, categories] = await Promise.all([
            window.refmansyApi.research.getAllFiles(),
            window.refmansyApi.categories.getAll()
        ]);

        researchFiles = files;
        categoriesList = categories;

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

    const filteredBadge = document.getElementById("filteredCountBadge");
    if (filteredBadge) filteredBadge.textContent = filtered.length;

    if (resultCount) {
        resultCount.textContent = `Showing ${filtered.length} research file${filtered.length === 1 ? "" : "s"}`;
    }

    renderReportTable(filtered);
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
    const printBtn = document.getElementById("printReportButton");
    if (printBtn) {
        printBtn.addEventListener("click", function () {
            window.print();
        });
    }

    const exportBtn = document.getElementById("exportCsvButton");
    if (exportBtn) {
        exportBtn.addEventListener("click", exportToCSV);
    }

    setupPdfExportModal();
}

function setupPdfExportModal() {
    const openBtn = document.getElementById("openExportPdfModalButton");
    const modal = document.getElementById("exportPdfModal");
    const closeBtn = document.getElementById("closeExportModalBtn");
    const cancelBtn = document.getElementById("cancelExportBtn");
    const generateBtn = document.getElementById("generatePdfBtn");
    const alertBox = document.getElementById("exportModalAlert");

    if (!openBtn || !modal) return;

    const presetPills = modal.querySelectorAll(".preset-pill");
    const moduleCheckboxes = {
        executive: document.getElementById("moduleExecutive"),
        catalog: document.getElementById("moduleCatalog"),
        downloads: document.getElementById("moduleDownloads"),
        faculty: document.getElementById("moduleFaculty")
    };

    function openModal() {
        const filteredBadge = document.getElementById("filteredCountBadge");
        if (filteredBadge) filteredBadge.textContent = filteredResearchFiles.length;

        const totalBadge = document.getElementById("totalCountBadge");
        if (totalBadge) totalBadge.textContent = researchFiles.length;

        if (alertBox) {
            alertBox.style.display = "none";
            alertBox.textContent = "";
        }

        modal.classList.add("active");
    }

    function closeModal() {
        modal.classList.remove("active");
    }

    openBtn.addEventListener("click", openModal);
    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

    modal.addEventListener("click", function (e) {
        if (e.target === modal) closeModal();
    });

    // Sync card active style with checkbox toggles
    Object.values(moduleCheckboxes).forEach(cb => {
        if (!cb) return;
        const card = cb.closest(".module-card");
        cb.addEventListener("change", () => {
            if (card) {
                if (cb.checked) card.classList.add("active");
                else card.classList.remove("active");
            }
            clearActivePresetPill();
        });
    });

    function clearActivePresetPill() {
        presetPills.forEach(p => p.classList.remove("active"));
    }

    // Presets handling
    presetPills.forEach(pill => {
        pill.addEventListener("click", () => {
            clearActivePresetPill();
            pill.classList.add("active");
            const preset = pill.getAttribute("data-preset");

            if (preset === "all") {
                setModuleStates({ executive: true, catalog: true, downloads: true, faculty: true });
            } else if (preset === "executive") {
                setModuleStates({ executive: true, catalog: false, downloads: false, faculty: false });
            } else if (preset === "catalog") {
                setModuleStates({ executive: false, catalog: true, downloads: false, faculty: false });
            } else if (preset === "readership") {
                setModuleStates({ executive: true, catalog: false, downloads: true, faculty: false });
            }
        });
    });

    function setModuleStates({ executive, catalog, downloads, faculty }) {
        if (moduleCheckboxes.executive) {
            moduleCheckboxes.executive.checked = executive;
            moduleCheckboxes.executive.closest(".module-card")?.classList.toggle("active", executive);
        }
        if (moduleCheckboxes.catalog) {
            moduleCheckboxes.catalog.checked = catalog;
            moduleCheckboxes.catalog.closest(".module-card")?.classList.toggle("active", catalog);
        }
        if (moduleCheckboxes.downloads) {
            moduleCheckboxes.downloads.checked = downloads;
            moduleCheckboxes.downloads.closest(".module-card")?.classList.toggle("active", downloads);
        }
        if (moduleCheckboxes.faculty) {
            moduleCheckboxes.faculty.checked = faculty;
            moduleCheckboxes.faculty.closest(".module-card")?.classList.toggle("active", faculty);
        }
    }

    // Generate PDF action
    if (generateBtn) {
        generateBtn.addEventListener("click", async function () {
            if (alertBox) {
                alertBox.style.display = "none";
                alertBox.textContent = "";
            }

            const modules = {
                executive: moduleCheckboxes.executive?.checked || false,
                catalog: moduleCheckboxes.catalog?.checked || false,
                downloads: moduleCheckboxes.downloads?.checked || false,
                faculty: moduleCheckboxes.faculty?.checked || false
            };

            const anySelected = Object.values(modules).some(Boolean);
            if (!anySelected) {
                if (alertBox) {
                    alertBox.textContent = "Please select at least one report module to export.";
                    alertBox.style.display = "block";
                }
                return;
            }

            const catalogScope = document.querySelector('input[name="catalogScope"]:checked')?.value || "filtered";

            const originalHtml = generateBtn.innerHTML;
            generateBtn.disabled = true;
            generateBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Compiling PDF Report...</span>`;

            try {
                // Fetch supplemental data if needed
                if (modules.downloads && !cachedDownloads) {
                    try {
                        cachedDownloads = await window.refmansyApi.downloads.getAllDownloads();
                    } catch (e) {
                        console.warn("Could not fetch downloads for PDF:", e);
                        cachedDownloads = [];
                    }
                }

                if (modules.faculty && !cachedUsers) {
                    try {
                        cachedUsers = await window.refmansyApi.users.getAll();
                    } catch (e) {
                        console.warn("Could not fetch users for PDF:", e);
                        cachedUsers = [];
                    }
                }

                const adminName = currentProfile?.full_name || currentProfile?.username || "Administrator";
                const adminRole = currentProfile?.role || "admin";

                if (!window.refmansyPdfGenerator || !window.refmansyPdfGenerator.generateModularPdfReport) {
                    throw new Error("PDF Generator module is not available. Please refresh the page.");
                }

                await window.refmansyPdfGenerator.generateModularPdfReport(
                    {
                        modules,
                        catalogScope,
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

                closeModal();
            } catch (err) {
                console.error("PDF generation failed:", err);
                if (alertBox) {
                    alertBox.textContent = `PDF Generation Error: ${err.message || "An unexpected error occurred."}`;
                    alertBox.style.display = "block";
                }
            } finally {
                generateBtn.disabled = false;
                generateBtn.innerHTML = originalHtml;
            }
        });
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