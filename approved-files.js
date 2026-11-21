// ================================================================
// Refmansy Admin Approved Files (Supabase Backend)
// ================================================================

let currentUser = null;
let currentProfile = null;
let approvedFiles = [];
let selectedFile = null;

const searchInput = document.getElementById("searchInput");
const categoryFilter = document.getElementById("categoryFilter");
const approvedFilesTable = document.getElementById("approvedFilesTable");
const detailsModal = document.getElementById("detailsModal");
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
    await loadApprovedFiles();
}

async function loadApprovedFiles() {
    try {
        if (approvedFilesTable) {
            approvedFilesTable.innerHTML = `<tr><td colspan="7" style="text-align: center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Loading approved files...</td></tr>`;
        }

        const [allFiles, categories] = await Promise.all([
            window.refmansyApi.research.getApprovedFiles(),
            window.refmansyApi.categories.getAll()
        ]);

        approvedFiles = allFiles;

        updateSummary();
        populateCategoryFilter(categories);
        filterApprovedFiles();
    } catch (err) {
        console.error("Error loading approved files:", err);
        if (approvedFilesTable) {
            approvedFilesTable.innerHTML = `<tr><td colspan="7" style="text-align: center; color: red; padding: 2rem;">Error: ${err.message}</td></tr>`;
        }
    }
}

function updateSummary() {
    const countEl = document.getElementById("totalApprovedFiles");
    if (countEl) countEl.textContent = approvedFiles.length;
}

function populateCategoryFilter(categories) {
    if (!categoryFilter) return;
    categoryFilter.innerHTML = `<option value="all">All Categories</option>`;
    categories.forEach(cat => {
        const opt = document.createElement("option");
        opt.value = cat.name;
        opt.textContent = cat.name;
        categoryFilter.appendChild(opt);
    });
}

function setupFilters() {
    if (searchInput) searchInput.addEventListener("input", filterApprovedFiles);
    if (categoryFilter) categoryFilter.addEventListener("change", filterApprovedFiles);
}

function filterApprovedFiles() {
    const term = (searchInput?.value || "").trim().toLowerCase();
    const cat = categoryFilter?.value || "all";

    const filtered = approvedFiles.filter(file => {
        const matchesTerm =
            !term ||
            file.title.toLowerCase().includes(term) ||
            file.researcher.toLowerCase().includes(term) ||
            file.uploadedBy.toLowerCase().includes(term);

        const matchesCat = cat === "all" || file.category === cat;

        return matchesTerm && matchesCat;
    });

    if (resultCount) {
        resultCount.textContent = `Showing ${filtered.length} of ${approvedFiles.length} approved files`;
    }

    renderTable(filtered);
}

function renderTable(files) {
    if (!approvedFilesTable) return;
    approvedFilesTable.innerHTML = "";

    if (!files || files.length === 0) {
        approvedFilesTable.innerHTML = `<tr><td colspan="7" class="empty-table">No approved research files found.</td></tr>`;
        return;
    }

    files.forEach((file, index) => {
        const row = document.createElement("tr");
        const displayId = "RF-" + String(index + 1).padStart(4, "0");

        row.innerHTML = `
            <td><strong>${displayId}</strong></td>
            <td>
                <div class="file-title-cell">
                    <strong>${escapeHtml(file.title)}</strong>
                    <br><small style="color: #64748b;">${escapeHtml(file.fileName || "PDF Document")}</small>
                </div>
            </td>
            <td>${escapeHtml(file.researcher)}</td>
            <td>${escapeHtml(file.category)}</td>
            <td>${file.reviewedDate || file.dateUploaded || "N/A"}</td>
            <td><span class="status-label"><i class="fa-solid fa-circle-check"></i> Approved</span></td>
            <td>
                <div class="table-actions">
                    <button type="button" class="view-button view-btn" title="View Details">
                        <i class="fa-regular fa-eye"></i> View
                    </button>
                    <button type="button" class="view-button qr-btn" title="Hard-Copy QR Sticker" style="background-color: var(--dark-blue); margin-left: 5px;">
                        <i class="fa-solid fa-qrcode"></i>
                    </button>
                    ${
                        file.filePath
                            ? `<button type="button" class="view-button download-btn" title="View Document" style="background-color: var(--approved-green); margin-left: 5px;">
                                <i class="fa-regular fa-file-pdf"></i> View
                               </button>`
                            : ""
                    }
                </div>
            </td>
        `;

        row.querySelector(".view-btn").addEventListener("click", () => openModal(file));

        const qrBtn = row.querySelector(".qr-btn");
        if (qrBtn) {
            qrBtn.addEventListener("click", () => openQrModal(file, displayId));
        }

        const dlBtn = row.querySelector(".download-btn");
        if (dlBtn) {
            dlBtn.addEventListener("click", () => {
                window.refmansyApi.storage.openDocumentInNewTab(file.filePath);
            });
        }

        approvedFilesTable.appendChild(row);
    });
}

