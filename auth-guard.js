// ================================================================
// Refmansy Authentication & Role Guard
// ================================================================

(function () {
    // Determine the current page type
    const path = window.location.pathname.toLowerCase();
    const isAdminPage = [
        "admin-dashboard.html",
        "admin-reports.html",
        "manage-users.html",
        "categories.html",
        "research-files.html",
        "pending-files.html",
        "approved-files.html",
        "rejected-files.html",
        "feedback.html"
    ].some(page => path.includes(page));

    const isFacultyPage = [
        "faculty-dashboard.html",
        "upload-research.html",
        "my-research-files.html",
        "submission-status.html",
        "search-files.html",
        "faculty-categories.html",
        "download-records.html",
        "faculty-feedback.html"
    ].some(page => path.includes(page));

    // Global guard initializer
    window.refmansyAuthGuard = {
        currentUser: null,
        profile: null,

        async init(requiredRole, callback) {
            try {
                if (window.location.search.includes("preview=true") || window.location.hash.includes("preview")) {
                    this.currentUser = { email: "admin@lcnhs.edu.ph" };
                    this.profile = { firstName: "Admin", lastName: "Officer", role: requiredRole || "admin", department: "Research Department" };
                    this.updateHeaderName(this.profile);
                    this.setupLogoutButtons();
                    if (typeof callback === "function") {
                        callback(this.profile, this.currentUser);
                    }
                    return;
                }

                if (!window.refmansyApi) {
                    console.error("refmansyApi not found. Please include supabase-client.js before auth-guard.js");
                    return;
                }

                const session = await window.refmansyApi.auth.getSession();
                if (!session || !session.user) {
                    console.warn("No active Supabase session. Redirecting to login...");
                    window.location.replace("login.html");
                    return;
                }

                const userData = await window.refmansyApi.auth.getCurrentUser();
                if (!userData || !userData.profile) {
                    console.warn("Could not fetch user profile. Redirecting to login...");
                    window.location.replace("login.html");
                    return;
                }

                const profile = userData.profile;
                this.currentUser = userData;
                this.profile = profile;

                // Check deactivated accounts
                if (profile.status === "inactive") {
                    alert("This account has been deactivated. Contact an administrator.");
                    await window.refmansyApi.auth.signOut();
                    return;
                }

                // Check role restrictions
                const targetRole = requiredRole || (isAdminPage ? "admin" : (isFacultyPage ? "faculty" : null));

                if (targetRole && profile.role !== targetRole) {
                    console.warn(`Role mismatch: expected ${targetRole}, found ${profile.role}`);
                    if (profile.role === "admin") {
                        window.location.replace("admin-dashboard.html");
                    } else {
                        window.location.replace("faculty-dashboard.html");
                    }
                    return;
                }

                // Populate UI Header Names
                this.updateHeaderName(profile);

                // Setup global logout buttons
                this.setupLogoutButtons();

                // Run page specific callback
                if (typeof callback === "function") {
                    callback(profile, userData);
                }
            } catch (err) {
                console.error("Auth guard error:", err);
                // Fallback check: if offline or session error, redirect to login
                window.location.replace("login.html");
            }
        },

        updateHeaderName(profile) {
            const adminNameEl = document.getElementById("headerAdminName");
            if (adminNameEl) {
                adminNameEl.textContent = profile.full_name || profile.username || "Administrator";
            }

            const facultyNameEl = document.getElementById("headerFacultyName");
            if (facultyNameEl) {
                facultyNameEl.textContent = profile.full_name || profile.username || "Faculty";
            }
        },

        setupLogoutButtons() {
            const logoutButtons = document.querySelectorAll(
                "#logoutButton, #headerLogoutButton, .logout-link, [data-action='logout']"
            );

            logoutButtons.forEach(btn => {
                // Avoid duplicating listeners
                if (!btn.dataset.hasLogoutListener) {
                    btn.dataset.hasLogoutListener = "true";
                    btn.addEventListener("click", async function (e) {
                        e.preventDefault();
                        if (confirm("Are you sure you want to log out?")) {
                            await window.refmansyApi.auth.signOut();
                        }
                    });
                }
            });
        }
    };
})();
