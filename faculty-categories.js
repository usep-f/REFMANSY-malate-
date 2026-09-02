// ================================================================
// Refmansy Faculty Categories (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;
let categories = [];
let tags = [];
let approvedFiles = [];

const categorySearch = document.getElementById("categorySearch");
const categoriesContainer = document.getElementById("categoriesContainer");
const tagsContainer = document.getElementById("tagsContainer");

// Auth Guard
window.refmansyAuthGuard.init("faculty", function (profile, user) {
    currentUser = user;
    currentProfile = profile;
    initializePage();
});

async function initializePage() {
    setupSearch();
    await loadData();
}

async function loadData() {
    try {
        categoriesContainer.innerHTML = `<div class="empty-content"><i class="fa-solid fa-spinner fa-spin"></i> Loading categories...</div>`;
        tagsContainer.innerHTML = `<p class="empty-content"><i class="fa-solid fa-spinner fa-spin"></i> Loading tags...</p>`;

        const [cats, tgs, files] = await Promise.all([
            window.refmansyApi.categories.getAll(),
            window.refmansyApi.categories.getTags(),
            window.refmansyApi.research.getApprovedFiles()
        ]);

        categories = cats;
        tags = tgs;
        approvedFiles = files;

        updateSummary();
        renderCategories(categories);
        renderTags(tags);
    } catch (err) {
        console.error("Error loading categories:", err);
    }
}

function updateSummary() {
    document.getElementById("totalCategories").textContent = categories.length;
    document.getElementById("totalTags").textContent = tags.length;
    document.getElementById("totalApprovedFiles").textContent = approvedFiles.length;
}

function setupSearch() {
    categorySearch.addEventListener("input", function () {
        const term = this.value.trim().toLowerCase();
        const filtered = categories.filter(c =>
            c.name.toLowerCase().includes(term) ||
            (c.description && c.description.toLowerCase().includes(term))
        );
        renderCategories(filtered);
    });
}

function renderCategories(list) {
    categoriesContainer.innerHTML = "";

    if (!list || list.length === 0) {
        categoriesContainer.innerHTML = `<div class="empty-content">No matching categories found.</div>`;
        return;
    }

    list.forEach(cat => {
        const card = document.createElement("article");
        card.className = "category-card";

        const count = approvedFiles.filter(f => f.category === cat.name).length;

        card.innerHTML = `
            <div class="category-card-top">
                <div class="category-icon-box">
                    <i class="fa-solid fa-folder-open"></i>
                </div>
                <span class="file-count-pill"><i class="fa-solid fa-file-lines"></i> ${count} approved</span>
            </div>
            <div class="category-card-body">
                <h3>${escapeHtml(cat.name)}</h3>
                <p>${escapeHtml(cat.description || "Research documents and publications.")}</p>
            </div>
            <div class="category-card-action">
                <span>Browse Papers <i class="fa-solid fa-arrow-right"></i></span>
            </div>
        `;

        card.addEventListener("click", function () {
            localStorage.setItem("refmansySearchCategory", cat.name);
            window.location.href = "search-files.html";
        });

        categoriesContainer.appendChild(card);
    });
}

function renderTags(list) {
    tagsContainer.innerHTML = "";

    if (!list || list.length === 0) {
        tagsContainer.innerHTML = `<p class="empty-content">No research tags available.</p>`;
        return;
    }

    list.forEach(tag => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "tag-button";
        btn.innerHTML = `<i class="fa-solid fa-hashtag"></i> ${escapeHtml(tag.name)}`;

        btn.addEventListener("click", function () {
            localStorage.setItem("refmansySearchTerm", tag.name);
            window.location.href = "search-files.html";
        });

        tagsContainer.appendChild(btn);
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