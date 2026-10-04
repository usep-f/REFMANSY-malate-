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

        async checkDuplicateTitle(title, excludeId = null, threshold = 0.75) {
            if (!title || title.trim().length < 4) return [];

            const cleanInput = title.trim();

            // 1. Try Supabase Postgres RPC if similarity extension & function are active
            try {
                const { data, error } = await supabaseClient.rpc("check_title_similarity", {
                    input_title: cleanInput,
                    similarity_threshold: threshold,
                    exclude_file_id: excludeId || null
                });

                if (!error && Array.isArray(data)) {
                    return data.map(item => ({
                        id: item.id,
                        title: item.title,
                        researcher: item.researcher,
                        category: item.category,
                        publicationYear: item.publication_year,
                        status: item.status,
                        similarityScore: item.similarity_score || 0,
                        similarityPct: Math.round((item.similarity_score || 0) * 100)
                    }));
                }
            } catch (rpcErr) {
                console.warn("Postgres similarity RPC notice, using client algorithm fallback:", rpcErr);
            }

            // 2. High-performance Client-Side Fallback Matching (Dice Bi-gram & Token Jaccard Similarity)
            try {
                const allFiles = await this.getAllFiles();
                const matches = [];

                for (const file of allFiles) {
                    if (excludeId && file.id === excludeId) continue;
                    if (!file.title) continue;

                    const score = calculateTitleSimilarityScore(cleanInput, file.title);
                    if (score >= threshold) {
                        matches.push({
                            id: file.id,
                            title: file.title,
                            researcher: file.researcher,
                            category: file.category,
                            publicationYear: file.publicationYear,
                            status: file.status,
                            similarityScore: score,
                            similarityPct: Math.round(score * 100)
                        });
                    }
                }

                // Sort descending by similarity score
                matches.sort((a, b) => b.similarityScore - a.similarityScore);
                return matches.slice(0, 5);
            } catch (err) {
                console.error("Error during client-side duplicate checking:", err);
                return [];
            }
        },

        async checkDuplicateFileHash(fileHash, excludeId = null) {
            if (!fileHash) return [];

            // 1. Try Supabase Postgres RPC
            try {
                const { data, error } = await supabaseClient.rpc("check_duplicate_file_hash", {
                    input_file_hash: fileHash,
                    exclude_file_id: excludeId || null
                });

                if (!error && Array.isArray(data)) {
                    return data.map(item => ({
                        id: item.id,
                        title: item.title,
                        researcher: item.researcher,
                        category: item.category,
                        publicationYear: item.publication_year,
                        fileName: item.file_name,
                        fileSize: item.file_size ? formatBytes(item.file_size) : "N/A",
                        fileSizeBytes: item.file_size || 0,
                        status: item.status
                    }));
                }
            } catch (rpcErr) {
                console.warn("Postgres file hash RPC notice, querying table directly:", rpcErr);
            }

            // 2. Direct Query Fallback on research_files table
            try {
                let query = supabaseClient
                    .from("research_files")
                    .select("id, title, researcher, category, publication_year, file_name, file_size, status")
                    .eq("file_hash", fileHash);

                if (excludeId) {
                    query = query.neq("id", excludeId);
                }

                const { data, error } = await query;
                if (error) throw error;

                return (data || []).map(item => ({
                    id: item.id,
                    title: item.title,
                    researcher: item.researcher,
                    category: item.category,
                    publicationYear: item.publication_year,
                    fileName: item.file_name,
                    fileSize: item.file_size ? formatBytes(item.file_size) : "N/A",
                    fileSizeBytes: item.file_size || 0,
                    status: item.status
                }));
            } catch (err) {
                console.error("Error during file hash duplicate checking:", err);
                return [];
            }
        },

        async createResearchFile(payload, fileObj) {
            // 1. Strict Title Duplication Prevention Guard
            const titleDuplicates = await this.checkDuplicateTitle(payload.title, null, 0.80);
            if (titleDuplicates && titleDuplicates.length > 0) {
                const topMatch = titleDuplicates[0];
                const msg = `Duplicate Detected: A similar research document already exists in the repository: "${topMatch.title}" by ${topMatch.researcher} (${topMatch.similarityPct}% match). Submissions with identical or similar titles are not permitted.`;
                const err = new Error(msg);
                err.isDuplicate = true;
                err.duplicateType = "title";
                err.matchedFile = topMatch;
                throw err;
            }

            let storagePath = null;
            let fileName = payload.fileName || (fileObj ? fileObj.name : "document.pdf");
            let fileSize = payload.fileSize || (fileObj ? fileObj.size : 0);
            let fileHash = payload.fileHash || null;

            // 2. Strict Binary PDF Content Hashing Guard (SHA-256)
            if (fileObj) {
                if (!fileHash) {
                    fileHash = await computeFileSha256(fileObj);
                }

                if (fileHash) {
                    const hashDuplicates = await this.checkDuplicateFileHash(fileHash);
                    if (hashDuplicates && hashDuplicates.length > 0) {
                        const topHashMatch = hashDuplicates[0];
                        const msg = `Duplicate File Detected: This exact PDF document has already been submitted to the repository under the title: "${topHashMatch.title}" by ${topHashMatch.researcher} (${topHashMatch.publicationYear}). Submissions of identical PDF files are prohibited even if submitted under different titles.`;
                        const err = new Error(msg);
                        err.isDuplicate = true;
                        err.duplicateType = "file_hash";
                        err.matchedFile = topHashMatch;
                        throw err;
                    }
                }

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
                    title: payload.title.trim(),
                    researcher: payload.researcher.trim(),
                    co_researchers: payload.coResearchers ? payload.coResearchers.trim() : "",
                    department: payload.department ? payload.department.trim() : "",
                    research_type: payload.researchType || "",
                    category: payload.category,
                    publication_year: String(payload.publicationYear),
                    description: payload.description ? payload.description.trim() : "",
                    keywords: payload.keywords ? payload.keywords.trim() : "",
                    file_path: storagePath,
                    file_name: fileName,
                    file_size: fileSize,
                    file_hash: fileHash,
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
            // 1. Strict Duplication Prevention Guard for updates (excluding self)
            const titleDuplicates = await this.checkDuplicateTitle(payload.title, fileId, 0.80);
            if (titleDuplicates && titleDuplicates.length > 0) {
                const topMatch = titleDuplicates[0];
                const msg = `Duplicate Detected: Another research document with a similar title already exists: "${topMatch.title}" by ${topMatch.researcher} (${topMatch.similarityPct}% match).`;
                const err = new Error(msg);
                err.isDuplicate = true;
                err.duplicateType = "title";
                err.matchedFile = topMatch;
                throw err;
            }

            let fileHash = payload.fileHash || null;

            // 2. Binary SHA-256 Duplicate Check on New File
            if (newFileObj) {
                if (!fileHash) {
                    fileHash = await computeFileSha256(newFileObj);
                }

                if (fileHash) {
                    const hashDuplicates = await this.checkDuplicateFileHash(fileHash, fileId);
                    if (hashDuplicates && hashDuplicates.length > 0) {
                        const topHashMatch = hashDuplicates[0];
                        const msg = `Duplicate File Detected: This exact PDF document has already been submitted to the repository under the title: "${topHashMatch.title}" by ${topHashMatch.researcher} (${topHashMatch.publicationYear}).`;
                        const err = new Error(msg);
                        err.isDuplicate = true;
                        err.duplicateType = "file_hash";
                        err.matchedFile = topHashMatch;
                        throw err;
                    }
                }
            }

            const updates = {
                title: payload.title.trim(),
                researcher: payload.researcher.trim(),
                co_researchers: payload.coResearchers ? payload.coResearchers.trim() : "",
                department: payload.department ? payload.department.trim() : "",
                research_type: payload.researchType || "",
                category: payload.category,
                publication_year: String(payload.publicationYear),
                description: payload.description ? payload.description.trim() : "",
                keywords: payload.keywords ? payload.keywords.trim() : "",
                status: "pending", // resets to pending for re-review
                review_comment: null,
                reviewed_by: null,
                reviewed_at: null,
                updated_at: new Date().toISOString()
            };

            if (fileHash) {
                updates.file_hash = fileHash;
            }

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

            return { success: true, message: "System data restored successfully." };
        },

        async getStorageQuotaInfo(maxCapacityGb = 100) {
            try {
                const stats = await this.getSystemStats();
                const maxBytes = maxCapacityGb * 1024 * 1024 * 1024;
                const usedBytes = stats.storageTotalSizeBytes || 0;
                const remainingBytes = Math.max(0, maxBytes - usedBytes);
                const usedPercentage = Math.min(100, Math.round((usedBytes / maxBytes) * 1000) / 10);
                
                // Typical thesis PDF size is ~3 MB, maximum single upload limit is 10 MB
                const avgThesisSizeBytes = 3 * 1024 * 1024;
                const maxSingleUploadBytes = 10 * 1024 * 1024;
                
                const totalThesesCapacity = Math.floor(maxBytes / avgThesisSizeBytes);
                const worstCaseCapacity = Math.floor(maxBytes / maxSingleUploadBytes);
                const currentThesesCount = stats.researchFiles || 0;
                const remainingThesesSlots = Math.max(0, Math.floor(remainingBytes / avgThesisSizeBytes));

                return {
                    maxCapacityGb,
                    maxCapacityBytes: maxBytes,
                    maxCapacityFormatted: `${maxCapacityGb} GB`,
                    usedBytes,
                    usedFormatted: stats.storageFormattedSize,
                    remainingBytes,
                    remainingFormatted: formatBytes(remainingBytes),
                    usedPercentage,
                    currentThesesCount,
                    totalThesesCapacity,
                    worstCaseCapacity,
                    remainingThesesSlots,
                    avgThesisSizeFormatted: "3.0 MB",
                    maxSingleUploadFormatted: "10.0 MB",
                    retentionPolicies: {
                        approvedResearch: "Permanent (Indefinite Institutional Archive)",
                        rejectedResearch: "90 Days (Revision Grace Period)",
                        downloadAuditLogs: "5 Years (DepEd / CHED Audit Trail)",
                        offlineBackups: "User / Administrator Managed Snapshots"
                    }
                };
            } catch (err) {
                console.error("Error calculating storage quota info:", err);
                throw err;
            }
        }
    },

    // -------------------------------------------------------------
    // Automated Research Intelligence & Analytics Summary Engine
    // -------------------------------------------------------------
    analytics: {
        generateExecutiveFindings(files = [], categories = [], downloads = [], users = []) {
            if (!files || files.length === 0) {
                return {
                    headline: "Institutional Repository Awaiting Initial Research Submissions",
                    summaryParagraph: "No research documents currently meet the active filter criteria. Upload submissions to generate automated institutional analytics.",
                    summaryText: "No research documents currently meet the active filter criteria. Upload submissions to generate automated institutional analytics.",
                    total: 0,
                    approved: 0,
                    pending: 0,
                    rejected: 0,
                    approvalRate: 0,
                    pendingRate: 0,
                    rejectedRate: 0,
                    totalVolume: 0,
                    findings: [
                        { tag: "Publication Health", title: "0% Approval Rate", desc: "No published thesis records matching active criteria." },
                        { tag: "Disciplinary Focus", title: "No Category Dominance", desc: "Academic discipline breakdown will appear once theses are uploaded." },
                        { tag: "Evaluation Pipeline", title: "Empty Evaluation Queue", desc: "No pending or unresolved thesis submissions in this view." },
                        { tag: "Readership & Faculty", title: "No Download Logs", desc: "Faculty and student access metrics will populate upon user downloads." }
                    ],
                    keyFindings: [
                        { icon: "fa-database", title: "No Submissions Found", desc: "No research records matched the current search query or date filters." }
                    ],
                    recommendations: [
                        "Encourage faculty members to submit their active or completed research papers."
                    ]
                };
            }

            const total = files.length;
            const approved = files.filter(f => f.status === "approved").length;
            const pending = files.filter(f => f.status === "pending").length;
            const rejected = files.filter(f => f.status === "rejected").length;

            const approvalRate = Math.round((approved / total) * 1000) / 10;
            const pendingRate = Math.round((pending / total) * 1000) / 10;
            const rejectedRate = Math.round((rejected / total) * 1000) / 10;

            // Category breakdown & dominance calculation
            const catMap = {};
            files.forEach(f => {
                const c = f.category || "Uncategorized";
                catMap[c] = (catMap[c] || 0) + 1;
            });
            const sortedCategories = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
            const topCategory = sortedCategories[0] || ["General", 0];
            const topCatShare = Math.round((topCategory[1] / total) * 100);

            // Dynamic Findings List
            const findings = [
                {
                    tag: "Publication Health",
                    title: `${approvalRate}% Approval Rate`,
                    desc: `${approved} of ${total} theses meet institutional criteria and are archived for faculty and student reference.`
                },
                {
                    tag: "Disciplinary Focus",
                    title: `Top Domain: "${topCategory[0]}"`,
                    desc: `The "${topCategory[0]}" domain leads with ${topCategory[1]} thesis papers (${topCatShare}% share of submissions).`
                },
                {
                    tag: "Evaluation Pipeline",
                    title: pending > 0 ? `${pending} Pending Reviews` : "Zero Review Backlog",
                    desc: pending > 0 
                        ? `${pendingRate}% of repository volume is currently awaiting committee evaluation and administrator approval.`
                        : "All submitted research papers have been reviewed and resolved by administrators."
                },
                {
                    tag: "Readership & Faculty",
                    title: (downloads && downloads.length > 0) ? `${downloads.length} Total Downloads` : `${users && users.length ? users.length : "Active"} Faculty Members`,
                    desc: (downloads && downloads.length > 0)
                        ? `Repository readership indicates strong student and faculty engagement across cataloged papers.`
                        : `Active faculty community contributing and referencing academic research.`
                }
            ];

            // Actionable Strategic Recommendations
            const recommendations = [];

            if (pending >= 5) {
                recommendations.push(`Prioritize the ${pending} pending research files to shorten peer review latency and accelerate publishing.`);
            }

            if (sortedCategories.length >= 3) {
                const leastCategories = sortedCategories.filter(c => c[1] <= 2);
                if (leastCategories.length > 0) {
                    const leastNames = leastCategories.slice(0, 2).map(c => `"${c[0]}"`).join(" and ");
                    recommendations.push(`Encourage research submissions in underrepresented fields such as ${leastNames} to balance academic output.`);
                }
            }

            if (rejected > 0) {
                recommendations.push(`Review administrator remarks on ${rejected} rejected paper(s) with authors to assist them with formatting revisions.`);
            }

            if (recommendations.length === 0) {
                recommendations.push("Maintain current institutional standards and conduct quarterly research dissemination seminars.");
            }

            const headline = `Institutional Research Health: ${approvalRate}% Approved (${approved}/${total} Theses)`;
            const summaryText = `The REFMANSY repository currently monitors ${total} research document(s) across ${sortedCategories.length} academic disciplines. ${approved} paper(s) are officially approved, ${pending} are under review, and ${rejected} have been rejected with feedback. Leading domain: ${topCategory[0]} (${topCatShare}% share).`;

            return {
                headline,
                summaryParagraph: summaryText,
                summaryText,
                total,
                approved,
                pending,
                rejected,
                approvalRate,
                pendingRate,
                rejectedRate,
                totalVolume: total,
                approvedCount: approved,
                pendingCount: pending,
                rejectedCount: rejected,
                topCategory: topCategory[0],
                topCategoryCount: topCategory[1],
                topCategoryShare: topCatShare,
                findings,
                keyFindings: findings,
                recommendations
            };
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
        fileHash: row.file_hash || null,
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

// -----------------------------------------------------------------
// Duplication Detection & String / Binary Hashing Algorithms
// -----------------------------------------------------------------
async function computeFileSha256(file) {
    if (!file) return null;
    try {
        let arrayBuffer;
        if (file instanceof ArrayBuffer) {
            arrayBuffer = file;
        } else if (file && file.buffer && (file.buffer instanceof ArrayBuffer || file instanceof Uint8Array)) {
            arrayBuffer = file.buffer.slice(file.byteOffset || 0, (file.byteOffset || 0) + (file.byteLength || file.length));
        } else if (file.arrayBuffer && typeof file.arrayBuffer === "function") {
            arrayBuffer = await file.arrayBuffer();
        } else if (typeof FileReader !== "undefined" && file instanceof Blob) {
            arrayBuffer = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result);
                reader.onerror = reject;
                reader.readAsArrayBuffer(file);
            });
        } else {
            return null;
        }

        // Native Web Crypto API SHA-256 Checksum
        if (typeof crypto !== "undefined" && crypto.subtle && typeof crypto.subtle.digest === "function") {
            const hashBuffer = await crypto.subtle.digest("SHA-256", arrayBuffer);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
        }

        // Fast fallback hashing for non-subtle contexts
        let hash = 0;
        const view = new Uint8Array(arrayBuffer);
        for (let i = 0; i < view.length; i++) {
            hash = ((hash << 5) - hash + view[i]) | 0;
        }
        return "fallback_" + Math.abs(hash).toString(16) + "_" + view.length;
    } catch (e) {
        console.warn("Could not compute SHA-256 file hash:", e);
        return null;
    }
}

