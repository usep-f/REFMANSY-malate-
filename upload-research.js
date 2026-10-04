// ================================================================
// Refmansy Upload Research (Supabase Backend + Anti-Duplication)
// ================================================================

let currentUser = null;
let currentProfile = null;

const researchForm = document.getElementById("researchForm");
const researchTitleInput = document.getElementById("researchTitle");
const titleCheckBadge = document.getElementById("titleCheckBadge");
const duplicateWarningCard = document.getElementById("duplicateWarningCard");
const duplicateWarningTitle = document.getElementById("duplicateWarningTitle");
const duplicateWarningSubtitle = document.getElementById("duplicateWarningSubtitle");
const duplicateMatchesList = document.getElementById("duplicateMatchesList");
const duplicateActionHint = document.getElementById("duplicateActionHint");

const researchFileInput = document.getElementById("researchFile");
const fileUploadArea = document.getElementById("fileUploadArea");
const uploadPlaceholder = document.getElementById("uploadPlaceholder");
const selectedFileDisplay = document.getElementById("selectedFile");
const selectedFileName = document.getElementById("selectedFileName");
const selectedFileSize = document.getElementById("selectedFileSize");
const fileCheckBadge = document.getElementById("fileCheckBadge");
const fileDuplicateWarningCard = document.getElementById("fileDuplicateWarningCard");
const fileDuplicateWarningTitle = document.getElementById("fileDuplicateWarningTitle");
const fileDuplicateWarningSubtitle = document.getElementById("fileDuplicateWarningSubtitle");
const fileDuplicateMatchesList = document.getElementById("fileDuplicateMatchesList");
const fileDuplicateActionHint = document.getElementById("fileDuplicateActionHint");
const formMessage = document.getElementById("formMessage");
const submitButton = document.getElementById("submitButton");
const existingFileMessage = document.getElementById("existingFileMessage");

let selectedPDF = null;
let selectedFileHash = null;
let isFileHashBlocked = false;
let existingFile = null;
let editingFileId = null;

let isTitleBlocked = false;
let checkTitleDebounceTimer = null;

const maximumFileSize = 10 * 1024 * 1024; // 10 MB limit for Supabase Storage

// Protect Page with Supabase Auth Guard
window.refmansyAuthGuard.init("faculty", function (profile, user) {
    currentUser = user;
    currentProfile = profile;
    initializePage();
});

async function initializePage() {
    await loadCategoryOptions();
    setDefaultValues();
    setupFileUpload();
    setupDuplicateTitleChecker();
    setupForm();
    await checkEditMode();
}

// Load categories dynamically from Supabase
async function loadCategoryOptions() {
    const categorySelect = document.getElementById("category");
    if (!categorySelect) return;
    categorySelect.innerHTML = `<option value="">Select a category</option>`;

    try {
        const categories = await window.refmansyApi.categories.getAll();
        if (categories && categories.length > 0) {
            categories.forEach(cat => {
                const option = document.createElement("option");
                option.value = cat.name;
                option.textContent = cat.name;
                categorySelect.appendChild(option);
            });
        } else {
            const defaults = [
                "Education", "Information Technology", "Engineering",
                "Business", "Health", "Social Science", "Agriculture",
                "Environmental Science", "Other"
            ];
            defaults.forEach(name => {
                const opt = document.createElement("option");
                opt.value = name;
                opt.textContent = name;
                categorySelect.appendChild(opt);
            });
        }
    } catch (err) {
        console.error("Error loading categories:", err);
    }
}

function setDefaultValues() {
    const researcherEl = document.getElementById("researcher");
    if (researcherEl && currentProfile) {
        researcherEl.value = currentProfile.full_name || currentProfile.username || "";
    }
    const pubYearEl = document.getElementById("publicationYear");
    if (pubYearEl) {
        pubYearEl.value = new Date().getFullYear();
    }
}

