// ================================================================
// Refmansy Supabase Client & Central API Service Layer
// ================================================================

const SUPABASE_URL = "https://tscpkrezpgxsjknrdskt.supabase.co";
const SUPABASE_ANON_KEY =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRzY3BrcmV6cGd4c2prbnJkc2t0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODgzNDM1OTcsImV4cCI6MjEwMzkxOTU5N30.ENMQ35CY85uWUMNMBK5Vxh_yjjnaMn6N9O9_XAzNkl0";

const STORAGE_BUCKET = "research-documents";

// Initialize the Supabase client
let supabaseClient = null;
if (typeof supabase !== "undefined" && supabase.createClient) {
    supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    });
} else if (typeof window !== "undefined" && window.supabase && window.supabase.createClient) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

// Global API Service Object
const refmansyApi = {
    client: supabaseClient,

    // -------------------------------------------------------------
    // Authentication Services
    // -------------------------------------------------------------
    auth: {
        async getSession() {
            const { data, error } = await supabaseClient.auth.getSession();
            if (error) throw error;
            return data.session;
        },

        async getCurrentUser() {
            const { data: { user }, error } = await supabaseClient.auth.getUser();
            if (error || !user) return null;

            // Fetch linked profile
            const { data: profile, error: profileErr } = await supabaseClient
                .from("profiles")
                .select("*")
                .eq("id", user.id)
                .maybeSingle();

            if (profileErr) {
                console.error("Error fetching user profile:", profileErr);
            }

            return {
                ...user,
                profile: profile || {
                    id: user.id,
                    email: user.email,
                    role: user.user_metadata?.role || "faculty",
                    full_name: user.user_metadata?.full_name || user.email,
                    username: user.user_metadata?.username || user.email.split("@")[0],
                    status: "active"
                }
            };
        },

        async signUp(email, password, { fullname, username, role }) {
            // Check if username or email already exists in profiles
            const { data: existingUser } = await supabaseClient
                .from("profiles")
                .select("id, username, email")
                .or(`username.ilike.${username.trim()},email.ilike.${email.trim()}`)
                .maybeSingle();

            if (existingUser) {
                if (existingUser.username.toLowerCase() === username.trim().toLowerCase()) {
                    throw new Error("This username is already registered.");
                }
                if (existingUser.email.toLowerCase() === email.trim().toLowerCase()) {
                    throw new Error("This email is already registered.");
                }
            }

            const redirectUrl = (typeof window !== "undefined" && window.location?.origin)
                ? `${window.location.origin}/login.html?verified=true`
                : undefined;

            const { data, error } = await supabaseClient.auth.signUp({
                email: email.trim(),
                password: password,
                options: {
                    emailRedirectTo: redirectUrl,
                    data: {
                        full_name: fullname.trim(),
                        fullname: fullname.trim(),
                        username: username.trim(),
                        role: role
                    }
                }
            });

            if (error) throw error;

            // Ensure profile row exists (in case trigger is delayed or fallback needed)
            if (data.user) {
                await supabaseClient.from("profiles").upsert({
                    id: data.user.id,
                    full_name: fullname.trim(),
                    username: username.trim(),
                    email: email.trim(),
                    role: role,
                    status: "active",
                    updated_at: new Date().toISOString()
                }, { onConflict: "id" });
            }

            return data;
        },

        async signIn(usernameOrEmail, password, selectedRole) {
            let targetEmail = usernameOrEmail.trim();

            // If input doesn't look like an email, lookup email by username
            if (!targetEmail.includes("@")) {
                const { data: profile, error: lookupErr } = await supabaseClient
                    .from("profiles")
                    .select("email, status, role")
                    .ilike("username", targetEmail)
                    .maybeSingle();

                if (lookupErr || !profile) {
                    throw new Error("User account not found.");
                }
                targetEmail = profile.email;
            }

            // Attempt Sign In
            const { data, error } = await supabaseClient.auth.signInWithPassword({
                email: targetEmail,
                password: password
            });

            if (error) throw error;

            // Fetch profile for role and status verification
            const { data: profile, error: profileErr } = await supabaseClient
                .from("profiles")
                .select("*")
                .eq("id", data.user.id)
                .single();

            if (profileErr || !profile) {
                throw new Error("Failed to load user profile.");
            }

            if (profile.status === "inactive") {
                await supabaseClient.auth.signOut();
                throw new Error("This account has been deactivated. Please contact an administrator.");
            }

            if (selectedRole && profile.role !== selectedRole) {
                await supabaseClient.auth.signOut();
                throw new Error(`Access denied. This account is not registered as ${selectedRole}.`);
            }

            // Cache user data in localStorage for fast synchronous render across legacy code
            localStorage.setItem("refmansyCurrentUser", JSON.stringify({
                id: profile.id,
                fullname: profile.full_name,
                username: profile.username,
                email: profile.email,
                role: profile.role,
                status: profile.status
            }));

            return { user: data.user, profile };
        },

        async signOut() {
            localStorage.removeItem("refmansyCurrentUser");
            localStorage.removeItem("refmansyEditFileId");
            localStorage.removeItem("refmansySelectedFile");
            const { error } = await supabaseClient.auth.signOut();
            if (error) console.error("Sign out error:", error);
            window.location.replace("login.html");
        },

        // Verify registration 6-digit OTP
        async verifySignUpOtp(email, token) {
            const { data, error } = await supabaseClient.auth.verifyOtp({
                email: email.trim(),
                token: token.trim(),
                type: "signup"
            });
            if (error) throw error;

            // Ensure profile row is set to active
            if (data?.user?.id) {
                await supabaseClient
                    .from("profiles")
                    .update({ status: "active", updated_at: new Date().toISOString() })
                    .eq("id", data.user.id);
            }

            return data;
        },

        // Resend signup confirmation OTP / link
        async resendSignUpOtp(email) {
            const redirectUrl = (typeof window !== "undefined" && window.location?.origin)
                ? `${window.location.origin}/login.html?verified=true`
                : undefined;

            const { data, error } = await supabaseClient.auth.resend({
                type: "signup",
                email: email.trim(),
                options: {
                    emailRedirectTo: redirectUrl
                }
            });
            if (error) throw error;
            return data;
        },

        // Request password reset OTP / recovery link
        async sendPasswordResetOtp(email) {
            const redirectUrl = (typeof window !== "undefined" && window.location?.origin)
                ? `${window.location.origin}/login.html`
                : undefined;

            const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email.trim(), {
                redirectTo: redirectUrl
            });
            if (error) throw error;
            return data;
        },

        // Verify password reset OTP
        async verifyPasswordResetOtp(email, token) {
            const { data, error } = await supabaseClient.auth.verifyOtp({
                email: email.trim(),
                token: token.trim(),
                type: "recovery"
            });
            if (error) throw error;
            return data;
        },

        // Update password for currently authenticated recovery session and then sign out cleanly
        async updatePassword(newPassword) {
            const { data, error } = await supabaseClient.auth.updateUser({
                password: newPassword
            });
            if (error) throw error;
            await supabaseClient.auth.signOut();
            return data;
        }
    },

    // -------------------------------------------------------------
    // Research Files Services
    // -------------------------------------------------------------
    research: {
        async getAllFiles() {
            const { data, error } = await supabaseClient
                .from("research_files")
                .select("*, profiles:owner_id(full_name, username, email)")
                .order("created_at", { ascending: false });

            if (error) throw error;
            return data.map(normalizeResearchFile);
        },

        async getApprovedFiles() {
            const { data, error } = await supabaseClient
                .from("research_files")
                .select("*, profiles:owner_id(full_name, username, email)")
                .eq("status", "approved")
                .order("created_at", { ascending: false });

            if (error) throw error;
            return data.map(normalizeResearchFile);
        },

        async getMyFiles(userId) {
            const { data, error } = await supabaseClient
                .from("research_files")
                .select("*, profiles:owner_id(full_name, username, email)")
                .eq("owner_id", userId)
                .order("created_at", { ascending: false });

            if (error) throw error;
            return data.map(normalizeResearchFile);
        },

        async getFileById(fileId) {
            const { data, error } = await supabaseClient
                .from("research_files")
                .select("*, profiles:owner_id(full_name, username, email)")
                .eq("id", fileId)
                .single();

            if (error) throw error;
            return normalizeResearchFile(data);
        },

        async createResearchFile(payload, fileObj) {
            let storagePath = null;
            let fileName = payload.fileName || (fileObj ? fileObj.name : "document.pdf");
            let fileSize = payload.fileSize || (fileObj ? fileObj.size : 0);

            // Upload PDF if a file object is provided
            if (fileObj) {
                const user = (await supabaseClient.auth.getUser()).data.user;
                const fileExt = fileName.split(".").pop();
                const cleanFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
                const path = `${user.id}/${Date.now()}_${cleanFileName}`;

                const { error: uploadError } = await supabaseClient.storage
                    .from(STORAGE_BUCKET)
                    .upload(path, fileObj, {
                        cacheControl: "3600",
                        upsert: true
                    });

                if (uploadError) {
                    console.error("Storage upload error:", uploadError);
                    throw new Error("Failed to upload document file: " + uploadError.message);
                }
                storagePath = path;
            }

            const { data, error } = await supabaseClient
                .from("research_files")
                .insert({
                    title: payload.title,
                    researcher: payload.researcher,
                    co_researchers: payload.coResearchers || "",
                    department: payload.department || "",
                    research_type: payload.researchType || "",
                    category: payload.category,
                    publication_year: String(payload.publicationYear),
                    description: payload.description || "",
                    keywords: payload.keywords || "",
                    file_path: storagePath,
                    file_name: fileName,
                    file_size: fileSize,
                    file_type: "application/pdf",
                    owner_id: payload.ownerId,
                    status: "pending"
                })
                .select()
                .single();

            if (error) throw error;
            return normalizeResearchFile(data);
        },

        async updateResearchFile(fileId, payload, newFileObj) {
            const updates = {
                title: payload.title,
                researcher: payload.researcher,
                co_researchers: payload.coResearchers || "",
                department: payload.department || "",
                research_type: payload.researchType || "",
                category: payload.category,
                publication_year: String(payload.publicationYear),
                description: payload.description || "",
                keywords: payload.keywords || "",
                status: "pending", // resets to pending for re-review
                review_comment: null,
                reviewed_by: null,
                reviewed_at: null,
                updated_at: new Date().toISOString()
            };

            if (newFileObj) {
                // Fetch previous file path so we can clean it up after upload
                const { data: oldFile } = await supabaseClient
                    .from("research_files")
                    .select("file_path")
                    .eq("id", fileId)
                    .maybeSingle();

                const user = (await supabaseClient.auth.getUser()).data.user;
                const cleanFileName = newFileObj.name.replace(/[^a-zA-Z0-9.-]/g, "_");
                const path = `${user.id}/${Date.now()}_${cleanFileName}`;

                const { error: uploadError } = await supabaseClient.storage
                    .from(STORAGE_BUCKET)
                    .upload(path, newFileObj, { upsert: true });

                if (uploadError) throw uploadError;

                // Delete previous file from storage to avoid orphaned files
                if (oldFile?.file_path && oldFile.file_path !== path) {
                    try {
                        await supabaseClient.storage.from(STORAGE_BUCKET).remove([oldFile.file_path]);
                    } catch (removeErr) {
                        console.warn("Could not remove old file from storage:", removeErr);
                    }
                }

                updates.file_path = path;
                updates.file_name = newFileObj.name;
                updates.file_size = newFileObj.size;
            }

            const { data, error } = await supabaseClient
                .from("research_files")
                .update(updates)
                .eq("id", fileId)
                .select()
                .single();

            if (error) throw error;
            return normalizeResearchFile(data);
        },

        async updateStatus(fileId, status, reviewComment, reviewerId) {
            const { data, error } = await supabaseClient
                .from("research_files")
                .update({
                    status: status,
                    review_comment: reviewComment || "",
                    reviewed_by: reviewerId,
                    reviewed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                })
                .eq("id", fileId)
                .select()
                .single();

            if (error) throw error;
            return normalizeResearchFile(data);
        },

        async deleteFile(fileId) {
            // Fetch file to get storage path if exists
            const { data: file } = await supabaseClient
                .from("research_files")
                .select("file_path")
                .eq("id", fileId)
                .maybeSingle();

            if (file && file.file_path) {
                await supabaseClient.storage.from(STORAGE_BUCKET).remove([file.file_path]);
            }

            const { error } = await supabaseClient
                .from("research_files")
                .delete()
                .eq("id", fileId);

            if (error) throw error;
            return true;
        }
    },

    // -------------------------------------------------------------
    // Storage & File Download Services
    // -------------------------------------------------------------
    storage: {
        async getDownloadUrl(filePath) {
            if (!filePath) return null;

            // Try creating signed URL (valid for 1 hour)
            const { data, error } = await supabaseClient.storage
                .from(STORAGE_BUCKET)
                .createSignedUrl(filePath, 3600);

            if (!error && data?.signedUrl) {
                return data.signedUrl;
            }

            // Fallback to public URL
            const { data: publicData } = supabaseClient.storage
                .from(STORAGE_BUCKET)
                .getPublicUrl(filePath);

            return publicData?.publicUrl || null;
        },

        async triggerBrowserDownload(filePath, fileName) {
            const url = await this.getDownloadUrl(filePath);
            if (!url) {
                alert("File URL could not be generated. The file might not have been uploaded to storage.");
                return;
            }

            try {
                const response = await fetch(url);
                const blob = await response.blob();
                const blobUrl = window.URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = blobUrl;
                link.download = fileName || "research-document.pdf";
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1000);
            } catch (err) {
                // If fetch fails (CORS or direct link), open in new tab
                window.open(url, "_blank");
            }
        }
    },

    // -------------------------------------------------------------
    // Categories & Tags Services
    // -------------------------------------------------------------
    categories: {
        async getAll() {
            const { data, error } = await supabaseClient
                .from("categories")
                .select("*")
                .order("name", { ascending: true });

            if (error) throw error;
            return data || [];
        },

        async create(name, description = "") {
            const { data, error } = await supabaseClient
                .from("categories")
                .insert({ name: name.trim(), description: description.trim() })
                .select()
                .single();

            if (error) throw error;
            return data;
        },

        async update(id, name, description = "") {
            const { data, error } = await supabaseClient
                .from("categories")
                .update({ name: name.trim(), description: description.trim() })
                .eq("id", id)
                .select()
                .single();

            if (error) throw error;
            return data;
        },

        async delete(id) {
            const { error } = await supabaseClient
                .from("categories")
                .delete()
                .eq("id", id);

            if (error) throw error;
            return true;
        },

        async getTags() {
            const { data, error } = await supabaseClient
                .from("tags")
                .select("*")
                .order("name", { ascending: true });

            if (error) throw error;
            return data || [];
        },

        async createTag(name) {
            const { data, error } = await supabaseClient
                .from("tags")
                .insert({ name: name.trim().toLowerCase() })
                .select()
                .single();

            if (error) throw error;
            return data;
        },

        async deleteTag(id) {
            const { error } = await supabaseClient
                .from("tags")
                .delete()
                .eq("id", id);

            if (error) throw error;
            return true;
        }
    },

    // -------------------------------------------------------------
    // User Profiles Management (Admin)
    // -------------------------------------------------------------
    users: {
        async getAll() {
            const { data, error } = await supabaseClient
                .from("profiles")
                .select("*")
                .order("created_at", { ascending: false });

            if (error) throw error;
            return (data || []).map(normalizeUserProfile);
        },

        async updateStatus(userId, status) {
            const { data, error } = await supabaseClient
                .from("profiles")
                .update({ status: status, updated_at: new Date().toISOString() })
                .eq("id", userId)
                .select()
                .single();

            if (error) throw error;
            return normalizeUserProfile(data);
        },

        async updateRole(userId, role) {
            const { data, error } = await supabaseClient
                .from("profiles")
                .update({ role: role, updated_at: new Date().toISOString() })
                .eq("id", userId)
                .select()
                .single();

            if (error) throw error;
            return normalizeUserProfile(data);
        },

        async updateProfile(userId, { fullname, username, role, status }) {
            const { data, error } = await supabaseClient
                .from("profiles")
                .update({
                    full_name: fullname.trim(),
                    username: username.trim(),
                    role: role,
                    status: status,
                    updated_at: new Date().toISOString()
                })
                .eq("id", userId)
                .select()
                .single();

            if (error) throw error;
            return normalizeUserProfile(data);
        },

        async deleteUser(userId) {
            const { data, error } = await supabaseClient.rpc("admin_delete_user", {
                target_user_id: userId
            });

            if (error) throw error;
            return true;
        },

        async createUser(email, password, { fullname, username, role, status = "active" }) {
            // Check if username or email already exists in profiles
            const { data: existingUser } = await supabaseClient
                .from("profiles")
                .select("id, username, email")
                .or(`username.ilike.${username.trim()},email.ilike.${email.trim()}`)
                .maybeSingle();

            if (existingUser) {
                if (existingUser.username.toLowerCase() === username.trim().toLowerCase()) {
                    throw new Error("This username is already registered.");
                }
                if (existingUser.email.toLowerCase() === email.trim().toLowerCase()) {
                    throw new Error("This email is already registered.");
                }
            }

            // Create isolated client without session persistence to prevent overwriting active admin session
            const isolatedClient = (typeof supabase !== "undefined" && supabase.createClient)
                ? supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } })
                : window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

            const { data, error } = await isolatedClient.auth.signUp({
                email: email.trim(),
                password: password,
                options: {
                    data: {
                        full_name: fullname.trim(),
                        fullname: fullname.trim(),
                        username: username.trim(),
                        role: role
                    }
                }
            });

            if (error) throw error;

            if (data?.user?.id) {
                await supabaseClient.from("profiles").upsert({
                    id: data.user.id,
                    full_name: fullname.trim(),
                    username: username.trim(),
                    email: email.trim(),
                    role: role,
                    status: status || "active",
                    updated_at: new Date().toISOString()
                }, { onConflict: "id" });
            }

            return data;
        }
    },

    // -------------------------------------------------------------
    // Download Records Services
    // -------------------------------------------------------------
    downloads: {
        async logDownload(fileId, fileTitle, fileCategory) {
            const user = (await supabaseClient.auth.getUser()).data.user;
            if (!user) return;

            const profile = (await refmansyApi.auth.getCurrentUser())?.profile;

            const { data, error } = await supabaseClient
                .from("download_records")
                .insert({
                    file_id: fileId,
                    user_id: user.id,
                    file_title: fileTitle,
                    file_category: fileCategory,
                    user_name: profile?.full_name || profile?.username || user.email,
                    user_email: user.email,
                    downloaded_at: new Date().toISOString()
                })
                .select()
                .single();

            if (error) console.error("Error logging download:", error);
            return data;
        },

        async getMyDownloads(userId) {
            const { data, error } = await supabaseClient
                .from("download_records")
                .select("*")
                .eq("user_id", userId)
                .order("downloaded_at", { ascending: false });

            if (error) throw error;
            return data || [];
        },

        async getAllDownloads() {
            const { data, error } = await supabaseClient
                .from("download_records")
                .select("*")
                .order("downloaded_at", { ascending: false });

            if (error) throw error;
            return data || [];
        }
    },

    // -------------------------------------------------------------
    // Feedback Services
    // -------------------------------------------------------------
    feedback: {
        async submitFeedback({ type, subject, message, rating }) {
            const user = (await supabaseClient.auth.getUser()).data.user;
            const profile = (await refmansyApi.auth.getCurrentUser())?.profile;
            const normalizedType = (type || "general").toLowerCase().trim();

            const insertPayload = {
                user_id: user ? user.id : null,
                user_name: profile?.full_name || profile?.username || "Faculty Member",
                user_email: user?.email || "",
                type: normalizedType,
                subject: subject.trim(),
                message: message.trim(),
                rating: rating ? parseInt(rating) : null,
                status: "new"
            };

            // Attempt insert with 'type' column, fallback gracefully if schema not yet migrated
            try {
                const { data, error } = await supabaseClient
                    .from("feedback")
                    .insert(insertPayload)
                    .select()
                    .single();

                if (error) throw error;
                return data;
            } catch (err) {
                // If the column 'type' does not exist yet on legacy schemas, retry without it
                if (err.message && err.message.includes("type")) {
                    console.warn("Retrying feedback insert without 'type' column for legacy database compatibility...");
                    delete insertPayload.type;
                    const { data, error } = await supabaseClient
                        .from("feedback")
                        .insert(insertPayload)
                        .select()
                        .single();
                    if (error) throw error;
                    return data;
                }
                throw err;
            }
        },

        async getMyFeedback(userId) {
            const { data, error } = await supabaseClient
                .from("feedback")
                .select("*")
                .eq("user_id", userId)
                .order("created_at", { ascending: false });

            if (error) throw error;
            return data || [];
        },

        async getAllFeedback() {
            const { data, error } = await supabaseClient
                .from("feedback")
                .select("*")
                .order("created_at", { ascending: false });

            if (error) throw error;
            return data || [];
        },

        async replyFeedback(id, adminReply, status = "resolved") {
            let normalizedStatus = (status || "resolved").toLowerCase().trim();
            if (normalizedStatus === "in-progress") {
                normalizedStatus = "in_progress";
            }

            const adminUser = (await supabaseClient.auth.getUser()).data?.user;
            const adminProfile = (await refmansyApi.auth.getCurrentUser())?.profile;

            const updatePayload = {
                admin_reply: adminReply.trim(),
                status: normalizedStatus,
                updated_at: new Date().toISOString()
            };

            if (adminUser?.id) {
                updatePayload.admin_id = adminUser.id;
            }
            if (adminProfile?.full_name || adminProfile?.username) {
                updatePayload.admin_name = adminProfile.full_name || adminProfile.username;
            }

            try {
                const { data, error } = await supabaseClient
                    .from("feedback")
                    .update(updatePayload)
                    .eq("id", id)
                    .select()
                    .single();

                if (error) throw error;
                return data;
            } catch (err) {
                // If admin_id / admin_name do not exist yet on legacy schema, retry without them
                if (err.message && (err.message.includes("admin_id") || err.message.includes("admin_name"))) {
                    delete updatePayload.admin_id;
                    delete updatePayload.admin_name;
                    const { data, error } = await supabaseClient
                        .from("feedback")
                        .update(updatePayload)
                        .eq("id", id)
                        .select()
                        .single();
                    if (error) throw error;
                    return data;
                }
                throw err;
            }
        },

        async updateStatus(id, status) {
            let normalizedStatus = (status || "new").toLowerCase().trim();
            if (normalizedStatus === "in-progress") {
                normalizedStatus = "in_progress";
            }

            const { data, error } = await supabaseClient
                .from("feedback")
                .update({
                    status: normalizedStatus,
                    updated_at: new Date().toISOString()
                })
                .eq("id", id)
                .select()
                .single();

            if (error) throw error;
            return data;
        },

        async deleteFeedback(id) {
            const { error } = await supabaseClient
                .from("feedback")
                .delete()
                .eq("id", id);

            if (error) throw error;
            return true;
        }
    },

    // -------------------------------------------------------------
    // System Backup & Disaster Recovery Services
    // -------------------------------------------------------------
    backup: {
        async getSystemStats() {
            try {
                const [
                    { count: profilesCount, error: err1 },
                    { count: categoriesCount, error: err2 },
                    { count: tagsCount, error: err3 },
                    { count: researchCount, error: err4 },
                    { count: downloadsCount, error: err5 },
                    { count: feedbackCount, error: err6 }
                ] = await Promise.all([
                    supabaseClient.from("profiles").select("*", { count: "exact", head: true }),
                    supabaseClient.from("categories").select("*", { count: "exact", head: true }),
                    supabaseClient.from("tags").select("*", { count: "exact", head: true }),
                    supabaseClient.from("research_files").select("*", { count: "exact", head: true }),
                    supabaseClient.from("download_records").select("*", { count: "exact", head: true }),
                    supabaseClient.from("feedback").select("*", { count: "exact", head: true })
                ]);

                if (err1 || err2 || err3 || err4 || err5 || err6) {
                    console.warn("Some table stats notice:", { err1, err2, err3, err4, err5, err6 });
                }

                const allStorageFiles = await this.listAllStorageFiles();
                const totalStorageFiles = allStorageFiles.length;
                const totalStorageBytes = allStorageFiles.reduce((sum, f) => sum + (f.size || 0), 0);

                return {
                    profiles: profilesCount || 0,
                    categories: categoriesCount || 0,
                    tags: tagsCount || 0,
                    researchFiles: researchCount || 0,
                    downloadRecords: downloadsCount || 0,
                    feedback: feedbackCount || 0,
                    totalDatabaseRows: (profilesCount || 0) + (categoriesCount || 0) + (tagsCount || 0) + (researchCount || 0) + (downloadsCount || 0) + (feedbackCount || 0),
                    storageFilesCount: totalStorageFiles,
                    storageTotalSizeBytes: totalStorageBytes,
                    storageFormattedSize: formatBytes(totalStorageBytes)
                };
            } catch (err) {
                console.error("Error fetching system backup stats:", err);
                throw err;
            }
        },

        async listAllStorageFiles() {
            const fileList = [];
            
            async function scanFolder(folder = "") {
                const { data, error } = await supabaseClient.storage
                    .from(STORAGE_BUCKET)
                    .list(folder, { limit: 1000, sortBy: { column: "name", order: "asc" } });

                if (error) {
                    console.error("Storage list error in folder " + folder, error);
                    return;
                }

                if (!data) return;

                for (const item of data) {
                    const itemPath = folder ? `${folder}/${item.name}` : item.name;
                    if (item.id === null) {
                        // Folder: dive deeper
                        await scanFolder(itemPath);
                    } else {
                        // File object
                        fileList.push({
                            name: item.name,
                            path: itemPath,
                            size: item.metadata?.size || item.size || 0,
                            mimetype: item.metadata?.mimetype || "application/pdf",
                            updated_at: item.updated_at
                        });
                    }
                }
            }

            await scanFolder("");
            return fileList;
        },

        async exportDatabaseSnapshot() {
            const [
                { data: profiles, error: err1 },
                { data: categories, error: err2 },
                { data: tags, error: err3 },
                { data: research_files, error: err4 },
                { data: download_records, error: err5 },
                { data: feedback, error: err6 }
            ] = await Promise.all([
                supabaseClient.from("profiles").select("*").order("created_at", { ascending: true }),
                supabaseClient.from("categories").select("*").order("name", { ascending: true }),
                supabaseClient.from("tags").select("*").order("name", { ascending: true }),
                supabaseClient.from("research_files").select("*").order("created_at", { ascending: true }),
                supabaseClient.from("download_records").select("*").order("downloaded_at", { ascending: true }),
                supabaseClient.from("feedback").select("*").order("created_at", { ascending: true })
            ]);

            if (err1) throw new Error("Failed to export profiles: " + err1.message);
            if (err2) throw new Error("Failed to export categories: " + err2.message);
            if (err3) throw new Error("Failed to export tags: " + err3.message);
            if (err4) throw new Error("Failed to export research files: " + err4.message);
            if (err5) throw new Error("Failed to export download records: " + err5.message);
            if (err6) throw new Error("Failed to export feedback: " + err6.message);

            return {
                profiles: profiles || [],
                categories: categories || [],
                tags: tags || [],
                research_files: research_files || [],
                download_records: download_records || [],
                feedback: feedback || []
            };
        },

        async downloadStorageFileBlob(filePath) {
            const { data, error } = await supabaseClient.storage
                .from(STORAGE_BUCKET)
                .download(filePath);

            if (error) throw error;
            return data;
        },

        async uploadStorageFileBlob(filePath, blob, contentType = "application/pdf") {
            const { data, error } = await supabaseClient.storage
                .from(STORAGE_BUCKET)
                .upload(filePath, blob, {
                    contentType: contentType,
                    upsert: true
                });

            if (error) throw error;
            return data;
        },

        async executeDatabaseRestore(dbData, onProgress = () => {}) {
            // 1. Purge data in reverse foreign-key dependency order
            onProgress({ stage: "purge", step: 1, totalSteps: 8, message: "Purging existing download audit records..." });
            const { error: delDownErr } = await supabaseClient.from("download_records").delete().neq("id", "00000000-0000-0000-0000-000000000000");
            if (delDownErr) console.warn("Download records purge notice:", delDownErr.message);

            onProgress({ stage: "purge", step: 2, totalSteps: 8, message: "Purging existing user feedback..." });
            const { error: delFeedErr } = await supabaseClient.from("feedback").delete().neq("id", "00000000-0000-0000-0000-000000000000");
            if (delFeedErr) console.warn("Feedback purge notice:", delFeedErr.message);

            onProgress({ stage: "purge", step: 3, totalSteps: 8, message: "Purging existing research metadata records..." });
            const { error: delResErr } = await supabaseClient.from("research_files").delete().neq("id", "00000000-0000-0000-0000-000000000000");
            if (delResErr) console.warn("Research files purge notice:", delResErr.message);

            onProgress({ stage: "purge", step: 4, totalSteps: 8, message: "Purging existing tags and categories..." });
            await supabaseClient.from("tags").delete().neq("id", "00000000-0000-0000-0000-000000000000");
            await supabaseClient.from("categories").delete().neq("id", "00000000-0000-0000-0000-000000000000");

            // 2. Insert data in primary foreign-key dependency order
            // Profiles (Upsert to prevent conflict with current admin profile)
            if (dbData.profiles && dbData.profiles.length > 0) {
                onProgress({ stage: "insert", step: 5, totalSteps: 8, message: `Restoring ${dbData.profiles.length} user profiles...` });
                for (let i = 0; i < dbData.profiles.length; i += 50) {
                    const batch = dbData.profiles.slice(i, i + 50);
                    const { error } = await supabaseClient.from("profiles").upsert(batch, { onConflict: "id" });
                    if (error) console.warn("Profile upsert notice:", error.message);
                }
            }

            // Categories & Tags
            if (dbData.categories && dbData.categories.length > 0) {
                onProgress({ stage: "insert", step: 6, totalSteps: 8, message: `Restoring ${dbData.categories.length} categories & tags...` });
                for (let i = 0; i < dbData.categories.length; i += 50) {
                    const batch = dbData.categories.slice(i, i + 50);
                    const { error } = await supabaseClient.from("categories").upsert(batch, { onConflict: "id" });
                    if (error) console.warn("Category insert notice:", error.message);
                }
            }

            if (dbData.tags && dbData.tags.length > 0) {
                for (let i = 0; i < dbData.tags.length; i += 50) {
                    const batch = dbData.tags.slice(i, i + 50);
                    const { error } = await supabaseClient.from("tags").upsert(batch, { onConflict: "id" });
                    if (error) console.warn("Tag insert notice:", error.message);
                }
            }

            // Research Files
            if (dbData.research_files && dbData.research_files.length > 0) {
                onProgress({ stage: "insert", step: 7, totalSteps: 8, message: `Restoring ${dbData.research_files.length} research records...` });
                for (let i = 0; i < dbData.research_files.length; i += 50) {
                    const batch = dbData.research_files.slice(i, i + 50);
                    const { error } = await supabaseClient.from("research_files").upsert(batch, { onConflict: "id" });
                    if (error) throw new Error("Failed to restore research records: " + error.message);
                }
            }

            // Download Records & Feedback (Analytics & Metrics restoration)
            onProgress({ stage: "insert", step: 8, totalSteps: 8, message: "Restoring download analytics and feedback logs..." });
            if (dbData.download_records && dbData.download_records.length > 0) {
                for (let i = 0; i < dbData.download_records.length; i += 50) {
                    const batch = dbData.download_records.slice(i, i + 50);
                    const { error } = await supabaseClient.from("download_records").upsert(batch, { onConflict: "id" });
                    if (error) console.warn("Download records insert notice:", error.message);
                }
            }

            if (dbData.feedback && dbData.feedback.length > 0) {
                for (let i = 0; i < dbData.feedback.length; i += 50) {
                    const batch = dbData.feedback.slice(i, i + 50);
                    const { error } = await supabaseClient.from("feedback").upsert(batch, { onConflict: "id" });
                    if (error) console.warn("Feedback insert notice:", error.message);
                }
            }

            return true;
        }
    }
};