const qrCodeModal = document.getElementById("qrCodeModal");
let activeQrFile = null;
let activeDisplayId = "";

function setupModal() {
    setupQrModal();

    const closeBtn = document.getElementById("closeModalButton");
    if (closeBtn) closeBtn.addEventListener("click", closeModal);

    if (detailsModal) {
        detailsModal.addEventListener("click", function (e) {
            if (e.target === detailsModal) closeModal();
        });
    }

    const viewBtn = document.getElementById("viewFileButton");
    if (viewBtn) {
        viewBtn.addEventListener("click", async function () {
            if (selectedFile && selectedFile.filePath) {
                await window.refmansyApi.storage.openDocumentInNewTab(selectedFile.filePath);
            } else {
                alert("No document file is attached.");
            }
        });
    }

    const modalQrBtn = document.getElementById("modalQrButton");
    if (modalQrBtn) {
        modalQrBtn.addEventListener("click", () => {
            if (selectedFile) {
                openQrModal(selectedFile, document.getElementById("modalFileId")?.textContent || "RF-0000");
            }
        });
    }

    const pendBtn = document.getElementById("markPendingButton");
    if (pendBtn) pendBtn.addEventListener("click", () => changeStatus("pending"));

    const rejBtn = document.getElementById("rejectButton");
    if (rejBtn) rejBtn.addEventListener("click", () => changeStatus("rejected"));
}

function setupQrModal() {
    const closeQrBtn = document.getElementById("closeQrModalButton");
    if (closeQrBtn) closeQrBtn.addEventListener("click", closeQrModal);

    if (qrCodeModal) {
        qrCodeModal.addEventListener("click", function (e) {
            if (e.target === qrCodeModal) closeQrModal();
        });
    }

    const printBtn = document.getElementById("printStickerBtn");
    if (printBtn) {
        printBtn.addEventListener("click", () => {
            window.print();
        });
    }

    const copyBtn = document.getElementById("copyQrLinkBtn");
    if (copyBtn) {
        copyBtn.addEventListener("click", () => {
            const input = document.getElementById("qrLinkInput");
            if (input && input.value) {
                navigator.clipboard.writeText(input.value).then(() => {
                    const originalHtml = copyBtn.innerHTML;
                    copyBtn.innerHTML = `<i class="fa-solid fa-check"></i> Copied!`;
                    copyBtn.style.backgroundColor = "#dcfce7";
                    copyBtn.style.color = "#15803d";
                    setTimeout(() => {
                        copyBtn.innerHTML = originalHtml;
                        copyBtn.style.backgroundColor = "";
                        copyBtn.style.color = "";
                    }, 2000);
                }).catch(() => {
                    input.select();
                    document.execCommand("copy");
                });
            }
        });
    }

    const dlPngBtn = document.getElementById("downloadQrPngBtn");
    if (dlPngBtn) {
        dlPngBtn.addEventListener("click", downloadQrPng);
    }
}

