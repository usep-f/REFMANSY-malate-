// ================================================================
// REFMANSY Document Viewer (View First, Then Ready to Download)
// ================================================================

document.addEventListener("DOMContentLoaded", async () => {
    const documentTitle = document.getElementById("documentTitle");
    const documentId = document.getElementById("documentId");
    const documentAuthor = document.getElementById("documentAuthor");
    const documentCategory = document.getElementById("documentCategory");
    const downloadButton = document.getElementById("downloadButton");
    const printButton = document.getElementById("printButton");
    const backButton = document.getElementById("backButton");
    const loadingOverlay = document.getElementById("loadingOverlay");
    const errorOverlay = document.getElementById("errorOverlay");
    const errorHeading = document.getElementById("errorHeading");
    const errorMessage = document.getElementById("errorMessage");
    const retryButton = document.getElementById("retryButton");
    const pdfViewerFrame = document.getElementById("pdfViewerFrame");

    const urlParams = new URLSearchParams(window.location.search);
    const fileId = urlParams.get("id");
    const filePathParam = urlParams.get("path");
    const titleParam = urlParams.get("title");

    let currentBlobUrl = null;
    let targetFileName = "research-document.pdf";
    let targetFile = null;

    backButton.addEventListener("click", () => {
        if (window.history.length > 1) {
            window.history.back();
        } else {
            window.close();
        }
    });

    retryButton.addEventListener("click", loadDocument);

    function showError(heading, message) {
        if (loadingOverlay) loadingOverlay.style.display = "none";
        if (errorOverlay) {
            errorOverlay.style.display = "flex";
            if (errorHeading) errorHeading.textContent = heading;
            if (errorMessage) errorMessage.textContent = message;
        }
    }

    async function loadDocument() {
        if (loadingOverlay) loadingOverlay.style.display = "flex";
        if (errorOverlay) errorOverlay.style.display = "none";

        try {
            let filePath = filePathParam;
            let displayTitle = titleParam || "Research Document";
            let displayResearcher = "Researcher";
            let displayCategory = "Research";
            let displayId = "";

            // If an ID was provided, query metadata from database
            if (fileId && window.refmansyApi?.research?.getById) {
                try {
                    const file = await window.refmansyApi.research.getById(fileId);
                    if (file) {
                        targetFile = file;
                        filePath = file.filePath || filePath;
                        displayTitle = file.title || displayTitle;
                        displayResearcher = file.researcher ? `By ${file.researcher}` : displayResearcher;
                        displayCategory = file.category || displayCategory;
                        displayId = file.displayId || "";
                        if (file.fileName) targetFileName = file.fileName;
                    }
                } catch (metaErr) {
                    console.warn("Could not fetch file metadata via getById, falling back to params:", metaErr);
                }
            }

            if (!filePath) {
                showError("No Document File Attached", "This research entry does not have a digital PDF document attached to it.");
                return;
            }

            // Update UI headers
            if (documentTitle) documentTitle.textContent = displayTitle;
            if (documentAuthor) documentAuthor.textContent = displayResearcher;
            if (documentCategory) {
                documentCategory.textContent = displayCategory;
                documentCategory.style.display = "inline-block";
            }
            if (documentId && displayId) {
                documentId.textContent = displayId;
                documentId.style.display = "inline-block";
            }
            document.title = `${displayTitle} - REFMANSY Viewer`;

            // Retrieve storage signed URL
            const downloadUrl = await window.refmansyApi.storage.getDownloadUrl(filePath);
            if (!downloadUrl) {
                showError("Document Unavailable", "Could not generate secure access link for this document in repository storage.");
                return;
            }

            // Fetch file as blob to ensure application/pdf viewing (preventing premature auto-download)
            const response = await fetch(downloadUrl);
            if (!response.ok) {
                throw new Error(`Failed to load PDF file from storage (HTTP ${response.status}).`);
            }

            const rawBlob = await response.blob();
            const pdfBlob = new Blob([rawBlob], { type: "application/pdf" });

            if (currentBlobUrl) {
                URL.revokeObjectURL(currentBlobUrl);
            }
            currentBlobUrl = URL.createObjectURL(pdfBlob);

            // Display in the frame so the user VIEWS the document first
            pdfViewerFrame.src = currentBlobUrl;

            // Configure Download button (ready to download once viewed)
            if (downloadButton) {
                downloadButton.disabled = false;
                downloadButton.onclick = async () => {
                    const downloadLink = document.createElement("a");
                    downloadLink.href = currentBlobUrl;
                    downloadLink.download = targetFileName || `${slugify(displayTitle)}.pdf`;
                    document.body.appendChild(downloadLink);
                    downloadLink.click();
                    document.body.removeChild(downloadLink);

                    // Log download audit record
                    if (targetFile?.id && window.refmansyApi?.downloads?.logDownload) {
                        try {
                            await window.refmansyApi.downloads.logDownload(
                                targetFile.id,
                                targetFile.title,
                                targetFile.category
                            );
                        } catch (logErr) {
                            console.warn("Audit log error:", logErr);
                        }
                    }
                };
            }

            // Configure Print button
            if (printButton) {
                printButton.onclick = () => {
                    try {
                        pdfViewerFrame.contentWindow.print();
                    } catch (e) {
                        window.open(currentBlobUrl, "_blank");
                    }
                };
            }

            // Hide loading overlay
            if (loadingOverlay) loadingOverlay.style.display = "none";

        } catch (err) {
            console.error("Document Viewer error:", err);
            showError("Document Load Failed", err.message || "An error occurred while loading the research PDF.");
        }
    }

    function slugify(text) {
        return (text || "document")
            .toString()
            .toLowerCase()
            .trim()
            .replace(/\s+/g, "-")
            .replace(/[^\w\-]+/g, "")
            .substring(0, 50);
    }

    loadDocument();
});
