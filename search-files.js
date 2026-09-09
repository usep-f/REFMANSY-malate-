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

        approvedFiles = await window.refmansyApi.research.getApprovedFiles();

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

        categories.forEach(cat => {
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
    if (sortFilter) sortFilter.addEventListener("change", filterSearchResults);

    if (clearFiltersButton) {
        clearFiltersButton.addEventListener("click", function () {
            if (searchInput) searchInput.value = "";
            if (categoryFilter) categoryFilter.value = "all";
            if (researchTypeFilter) researchTypeFilter.value = "all";
            if (yearFilter) yearFilter.value = "all";
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
    const sort = sortFilter?.value || "newest";

    let filtered = approvedFiles.filter(file => {
        const matchesTerm =
            !term ||
            file.title.toLowerCase().includes(term) ||
            file.researcher.toLowerCase().includes(term) ||
            (file.keywords && file.keywords.toLowerCase().includes(term)) ||
            (file.department && file.department.toLowerCase().includes(term));

        const matchesCat = cat === "all" || file.category === cat;
        const matchesType = rType === "all" || file.researchType === rType;
        const matchesYr = yr === "all" || String(file.publicationYear) === String(yr);

        return matchesTerm && matchesCat && matchesType && matchesYr;
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
                <span class="paper-category">${escapeHtml(file.category)}</span>
                <h3 class="paper-title">${escapeHtml(file.title)}</h3>
                <p class="paper-author"><i class="fa-solid fa-user-pen"></i> ${escapeHtml(file.researcher)} (${file.publicationYear})</p>
                <p class="paper-abstract">${escapeHtml(file.description || "No abstract provided.")}</p>
                ${keywordsHtml ? `<div class="paper-tags">${keywordsHtml}</div>` : ""}
            </div>
            <div class="paper-card-footer">
                <button type="button" class="btn-card view-details-btn">
                    <i class="fa-regular fa-eye"></i> View Details
                </button>
                <button type="button" class="btn-card download-paper-btn">
                    <i class="fa-solid fa-download"></i> Download
                </button>
            </div>
        `;

        card.querySelector(".view-details-btn").addEventListener("click", () => openModal(file));
        card.querySelector(".download-paper-btn").addEventListener("click", () => triggerDownload(file));

        researchResults.appendChild(card);
    });
}

async function triggerDownload(file) {
    if (!file || !file.filePath) {
        alert("This paper does not have a downloadable file attached.");
        return;
    }

    try {
        await window.refmansyApi.downloads.logDownload(file.id, file.title, file.category);
        await window.refmansyApi.storage.triggerBrowserDownload(file.filePath, file.fileName);
    } catch (err) {
        console.error("Download error:", err);
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
            if (selectedFile && selectedFile.filePath) {
                const url = await window.refmansyApi.storage.getDownloadUrl(selectedFile.filePath);
                if (url) window.open(url, "_blank");
            } else {
                alert("No document file is attached.");
            }
        });
    }

    const dlBtn = document.getElementById("downloadButton");
    if (dlBtn) {
        dlBtn.addEventListener("click", function () {
            if (selectedFile) triggerDownload(selectedFile);
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