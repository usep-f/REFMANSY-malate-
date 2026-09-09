// ================================================================
// Refmansy Manage Users (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;
let usersList = [];
let editingUserId = null;

const searchInput = document.getElementById("searchInput");
const roleFilter = document.getElementById("roleFilter");
const statusFilter = document.getElementById("statusFilter");
const usersTable = document.getElementById("usersTable");
const userModal = document.getElementById("userModal");
const userForm = document.getElementById("userForm");
const modalTitle = document.getElementById("modalTitle");
const formMessage = document.getElementById("formMessage");
const resultCount = document.getElementById("resultCount");

// Auth Guard
window.refmansyAuthGuard.init("admin", function (profile, user) {
    currentUser = user;
    currentProfile = profile;
    initializePage();
});

async function initializePage() {
    setupFilters();
    setupModal();
    setupForm();
    await loadUsers();
}

async function loadUsers() {
    try {
        if (usersTable) {
            usersTable.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading user accounts...</td></tr>`;
        }

        usersList = await window.refmansyApi.users.getAll();

        updateSummary();
        filterUsers();
    } catch (err) {
        console.error("Error loading users:", err);
        if (usersTable) {
            usersTable.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red; padding: 2rem;">Error: ${err.message}</td></tr>`;
        }
    }
}

function updateSummary() {
    const total = usersList.length;
    const adminCount = usersList.filter(u => u.role === "admin").length;
    const facultyCount = usersList.filter(u => u.role === "faculty").length;
    const activeCount = usersList.filter(u => u.status === "active").length;

    const totalEl = document.getElementById("totalUsers");
    if (totalEl) totalEl.textContent = total;

    const adminEl = document.getElementById("totalAdmins");
    if (adminEl) adminEl.textContent = adminCount;

    const facultyEl = document.getElementById("totalRegularUsers");
    if (facultyEl) facultyEl.textContent = facultyCount;

    const activeEl = document.getElementById("activeUsers");
    if (activeEl) activeEl.textContent = activeCount;
}

function setupFilters() {
    if (searchInput) searchInput.addEventListener("input", filterUsers);
    if (roleFilter) roleFilter.addEventListener("change", filterUsers);
    if (statusFilter) statusFilter.addEventListener("change", filterUsers);
}

function filterUsers() {
    const term = (searchInput?.value || "").trim().toLowerCase();
    const role = (roleFilter?.value || "all").toLowerCase();
    const stat = (statusFilter?.value || "all").toLowerCase();

    const filtered = usersList.filter(user => {
        const matchesTerm =
            !term ||
            user.fullname.toLowerCase().includes(term) ||
            user.username.toLowerCase().includes(term) ||
            user.email.toLowerCase().includes(term);

        const matchesRole = role === "all" || user.role === role;
        const matchesStatus = stat === "all" || user.status === stat;

        return matchesTerm && matchesRole && matchesStatus;
    });

    if (resultCount) {
        resultCount.textContent = `Showing ${filtered.length} of ${usersList.length} users`;
    }

    renderUsersTable(filtered);
}

function renderUsersTable(list) {
    if (!usersTable) return;
    usersTable.innerHTML = "";

    if (!list || list.length === 0) {
        usersTable.innerHTML = `<tr><td colspan="7" class="empty-table">No user accounts found matching criteria.</td></tr>`;
        return;
    }

    list.forEach(user => {
        const row = document.createElement("tr");

        const roleBadge =
            user.role === "admin"
                ? `<span class="badge-admin">Admin</span>`
                : `<span class="badge-faculty">Faculty</span>`;

        const statusBadge =
            user.status === "active"
                ? `<span class="badge-active"><i class="fa-solid fa-circle-check"></i> Active</span>`
                : `<span class="badge-inactive"><i class="fa-solid fa-circle-xmark"></i> Inactive</span>`;

        const isSelf = user.id === currentProfile.id;

        row.innerHTML = `
            <td>
                <div class="user-avatar-cell">
                    <div class="avatar-circle"><i class="fa-solid fa-user"></i></div>
                    <div>
                        <strong>${escapeHtml(user.fullname || user.username)}</strong>
                    </div>
                </div>
            </td>
            <td>@${escapeHtml(user.username)}</td>
            <td>${escapeHtml(user.email)}</td>
            <td>${roleBadge}</td>
            <td>${user.dateCreated || "N/A"}</td>
            <td>${statusBadge}</td>
            <td>
                <div class="table-actions">
                    <button type="button" class="btn-action edit-user-btn" title="Edit User">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    ${
                        !isSelf
                            ? `<button type="button" class="btn-action delete-user-btn" title="Delete User">
                                <i class="fa-solid fa-trash"></i>
                               </button>`
                            : ""
                    }
                </div>
            </td>
        `;

        row.querySelector(".edit-user-btn").addEventListener("click", () => openEditModal(user));

        const deleteBtn = row.querySelector(".delete-user-btn");
        if (deleteBtn) {
            deleteBtn.addEventListener("click", () => deleteUserAccount(user));
        }

        usersTable.appendChild(row);
    });
}

