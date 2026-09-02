// ================================================================
// Refmansy Manage Users (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;
let usersList = [];
let editingUserId = null;

const searchInput = document.getElementById("searchUserInput");
const roleFilter = document.getElementById("roleFilter");
const statusFilter = document.getElementById("statusFilter");
const usersTableBody = document.getElementById("usersTableBody");
const userModal = document.getElementById("userModal");
const userForm = document.getElementById("userForm");
const modalTitle = document.getElementById("modalTitle");
const formMessage = document.getElementById("formMessage");

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
        usersTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading user accounts...</td></tr>`;

        usersList = await window.refmansyApi.users.getAll();

        updateSummary();
        filterUsers();
    } catch (err) {
        console.error("Error loading users:", err);
        usersTableBody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red; padding: 2rem;">Error: ${err.message}</td></tr>`;
    }
}

function updateSummary() {
    const total = usersList.length;
    const adminCount = usersList.filter(u => u.role === "admin").length;
    const facultyCount = usersList.filter(u => u.role === "faculty").length;
    const activeCount = usersList.filter(u => u.status === "active").length;
    const inactiveCount = usersList.filter(u => u.status === "inactive").length;

    const totalEl = document.getElementById("totalUsers");
    if (totalEl) totalEl.textContent = total;

    const adminEl = document.getElementById("totalAdmins");
    if (adminEl) adminEl.textContent = adminCount;

    const facultyEl = document.getElementById("totalFaculty");
    if (facultyEl) facultyEl.textContent = facultyCount;

    const activeEl = document.getElementById("activeUsers");
    if (activeEl) activeEl.textContent = activeCount;

    const inactiveEl = document.getElementById("inactiveUsers");
    if (inactiveEl) inactiveEl.textContent = inactiveCount;
}

function setupFilters() {
    searchInput.addEventListener("input", filterUsers);
    roleFilter.addEventListener("change", filterUsers);
    statusFilter.addEventListener("change", filterUsers);
}

function filterUsers() {
    const term = searchInput.value.trim().toLowerCase();
    const role = roleFilter.value.toLowerCase();
    const stat = statusFilter.value.toLowerCase();

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

    renderUsersTable(filtered);
}

function renderUsersTable(list) {
    usersTableBody.innerHTML = "";

    if (!list || list.length === 0) {
        usersTableBody.innerHTML = `<tr><td colspan="7" class="empty-table">No user accounts found matching criteria.</td></tr>`;
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
                        <br><small style="color: #64748b;">@${escapeHtml(user.username)}</small>
                    </div>
                </div>
            </td>
            <td>${escapeHtml(user.email)}</td>
            <td>${roleBadge}</td>
            <td>${statusBadge}</td>
            <td>${user.dateCreated || "N/A"}</td>
            <td>
                <div class="table-actions">
                    <button type="button" class="btn-action edit-user-btn" title="Edit User">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    ${
                        !isSelf
                            ? `<button type="button" class="btn-action toggle-status-btn" title="${user.status === 'active' ? 'Deactivate' : 'Activate'} User">
                                <i class="fa-solid ${user.status === 'active' ? 'fa-ban' : 'fa-check'}"></i>
                               </button>`
                            : ""
                    }
                </div>
            </td>
        `;

        row.querySelector(".edit-user-btn").addEventListener("click", () => openEditModal(user));

        const toggleBtn = row.querySelector(".toggle-status-btn");
        if (toggleBtn) {
            toggleBtn.addEventListener("click", () => toggleUserStatus(user));
        }

        usersTableBody.appendChild(row);
    });
}

async function toggleUserStatus(user) {
    const nextStatus = user.status === "active" ? "inactive" : "active";
    const actionWord = nextStatus === "active" ? "activate" : "deactivate";

    if (!confirm(`Are you sure you want to ${actionWord} the account for ${user.fullname || user.username}?`)) {
        return;
    }

    try {
        await window.refmansyApi.users.updateStatus(user.id, nextStatus);
        user.status = nextStatus;
        updateSummary();
        filterUsers();
    } catch (err) {
        console.error("Failed to update status:", err);
        alert("Error updating user status: " + err.message);
    }
}

function setupModal() {
    const addBtn = document.getElementById("addUserButton");
    if (addBtn) addBtn.addEventListener("click", openAddModal);

    document.getElementById("closeModalButton").addEventListener("click", closeModal);
    document.getElementById("cancelButton").addEventListener("click", closeModal);

    userModal.addEventListener("click", function (e) {
        if (e.target === userModal) closeModal();
    });
}

function openAddModal() {
    editingUserId = null;
    modalTitle.textContent = "Add New User";
    userForm.reset();
    document.getElementById("passwordGroup").style.display = "block";
    document.getElementById("password").required = true;
    clearFormMessage();
    userModal.classList.add("active");
}

function openEditModal(user) {
    editingUserId = user.id;
    modalTitle.textContent = "Edit User Account";

    document.getElementById("fullname").value = user.fullname || "";
    document.getElementById("username").value = user.username || "";
    document.getElementById("email").value = user.email || "";
    document.getElementById("role").value = user.role || "faculty";
    document.getElementById("status").value = user.status || "active";

    // Disable password input when editing
    const pwGroup = document.getElementById("passwordGroup");
    if (pwGroup) pwGroup.style.display = "none";
    const pwInput = document.getElementById("password");
    if (pwInput) pwInput.required = false;

    clearFormMessage();
    userModal.classList.add("active");
}

function closeModal() {
    userModal.classList.remove("active");
    editingUserId = null;
}

function setupForm() {
    userForm.addEventListener("submit", async function (e) {
        e.preventDefault();

        const fullname = document.getElementById("fullname").value.trim();
        const username = document.getElementById("username").value.trim();
        const email = document.getElementById("email").value.trim();
        const role = document.getElementById("role").value;
        const status = document.getElementById("status").value;
        const saveBtn = userForm.querySelector("button[type='submit']");

        if (!fullname || !username || !email || !role) {
            showFormMessage("Please fill in all required fields.", "error");
            return;
        }

        try {
            saveBtn.disabled = true;
            saveBtn.textContent = "Saving...";

            if (editingUserId) {
                await window.refmansyApi.users.updateProfile(editingUserId, {
                    fullname,
                    username,
                    role,
                    status
                });
            } else {
                const password = document.getElementById("password").value;
                if (!password || password.length < 6) {
                    showFormMessage("Password must be at least 6 characters.", "error");
                    saveBtn.disabled = false;
                    saveBtn.textContent = "Save User";
                    return;
                }

                await window.refmansyApi.auth.signUp(email, password, {
                    fullname,
                    username,
                    role
                });
            }

            closeModal();
            await loadUsers();
        } catch (err) {
            console.error("Save user error:", err);
            showFormMessage(err.message || "Failed to save user.", "error");
        } finally {
            saveBtn.disabled = false;
            saveBtn.textContent = "Save User";
        }
    });
}

function showFormMessage(text, type) {
    formMessage.textContent = text;
    formMessage.className = "form-message " + type;
}

function clearFormMessage() {
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