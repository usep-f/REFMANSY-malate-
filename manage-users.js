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
}

function openAddModal() {
    editingUserId = null;
    if (modalTitle) modalTitle.textContent = "Add New User";
    const headerIcon = document.getElementById("modalHeaderIcon");
    if (headerIcon) headerIcon.className = "fa-solid fa-user-plus";
    const sub = document.getElementById("modalSubtitle");
    if (sub) sub.textContent = "Enter user details and authentication credentials.";
    if (userForm) userForm.reset();

    const pwInput = document.getElementById("password");
    if (pwInput) pwInput.required = true;
    const confirmPwInput = document.getElementById("confirmPassword");
    if (confirmPwInput) confirmPwInput.required = true;

    clearAllValidations();
    clearFormMessage();
    if (userModal) userModal.classList.add("active");
}

function openEditModal(user) {
    editingUserId = user.id;
    if (modalTitle) modalTitle.textContent = "Edit User Account";
    const headerIcon = document.getElementById("modalHeaderIcon");
    if (headerIcon) headerIcon.className = "fa-solid fa-user-pen";
    const sub = document.getElementById("modalSubtitle");
    if (sub) sub.textContent = "Update user details and access permissions.";

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
    if (pwInput) {
        pwInput.value = "";
        pwInput.required = false;
    }
    const confirmPwInput = document.getElementById("confirmPassword");
    if (confirmPwInput) {
        confirmPwInput.value = "";
        confirmPwInput.required = false;
    }

    clearAllValidations();
    clearFormMessage();
    if (userModal) userModal.classList.add("active");
}

function closeModal() {
    if (userModal) userModal.classList.remove("active");
    editingUserId = null;
    clearAllValidations();
}

// ----------------------------------------------------------------
// Form Validation & Feedback Helpers
// ----------------------------------------------------------------
function setFieldFeedback(inputEl, feedbackEl, message, isError = true) {
    if (!feedbackEl) return;
    if (!message) {
        feedbackEl.style.display = "none";
        feedbackEl.textContent = "";
        feedbackEl.className = "field-feedback";
        if (inputEl) {
            inputEl.classList.remove("input-error", "input-success");
        }
    } else {
        feedbackEl.style.display = "flex";
        feedbackEl.innerHTML = (isError ? '<i class="fa-solid fa-circle-exclamation"></i> ' : '<i class="fa-solid fa-circle-check"></i> ') + escapeHtml(message);
        feedbackEl.className = "field-feedback " + (isError ? "error" : "success");
        if (inputEl) {
            inputEl.classList.remove(isError ? "input-success" : "input-error");
            inputEl.classList.add(isError ? "input-error" : "input-success");
        }
    }
}

function clearAllValidations() {
    const inputs = [
        document.getElementById("fullname"),
        document.getElementById("username"),
        document.getElementById("email"),
        document.getElementById("password"),
        document.getElementById("confirmPassword")
    ];
    inputs.forEach(inp => {
        if (inp) inp.classList.remove("input-error", "input-success");
    });

    const feedbacks = [
        document.getElementById("fullnameError"),
        document.getElementById("usernameError"),
        document.getElementById("emailError"),
        document.getElementById("passwordFeedback"),
        document.getElementById("confirmPasswordFeedback")
    ];
    feedbacks.forEach(fb => {
        if (fb) {
            fb.style.display = "none";
            fb.textContent = "";
            fb.className = "field-feedback";
        }
    });

    const pwStrengthBox = document.getElementById("passwordStrengthBox");
    if (pwStrengthBox) pwStrengthBox.style.display = "none";
}

function validateFullName(showError = false) {
    const fnInput = document.getElementById("fullname");
    const fnError = document.getElementById("fullnameError");
    const val = (fnInput?.value || "").trim();

    if (!val) {
        if (showError) {
            setFieldFeedback(fnInput, fnError, "Full Name is required (Format: Surname, First Name, Middle Name)", true);
        }
        return false;
    }

    setFieldFeedback(fnInput, fnError, "", false);
    return true;
}

