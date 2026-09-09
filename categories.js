// ================================================================
// Refmansy Categories and Tags (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;
let categories = [];
let tags = [];
let allFiles = [];
let editingCategoryId = null;

const categoriesTable = document.getElementById("categoriesTable");
const tagsContainer = document.getElementById("tagsContainer");
const categorySearch = document.getElementById("categorySearch");
const categoryModal = document.getElementById("categoryModal");
const categoryForm = document.getElementById("categoryForm");
const tagForm = document.getElementById("tagForm");
const categoryMessage = document.getElementById("categoryMessage");
const categoryCount = document.getElementById("categoryCount");

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
        if (categoriesTable) {
            categoriesTable.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading categories...</td></tr>`;
        }

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

    const totalCatsEl = document.getElementById("totalCategories");
    if (totalCatsEl) totalCatsEl.textContent = categories.length;

    const totalTagsEl = document.getElementById("totalTags");
    if (totalTagsEl) totalTagsEl.textContent = tags.length;

    const catFilesEl = document.getElementById("categorizedFiles");
    if (catFilesEl) catFilesEl.textContent = categorizedCount;
}

function setupSearch() {
    if (categorySearch) {
        categorySearch.addEventListener("input", function () {
            const term = this.value.trim().toLowerCase();
            const filtered = categories.filter(c =>
                c.name.toLowerCase().includes(term) ||
                (c.description && c.description.toLowerCase().includes(term))
            );
            renderCategories(filtered);
        });
    }
}

function renderCategories(list) {
    if (!categoriesTable) return;
    categoriesTable.innerHTML = "";

    if (!list || list.length === 0) {
        categoriesTable.innerHTML = `<tr><td colspan="5" class="empty-table">No categories found.</td></tr>`;
        return;
    }

    if (categoryCount) {
        categoryCount.textContent = `Showing ${list.length} categories`;
    }

    list.forEach(cat => {
        const row = document.createElement("tr");
        const fileCount = allFiles.filter(f => f.category === cat.name).length;
        const dateStr = cat.created_at ? new Date(cat.created_at).toLocaleDateString() : "Active";

        row.innerHTML = `
            <td><strong>${escapeHtml(cat.name)}</strong></td>
            <td>${escapeHtml(cat.description || "—")}</td>
            <td><span class="file-count-badge">${fileCount} file${fileCount === 1 ? "" : "s"}</span></td>
            <td>${dateStr}</td>
            <td>
                <div class="table-actions">
                    <button type="button" class="btn-action edit-cat-btn" title="Edit Category">
                        <i class="fa-solid fa-pen"></i> Edit
                    </button>
                    <button type="button" class="btn-action delete-cat-btn" title="Delete Category">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            </td>
        `;

        row.querySelector(".edit-cat-btn").addEventListener("click", () => openEditCategory(cat));
        row.querySelector(".delete-cat-btn").addEventListener("click", () => deleteCategory(cat));

        categoriesTable.appendChild(row);
    });
}

function renderTags(list) {
    if (!tagsContainer) return;
    tagsContainer.innerHTML = "";

    if (!list || list.length === 0) {
        tagsContainer.innerHTML = `<p class="empty-tags">No tags created yet.</p>`;
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
        tagsContainer.appendChild(tagEl);
    });
}

function setupModal() {
    const addBtn = document.getElementById("addCategoryButton");
    if (addBtn) addBtn.addEventListener("click", openAddCategory);

    const closeBtn = document.getElementById("closeModalButton");
    if (closeBtn) closeBtn.addEventListener("click", closeCategoryModal);

    const cancelBtn = document.getElementById("cancelButton");
    if (cancelBtn) cancelBtn.addEventListener("click", closeCategoryModal);

    if (categoryModal) {
        categoryModal.addEventListener("click", function (e) {
            if (e.target === categoryModal) closeCategoryModal();
        });
    }
}

function openAddCategory() {
    editingCategoryId = null;
    const mTitle = document.getElementById("modalTitle");
    if (mTitle) mTitle.textContent = "Add Category";
    if (categoryForm) categoryForm.reset();
    clearCategoryMessage();
    if (categoryModal) categoryModal.classList.add("active");
}

function openEditCategory(cat) {
    editingCategoryId = cat.id;
    const mTitle = document.getElementById("modalTitle");
    if (mTitle) mTitle.textContent = "Edit Category";

    const nameInput = document.getElementById("categoryName");
    if (nameInput) nameInput.value = cat.name;

    const descInput = document.getElementById("categoryDescription");
    if (descInput) descInput.value = cat.description || "";

    clearCategoryMessage();
    if (categoryModal) categoryModal.classList.add("active");
}

function closeCategoryModal() {
    if (categoryModal) categoryModal.classList.remove("active");
    editingCategoryId = null;
}

function setupCategoryForm() {
    if (!categoryForm) return;

    categoryForm.addEventListener("submit", async function (e) {
        e.preventDefault();

        const name = (document.getElementById("categoryName")?.value || "").trim();
        const description = (document.getElementById("categoryDescription")?.value || "").trim();
        const saveBtn = categoryForm.querySelector("button[type='submit']");

        if (!name) {
            showCategoryMessage("Please enter a category name.", "error");
            return;
        }

        try {
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = "Saving...";
            }

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
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = "Save Category";
            }
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
    if (!tagForm) return;

    tagForm.addEventListener("submit", async function (e) {
        e.preventDefault();

        const input = document.getElementById("tagName");
        const tagName = (input?.value || "").trim();

        if (!tagName) return;

        try {
            await window.refmansyApi.categories.createTag(tagName);
            if (input) input.value = "";
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
    if (!categoryMessage) return;
    categoryMessage.textContent = text;
    categoryMessage.className = "form-message " + type;
}

function clearCategoryMessage() {
    if (!categoryMessage) return;
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