// -----------------------------------------------------------------
// Normalization Helper Functions
// Bridge Supabase column formats with existing UI expectations
// -----------------------------------------------------------------
function normalizeResearchFile(row) {
    if (!row) return null;
    return {
        id: row.id,
        title: row.title || "",
        researcher: row.researcher || "",
        coResearchers: row.co_researchers || "",
        category: row.category || "",
        publicationYear: row.publication_year || "",
        department: row.department || "",
        researchType: row.research_type || "",
        description: row.description || "",
        keywords: row.keywords || "",
        filePath: row.file_path || null,
        fileName: row.file_name || "Document.pdf",
        fileSize: row.file_size ? formatBytes(row.file_size) : "N/A",
        fileSizeBytes: row.file_size || 0,
        fileType: row.file_type || "application/pdf",
        ownerId: row.owner_id,
        uploadedBy: row.profiles?.username || row.profiles?.full_name || "Faculty",
        uploadedByEmail: row.profiles?.email || "",
        status: (row.status || "pending").toLowerCase(),
        reviewComment: row.review_comment || "",
        reviewedBy: row.reviewed_by || "",
        reviewedDate: row.reviewed_at ? new Date(row.reviewed_at).toLocaleDateString() : "",
        dateUploaded: row.created_at ? new Date(row.created_at).toLocaleString() : "",
        createdAt: row.created_at,
        updatedAt: row.updated_at
    };
}

function normalizeUserProfile(row) {
    if (!row) return null;
    return {
        id: row.id,
        fullname: row.full_name || "",
        username: row.username || "",
        email: row.email || "",
        role: row.role || "faculty",
        status: row.status || "active",
        dateCreated: row.created_at ? new Date(row.created_at).toLocaleString() : ""
    };
}

function formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

// Make globally available
window.refmansyApi = refmansyApi;
