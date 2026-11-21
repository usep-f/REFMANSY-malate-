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
        "feedback.html",
        "admin-backup.html"
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

                // Check role restrictions (allow shared search pages for all authenticated roles)
                const isSharedPage = path.includes("search-files.html");
                const targetRole = isSharedPage ? null : (requiredRole || (isAdminPage ? "admin" : (isFacultyPage ? "faculty" : null)));

                if (targetRole && profile.role !== targetRole) {
                    console.warn(`Role mismatch: expected ${targetRole}, found ${profile.role}`);
                    if (profile.role === "admin") {
                        window.location.replace("admin-dashboard.html");
                    } else {
                        window.location.replace("faculty-dashboard.html");
                    }
                    return;
                }

                // If user is admin, register active admin presence & heartbeat
                if (profile.role === "admin") {
                    this.initAdminPresence(profile);
                }

                // Populate UI Header Names
                this.updateHeaderName(profile);

                // Setup global logout buttons
                this.setupLogoutButtons();

                // Setup global navigation helpers
                this.setupGlobalNav();

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

        initAdminPresence(profile) {
            try {
                if (window.refmansyApi?.auth?.setActiveAdminSession) {
                    window.refmansyApi.auth.setActiveAdminSession(profile.id, profile.full_name || profile.username);
                }

                // Heartbeat every 15 seconds to keep session alive
                setInterval(() => {
                    window.refmansyApi?.auth?.touchActiveAdminSession?.();
                }, 15000);

                // Listen for presence checks across tabs
                if (typeof BroadcastChannel !== "undefined") {
                    const bc = new BroadcastChannel("refmansy_admin_session");
                    bc.onmessage = (event) => {
                        if (event.data?.type === "CHECK_ADMIN_ONLINE") {
                            bc.postMessage({
                                type: "ADMIN_ONLINE_ACK",
                                session: {
                                    id: profile.id,
                                    name: profile.full_name || profile.username,
                                    timestamp: Date.now()
                                }
                            });
                        }
                    };
                }
            } catch (e) {
                console.warn("Admin presence init notice:", e);
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
        },

        setupGlobalNav() {
            document.addEventListener("click", function (e) {
                const link = e.target.closest('a[href*="upload-research.html"]');
                if (link && !link.closest(".modal-actions") && !link.classList.contains("edit-btn") && link.id !== "cancelUploadBtn") {
                    localStorage.removeItem("refmansyEditFileId");
                }
            });
        }
    };
})();
