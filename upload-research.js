// ================================================================
// Refmansy Upload Research (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;

const researchForm = document.getElementById("researchForm");
const researchFileInput = document.getElementById("researchFile");
const fileUploadArea = document.getElementById("fileUploadArea");
const uploadPlaceholder = document.getElementById("uploadPlaceholder");
const selectedFileDisplay = document.getElementById("selectedFile");
const selectedFileName = document.getElementById("selectedFileName");
const selectedFileSize = document.getElementById("selectedFileSize");
const formMessage = document.getElementById("formMessage");
const submitButton = document.getElementById("submitButton");
const existingFileMessage = document.getElementById("existingFileMessage");

let selectedPDF = null;
let existingFile = null;
let editingFileId = null;

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

// Setup file picker and drag-and-drop
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
}

function removeSelectedFile() {
    selectedPDF = null;
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

// Form Submission
function setupForm() {
    if (!researchForm) return;

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

        try {
            submitButton.disabled = true;
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
            submitButton.innerHTML = `<i class="fa-solid fa-upload"></i> Submit Research`;
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