function validateUsername(showError = false) {
    const unInput = document.getElementById("username");
    const unError = document.getElementById("usernameError");
    const val = (unInput?.value || "").trim();

    if (!val) {
        if (showError) {
            setFieldFeedback(unInput, unError, "Username is required (eg Juan_12)", true);
        }
        return false;
    }

    if (val.length < 3) {
        if (showError) {
            setFieldFeedback(unInput, unError, "Username must be at least 3 characters (eg Juan_12)", true);
        }
        return false;
    }

    if (val.length > 20) {
        if (showError) {
            setFieldFeedback(unInput, unError, "Username cannot exceed 20 characters", true);
        }
        return false;
    }

    const pattern = /^[a-zA-Z0-9_]+$/;
    if (!pattern.test(val)) {
        if (showError) {
            setFieldFeedback(unInput, unError, "Only letters, numbers, and underscore (_) are allowed (eg Juan_12)", true);
        }
        return false;
    }

    setFieldFeedback(unInput, unError, "", false);
    return true;
}

function validateEmail(showError = false) {
    const emInput = document.getElementById("email");
    const emError = document.getElementById("emailError");
    const val = (emInput?.value || "").trim();

    if (!val) {
        if (showError) {
            setFieldFeedback(emInput, emError, "Email address is missing or required (e.g. user@lcnhs.edu.ph)", true);
        }
        return false;
    }

    if (!val.includes("@")) {
        if (showError) {
            setFieldFeedback(emInput, emError, "Missing '@' in email address (e.g. user@lcnhs.edu.ph)", true);
        }
        return false;
    }

    const parts = val.split("@");
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
        if (showError) {
            setFieldFeedback(emInput, emError, "Incomplete email address (e.g. user@lcnhs.edu.ph)", true);
        }
        return false;
    }

    const domain = parts[1];
    if (!domain.includes(".")) {
        if (showError) {
            setFieldFeedback(emInput, emError, "Missing domain extension (e.g. .edu.ph, .edu, .com)", true);
        }
        return false;
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(val)) {
        if (showError) {
            setFieldFeedback(emInput, emError, "Incorrect email format. Sample: user@lcnhs.edu.ph", true);
        }
        return false;
    }

    setFieldFeedback(emInput, emError, "", false);
    return true;
}

function checkPasswordStrength(showError = false) {
    const pwInput = document.getElementById("password");
    const pwFeedback = document.getElementById("passwordFeedback");
    const pwBox = document.getElementById("passwordStrengthBox");
    const bar = document.getElementById("strengthBar");
    const txt = document.getElementById("strengthText");
    const req = document.getElementById("strengthRequirement");
    const val = pwInput?.value || "";

    if (editingUserId && !val) {
        if (pwBox) pwBox.style.display = "none";
        setFieldFeedback(pwInput, pwFeedback, "", false);
        return true;
    }

    if (!val) {
        if (pwBox) pwBox.style.display = "none";
        if (showError) {
            setFieldFeedback(pwInput, pwFeedback, "Password is required (min. 6 characters with number)", true);
        } else {
            setFieldFeedback(pwInput, pwFeedback, "", false);
        }
        return false;
    }

    if (pwBox) pwBox.style.display = "block";

    const hasNumber = /\d/.test(val);
    const hasLetters = /[a-zA-Z]/.test(val);
    const hasSpecial = /[^a-zA-Z0-9]/.test(val);
    const isLongEnough = val.length >= 6;
    const isStrongLength = val.length >= 8;

    let strength = "weak";
    let reqText = "Must include at least 1 number";

    if (!isLongEnough) {
        strength = "weak";
        reqText = "Too short (min 6 chars with number)";
    } else if (!hasNumber) {
        strength = "weak";
        reqText = "Must include at least 1 number";
    } else if (!hasLetters) {
        strength = "weak";
        reqText = "Include both letters and numbers";
    } else if (isStrongLength && (hasSpecial || (/[A-Z]/.test(val) && /[a-z]/.test(val)))) {
        strength = "strong";
        reqText = "Strong password! Includes numbers & characters";
    } else {
        strength = "medium";
        reqText = "Good password (add uppercase or special chars for Strong)";
    }

    if (bar) bar.className = "strength-bar " + strength;
    if (txt) {
        txt.className = "strength-text " + strength;
        txt.textContent = strength.charAt(0).toUpperCase() + strength.slice(1);
    }
    if (req) req.textContent = reqText;

    if (!isLongEnough) {
        if (showError) setFieldFeedback(pwInput, pwFeedback, "Password must be at least 6 characters.", true);
        else setFieldFeedback(pwInput, pwFeedback, "", false);
        return false;
    }

    if (!hasNumber) {
        if (showError) setFieldFeedback(pwInput, pwFeedback, "Password must include at least 1 number.", true);
        else setFieldFeedback(pwInput, pwFeedback, "", false);
        return false;
    }

    setFieldFeedback(pwInput, pwFeedback, "", false);
    return true;
}

