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

            const { data, error } = await supabaseClient.auth.signUp({
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

        // Resend signup confirmation OTP
        async resendSignUpOtp(email) {
            const { data, error } = await supabaseClient.auth.resend({
                type: "signup",
                email: email.trim()
            });
            if (error) throw error;
            return data;
        },

        // Request password reset OTP
        async sendPasswordResetOtp(email) {
            const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email.trim());
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
                const user = (await supabaseClient.auth.getUser()).data.user;
                const cleanFileName = newFileObj.name.replace(/[^a-zA-Z0-9.-]/g, "_");
                const path = `${user.id}/${Date.now()}_${cleanFileName}`;

                const { error: uploadError } = await supabaseClient.storage
                    .from(STORAGE_BUCKET)
                    .upload(path, newFileObj, { upsert: true });

                if (uploadError) throw uploadError;

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
        async submitFeedback({ subject, message, rating }) {
            const user = (await supabaseClient.auth.getUser()).data.user;
            const profile = (await refmansyApi.auth.getCurrentUser())?.profile;

            const { data, error } = await supabaseClient
                .from("feedback")
                .insert({
                    user_id: user ? user.id : null,
                    user_name: profile?.full_name || profile?.username || "Faculty Member",
                    user_email: user?.email || "",
                    subject: subject.trim(),
                    message: message.trim(),
                    rating: rating ? parseInt(rating) : null,
                    status: "new"
                })
                .select()
                .single();

            if (error) throw error;
            return data;
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
            const { data, error } = await supabaseClient
                .from("feedback")
                .update({
                    admin_reply: adminReply.trim(),
                    status: status,
                    updated_at: new Date().toISOString()
                })
                .eq("id", id)
                .select()
                .single();

            if (error) throw error;
            return data;
        },

        async updateStatus(id, status) {
            const { data, error } = await supabaseClient
                .from("feedback")
                .update({
                    status: status,
                    updated_at: new Date().toISOString()
                })
                .eq("id", id)
                .select()
                .single();

            if (error) throw error;
            return data;
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
