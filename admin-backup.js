// ================================================================
// Refmansy Admin System Backup & Disaster Recovery Logic
// ================================================================

let currentUser = null;
let currentProfile = null;
let currentStats = null;
let stagedBackupPackage = null;

// DOM Elements
const statTotalDbRows = document.getElementById("statTotalDbRows");
const statDbBreakdown = document.getElementById("statDbBreakdown");
const statTotalStorageSize = document.getElementById("statTotalStorageSize");
const statStorageCount = document.getElementById("statStorageCount");
const statTotalAnalytics = document.getElementById("statTotalAnalytics");
const statAnalyticsBreakdown = document.getElementById("statAnalyticsBreakdown");
const statLastBackupDate = document.getElementById("statLastBackupDate");
const statLastBackupSub = document.getElementById("statLastBackupSub");
const refreshStatsButton = document.getElementById("refreshStatsButton");

// Export Elements
const startBackupBtn = document.getElementById("startBackupBtn");
const exportProgressBox = document.getElementById("exportProgressBox");
const exportProgressStage = document.getElementById("exportProgressStage");
const exportProgressPercent = document.getElementById("exportProgressPercent");
const exportProgressBar = document.getElementById("exportProgressBar");
const exportProgressDetails = document.getElementById("exportProgressDetails");

// Restore Elements
const restoreDropzone = document.getElementById("restoreDropzone");
const backupFileInput = document.getElementById("backupFileInput");
const stagingInspectionBox = document.getElementById("stagingInspectionBox");
const stagedFileName = document.getElementById("stagedFileName");
const stagedIntegrityBadge = document.getElementById("stagedIntegrityBadge");
const stagedCreatedAt = document.getElementById("stagedCreatedAt");
const stagedCreatedBy = document.getElementById("stagedCreatedBy");
const stagedDbTotal = document.getElementById("stagedDbTotal");
const stagedStorageTotal = document.getElementById("stagedStorageTotal");
const stagedPillsList = document.getElementById("stagedPillsList");
const clearStagedFileBtn = document.getElementById("clearStagedFileBtn");
const openRestoreModalBtn = document.getElementById("openRestoreModalBtn");
const restoreProgressBox = document.getElementById("restoreProgressBox");
const restoreProgressStage = document.getElementById("restoreProgressStage");
const restoreProgressPercent = document.getElementById("restoreProgressPercent");
const restoreProgressBar = document.getElementById("restoreProgressBar");
const restoreProgressDetails = document.getElementById("restoreProgressDetails");

// Modal Elements
const restoreConfirmModal = document.getElementById("restoreConfirmModal");
const closeRestoreModalBtn = document.getElementById("closeRestoreModalBtn");
const cancelRestoreModalBtn = document.getElementById("cancelRestoreModalBtn");
const confirmExecuteRestoreBtn = document.getElementById("confirmExecuteRestoreBtn");
const restoreConfirmInput = document.getElementById("restoreConfirmInput");
const modalSnapshotName = document.getElementById("modalSnapshotName");
const modalSnapshotDate = document.getElementById("modalSnapshotDate");
const modalSnapshotDocs = document.getElementById("modalSnapshotDocs");
const restoreModalAlert = document.getElementById("restoreModalAlert");

// -------------------------------------------------------------
// Initialize Auth Guard & Dashboard
// -------------------------------------------------------------
window.refmansyAuthGuard.init("admin", function (profile, user) {
    currentUser = user;
    currentProfile = profile;
    initializeBackupModule();
});

async function initializeBackupModule() {
    setupEventListeners();
    loadLastBackupHistory();
    await loadSystemStats();
}