function normalizeTitleText(text) {
    if (!text) return "";
    return text
        .toLowerCase()
        .replace(/['"“”‘’`]/g, "")
        .replace(/[^a-z0-9\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
}

function getBigrams(str) {
    const bigrams = new Set();
    const s = normalizeTitleText(str);
    for (let i = 0; i < s.length - 1; i++) {
        bigrams.add(s.substring(i, i + 2));
    }
    return bigrams;
}

function calculateTitleSimilarityScore(str1, str2) {
    if (!str1 || !str2) return 0;
    const norm1 = normalizeTitleText(str1);
    const norm2 = normalizeTitleText(str2);

    if (norm1 === norm2) return 1.0;
    if (!norm1 || !norm2) return 0.0;

    // 1. Bigram Dice Coefficient (Character-level similarity)
    const bigrams1 = getBigrams(norm1);
    const bigrams2 = getBigrams(norm2);
    let intersectionCount = 0;

    bigrams1.forEach(bg => {
        if (bigrams2.has(bg)) intersectionCount++;
    });

    const totalBigrams = bigrams1.size + bigrams2.size;
    const diceScore = totalBigrams > 0 ? (2.0 * intersectionCount) / totalBigrams : 0;

    // 2. Token Jaccard Similarity (Word-level similarity)
    const words1 = new Set(norm1.split(" ").filter(w => w.length > 2));
    const words2 = new Set(norm2.split(" ").filter(w => w.length > 2));
    let wordIntersect = 0;

    words1.forEach(w => {
        if (words2.has(w)) wordIntersect++;
    });

    const totalWords = words1.size + words2.size - wordIntersect;
    const jaccardScore = totalWords > 0 ? wordIntersect / totalWords : 0;

    // Weighted blend: 60% character n-gram, 40% word token match
    return Math.round((diceScore * 0.6 + jaccardScore * 0.4) * 100) / 100;
}

// Expose utilities on refmansyApi
refmansyApi.crypto = {
    computeFileSha256
};

// Make globally available
window.refmansyApi = refmansyApi;