// -------------------------------------------------------------
// Real-Time Duplicate & Similarity Title Detection Engine
// -------------------------------------------------------------
function setupDuplicateTitleChecker() {
    if (!researchTitleInput) return;

    researchTitleInput.addEventListener("input", function () {
        const title = this.value.trim();
        clearTimeout(checkTitleDebounceTimer);

        if (title.length < 4) {
            resetDuplicateUI();
            return;
        }

        // Show checking status in badge
        if (titleCheckBadge) {
            titleCheckBadge.style.display = "inline-flex";
            titleCheckBadge.className = "title-check-badge checking";
            titleCheckBadge.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Checking repository...`;
        }

        checkTitleDebounceTimer = setTimeout(async () => {
            await verifyTitleSimilarity(title);
        }, 400);
    });

    researchTitleInput.addEventListener("blur", function () {
        const title = this.value.trim();
        if (title.length >= 4) {
            verifyTitleSimilarity(title);
        }
    });
}

async function verifyTitleSimilarity(title) {
    if (!title || title.trim().length < 4) {
        resetDuplicateUI();
        return [];
    }

    try {
        const matches = await window.refmansyApi.research.checkDuplicateTitle(
            title,
            editingFileId,
            0.70 // Start capturing similar titles from 70% threshold
        );

        renderDuplicateCheckResults(matches, title);
        return matches;
    } catch (err) {
        console.error("Title similarity check error:", err);
        return [];
    }
}

function renderDuplicateCheckResults(matches, inputTitle) {
    if (!duplicateWarningCard || !duplicateMatchesList) return;

    if (!matches || matches.length === 0) {
        // Unique Title Verified
        isTitleBlocked = false;
        duplicateWarningCard.style.display = "none";
        duplicateMatchesList.innerHTML = "";

        if (titleCheckBadge) {
            titleCheckBadge.style.display = "inline-flex";
            titleCheckBadge.className = "title-check-badge";
            titleCheckBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> Title Verified Unique`;
        }
        return;
    }

    const highestMatch = matches[0];
    const isStrictDuplicate = highestMatch.similarityPct >= 80;

    isTitleBlocked = isStrictDuplicate;

    // Adjust Warning Card Appearance
    duplicateWarningCard.style.display = "block";
    duplicateWarningCard.className = `duplicate-warning-card ${isStrictDuplicate ? "blocked" : ""}`;

    if (isStrictDuplicate) {
        if (duplicateWarningTitle) {
            duplicateWarningTitle.textContent = "Upload Blocked: Duplicate Document Found";
        }
        if (duplicateWarningSubtitle) {
            duplicateWarningSubtitle.textContent = `A research document with an identical or ${highestMatch.similarityPct}% similar title already exists in the system. Duplicate uploads are prohibited.`;
        }
        if (duplicateActionHint) {
            duplicateActionHint.innerHTML = `<i class="fa-solid fa-ban"></i> <strong>Action Required:</strong> Please verify your paper or modify the title before submitting.`;
        }
        if (titleCheckBadge) {
            titleCheckBadge.style.display = "inline-flex";
            titleCheckBadge.className = "title-check-badge";
            titleCheckBadge.style.backgroundColor = "#fee2e2";
            titleCheckBadge.style.color = "#991b1b";
            titleCheckBadge.style.borderColor = "#fca5a5";
            titleCheckBadge.innerHTML = `<i class="fa-solid fa-circle-xmark"></i> Duplicate Title Found (${highestMatch.similarityPct}%)`;
        }
    } else {
        if (duplicateWarningTitle) {
            duplicateWarningTitle.textContent = "Potential Similarity Notice";
        }
        if (duplicateWarningSubtitle) {
            duplicateWarningSubtitle.textContent = `We noticed existing research with a somewhat similar title (${highestMatch.similarityPct}% similarity). Please verify this is a distinct research work.`;
        }
        if (duplicateActionHint) {
            duplicateActionHint.innerHTML = `<i class="fa-solid fa-circle-info"></i> Advisory: You may still proceed if this is an independent, distinct research study.`;
        }
        if (titleCheckBadge) {
            titleCheckBadge.style.display = "inline-flex";
            titleCheckBadge.className = "title-check-badge checking";
            titleCheckBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Moderate Similarity (${highestMatch.similarityPct}%)`;
        }
    }

    // Render list of matching files
    duplicateMatchesList.innerHTML = "";
    matches.forEach(m => {
        const item = document.createElement("div");
        item.className = "duplicate-match-item";

        const pillClass = m.similarityPct >= 80 ? "similarity-high" : "similarity-medium";
        const statusBadge = m.status === "approved"
            ? `<span style="color: #16a34a; font-weight: 600;">Approved</span>`
            : m.status === "pending"
            ? `<span style="color: #d97706; font-weight: 600;">Pending Review</span>`
            : `<span style="color: #dc2626; font-weight: 600;">Rejected</span>`;

        item.innerHTML = `
            <div class="match-info">
                <div class="match-title" title="${escapeHtml(m.title)}">${escapeHtml(m.title)}</div>
                <div class="match-meta">
                    <span><i class="fa-solid fa-user-pen"></i> ${escapeHtml(m.researcher || "Author")}</span>
                    <span><i class="fa-solid fa-tag"></i> ${escapeHtml(m.category || "General")}</span>
                    <span><i class="fa-regular fa-calendar"></i> ${m.publicationYear || "N/A"}</span>
                    <span>Status: ${statusBadge}</span>
                </div>
            </div>
            <div class="match-similarity-pill ${pillClass}">
                <i class="fa-solid fa-percent"></i> ${m.similarityPct}% Match
            </div>
        `;

        duplicateMatchesList.appendChild(item);
    });
}

function resetDuplicateUI() {
    isTitleBlocked = false;
    if (duplicateWarningCard) duplicateWarningCard.style.display = "none";
    if (duplicateMatchesList) duplicateMatchesList.innerHTML = "";
    if (titleCheckBadge) titleCheckBadge.style.display = "none";
}

// -------------------------------------------------------------
// File Upload & Picker Handlers
// -------------------------------------------------------------
function setupFileUpload() {
    const chooseBtn = document.getElementById("chooseFileButton");
    if (chooseBtn) {
        chooseBtn.addEventListener("click", function () {
            researchFileInput.click();
        });
    }

    if (researchFileInput) {
        researchFileInput.addEventListener("change", function () {
            if (this.files.length > 0) {
                handleSelectedFile(this.files[0]);
            }
        });
    }

    const removeBtn = document.getElementById("removeFileButton");
    if (removeBtn) {
        removeBtn.addEventListener("click", removeSelectedFile);
    }

    if (fileUploadArea) {
        fileUploadArea.addEventListener("dragover", function (e) {
            e.preventDefault();
            this.classList.add("dragging");
        });

        fileUploadArea.addEventListener("dragleave", function () {
            this.classList.remove("dragging");
        });

        fileUploadArea.addEventListener("drop", function (e) {
            e.preventDefault();
            this.classList.remove("dragging");
            if (e.dataTransfer.files.length > 0) {
                handleSelectedFile(e.dataTransfer.files[0]);
            }
        });
    }
}

function handleSelectedFile(file) {
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
        showFormMessage("Please upload a PDF document.", "error");
        removeSelectedFile();
        return;
    }

    if (file.size > maximumFileSize) {
        showFormMessage("The selected file exceeds the 10 MB size limit.", "error");
        removeSelectedFile();
        return;
    }

    selectedPDF = file;
    if (selectedFileName) selectedFileName.textContent = file.name;
    if (selectedFileSize) selectedFileSize.textContent = formatFileSize(file.size);

    if (uploadPlaceholder) uploadPlaceholder.style.display = "none";
    if (selectedFileDisplay) selectedFileDisplay.style.display = "flex";
    clearFormMessage();

    // Trigger instant SHA-256 binary duplicate check
    verifyFileHashDuplication(file);
}

async function verifyFileHashDuplication(file) {
    if (!file) {
        resetFileDuplicateUI();
        return [];
    }

    if (fileCheckBadge) {
        fileCheckBadge.style.display = "inline-flex";
        fileCheckBadge.className = "title-check-badge checking";
        fileCheckBadge.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Checking PDF checksum...`;
    }

    try {
        const hash = await window.refmansyApi.crypto.computeFileSha256(file);
        selectedFileHash = hash;

        if (!hash) {
            resetFileDuplicateUI();
            return [];
        }

        const duplicates = await window.refmansyApi.research.checkDuplicateFileHash(hash, editingFileId);
        renderFileDuplicateCheckResults(duplicates);
        return duplicates;
    } catch (err) {
        console.error("Error verifying file hash duplication:", err);
        return [];
    }
}

function renderFileDuplicateCheckResults(matches) {
    if (!fileDuplicateWarningCard || !fileDuplicateMatchesList) return;

    if (!matches || matches.length === 0) {
        // Unique PDF file confirmed
        isFileHashBlocked = false;
        fileDuplicateWarningCard.style.display = "none";
        fileDuplicateMatchesList.innerHTML = "";

        if (fileCheckBadge) {
            fileCheckBadge.style.display = "inline-flex";
            fileCheckBadge.className = "title-check-badge";
            fileCheckBadge.innerHTML = `<i class="fa-solid fa-circle-check"></i> PDF Verified Unique`;
        }
        return;
    }

    // Duplicate File Found -> Block Upload
    isFileHashBlocked = true;
    fileDuplicateWarningCard.style.display = "block";
    fileDuplicateWarningCard.className = "duplicate-warning-card blocked";

    const top = matches[0];
    if (fileDuplicateWarningSubtitle) {
        fileDuplicateWarningSubtitle.textContent = `This exact PDF file was already uploaded to the repository under the title "${top.title}" by ${top.researcher} (${top.publicationYear || "N/A"}).`;
    }

    if (fileCheckBadge) {
        fileCheckBadge.style.display = "inline-flex";
        fileCheckBadge.className = "title-check-badge duplicate";
        fileCheckBadge.innerHTML = `<i class="fa-solid fa-ban"></i> Identical PDF Detected`;
    }

    fileDuplicateMatchesList.innerHTML = "";
    matches.forEach(m => {
        const item = document.createElement("div");
        item.className = "duplicate-match-item";

        const statusBadge = m.status === "approved"
            ? `<span style="color: #16a34a; font-weight: 600;">Approved</span>`
            : m.status === "pending"
            ? `<span style="color: #d97706; font-weight: 600;">Pending Review</span>`
            : `<span style="color: #dc2626; font-weight: 600;">Rejected</span>`;

        item.innerHTML = `
            <div class="match-info">
                <div class="match-title" title="${escapeHtml(m.title)}">${escapeHtml(m.title)}</div>
                <div class="match-meta">
                    <span><i class="fa-solid fa-user-pen"></i> ${escapeHtml(m.researcher || "Author")}</span>
                    <span><i class="fa-solid fa-tag"></i> ${escapeHtml(m.category || "General")}</span>
                    <span><i class="fa-regular fa-calendar"></i> ${m.publicationYear || "N/A"}</span>
                    <span><i class="fa-solid fa-file-pdf"></i> ${escapeHtml(m.fileName || "document.pdf")}</span>
                    <span>Status: ${statusBadge}</span>
                </div>
            </div>
            <div class="match-similarity-pill similarity-high">
                <i class="fa-solid fa-fingerprint"></i> 100% Identical File
            </div>
        `;

        fileDuplicateMatchesList.appendChild(item);
    });
}

function resetFileDuplicateUI() {
    isFileHashBlocked = false;
    selectedFileHash = null;
    if (fileDuplicateWarningCard) fileDuplicateWarningCard.style.display = "none";
    if (fileDuplicateMatchesList) fileDuplicateMatchesList.innerHTML = "";
    if (fileCheckBadge) fileCheckBadge.style.display = "none";
}

function removeSelectedFile() {
    selectedPDF = null;
    resetFileDuplicateUI();
    if (researchFileInput) researchFileInput.value = "";
    if (uploadPlaceholder) uploadPlaceholder.style.display = "block";
    if (selectedFileDisplay) selectedFileDisplay.style.display = "none";
}

// Check edit mode
async function checkEditMode() {
    editingFileId = localStorage.getItem("refmansyEditFileId");
    if (!editingFileId) return;

    try {
        existingFile = await window.refmansyApi.research.getFileById(editingFileId);
        if (!existingFile) return;

        const pTitle = document.getElementById("pageTitle");
        if (pTitle) pTitle.textContent = "Edit Research Submission";
        const pDesc = document.getElementById("pageDescription");
        if (pDesc) pDesc.textContent = "Update your submission details or replace your research document.";
        if (submitButton) submitButton.innerHTML = `<i class="fa-solid fa-floppy-disk"></i> Save Changes`;

        const titleInput = document.getElementById("researchTitle");
        if (titleInput) titleInput.value = existingFile.title || "";
        const researcherInput = document.getElementById("researcher");
        if (researcherInput) researcherInput.value = existingFile.researcher || "";
        const coResInput = document.getElementById("coResearchers");
        if (coResInput) coResInput.value = existingFile.coResearchers || "";
        const catInput = document.getElementById("category");
        if (catInput) catInput.value = existingFile.category || "";
        const pubYearInput = document.getElementById("publicationYear");
        if (pubYearInput) pubYearInput.value = existingFile.publicationYear || "";
        const deptInput = document.getElementById("department");
        if (deptInput) deptInput.value = existingFile.department || "";
        const typeInput = document.getElementById("researchType");
        if (typeInput) typeInput.value = existingFile.researchType || "";
        const descInput = document.getElementById("description");
        if (descInput) descInput.value = existingFile.description || "";
        const kwInput = document.getElementById("keywords");
        if (kwInput) kwInput.value = existingFile.keywords || "";

        if (existingFile.fileName) {
            if (selectedFileName) selectedFileName.textContent = existingFile.fileName;
            if (selectedFileSize) selectedFileSize.textContent = existingFile.fileSize || "Existing Document";
            if (uploadPlaceholder) uploadPlaceholder.style.display = "none";
            if (selectedFileDisplay) selectedFileDisplay.style.display = "flex";
            if (existingFileMessage) {
                existingFileMessage.textContent = `Current file: ${existingFile.fileName}. Uploading a new PDF will replace it.`;
            }
        }
    } catch (err) {
        console.error("Error loading file for edit:", err);
    }
}

// -------------------------------------------------------------
// Form Submission & Pre-Flight Duplicate Check
// -------------------------------------------------------------
function setupForm() {
    if (!researchForm) return;

    const cancelBtn = document.getElementById("cancelUploadBtn");
    if (cancelBtn) {
        cancelBtn.addEventListener("click", function () {
            localStorage.removeItem("refmansyEditFileId");
        });
    }

    researchForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        const title = (document.getElementById("researchTitle")?.value || "").trim();
        const researcher = (document.getElementById("researcher")?.value || "").trim();
        const coResearchers = (document.getElementById("coResearchers")?.value || "").trim();
        const category = (document.getElementById("category")?.value || "").trim();
        const publicationYear = (document.getElementById("publicationYear")?.value || "").trim();
        const department = (document.getElementById("department")?.value || "").trim();
        const researchType = (document.getElementById("researchType")?.value || "").trim();
        const description = (document.getElementById("description")?.value || "").trim();
        const keywords = (document.getElementById("keywords")?.value || "").trim();

        if (!title || !researcher || !category || !publicationYear) {
            showFormMessage("Please fill in all required fields.", "error");
            return;
        }

        if (!editingFileId && !selectedPDF) {
            showFormMessage("Please select a PDF document to upload.", "error");
            return;
        }

        if (isFileHashBlocked) {
            showFormMessage("Cannot upload: This exact PDF document has already been registered in the repository.", "error");
            return;
        }

        if (isTitleBlocked) {
            showFormMessage("Cannot upload: A similar thesis title already exists in the repository.", "error");
            return;
        }

        try {
            submitButton.disabled = true;
            submitButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Checking Duplicates...`;
            showFormMessage("Validating title and document uniqueness...", "info");

            // 1. Pre-flight Title Similarity Verification
            const titleMatches = await verifyTitleSimilarity(title);
            if (titleMatches && titleMatches.length > 0 && titleMatches[0].similarityPct >= 80) {
                const top = titleMatches[0];
                showFormMessage(`Cannot upload: A similar thesis title already exists: "${top.title}" by ${top.researcher} (${top.similarityPct}% match). Duplicate submissions are prohibited.`, "error");
                submitButton.disabled = false;
                submitButton.innerHTML = editingFileId ? `<i class="fa-solid fa-floppy-disk"></i> Save Changes` : `<i class="fa-solid fa-upload"></i> Submit Research`;
                return;
            }

            // 2. Pre-flight Binary SHA-256 Verification
            if (selectedPDF) {
                const hashMatches = await verifyFileHashDuplication(selectedPDF);
                if (hashMatches && hashMatches.length > 0) {
                    const topHash = hashMatches[0];
                    showFormMessage(`Cannot upload: This exact PDF file was already submitted as "${topHash.title}" by ${topHash.researcher}.`, "error");
                    submitButton.disabled = false;
                    submitButton.innerHTML = editingFileId ? `<i class="fa-solid fa-floppy-disk"></i> Save Changes` : `<i class="fa-solid fa-upload"></i> Submit Research`;
                    return;
                }
            }

            submitButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Uploading & Saving...`;
            showFormMessage("Saving research submission...", "info");

            const payload = {
                title,
                researcher,
                coResearchers,
                category,
                publicationYear,
                department,
                researchType,
                description,
                keywords,
                fileHash: selectedFileHash,
                ownerId: currentProfile.id
            };

            if (editingFileId) {
                await window.refmansyApi.research.updateResearchFile(
                    editingFileId,
                    payload,
                    selectedPDF
                );
                localStorage.removeItem("refmansyEditFileId");
                showFormMessage("Research submission updated successfully! Redirecting...", "success");
            } else {
                await window.refmansyApi.research.createResearchFile(
                    payload,
                    selectedPDF
                );
                showFormMessage("Research submitted successfully for review! Redirecting...", "success");
            }

            setTimeout(function () {
                window.location.href = "my-research-files.html";
            }, 1200);
        } catch (error) {
            console.error("Submission error:", error);
            showFormMessage(error.message || "Failed to submit research.", "error");
            submitButton.disabled = false;
            submitButton.innerHTML = editingFileId ? `<i class="fa-solid fa-floppy-disk"></i> Save Changes` : `<i class="fa-solid fa-upload"></i> Submit Research`;
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

function formatFileSize(bytes) {
    if (bytes < 1024) return bytes + " B";
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
    return (bytes / (1024 * 1024)).toFixed(1) + " MB";
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