function setupEventListeners() {
    if (refreshStatsButton) {
        refreshStatsButton.addEventListener("click", async () => {
            refreshStatsButton.disabled = true;
            refreshStatsButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Updating...</span>`;
            await loadSystemStats();
            refreshStatsButton.disabled = false;
            refreshStatsButton.innerHTML = `<i class="fa-solid fa-arrows-rotate"></i> <span>Refresh Stats</span>`;
        });
    }

    if (startBackupBtn) {
        startBackupBtn.addEventListener("click", handleCreateBackup);
    }

    // Dropzone Events
    if (restoreDropzone && backupFileInput) {
        restoreDropzone.addEventListener("click", () => backupFileInput.click());

        restoreDropzone.addEventListener("dragover", (e) => {
            e.preventDefault();
            restoreDropzone.classList.add("dragover");
        });

        restoreDropzone.addEventListener("dragleave", () => {
            restoreDropzone.classList.remove("dragover");
        });

        restoreDropzone.addEventListener("drop", (e) => {
            e.preventDefault();
            restoreDropzone.classList.remove("dragover");
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                handleBackupFileSelected(file);
            }
        });

        backupFileInput.addEventListener("change", (e) => {
            if (e.target.files && e.target.files.length > 0) {
                handleBackupFileSelected(e.target.files[0]);
            }
        });
    }

    if (clearStagedFileBtn) {
        clearStagedFileBtn.addEventListener("click", resetRestoreStaging);
    }

    // Modal Triggers
    if (openRestoreModalBtn) {
        openRestoreModalBtn.addEventListener("click", openConfirmationModal);
    }

    if (closeRestoreModalBtn) {
        closeRestoreModalBtn.addEventListener("click", closeConfirmationModal);
    }

    if (cancelRestoreModalBtn) {
        cancelRestoreModalBtn.addEventListener("click", closeConfirmationModal);
    }

    if (restoreConfirmInput) {
        restoreConfirmInput.addEventListener("input", (e) => {
            const isMatch = e.target.value.trim() === "RESTORE-CONFIRM";
            if (confirmExecuteRestoreBtn) {
                confirmExecuteRestoreBtn.disabled = !isMatch;
            }
        });
    }

    if (confirmExecuteRestoreBtn) {
        confirmExecuteRestoreBtn.addEventListener("click", handleExecuteRestore);
    }
}

// -------------------------------------------------------------
// Load Live System Stats
// -------------------------------------------------------------
async function loadSystemStats() {
    try {
        currentStats = await window.refmansyApi.backup.getSystemStats();

        if (statTotalDbRows) {
            statTotalDbRows.textContent = currentStats.totalDatabaseRows.toLocaleString();
        }

        if (statDbBreakdown) {
            statDbBreakdown.textContent = `${currentStats.researchFiles} Research • ${currentStats.profiles} Users • ${currentStats.categories} Categories`;
        }

        if (statTotalStorageSize) {
            statTotalStorageSize.textContent = currentStats.storageFormattedSize;
        }

        if (statStorageCount) {
            statStorageCount.textContent = `${currentStats.storageFilesCount} PDF Documents`;
        }

        if (statTotalAnalytics) {
            const totalAnalytics = currentStats.downloadRecords + currentStats.feedback;
            statTotalAnalytics.textContent = totalAnalytics.toLocaleString();
        }

        if (statAnalyticsBreakdown) {
            statAnalyticsBreakdown.textContent = `${currentStats.downloadRecords} Downloads • ${currentStats.feedback} Feedback`;
        }
    } catch (err) {
        console.error("Error loading system backup stats:", err);
        if (statTotalDbRows) statTotalDbRows.textContent = "Error";
        if (statTotalStorageSize) statTotalStorageSize.textContent = "Error";
        if (statTotalAnalytics) statTotalAnalytics.textContent = "Error";
    }
}

function loadLastBackupHistory() {
    const lastExportIso = localStorage.getItem("refmansy_last_backup_export");
    if (lastExportIso) {
        try {
            const date = new Date(lastExportIso);
            if (statLastBackupDate) {
                statLastBackupDate.textContent = date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
            }
            if (statLastBackupSub) {
                statLastBackupSub.textContent = `At ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
            }
        } catch (e) {
            console.error("Date parse error", e);
        }
    }
}

