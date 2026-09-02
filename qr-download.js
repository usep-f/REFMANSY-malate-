// ================================================================
// REFMANSY: QR Code Public Auto-Download Handler
// ================================================================

document.addEventListener("DOMContentLoaded", async () => {
    const loadingView = document.getElementById("loadingView");
    const successView = document.getElementById("successView");
    const errorView = document.getElementById("errorView");
    const errorMessage = document.getElementById("errorMessage");

    const docCategory = document.getElementById("docCategory");
    const docTitle = document.getElementById("docTitle");
    const docResearcher = document.getElementById("docResearcher");
    const docYear = document.getElementById("docYear");
    const docSize = document.getElementById("docSize");
    const manualDownloadBtn = document.getElementById("manualDownloadBtn");

    function showError(msg) {
        if (loadingView) loadingView.style.display = "none";
        if (successView) successView.style.display = "none";
        if (errorMessage) errorMessage.textContent = msg;
        if (errorView) errorView.style.display = "flex";
    }

    function showSuccess() {
        if (loadingView) loadingView.style.display = "none";
        if (errorView) errorView.style.display = "none";
        if (successView) successView.style.display = "flex";
    }

    // Extract File ID from Query String
    const urlParams = new URLSearchParams(window.location.search);
    const fileId = urlParams.get("id");

    if (!fileId) {
        showError("No research file ID was provided in the QR code link. Please verify the physical QR sticker.");
        return;
    }

    try {
        if (!window.refmansyApi || !window.refmansyApi.client) {
            throw new Error("Unable to connect to REFMANSY repository services.");
        }

        const client = window.refmansyApi.client;

        // Query file metadata (RLS ensures only status='approved' can be retrieved anonymously)
        const { data: file, error: fetchErr } = await client
            .from("research_files")
            .select("id, title, category, researcher, file_path, file_name, status, file_size, publication_year, department")
            .eq("id", fileId)
            .eq("status", "approved")
            .maybeSingle();

        if (fetchErr) {
            console.error("Fetch error:", fetchErr);
            showError("Unable to retrieve research document metadata. Please try again later.");
            return;
        }

        if (!file) {
            showError("This research document could not be found or has not been approved for public soft-copy access.");
            return;
        }

        if (!file.file_path) {
            showError("No digital soft copy is attached to this research record. Please visit the library service desk.");
            return;
        }

        // Populate DOM details
        if (docCategory) docCategory.textContent = file.category || "Research Document";
        if (docTitle) docTitle.textContent = file.title || "Untitled Document";
        if (docResearcher) docResearcher.textContent = file.researcher ? `By ${file.researcher}` : "Author unlisted";
        if (docYear) docYear.innerHTML = `<i class="fa-regular fa-calendar"></i> ${file.publication_year || "N/A"}`;
        if (docSize) {
            const formattedSize = file.file_size ? formatBytes(file.file_size) : (file.file_name || "PDF Document");
            docSize.innerHTML = `<i class="fa-regular fa-file-pdf"></i> ${formattedSize}`;
        }

        // Get storage download URL
        const downloadUrl = await window.refmansyApi.storage.getDownloadUrl(file.file_path);
        if (!downloadUrl) {
            showError("The soft-copy PDF file is currently unavailable in the storage repository.");
            return;
        }

        // Configure manual download fallback button
        if (manualDownloadBtn) {
            manualDownloadBtn.href = downloadUrl;
            manualDownloadBtn.download = file.file_name || `${slugify(file.title || "document")}.pdf`;
            manualDownloadBtn.addEventListener("click", () => {
                logQrDownload(client, file);
            });
        }

        // Show success view
        showSuccess();

        // Log download event in download_records
        await logQrDownload(client, file);

        // Automatically trigger download
        setTimeout(() => {
            triggerDirectDownload(downloadUrl, file.file_name || `${slugify(file.title || "document")}.pdf`);
        }, 300);

    } catch (err) {
        console.error("QR Download Error:", err);
        showError(err.message || "An unexpected error occurred while processing the QR code.");
    }
});

async function logQrDownload(client, file) {
    try {
        await client.from("download_records").insert({
            file_id: file.id,
            file_title: file.title,
            file_category: file.category,
            user_name: "QR Hard-Copy Guest",
            user_email: "qr-guest@refmansy.local",
            downloaded_at: new Date().toISOString()
        });
    } catch (e) {
        console.warn("Could not log QR download metric:", e);
    }
}

function triggerDirectDownload(url, filename) {
    try {
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    } catch (e) {
        console.warn("Direct trigger blocked, manual button ready:", e);
    }
}

function formatBytes(bytes, decimals = 1) {
    if (!bytes || bytes === 0) return "0 B";
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + " " + sizes[i];
}

function slugify(text) {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "-")
        .replace(/[^\w\-]+/g, "")
        .replace(/\-\-+/g, "-")
        .substring(0, 50);
}