function checkPasswordMatch(showError = false) {
    const pwInput = document.getElementById("password");
    const cpwInput = document.getElementById("confirmPassword");
    const cpwFeedback = document.getElementById("confirmPasswordFeedback");

    const pw = pwInput?.value || "";
    const cpw = cpwInput?.value || "";

    if (editingUserId && !pw && !cpw) {
        setFieldFeedback(cpwInput, cpwFeedback, "", false);
        return true;
    }

    if (!cpw) {
        if (showError) {
            setFieldFeedback(cpwInput, cpwFeedback, "Please confirm your password", true);
            return false;
        }
        setFieldFeedback(cpwInput, cpwFeedback, "", false);
        return false;
    }

    if (pw !== cpw) {
        setFieldFeedback(cpwInput, cpwFeedback, "Passwords do not match", true);
        return false;
    }

    setFieldFeedback(cpwInput, cpwFeedback, "Passwords match", false);
    return true;
}

function setupForm() {
    if (!userForm) return;

    const fnInput = document.getElementById("fullname");
    const unInput = document.getElementById("username");
    const emInput = document.getElementById("email");
    const pwInput = document.getElementById("password");
    const cpwInput = document.getElementById("confirmPassword");

    if (fnInput) {
        fnInput.addEventListener("input", () => validateFullName(false));
        fnInput.addEventListener("blur", () => validateFullName(true));
    }

    if (unInput) {
        unInput.addEventListener("input", () => {
            if (unInput.value.length >= 3) validateUsername(true);
            else validateUsername(false);
        });
        unInput.addEventListener("blur", () => validateUsername(true));
    }

    if (emInput) {
        emInput.addEventListener("input", () => {
            if (emInput.value.includes("@")) validateEmail(false);
        });
        emInput.addEventListener("blur", () => validateEmail(true));
    }

    if (pwInput) {
        pwInput.addEventListener("input", () => {
            checkPasswordStrength(false);
            if (cpwInput && cpwInput.value) {
                checkPasswordMatch(false);
            }
        });
        pwInput.addEventListener("blur", () => checkPasswordStrength(true));
    }

    if (cpwInput) {
        cpwInput.addEventListener("input", () => checkPasswordMatch(false));
        cpwInput.addEventListener("blur", () => checkPasswordMatch(true));
    }

    userForm.addEventListener("submit", async function (e) {
        e.preventDefault();

        const fullnameValid = validateFullName(true);
        const usernameValid = validateUsername(true);
        const emailValid = validateEmail(true);
        const passwordValid = checkPasswordStrength(true);
        const matchValid = checkPasswordMatch(true);

        if (!fullnameValid || !usernameValid || !emailValid || !passwordValid || !matchValid) {
            showFormMessage("Please correct the errors in the form before saving.", "error");
            return;
        }

        const fullname = (document.getElementById("fullname")?.value || "").trim();
        const username = (document.getElementById("username")?.value || "").trim();
        const email = (document.getElementById("email")?.value || "").trim();
        const role = document.getElementById("role")?.value || "faculty";
        const status = document.getElementById("accountStatus")?.value || "active";
        const saveBtn = userForm.querySelector("button[type='submit']");

        try {
            if (saveBtn) {
                saveBtn.disabled = true;
                saveBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
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
                saveBtn.innerHTML = '<i class="fa-solid fa-floppy-disk"></i> Save User';
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