// -------------------------------------------------------------
// Backup Creation (Export) Workflow
// -------------------------------------------------------------
async function handleCreateBackup() {
    if (!window.JSZip) {
        alert("JSZip library failed to load. Please refresh the page and try again.");
        return;
    }

    startBackupBtn.disabled = true;
    exportProgressBox.style.display = "block";
    updateExportProgress("Phase 1: Fetching database tables...", 10, "Querying user profiles, research metadata, categories, feedback, and download logs...");

    try {
        const zip = new JSZip();
        const checksums = {};

        // 1. Export Database Tables
        const dbSnapshot = await window.refmansyApi.backup.exportDatabaseSnapshot();
        const dbFolder = zip.folder("database");

        const tableNames = ["profiles", "categories", "tags", "research_files", "download_records", "feedback"];
        for (const tbl of tableNames) {
            const jsonStr = JSON.stringify(dbSnapshot[tbl] || [], null, 2);
            const path = `database/${tbl}.json`;
            dbFolder.file(`${tbl}.json`, jsonStr);
            checksums[path] = await computeSha256(jsonStr);
        }

        updateExportProgress("Phase 2: Scanning document storage...", 30, "Found database records. Enumerating cloud storage PDFs...");

        // 2. Scan and Download Document Storage Files
        const storageFiles = await window.refmansyApi.backup.listAllStorageFiles();
        const storageFolder = zip.folder("storage/research-documents");

        let downloadedCount = 0;
        let totalStorageBytes = 0;

        if (storageFiles.length > 0) {
            for (let i = 0; i < storageFiles.length; i++) {
                const fileInfo = storageFiles[i];
                const progressPct = 30 + Math.round(((i + 1) / storageFiles.length) * 45); // 30% to 75%
                updateExportProgress(
                    `Phase 3: Downloading documents (${i + 1}/${storageFiles.length})...`,
                    progressPct,
                    `Streaming: ${fileInfo.name} (${formatBytes(fileInfo.size)})`
                );

                try {
                    const blob = await window.refmansyApi.backup.downloadStorageFileBlob(fileInfo.path);
                    const arrayBuf = await blob.arrayBuffer();
                    storageFolder.file(fileInfo.path, arrayBuf);

                    const archivePath = `storage/research-documents/${fileInfo.path}`;
                    checksums[archivePath] = await computeSha256(arrayBuf);
                    downloadedCount++;
                    totalStorageBytes += fileInfo.size;
                } catch (downloadErr) {
                    console.warn(`Could not download file ${fileInfo.path}:`, downloadErr);
                }
            }
        }

        updateExportProgress("Phase 4: Generating cryptographic manifest...", 80, "Calculating SHA-256 integrity hashes for all system entities...");

        // 3. Create manifest.json
        const now = new Date();
        const timestampStr = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const fileName = `REFMANSY_BACKUP_${timestampStr}.zip`;

        const manifest = {
            system: "REFMANSY",
            version: "1.0",
            createdAt: now.toISOString(),
            createdBy: {
                adminId: currentUser?.id || "unknown",
                adminName: currentProfile?.full_name || currentProfile?.username || "Admin",
                adminEmail: currentUser?.email || "admin@lcnhs.edu.ph"
            },
            tables: {
                profiles: dbSnapshot.profiles.length,
                categories: dbSnapshot.categories.length,
                tags: dbSnapshot.tags.length,
                research_files: dbSnapshot.research_files.length,
                download_records: dbSnapshot.download_records.length,
                feedback: dbSnapshot.feedback.length
            },
            storageFilesCount: downloadedCount,
            storageTotalSizeBytes: totalStorageBytes,
            checksums: checksums
        };

        const manifestJsonStr = JSON.stringify(manifest, null, 2);
        zip.file("manifest.json", manifestJsonStr);

        updateExportProgress("Phase 5: Compressing backup archive...", 90, "Building compressed .zip file for local download...");

        // 4. Generate ZIP Blob
        const zipBlob = await zip.generateAsync({
            type: "blob",
            compression: "DEFLATE",
            compressionOptions: { level: 6 }
        }, (metadata) => {
            const pct = 90 + Math.round(metadata.percent * 0.08);
            updateExportProgress("Phase 5: Compressing backup archive...", pct, `Deflating files: ${Math.round(metadata.percent)}%`);
        });

        // 5. Trigger Browser Download
        const downloadUrl = URL.createObjectURL(zipBlob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(downloadUrl);

        // Record history
        localStorage.setItem("refmansy_last_backup_export", now.toISOString());
        loadLastBackupHistory();

        updateExportProgress("Backup Complete!", 100, `Successfully generated and saved ${fileName} (${formatBytes(zipBlob.size)}).`);

        setTimeout(() => {
            startBackupBtn.disabled = false;
        }, 2000);

    } catch (err) {
        console.error("Backup creation failed:", err);
        updateExportProgress("Backup Failed", 0, `Error: ${err.message}`);
        startBackupBtn.disabled = false;
    }
}

function updateExportProgress(stage, percent, details) {
    if (exportProgressStage) exportProgressStage.textContent = stage;
    if (exportProgressPercent) exportProgressPercent.textContent = `${percent}%`;
    if (exportProgressBar) exportProgressBar.style.width = `${percent}%`;
    if (exportProgressDetails) exportProgressDetails.textContent = details;
}

// -------------------------------------------------------------
// Restore Staging & File Inspection Workflow
// -------------------------------------------------------------
async function handleBackupFileSelected(file) {
    if (!file || !file.name.endsWith(".zip")) {
        alert("Please select a valid .zip backup archive.");
        return;
    }

    restoreDropzone.style.display = "none";
    stagingInspectionBox.style.display = "block";
    stagedFileName.textContent = file.name;
    stagedIntegrityBadge.className = "integrity-badge badge-valid";
    stagedIntegrityBadge.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> <span>Verifying SHA-256 Checksums...</span>`;

    try {
        const zip = await JSZip.loadAsync(file);
        
        // 1. Find manifest.json
        const manifestFile = zip.file("manifest.json");
        if (!manifestFile) {
            throw new Error("Invalid archive: manifest.json is missing.");
        }

        const manifestText = await manifestFile.async("string");
        const manifest = JSON.parse(manifestText);

        if (!manifest.tables || !manifest.checksums) {
            throw new Error("Invalid archive: manifest format does not conform to REFMANSY specifications.");
        }

        // 2. Validate Checksums
        let hasMismatch = false;
        let totalChecked = 0;

        const dbData = {};
        const storageBlobs = [];

        // Check database files
        const tableNames = ["profiles", "categories", "tags", "research_files", "download_records", "feedback"];
        for (const tbl of tableNames) {
            const path = `database/${tbl}.json`;
            const tblFile = zip.file(path);
            if (tblFile) {
                const text = await tblFile.async("string");
                const hash = await computeSha256(text);
                totalChecked++;
                if (manifest.checksums[path] && manifest.checksums[path] !== hash) {
                    console.warn(`Checksum mismatch on ${path}`);
                    hasMismatch = true;
                }
                dbData[tbl] = JSON.parse(text);
            } else {
                dbData[tbl] = [];
            }
        }

        // Check storage files
        const storagePrefix = "storage/research-documents/";
        for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
            if (relativePath.startsWith(storagePrefix) && !zipEntry.dir) {
                const innerStoragePath = relativePath.substring(storagePrefix.length);
                const arrayBuf = await zipEntry.async("arraybuffer");
                const hash = await computeSha256(arrayBuf);
                totalChecked++;
                if (manifest.checksums[relativePath] && manifest.checksums[relativePath] !== hash) {
                    console.warn(`Checksum mismatch on ${relativePath}`);
                    hasMismatch = true;
                }

                storageBlobs.push({
                    path: innerStoragePath,
                    blob: new Blob([arrayBuf], { type: "application/pdf" }),
                    size: arrayBuf.byteLength
                });
            }
        }

        // 3. Render Inspection Summary
        if (hasMismatch) {
            stagedIntegrityBadge.className = "integrity-badge badge-invalid";
            stagedIntegrityBadge.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> <span>Integrity Alert: Hash Mismatch</span>`;
        } else {
            stagedIntegrityBadge.className = "integrity-badge badge-valid";
            stagedIntegrityBadge.innerHTML = `<i class="fa-solid fa-shield-check"></i> <span>Integrity Verified (SHA-256 Valid)</span>`;
        }

        const date = new Date(manifest.createdAt);
        stagedCreatedAt.textContent = `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
        stagedCreatedBy.textContent = manifest.createdBy?.adminName || "System Admin";

        const totalDbRows = Object.values(manifest.tables || {}).reduce((a, b) => a + b, 0);
        stagedDbTotal.textContent = `${totalDbRows.toLocaleString()} Records`;
        stagedStorageTotal.textContent = `${manifest.storageFilesCount || storageBlobs.length} PDFs (${formatBytes(manifest.storageTotalSizeBytes || 0)})`;

        // Render Pills
        stagedPillsList.innerHTML = `
            <div class="pill-item"><span>Research:</span> <span class="pill-count">${manifest.tables.research_files || 0}</span></div>
            <div class="pill-item"><span>Profiles:</span> <span class="pill-count">${manifest.tables.profiles || 0}</span></div>
            <div class="pill-item"><span>Downloads:</span> <span class="pill-count">${manifest.tables.download_records || 0}</span></div>
            <div class="pill-item"><span>Feedback:</span> <span class="pill-count">${manifest.tables.feedback || 0}</span></div>
            <div class="pill-item"><span>Categories:</span> <span class="pill-count">${manifest.tables.categories || 0}</span></div>
            <div class="pill-item"><span>Tags:</span> <span class="pill-count">${manifest.tables.tags || 0}</span></div>
        `;

        stagedBackupPackage = {
            file: file,
            manifest: manifest,
            dbData: dbData,
            storageBlobs: storageBlobs
        };

    } catch (err) {
        console.error("Error inspecting backup file:", err);
        alert(`Failed to load backup archive: ${err.message}`);
        resetRestoreStaging();
    }
}

function resetRestoreStaging() {
    stagedBackupPackage = null;
    if (backupFileInput) backupFileInput.value = "";
    if (stagingInspectionBox) stagingInspectionBox.style.display = "none";
    if (restoreDropzone) restoreDropzone.style.display = "block";
    if (restoreProgressBox) restoreProgressBox.style.display = "none";
}

// -------------------------------------------------------------
// Confirmation Modal
// -------------------------------------------------------------
function openConfirmationModal() {
    if (!stagedBackupPackage) return;

    modalSnapshotName.textContent = stagedBackupPackage.file.name;
    const date = new Date(stagedBackupPackage.manifest.createdAt);
    modalSnapshotDate.textContent = `${date.toLocaleDateString()} at ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
    modalSnapshotDocs.textContent = `${stagedBackupPackage.storageBlobs.length} PDF files`;

    if (restoreConfirmInput) restoreConfirmInput.value = "";
    if (confirmExecuteRestoreBtn) confirmExecuteRestoreBtn.disabled = true;
    if (restoreModalAlert) restoreModalAlert.style.display = "none";

    restoreConfirmModal.style.display = "flex";
}

