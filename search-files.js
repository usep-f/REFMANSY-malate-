// ================================================================
// Refmansy Search Approved Files (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;
let approvedFiles = [];
let selectedFile = null;

const searchInput = document.getElementById("searchInput");
const searchButton = document.getElementById("searchButton");
const categoryFilter = document.getElementById("categoryFilter");
const researchTypeFilter = document.getElementById("researchTypeFilter");
const yearFilter = document.getElementById("yearFilter");
const startDate = document.getElementById("startDate");
const endDate = document.getElementById("endDate");
const sortFilter = document.getElementById("sortFilter");
const clearFiltersButton = document.getElementById("clearFiltersButton");
const researchResults = document.getElementById("researchResults");
const detailsModal = document.getElementById("detailsModal");
const resultCount = document.getElementById("resultCount");

// Auth Guard (Accessible to both faculty and admin)
window.refmansyAuthGuard.init(null, function (profile, user) {
    currentUser = user;
    currentProfile = profile;
    initializePage();
});

async function initializePage() {
    setupFilters();
    setupModal();
    await loadApprovedFiles();
    handleIncomingSearch();
}

async function loadApprovedFiles() {
    try {
        if (researchResults) {
            researchResults.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading approved research papers...</div>`;
        }

        const files = await window.refmansyApi.research.getApprovedFiles();

        // Assign stable, permanent displayId to each record based on initial order
        (files || []).forEach((file, index) => {
            file.displayId = "RF-" + String(index + 1).padStart(4, "0");
        });

        approvedFiles = files;

        await loadCategoryFilter();
        loadYearFilter();
        filterSearchResults();
    } catch (err) {
        console.error("Error loading approved files:", err);
        if (researchResults) {
            researchResults.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: red; padding: 2rem;">Error: ${err.message}</div>`;
        }
    }
}

async function loadCategoryFilter() {
    if (!categoryFilter) return;
    try {
        const categories = await window.refmansyApi.categories.getAll();
        categoryFilter.innerHTML = `<option value="all">All Categories</option>`;

        (categories || []).forEach(cat => {
            const opt = document.createElement("option");
            opt.value = cat.name;
            opt.textContent = cat.name;
            categoryFilter.appendChild(opt);
        });
    } catch (err) {
        console.error("Error loading category options:", err);
    }
}

