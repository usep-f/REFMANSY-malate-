// ================================================================
// Refmansy Search Approved Files (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;
let approvedFiles = [];
let selectedFile = null;

const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const yearFilter = document.getElementById("yearFilter");
const searchResults = document.getElementById("searchResults");
const emptyState = document.getElementById("emptyState");
const fileModal = document.getElementById("fileModal");
const resultsCount = document.getElementById("resultsCount");

// Auth Guard
window.refmansyAuthGuard.init("faculty", function (profile, user) {
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
        searchResults.innerHTML = `<div style="grid-column: 1/-1; text-align: center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading approved research papers...</div>`;
        
        approvedFiles = await window.refmansyApi.research.getApprovedFiles();
        
        await loadCategoryFilter();
        loadYearFilter();
        filterSearchResults();
    } catch (err) {
        console.error("Error loading approved files:", err);
        searchResults.innerHTML = `<div style="grid-column: 1/-1; text-align: center; color: red; padding: 2rem;">Error: ${err.message}</div>`;
    }
}

async function loadCategoryFilter() {
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

    if (incomingCat) {
        categoryFilter.value = incomingCat;
        localStorage.removeItem("refmansySearchCategory");
    }
    if (incomingTerm) {
        searchInput.value = incomingTerm;
        localStorage.removeItem("refmansySearchTerm");
    }

    filterSearchResults();
}

function setupFilters() {
    searchInput.addEventListener("input", filterSearchResults);
    categoryFilter.addEventListener("change", filterSearchResults);
    yearFilter.addEventListener("change", filterSearchResults);
}

function filterSearchResults() {
    const term = searchInput.value.trim().toLowerCase();
    const cat = categoryFilter.value;
    const yr = yearFilter.value;

    const filtered = approvedFiles.filter(file => {
        const matchesTerm =
            !term ||
            file.title.toLowerCase().includes(term) ||
            file.researcher.toLowerCase().includes(term) ||
            (file.keywords && file.keywords.toLowerCase().includes(term)) ||
            (file.department && file.department.toLowerCase().includes(term));

        const matchesCat = cat === "all" || file.category === cat;
        const matchesYr = yr === "all" || String(file.publicationYear) === String(yr);

        return matchesTerm && matchesCat && matchesYr;
    });

    resultsCount.textContent = `${filtered.length} paper${filtered.length === 1 ? "" : "s"} found`;
    renderResults(filtered);
}

function renderResults(files) {
    searchResults.innerHTML = "";

    if (!files || files.length === 0) {
        emptyState.style.display = "block";
        return;
    }

    emptyState.style.display = "none";

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

        searchResults.appendChild(card);
    });
}

async function triggerDownload(file) {
    if (!file || !file.filePath) {
        alert("This paper does not have a downloadable file attached.");
        return;
    }

    try {
        // Log the download event into Supabase
        await window.refmansyApi.downloads.logDownload(file.id, file.title, file.category);

        // Stream file download
        await window.refmansyApi.storage.triggerBrowserDownload(file.filePath, file.fileName);
    } catch (err) {
        console.error("Download error:", err);
    }
}

function setupModal() {
    document.getElementById("closeModalButton").addEventListener("click", closeModal);
    fileModal.addEventListener("click", function (e) {
        if (e.target === fileModal) closeModal();
    });

    document.getElementById("viewDocumentButton").addEventListener("click", async function () {
        if (selectedFile && selectedFile.filePath) {
            const url = await window.refmansyApi.storage.getDownloadUrl(selectedFile.filePath);
            if (url) window.open(url, "_blank");
        } else {
            alert("No document file is attached.");
        }
    });

    document.getElementById("downloadButton").addEventListener("click", function () {
        if (selectedFile) triggerDownload(selectedFile);
    });
}

function openModal(file) {
    selectedFile = file;

    document.getElementById("modalTitle").textContent = file.title;
    document.getElementById("modalResearcher").textContent = file.researcher;
    document.getElementById("modalCoResearchers").textContent = file.coResearchers || "None";
    document.getElementById("modalCategory").textContent = file.category;
    document.getElementById("modalResearchType").textContent = file.researchType || "N/A";
    document.getElementById("modalDepartment").textContent = file.department || "N/A";
    document.getElementById("modalYear").textContent = file.publicationYear || "N/A";
    document.getElementById("modalDescription").textContent = file.description || "No description provided.";

    const keywordsContainer = document.getElementById("modalKeywords");
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

    fileModal.classList.add("active");
}

function closeModal() {
    fileModal.classList.remove("active");
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