function openQrModal(file, displayId) {
    activeQrFile = file;
    activeDisplayId = displayId || ("RF-" + String(file.id).substring(0, 4).toUpperCase());

    const sDocId = document.getElementById("stickerDocId");
    if (sDocId) sDocId.textContent = activeDisplayId;

    const sTitle = document.getElementById("stickerTitle");
    if (sTitle) sTitle.textContent = file.title || "Untitled Research";

    const sAuthor = document.getElementById("stickerAuthor");
    if (sAuthor) sAuthor.textContent = file.researcher ? `By ${file.researcher}` : "Author unlisted";

    const sCategory = document.getElementById("stickerCategory");
    if (sCategory) sCategory.textContent = file.category || "Research Document";

    // Format QR Download URL
    const basePath = window.location.href.substring(0, window.location.href.lastIndexOf("/"));
    const qrUrl = `${basePath}/qr-download.html?id=${encodeURIComponent(file.id)}`;

    const qrInput = document.getElementById("qrLinkInput");
    if (qrInput) qrInput.value = qrUrl;

    // Render QR Code Canvas
    const canvasHolder = document.getElementById("stickerQrCanvas");
    if (canvasHolder) {
        canvasHolder.innerHTML = "";
        if (typeof QRCode !== "undefined") {
            new QRCode(canvasHolder, {
                text: qrUrl,
                width: 100,
                height: 100,
                colorDark: "#000000",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.H
            });
        } else {
            canvasHolder.innerHTML = `<p style="font-size: 10px; color: red;">QR Engine Loading...</p>`;
        }
    }

    if (qrCodeModal) qrCodeModal.classList.add("active");
}

function closeQrModal() {
    if (qrCodeModal) qrCodeModal.classList.remove("active");
    activeQrFile = null;
}

function downloadQrPng() {
    const canvasHolder = document.getElementById("stickerQrCanvas");
    if (!canvasHolder) return;

    const canvas = canvasHolder.querySelector("canvas");
    const img = canvasHolder.querySelector("img");

    let dataUrl = null;
    if (canvas) {
        dataUrl = canvas.toDataURL("image/png");
    } else if (img && img.src) {
        dataUrl = img.src;
    }

    if (!dataUrl) {
        alert("QR Code image is not yet rendered.");
        return;
    }

    const a = document.createElement("a");
    a.href = dataUrl;
    const safeTitle = (activeQrFile?.title || "research-qr").replace(/[^a-z0-9]/gi, "_").toLowerCase().substring(0, 30);
    a.download = `QR_${activeDisplayId}_${safeTitle}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
}

function openModal(file) {
    selectedFile = file;

    const mFileId = document.getElementById("modalFileId");
    if (mFileId) mFileId.textContent = file.id;
    const mAppDate = document.getElementById("modalApprovedDate");
    if (mAppDate) mAppDate.textContent = file.reviewedDate || file.dateUploaded || "N/A";
    const mTitle = document.getElementById("modalTitle");
    if (mTitle) mTitle.textContent = file.title;
    const mRes = document.getElementById("modalResearcher");
    if (mRes) mRes.textContent = file.researcher;
    const mCat = document.getElementById("modalCategory");
    if (mCat) mCat.textContent = file.category;
    const mRevBy = document.getElementById("modalReviewedBy");
    if (mRevBy) mRevBy.textContent = "Administrator";
    const mDesc = document.getElementById("modalDescription");
    if (mDesc) mDesc.textContent = file.description || "No description provided.";
    const mComment = document.getElementById("modalComment");
    if (mComment) mComment.textContent = file.reviewComment || "No review comment.";

    if (detailsModal) detailsModal.classList.add("active");
}

function closeModal() {
    if (detailsModal) detailsModal.classList.remove("active");
    selectedFile = null;
}

async function changeStatus(newStatus) {
    if (!selectedFile) return;

    const reason = prompt(`Reason for changing status to ${newStatus}:`, selectedFile.reviewComment || "");
    if (reason === null) return;

    try {
        await window.refmansyApi.research.updateStatus(
            selectedFile.id,
            newStatus,
            reason,
            currentProfile.id
        );

        closeModal();
        await loadApprovedFiles();
    } catch (err) {
        console.error("Change status error:", err);
        alert("Failed to update status: " + err.message);
    }
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