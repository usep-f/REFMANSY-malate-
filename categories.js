// ================================================================
// Refmansy Categories and Tags (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;
let categories = [];
let tags = [];
let allFiles = [];
let editingCategoryId = null;

const categoriesTableBody = document.getElementById("categoriesTableBody");
const tagsListContainer = document.getElementById("tagsList");
const categorySearch = document.getElementById("categorySearch");
const categoryModal = document.getElementById("categoryModal");
const categoryForm = document.getElementById("categoryForm");
const tagForm = document.getElementById("tagForm");
const categoryMessage = document.getElementById("categoryMessage");

// Auth Guard
window.refmansyAuthGuard.init("admin", function (profile, user) {
    currentUser = user;
    currentProfile = profile;
    initializePage();
});

async function initializePage() {
    setupModal();
    setupCategoryForm();
    setupTagForm();
    setupSearch();
    await loadData();
}

async function loadData() {
    try {
        categoriesTableBody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading categories...</td></tr>`;

        const [cats, tgs, files] = await Promise.all([
            window.refmansyApi.categories.getAll(),
            window.refmansyApi.categories.getTags(),
            window.refmansyApi.research.getAllFiles()
        ]);

        categories = cats;
        tags = tgs;
        allFiles = files;

        updateSummary();
        renderCategories(categories);
        renderTags(tags);
    } catch (err) {
        console.error("Error loading categories:", err);
    }
}

function updateSummary() {
    const categorizedCount = allFiles.filter(f => f.category && f.category.trim() !== "").length;

    document.getElementById("totalCategories").textContent = categories.length;
    document.getElementById("totalTags").textContent = tags.length;
    document.getElementById("categorizedFiles").textContent = categorizedCount;
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
    categoriesTableBody.innerHTML = "";

    if (!list || list.length === 0) {
        categoriesTableBody.innerHTML = `<tr><td colspan="4" class="empty-table">No categories found.</td></tr>`;
        return;
    }

    list.forEach(cat => {
        const row = document.createElement("tr");
        const fileCount = allFiles.filter(f => f.category === cat.name).length;

        row.innerHTML = `
            <td><strong>${escapeHtml(cat.name)}</strong></td>
            <td>${escapeHtml(cat.description || "—")}</td>
            <td>${fileCount} file${fileCount === 1 ? "" : "s"}</td>
            <td>
                <div class="table-actions">
                    <button type="button" class="btn-action edit-cat-btn" title="Edit Category">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button type="button" class="btn-action delete-cat-btn" title="Delete Category">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        `;

        row.querySelector(".edit-cat-btn").addEventListener("click", () => openEditCategory(cat));
        row.querySelector(".delete-cat-btn").addEventListener("click", () => deleteCategory(cat));

        categoriesTableBody.appendChild(row);
    });
}

function renderTags(list) {
    tagsListContainer.innerHTML = "";

    if (!list || list.length === 0) {
        tagsListContainer.innerHTML = `<p class="empty-tags">No tags created yet.</p>`;
        return;
    }

    list.forEach(tag => {
        const tagEl = document.createElement("div");
        tagEl.className = "admin-tag-chip";

        tagEl.innerHTML = `
            <span>#${escapeHtml(tag.name)}</span>
            <button type="button" class="btn-remove-tag" title="Delete tag">
                <i class="fa-solid fa-xmark"></i>
            </button>
        `;

        tagEl.querySelector(".btn-remove-tag").addEventListener("click", () => deleteTag(tag));
        tagsListContainer.appendChild(tagEl);
    });
}

function setupModal() {
    document.getElementById("addCategoryButton").addEventListener("click", openAddCategory);
    document.getElementById("closeModalButton").addEventListener("click", closeCategoryModal);
    document.getElementById("cancelButton").addEventListener("click", closeCategoryModal);

    categoryModal.addEventListener("click", function (e) {
        if (e.target === categoryModal) closeCategoryModal();
    });
}

function openAddCategory() {
    editingCategoryId = null;
    document.getElementById("modalTitle").textContent = "Add Category";
    categoryForm.reset();
    clearCategoryMessage();
    categoryModal.classList.add("active");
}

function openEditCategory(cat) {
    editingCategoryId = cat.id;
    document.getElementById("modalTitle").textContent = "Edit Category";
    document.getElementById("categoryName").value = cat.name;
    document.getElementById("categoryDescription").value = cat.description || "";
    clearCategoryMessage();
    categoryModal.classList.add("active");
}

function closeCategoryModal() {
    categoryModal.classList.remove("active");
    editingCategoryId = null;
}

function setupCategoryForm() {
    categoryForm.addEventListener("submit", async function (e) {
        e.preventDefault();

        const name = document.getElementById("categoryName").value.trim();
        const description = document.getElementById("categoryDescription").value.trim();
        const saveBtn = categoryForm.querySelector("button[type='submit']");

        if (!name) {
            showCategoryMessage("Please enter a category name.", "error");
            return;
        }

        try {
            saveBtn.disabled = true;
            saveBtn.textContent = "Saving...";

            if (editingCategoryId) {
                await window.refmansyApi.categories.update(editingCategoryId, name, description);
            } else {
                await window.refmansyApi.categories.create(name, description);
            }

            closeCategoryModal();
            await loadData();
        } catch (err) {
            console.error("Save category error:", err);
            showCategoryMessage(err.message || "Failed to save category.", "error");
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = "Save Category";
        }
    });
}

async function deleteCategory(cat) {
    if (!confirm(`Are you sure you want to delete category "${cat.name}"?`)) return;

    try {
        await window.refmansyApi.categories.delete(cat.id);
        await loadData();
    } catch (err) {
        console.error("Delete category error:", err);
        alert("Could not delete category: " + err.message);
    }
}

function setupTagForm() {
    tagForm.addEventListener("submit", async function (e) {
        e.preventDefault();

        const input = document.getElementById("tagName");
        const tagName = input.value.trim();

        if (!tagName) return;

        try {
            await window.refmansyApi.categories.createTag(tagName);
            input.value = "";
            tags = await window.refmansyApi.categories.getTags();
            updateSummary();
            renderTags(tags);
        } catch (err) {
            console.error("Create tag error:", err);
            alert("Could not add tag: " + err.message);
        }
    });
}

async function deleteTag(tag) {
    try {
        await window.refmansyApi.categories.deleteTag(tag.id);
        tags = await window.refmansyApi.categories.getTags();
        updateSummary();
        renderTags(tags);
    } catch (err) {
        console.error("Delete tag error:", err);
        alert("Could not delete tag: " + err.message);
    }
}

function showCategoryMessage(text, type) {
    categoryMessage.textContent = text;
    categoryMessage.className = "form-message " + type;
}

function clearCategoryMessage() {
    categoryMessage.textContent = "";
    categoryMessage.className = "form-message";
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