async function deleteUserAccount(user) {
    if (user.id === currentProfile.id) {
        alert("You cannot delete your own administrator account.");
        return;
    }

    const userName = user.fullname || user.username;
    const confirmMessage = `Are you sure you want to permanently delete the account for "${userName}" (@${user.username})?\n\nThis will permanently delete their authentication credentials and database profile. This action cannot be undone.`;

    if (!confirm(confirmMessage)) {
        return;
    }

    try {
        await window.refmansyApi.users.deleteUser(user.id);
        alert(`User account for "${userName}" has been permanently deleted.`);
        await loadUsers();
    } catch (err) {
        console.error("Failed to delete user account:", err);
        alert("Error deleting user account: " + (err.message || "Unknown error occurred."));
    }
}

function setupModal() {
    const addBtn = document.getElementById("addUserButton");
    if (addBtn) addBtn.addEventListener("click", openAddModal);

    const closeBtn = document.getElementById("closeModalButton");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    const cancelBtn = document.getElementById("cancelButton");
    if (cancelBtn) cancelBtn.addEventListener("click", closeModal);

    if (userModal) {
        userModal.addEventListener("click", function (e) {
            if (e.target === userModal) closeModal();
        });
    }
}

function openAddModal() {
    editingUserId = null;
    if (modalTitle) modalTitle.textContent = "Add New User";
    if (userForm) userForm.reset();

    const pwInput = document.getElementById("password");
    if (pwInput) pwInput.required = true;
    const confirmPwInput = document.getElementById("confirmPassword");
    if (confirmPwInput) confirmPwInput.required = true;

    clearFormMessage();
    if (userModal) userModal.classList.add("active");
}

function openEditModal(user) {
    editingUserId = user.id;
    if (modalTitle) modalTitle.textContent = "Edit User Account";

    const fn = document.getElementById("fullname");
    if (fn) fn.value = user.fullname || "";
    const un = document.getElementById("username");
    if (un) un.value = user.username || "";
    const em = document.getElementById("email");
    if (em) em.value = user.email || "";
    const rl = document.getElementById("role");
    if (rl) rl.value = user.role || "faculty";
    const st = document.getElementById("accountStatus");
    if (st) st.value = user.status || "active";

    const pwInput = document.getElementById("password");
    if (pwInput) pwInput.required = false;
    const confirmPwInput = document.getElementById("confirmPassword");
    if (confirmPwInput) confirmPwInput.required = false;

    clearFormMessage();
    if (userModal) userModal.classList.add("active");
}

function closeModal() {
    if (userModal) userModal.classList.remove("active");
    editingUserId = null;
}

function setupForm() {
    if (!userForm) return;

    userForm.addEventListener("submit", async function (e) {
        e.preventDefault();

        const fullname = (document.getElementById("fullname")?.value || "").trim();
        const username = (document.getElementById("username")?.value || "").trim();
        const email = (document.getElementById("email")?.value || "").trim();
        const role = document.getElementById("role")?.value || "faculty";
        const status = document.getElementById("accountStatus")?.value || "active";
        const saveBtn = userForm.querySelector("button[type='submit']");

        if (!fullname || !username || !email || !role) {
            showFormMessage("Please fill in all required fields.", "error");
            return;
        }

        try {
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.textContent = "Saving...";
            }

            if (editingUserId) {
                await window.refmansyApi.users.updateProfile(editingUserId, {
                    fullname,
                    username,
                    role,
                    status
                });
            } else {
                const password = document.getElementById("password")?.value || "";
                if (!password || password.length < 6) {
                    showFormMessage("Password must be at least 6 characters.", "error");
                    if (saveBtn) {
                        saveBtn.disabled = false;
                        saveBtn.textContent = "Save User";
                    }
                    return;
                }

                await window.refmansyApi.users.createUser(email, password, {
                    fullname,
                    username,
                    role,
                    status
                });
            }

            closeModal();
            await loadUsers();
        } catch (err) {
            console.error("Save user error:", err);
            showFormMessage(err.message || "Failed to save user.", "error");
        } finally {
            if (saveBtn) {
                saveBtn.disabled = false;
                saveBtn.textContent = "Save User";
            }
        }
    });
}

function showFormMessage(text, type) {
    if (!formMessage) return;
    formMessage.textContent = text;
    formMessage.className = "form-message " + type;
}

function clearFormMessage() {
    if (!formMessage) return;
    formMessage.textContent = "";
    formMessage.className = "form-message";
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