function loadYearFilter() {
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

function handleIncomingSearch() {
    const incomingCat = localStorage.getItem("refmansySearchCategory");
    const incomingTerm = localStorage.getItem("refmansySearchTerm");

    if (incomingCat && categoryFilter) {
        categoryFilter.value = incomingCat;
        localStorage.removeItem("refmansySearchCategory");
    }
    if (incomingTerm && searchInput) {
        searchInput.value = incomingTerm;
        localStorage.removeItem("refmansySearchTerm");
    }

    filterSearchResults();
}

function setupFilters() {
    if (searchInput) searchInput.addEventListener("input", filterSearchResults);
    if (searchButton) searchButton.addEventListener("click", filterSearchResults);
    if (categoryFilter) categoryFilter.addEventListener("change", filterSearchResults);
    if (researchTypeFilter) researchTypeFilter.addEventListener("change", filterSearchResults);
    if (yearFilter) yearFilter.addEventListener("change", filterSearchResults);
    if (startDate) startDate.addEventListener("change", filterSearchResults);
    if (endDate) endDate.addEventListener("change", filterSearchResults);
    if (sortFilter) sortFilter.addEventListener("change", filterSearchResults);

    if (clearFiltersButton) {
        clearFiltersButton.addEventListener("click", function () {
            if (searchInput) searchInput.value = "";
            if (categoryFilter) categoryFilter.value = "all";
            if (researchTypeFilter) researchTypeFilter.value = "all";
            if (yearFilter) yearFilter.value = "all";
            if (startDate) startDate.value = "";
            if (endDate) endDate.value = "";
            if (sortFilter) sortFilter.value = "newest";
            filterSearchResults();
        });
    }
}

function filterSearchResults() {
    const term = (searchInput?.value || "").trim().toLowerCase();
    const cat = categoryFilter?.value || "all";
    const rType = researchTypeFilter?.value || "all";
    const yr = yearFilter?.value || "all";
    const start = startDate?.value || "";
    const end = endDate?.value || "";
    const sort = sortFilter?.value || "newest";

    let filtered = approvedFiles.filter(file => {
        const matchesTerm =
            !term ||
            (file.displayId && file.displayId.toLowerCase().includes(term)) ||
            (file.title && file.title.toLowerCase().includes(term)) ||
            (file.researcher && file.researcher.toLowerCase().includes(term)) ||
            (file.coResearchers && file.coResearchers.toLowerCase().includes(term)) ||
            (file.keywords && file.keywords.toLowerCase().includes(term)) ||
            (file.department && file.department.toLowerCase().includes(term));

        const matchesCat = cat === "all" || file.category === cat;
        const matchesType = rType === "all" || file.researchType === rType;
        const matchesYr = yr === "all" || String(file.publicationYear) === String(yr);

        let matchesDate = true;
        const fileDateStr = file.createdAt || file.dateUploaded;
        if (start && fileDateStr) {
            matchesDate = matchesDate && new Date(fileDateStr) >= new Date(start);
        }
        if (end && fileDateStr) {
            matchesDate = matchesDate && new Date(fileDateStr) <= new Date(end + "T23:59:59");
        }

        return matchesTerm && matchesCat && matchesType && matchesYr && matchesDate;
    });

    if (sort === "oldest") {
        filtered.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    } else if (sort === "title") {
        filtered.sort((a, b) => a.title.localeCompare(b.title));
    } else {
        filtered.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }

    if (resultCount) {
        resultCount.textContent = `Showing ${filtered.length} of ${approvedFiles.length} research files`;
    }

    renderResults(filtered);
}

function renderResults(files) {
    if (!researchResults) return;
    researchResults.innerHTML = "";

    if (!files || files.length === 0) {
        researchResults.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: #64748b;">No research papers found matching your search.</div>`;
        return;
    }

    files.forEach(file => {
        const card = document.createElement("article");
        card.className = "paper-card";

        const keywordsArray = (file.keywords || "")
            .split(",")
            .map(k => k.trim())
            .filter(Boolean);

        const keywordsHtml = keywordsArray
            .slice(0, 3)
            .map(k => `<span class="badge-tag">${escapeHtml(k)}</span>`)
            .join(" ");

        card.innerHTML = `
            <div class="paper-card-body">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                    <span class="paper-category">${escapeHtml(file.category)}</span>
                    <strong style="color: #64748b; font-size: 11px; background: #f1f5f9; padding: 2px 7px; border-radius: 4px;">${escapeHtml(file.displayId || "RF-0001")}</strong>
                </div>
                <h3 class="paper-title">${escapeHtml(file.title)}</h3>
                <p class="paper-author"><i class="fa-solid fa-user-pen"></i> ${escapeHtml(file.researcher)} (${file.publicationYear})</p>
                <p class="paper-abstract">${escapeHtml(file.description || "No abstract provided.")}</p>
                ${keywordsHtml ? `<div class="paper-tags">${keywordsHtml}</div>` : ""}
            </div>
            <div class="paper-card-footer">
                <button type="button" class="btn-card view-details-btn">
                    <i class="fa-regular fa-eye"></i> View Details
                </button>
                <button type="button" class="btn-card download-paper-btn view-paper-btn">
                    <i class="fa-regular fa-file-pdf"></i> View
                </button>
            </div>
        `;

        card.querySelector(".view-details-btn").addEventListener("click", () => openModal(file));
        card.querySelector(".download-paper-btn").addEventListener("click", () => triggerView(file));

        researchResults.appendChild(card);
    });
}

    async function triggerView(file) {
        if (!file || !file.filePath) {
            alert("This paper does not have a research file attached.");
            return;
        }

        try {
            await window.refmansyApi.downloads.logDownload(file.id, file.title, file.category);
            await window.refmansyApi.storage.openDocumentInNewTab(file.filePath);
        } catch (err) {
            console.error("View error:", err);
        }
    }

    function setupModal() {
        const closeBtn = document.getElementById("closeModalButton");
        if (closeBtn) closeBtn.addEventListener("click", closeModal);

        if (detailsModal) {
            detailsModal.addEventListener("click", function (e) {
                if (e.target === detailsModal) closeModal();
            });
        }

        const viewDocBtn = document.getElementById("viewDocumentButton");
        if (viewDocBtn) {
            viewDocBtn.addEventListener("click", async function () {
                if (selectedFile) triggerView(selectedFile);
            });
        }

        const dlBtn = document.getElementById("downloadButton");
        if (dlBtn) {
            dlBtn.addEventListener("click", function () {
                if (selectedFile) triggerView(selectedFile);
            });
        }
    }

    function openModal(file) {
        selectedFile = file;

        const mTitle = document.getElementById("modalTitle");
        if (mTitle) mTitle.textContent = file.title;
        const mRes = document.getElementById("modalResearcher");
        if (mRes) mRes.textContent = file.researcher;
        const mCoRes = document.getElementById("modalCoResearchers");
        if (mCoRes) mCoRes.textContent = file.coResearchers || "None";
        const mCat = document.getElementById("modalCategory");
        if (mCat) mCat.textContent = file.category;
        const mType = document.getElementById("modalResearchType");
        if (mType) mType.textContent = file.researchType || "N/A";
        const mDept = document.getElementById("modalDepartment");
        if (mDept) mDept.textContent = file.department || "N/A";
        const mYear = document.getElementById("modalYear");
        if (mYear) mYear.textContent = file.publicationYear || "N/A";
        const mDesc = document.getElementById("modalDescription");
        if (mDesc) mDesc.textContent = file.description || "No description provided.";

        const keywordsContainer = document.getElementById("modalKeywords");
        if (keywordsContainer) {
            const keywordsArray = (file.keywords || "")
                .split(",")
                .map(k => k.trim())
                .filter(Boolean);

            if (keywordsArray.length > 0) {
                keywordsContainer.innerHTML = keywordsArray
                    .map(k => `<span class="badge-tag">${escapeHtml(k)}</span>`)
                    .join(" ");
            } else {
                keywordsContainer.innerHTML = `<span>No keywords</span>`;
            }
        }

        if (detailsModal) detailsModal.classList.add("active");
    }

    function closeModal() {
        if (detailsModal) detailsModal.classList.remove("active");
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