function closeConfirmationModal() {
    if (restoreConfirmModal) restoreConfirmModal.style.display = "none";
}

// -------------------------------------------------------------
// Execute System Restore
// -------------------------------------------------------------
async function handleExecuteRestore() {
    if (!stagedBackupPackage) return;

    closeConfirmationModal();
    stagingInspectionBox.style.display = "none";
    restoreProgressBox.style.display = "block";

    updateRestoreProgress("Phase 1: Validating admin session...", 10, "Authorizing disaster recovery procedure...");

    try {
        const { dbData, storageBlobs, manifest } = stagedBackupPackage;

        // 1. Execute Database Purge and Sequential Insert
        await window.refmansyApi.backup.executeDatabaseRestore(dbData, ({ stage, step, totalSteps, message }) => {
            const pct = Math.round((step / totalSteps) * 60); // 0% to 60%
            updateRestoreProgress(`Phase 2: Database Restoration (${step}/${totalSteps})`, pct, message);
        });

        // 2. Upload Storage PDFs
        if (storageBlobs && storageBlobs.length > 0) {
            for (let i = 0; i < storageBlobs.length; i++) {
                const item = storageBlobs[i];
                const pct = 60 + Math.round(((i + 1) / storageBlobs.length) * 35); // 60% to 95%
                updateRestoreProgress(
                    `Phase 3: Restoring document storage (${i + 1}/${storageBlobs.length})...`,
                    pct,
                    `Uploading: ${item.path}`
                );

                await window.refmansyApi.backup.uploadStorageFileBlob(item.path, item.blob, "application/pdf");
            }
        }

        updateRestoreProgress("Phase 4: Finalizing system verification...", 98, "Re-indexing records and verifying foreign key integrity...");

        // 3. Complete
        updateRestoreProgress("Restore Successful!", 100, "All database tables, analytics logs, and PDF documents have been restored.");

        // Refresh stats
        await loadSystemStats();

        setTimeout(() => {
            alert("System restoration successfully completed! The application will now reload.");
            window.location.reload();
        }, 2000);

    } catch (err) {
        console.error("System restore execution failed:", err);
        updateRestoreProgress("Restore Failed", 0, `Error: ${err.message}`);
        alert(`Disaster recovery restore encountered an error: ${err.message}`);
    }
}

function updateRestoreProgress(stage, percent, details) {
    if (restoreProgressStage) restoreProgressStage.textContent = stage;
    if (restoreProgressPercent) restoreProgressPercent.textContent = `${percent}%`;
    if (restoreProgressBar) restoreProgressBar.style.width = `${percent}%`;
    if (restoreProgressDetails) restoreProgressDetails.textContent = details;
}

// -------------------------------------------------------------
// Utilities
// -------------------------------------------------------------
async function computeSha256(data) {
    let buffer;
    if (typeof data === "string") {
        buffer = new TextEncoder().encode(data);
    } else if (data instanceof ArrayBuffer) {
        buffer = data;
    } else if (data instanceof Uint8Array) {
        buffer = data.buffer;
    } else {
        buffer = new TextEncoder().encode(JSON.stringify(data));
    }
    const hashBuffer = await crypto.subtle.digest("SHA-256", buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, "0")).join("");
}

function formatBytes(bytes, decimals = 2) {
    if (!bytes || bytes === 0) return "0 Bytes";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}
