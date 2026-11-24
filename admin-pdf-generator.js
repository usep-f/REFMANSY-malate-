// ================================================================
// REFMANSY: Modular Vector PDF Report Generator (jsPDF + AutoTable)
// ================================================================

(function () {
    "use strict";

    // Cache base64 images so subsequent exports are instantaneous
    const imageCache = {};

    /**
     * Converts an image path to base64 via offscreen HTML5 Canvas
     */
    function getBase64ImageFromUrl(url) {
        if (imageCache[url]) {
            return Promise.resolve(imageCache[url]);
        }

        return new Promise((resolve) => {
            const img = new Image();
            img.setAttribute("crossOrigin", "anonymous");
            img.onload = function () {
                try {
                    const canvas = document.createElement("canvas");
                    canvas.width = img.naturalWidth || img.width || 120;
                    canvas.height = img.naturalHeight || img.height || 120;
                    const ctx = canvas.getContext("2d");
                    ctx.drawImage(img, 0, 0);
                    const dataURL = canvas.toDataURL("image/png");
                    imageCache[url] = dataURL;
                    resolve(dataURL);
                } catch (e) {
                    console.warn("Canvas export failed for image:", url, e);
                    resolve(null);
                }
            };
            img.onerror = function () {
                console.warn("Could not load image at:", url);
                resolve(null);
            };
            img.src = url;
        });
    }

    /**
     * Renders a high-resolution vector Donut Chart for Status Distribution onto an off-screen canvas
     */
    function renderStatusDonutChart(approved, pending, rejected, total) {
        const width = 560;
        const height = 300;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        // Clear background
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);

        const centerX = 160;
        const centerY = 150;
        const outerRadius = 110;
        const innerRadius = 65;

        const safeTotal = total || 1;
        const slices = [
            { label: "Approved", count: approved, color: "#16a34a", percent: Math.round((approved / safeTotal) * 100) },
            { label: "Pending", count: pending, color: "#d97706", percent: Math.round((pending / safeTotal) * 100) },
            { label: "Rejected", count: rejected, color: "#64748b", percent: Math.round((rejected / safeTotal) * 100) }
        ];

        let startAngle = -Math.PI / 2;

        slices.forEach((slice) => {
            const sliceAngle = (slice.count / safeTotal) * (2 * Math.PI);
            const endAngle = startAngle + sliceAngle;

            if (slice.count > 0) {
                ctx.beginPath();
                ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
                ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
                ctx.closePath();
                ctx.fillStyle = slice.color;
                ctx.fill();
            }
            startAngle = endAngle;
        });

        // Center donut text
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#0f172a";
        ctx.font = "bold 34px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.fillText(String(total), centerX, centerY - 10);

        ctx.fillStyle = "#64748b";
        ctx.font = "600 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
        ctx.fillText("TOTAL FILES", centerX, centerY + 18);

        // Render Legend on the right
        const legendX = 330;
        let legendY = 70;

        ctx.textAlign = "left";
        ctx.textBaseline = "middle";

        slices.forEach((slice) => {
            // Color marker pill
            ctx.fillStyle = slice.color;
            ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(legendX, legendY - 9, 18, 18, 5) : ctx.rect(legendX, legendY - 9, 18, 18);
            ctx.fill();

            // Label & Count
            ctx.fillStyle = "#1e293b";
            ctx.font = "bold 15px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
            ctx.fillText(slice.label, legendX + 28, legendY);

            ctx.fillStyle = "#475569";
            ctx.font = "500 14px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
            ctx.fillText(`${slice.count} papers (${slice.percent}%)`, legendX + 28, legendY + 20);

            legendY += 56;
        });

        return canvas.toDataURL("image/png");
    }

    /**
     * Renders a high-resolution horizontal Bar Chart for Category Distribution onto an off-screen canvas
     */
    function renderCategoryBarChart(categoriesWithCounts, totalFiles) {
        const width = 560;
        const height = 300;
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");

        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);

        const safeTotal = totalFiles || 1;
        // Sort top 6 categories
        const topCategories = [...categoriesWithCounts]
            .sort((a, b) => b.count - a.count)
            .slice(0, 6);

        if (topCategories.length === 0) {
            ctx.fillStyle = "#64748b";
            ctx.font = "14px -apple-system, BlinkMacSystemFont, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("No category data available", width / 2, height / 2);
            return canvas.toDataURL("image/png");
        }

        const barX = 170;
        const maxBarWidth = 320;
        const rowHeight = 44;
        let startY = 30;

        topCategories.forEach((cat) => {
            const pct = Math.round((cat.count / safeTotal) * 100);
            const currentBarWidth = Math.max(8, (cat.count / safeTotal) * maxBarWidth);

            // Category Label
            ctx.fillStyle = "#1e293b";
            ctx.font = "600 13px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
            ctx.textAlign = "right";
            ctx.textBaseline = "middle";

            let label = cat.name;
            if (label.length > 18) label = label.substring(0, 16) + "...";
            ctx.fillText(label, barX - 14, startY + 10);

            // Background track
            ctx.fillStyle = "#f1f5f9";
            ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(barX, startY, maxBarWidth, 20, 4) : ctx.rect(barX, startY, maxBarWidth, 20);
            ctx.fill();

            // Progress bar
            ctx.fillStyle = "#1e3a8a"; // primary navy blue
            ctx.beginPath();
            ctx.roundRect ? ctx.roundRect(barX, startY, currentBarWidth, 20, 4) : ctx.rect(barX, startY, currentBarWidth, 20);
            ctx.fill();

            // Value text
            ctx.fillStyle = "#0f172a";
            ctx.font = "bold 12px -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
            ctx.textAlign = "left";
            ctx.fillText(`${cat.count} (${pct}%)`, barX + currentBarWidth + 8, startY + 11);

            startY += rowHeight;
        });

        return canvas.toDataURL("image/png");
    }

    /**
     * Master Generator Function
     */
    async function generateModularPdfReport(config, data) {
        if (!window.jspdf || !window.jspdf.jsPDF) {
            throw new Error("jsPDF library is not loaded. Please ensure the CDN is accessible.");
        }

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({
            orientation: "portrait",
            unit: "mm",
            format: "a4"
        });

        const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
        const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
        const marginX = 14;
        const contentWidth = pageWidth - marginX * 2; // 182mm

        // Preload institutional logos
        const [logoLCNHS, logoProgram] = await Promise.all([
            getBase64ImageFromUrl("LOGO LCNHS.png"),
            getBase64ImageFromUrl("RESPROGRAM.png")
        ]);

        let currentY = 12;

        // -------------------------------------------------------------
        // Header Helper (Page 1 Official Institutional Header)
        // -------------------------------------------------------------
        function drawFirstPageHeader() {
            const headerY = currentY;

            // Dual Logos
            if (logoLCNHS) {
                try {
                    doc.addImage(logoLCNHS, "PNG", marginX, headerY, 20, 20);
                } catch (e) {
                    console.warn("Could not embed LCNHS logo:", e);
                }
            }

            if (logoProgram) {
                try {
                    doc.addImage(logoProgram, "PNG", pageWidth - marginX - 20, headerY, 20, 20);
                } catch (e) {
                    console.warn("Could not embed Program logo:", e);
                }
            }

            // Header Title: Clean Executive Report
            doc.setFont("helvetica", "bold");
            doc.setFontSize(20);
            doc.setTextColor(30, 58, 138); // Primary navy #1e3a8a
            doc.text("EXECUTIVE REPORT", pageWidth / 2, headerY + 13, { align: "center" });

            // Horizontal decorative rule
            doc.setDrawColor(203, 213, 225);
            doc.setLineWidth(0.6);
            doc.line(marginX, headerY + 24, pageWidth - marginX, headerY + 24);

            // Metadata Strip
            doc.setFont("helvetica", "normal");
            doc.setFontSize(8);
            doc.setTextColor(100, 116, 139);
            const nowStr = new Date().toLocaleString();
            doc.text(`Generated: ${nowStr}`, marginX, headerY + 30);
            doc.text(`Prepared By: ${config.adminName || "Administrator"} (Admin)`, pageWidth - marginX, headerY + 30, { align: "right" });

            currentY = headerY + 36;
        }

        // -------------------------------------------------------------
        // Section Title Helper
        // -------------------------------------------------------------
        function drawSectionHeading(title, subtitle) {
            // Page break check
            if (currentY > pageHeight - 45) {
                doc.addPage();
                currentY = 20;
            }

            doc.setFillColor(241, 245, 249);
            doc.roundedRect(marginX, currentY, contentWidth, 10, 2, 2, "F");

            doc.setFillColor(30, 58, 138);
            doc.rect(marginX, currentY, 3.5, 10, "F");

            doc.setFont("helvetica", "bold");
            doc.setFontSize(10);
            doc.setTextColor(15, 23, 42);
            doc.text(title.toUpperCase(), marginX + 7, currentY + 6.5);

            if (subtitle) {
                doc.setFont("helvetica", "normal");
                doc.setFontSize(8);
                doc.setTextColor(100, 116, 139);
                doc.text(subtitle, pageWidth - marginX - 4, currentY + 6.5, { align: "right" });
            }

            currentY += 15;
        }

        // 1. Initial Page Header
        drawFirstPageHeader();

        const allFiles = data.allFiles || [];
        const filteredFiles = data.filteredFiles || [];
        const categoriesList = data.categoriesList || [];
        const downloadsList = data.downloadsList || [];
        const usersList = data.usersList || [];

        // -------------------------------------------------------------
        // MODULE A: EXECUTIVE SUMMARY & ANALYTICS
        // -------------------------------------------------------------
        if (config.modules.executive) {
            drawSectionHeading("Module A: Executive Research Analytics & Qualitative Findings");

            const total = allFiles.length;
            const approved = allFiles.filter(f => f.status === "approved").length;
            const pending = allFiles.filter(f => f.status === "pending").length;
            const rejected = allFiles.filter(f => f.status === "rejected").length;

            // Generate qualitative findings synthesis
            const insights = (window.refmansyApi && window.refmansyApi.analytics && window.refmansyApi.analytics.generateExecutiveFindings)
                ? window.refmansyApi.analytics.generateExecutiveFindings(allFiles, categoriesList, downloadsList, usersList)
                : null;

            // 1. Render KPI Summary Cards
            const cardWidth = (contentWidth - 12) / 4;
            const cardHeight = 15;
            const cardY = currentY;

            const kpis = [
                { label: "Total Uploaded", value: String(total), color: [30, 58, 138] },
                { label: "Approved Papers", value: String(approved), color: [22, 163, 74] },
                { label: "Pending Review", value: String(pending), color: [217, 119, 6] },
                { label: "Rejected Papers", value: String(rejected), color: [100, 116, 139] }
            ];

            kpis.forEach((kpi, index) => {
                const x = marginX + index * (cardWidth + 4);
                doc.setFillColor(248, 250, 252);
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.3);
                doc.roundedRect(x, cardY, cardWidth, cardHeight, 2, 2, "FD");

                // Accent Top Border
                doc.setFillColor(...kpi.color);
                doc.rect(x, cardY, cardWidth, 1.2, "F");

                doc.setFont("helvetica", "bold");
                doc.setFontSize(12);
                doc.setTextColor(...kpi.color);
                doc.text(kpi.value, x + cardWidth / 2, cardY + 7.5, { align: "center" });

                doc.setFont("helvetica", "normal");
                doc.setFontSize(6.5);
                doc.setTextColor(100, 116, 139);
                doc.text(kpi.label.toUpperCase(), x + cardWidth / 2, cardY + 12.2, { align: "center" });
            });

            currentY = cardY + cardHeight + 6;

            // 2. Executive Narrative Summary Box
            if (insights) {
                const summaryHeadline = insights.headline || "Institutional Research Repository Synthesis";
                const summaryLines = doc.splitTextToSize(insights.summaryParagraph || "", contentWidth - 14);
                const narrativeBoxHeight = 10 + (summaryLines.length * 3.6);

                doc.setFillColor(240, 253, 244); // #f0fdf4
                doc.setDrawColor(187, 247, 208); // #bbf7d0
                doc.setLineWidth(0.4);
                doc.roundedRect(marginX, currentY, contentWidth, narrativeBoxHeight, 2, 2, "FD");

                // Green accent stripe on left
                doc.setFillColor(31, 146, 84); // #1f9254
                doc.rect(marginX, currentY, 3, narrativeBoxHeight, "F");

                doc.setFont("helvetica", "bold");
                doc.setFontSize(8.5);
                doc.setTextColor(20, 83, 45); // #14532d
                doc.text(summaryHeadline, marginX + 6, currentY + 5.5);

                doc.setFont("helvetica", "normal");
                doc.setFontSize(7.2);
                doc.setTextColor(22, 101, 52); // #166534
                doc.text(summaryLines, marginX + 6, currentY + 9.5);

                currentY += narrativeBoxHeight + 6;

                // 3. 4-Box Key Analytical Findings (2x2 compact grid)
                const gridW = (contentWidth - 6) / 2;
                const gridH = 13.5;

                for (let i = 0; i < 4; i++) {
                    const finding = insights.findings[i];
                    if (!finding) continue;

                    const col = i % 2;
                    const row = Math.floor(i / 2);
                    const fx = marginX + col * (gridW + 6);
                    const fy = currentY + row * (gridH + 4);

                    doc.setFillColor(248, 250, 252);
                    doc.setDrawColor(226, 232, 240);
                    doc.setLineWidth(0.3);
                    doc.roundedRect(fx, fy, gridW, gridH, 1.5, 1.5, "FD");

                    // Small Tag
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(5.8);
                    doc.setTextColor(100, 116, 139);
                    doc.text(finding.tag.toUpperCase(), fx + 4, fy + 3.8);

                    // Title
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(7.5);
                    doc.setTextColor(30, 41, 59);
                    doc.text(finding.title, fx + 4, fy + 7.2);

                    // Description (truncated if long)
                    doc.setFont("helvetica", "normal");
                    doc.setFontSize(6.5);
                    doc.setTextColor(71, 85, 105);
                    const descLines = doc.splitTextToSize(finding.desc, gridW - 8);
                    doc.text(descLines.slice(0, 2), fx + 4, fy + 10.8);
                }

                currentY += (2 * (gridH + 4)) + 4;
            }

            // 4. Generate Off-screen Vector Charts
            const statusChartDataUrl = renderStatusDonutChart(approved, pending, rejected, total);

            // Compute category counts
            const catCounts = categoriesList.map(c => ({
                name: c.name,
                count: allFiles.filter(f => f.category === c.name).length
            }));
            const catChartDataUrl = renderCategoryBarChart(catCounts, total);

            // Render Charts side by side
            const chartWidth = (contentWidth - 6) / 2;
            const chartHeight = 44;

            doc.setFont("helvetica", "bold");
            doc.setFontSize(8);
            doc.setTextColor(30, 41, 59);
            doc.text("Status Distribution Ratio", marginX, currentY + 3);
            doc.text("Research by Academic Category", marginX + chartWidth + 6, currentY + 3);

            currentY += 5;

            try {
                doc.addImage(statusChartDataUrl, "PNG", marginX, currentY, chartWidth, chartHeight);
                doc.addImage(catChartDataUrl, "PNG", marginX + chartWidth + 6, currentY, chartWidth, chartHeight);
            } catch (e) {
                console.warn("Error embedding charts in PDF:", e);
            }

            currentY += chartHeight + 6;

            // 5. Strategic Recommendations
            if (insights && insights.recommendations && insights.recommendations.length > 0) {
                // Check if page break needed
                if (currentY + 22 > pageHeight - 30) {
                    doc.addPage();
                    currentY = 20;
                }

                const recBoxY = currentY;
                const recHeight = 7 + (insights.recommendations.length * 3.8);

                doc.setFillColor(255, 251, 235); // #fffbeb
                doc.setDrawColor(253, 230, 138); // #fde68a
                doc.setLineWidth(0.3);
                doc.roundedRect(marginX, recBoxY, contentWidth, recHeight, 2, 2, "FD");

                doc.setFont("helvetica", "bold");
                doc.setFontSize(7.5);
                doc.setTextColor(146, 64, 14); // #92400e
                doc.text("ACTIONABLE ADMINISTRATIVE RECOMMENDATIONS:", marginX + 4, recBoxY + 4.5);

                doc.setFont("helvetica", "normal");
                doc.setFontSize(6.8);
                doc.setTextColor(120, 53, 15); // #78350f

                insights.recommendations.forEach((rec, rIdx) => {
                    const rLines = doc.splitTextToSize(`*  ${rec}`, contentWidth - 10);
                    doc.text(rLines, marginX + 5, recBoxY + 8.5 + (rIdx * 4));
                });

                currentY = recBoxY + recHeight + 8;
            } else {
                currentY += 4;
            }
        }

        // -------------------------------------------------------------
        // MODULE B: RESEARCH SUBMISSIONS TABLE
        // -------------------------------------------------------------
        if (config.modules.catalog) {
            // Start Module B cleanly on a new page to keep Page 1 as an executive overview
            doc.addPage();
            currentY = 20;

            let targetFiles = allFiles;
            let scopeLabel = `All Submissions (${allFiles.length} Records)`;

            const selectedScope = (config.catalogScope || "all").toLowerCase();

                if (selectedScope === "filtered" || (filteredFiles && filteredFiles.length > 0 && filteredFiles.length !== allFiles.length)) {
                    targetFiles = filteredFiles;
                    scopeLabel = `Filtered Submissions (${targetFiles.length} Records)`;
                } else if (selectedScope === "approved") {
                    targetFiles = allFiles.filter(f => (f.status || "").toLowerCase() === "approved");
                    scopeLabel = `Approved Submissions (${targetFiles.length} Records)`;
                } else if (selectedScope === "pending") {
                    targetFiles = allFiles.filter(f => (f.status || "").toLowerCase() === "pending");
                    scopeLabel = `Pending Submissions (${targetFiles.length} Records)`;
                } else {
                    targetFiles = allFiles;
                    scopeLabel = `All Submissions (${allFiles.length} Records)`;
                }

                drawSectionHeading("Module B: Research Submissions", scopeLabel);

                if (targetFiles.length === 0) {
                    doc.setFont("helvetica", "italic");
                    doc.setFontSize(9);
                    doc.setTextColor(148, 163, 184);
                    const emptyMsg = selectedScope === "approved"
                        ? "No approved research submissions found."
                        : selectedScope === "pending"
                            ? "No pending research submissions found."
                            : "No research records found matching the designated scope.";
                    doc.text(emptyMsg, marginX, currentY + 4);
                    currentY += 12;
                } else {
                    const tableRows = targetFiles.map((file, idx) => {
                        const displayId = "RF-" + String(idx + 1).padStart(4, "0");
                        const statusStr = (file.status || "pending").toUpperCase();
                        const reviewStr = file.reviewedDate || file.dateUploaded || "N/A";
                        return [
                            displayId,
                            file.title || "Untitled Paper",
                            file.researcher || "N/A",
                            file.category || "General",
                            file.publicationYear || "N/A",
                            statusStr,
                            reviewStr
                        ];
                    });

                    doc.autoTable({
                        startY: currentY,
                        head: [["ID", "Research Title", "Lead Researcher", "Category", "Year", "Status", "Review Date"]],
                        body: tableRows,
                        theme: "grid",
                        margin: { left: marginX, right: marginX },
                        styles: {
                            fontSize: 7.5,
                            cellPadding: 2.2,
                            lineColor: [226, 232, 240],
                            lineWidth: 0.2,
                            valign: "middle"
                        },
                        headStyles: {
                            fillColor: [30, 58, 138],
                            textColor: [255, 255, 255],
                            fontStyle: "bold",
                            halign: "left"
                        },
                        columnStyles: {
                            0: { cellWidth: 16, fontStyle: "bold" },
                            1: { cellWidth: 62 },
                            2: { cellWidth: 34 },
                            3: { cellWidth: 26 },
                            4: { cellWidth: 12, halign: "center" },
                            5: { cellWidth: 16, halign: "center", fontStyle: "bold" },
                            6: { cellWidth: 16, halign: "center" }
                        },
                        didParseCell: function (data) {
                            if (data.section === "body" && data.column.index === 5) {
                                if (data.cell.raw === "APPROVED") {
                                    data.cell.styles.textColor = [22, 163, 74];
                                } else if (data.cell.raw === "REJECTED") {
                                    data.cell.styles.textColor = [148, 163, 184];
                                } else {
                                    data.cell.styles.textColor = [217, 119, 6];
                                }
                            }
                        }
                    });

                    currentY = doc.lastAutoTable.finalY + 12;
                }
            }

            // -------------------------------------------------------------
            // MODULE C: READERSHIP & PHYSICAL QR SCAN AUDIT
            // -------------------------------------------------------------
            if (config.modules.downloads) {
                drawSectionHeading("Module C: Research Readership & Physical QR Scan Audit");

                const totalDl = downloadsList.length;
                const qrScans = downloadsList.filter(d => (d.user_email && d.user_email.includes("qr-guest")) || (d.user_name && d.user_name.includes("QR"))).length;
                const facultyDl = totalDl - qrScans;

                // Metric pills
                const dlPillWidth = (contentWidth - 8) / 3;
                const pillY = currentY;

                const dlMetrics = [
                    { label: "Total Document Downloads", value: String(totalDl), color: [30, 58, 138] },
                    { label: "Faculty Portal Downloads", value: String(facultyDl), color: [22, 163, 74] },
                    { label: "Hard-Copy QR Guest Scans", value: String(qrScans), color: [147, 51, 234] }
                ];

                dlMetrics.forEach((m, idx) => {
                    const px = marginX + idx * (dlPillWidth + 4);
                    doc.setFillColor(248, 250, 252);
                    doc.setDrawColor(226, 232, 240);
                    doc.roundedRect(px, pillY, dlPillWidth, 14, 2, 2, "FD");

                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(11);
                    doc.setTextColor(...m.color);
                    doc.text(m.value, px + dlPillWidth / 2, pillY + 6.5, { align: "center" });

                    doc.setFont("helvetica", "normal");
                    doc.setFontSize(7);
                    doc.setTextColor(100, 116, 139);
                    doc.text(m.label.toUpperCase(), px + dlPillWidth / 2, pillY + 11.5, { align: "center" });
                });

                currentY = pillY + 20;

                // Compute Top Downloaded Research Papers
                const paperDownloadCounts = {};
                downloadsList.forEach(d => {
                    const title = d.file_title || "Unknown Document";
                    const cat = d.file_category || "General";
                    if (!paperDownloadCounts[title]) {
                        paperDownloadCounts[title] = { title, category: cat, total: 0, qr: 0, faculty: 0 };
                    }
                    paperDownloadCounts[title].total++;
                    if (d.user_email && d.user_email.includes("qr-guest")) {
                        paperDownloadCounts[title].qr++;
                    } else {
                        paperDownloadCounts[title].faculty++;
                    }
                });

                const topDownloaded = Object.values(paperDownloadCounts)
                    .sort((a, b) => b.total - a.total)
                    .slice(0, 8);

                if (topDownloaded.length > 0) {
                    doc.setFont("helvetica", "bold");
                    doc.setFontSize(8.5);
                    doc.setTextColor(30, 41, 59);
                    doc.text("Top Most Accessed Research Documents", marginX, currentY);
                    currentY += 4;

                    const dlRows = topDownloaded.map((item, idx) => [
                        String(idx + 1),
                        item.title,
                        item.category,
                        String(item.faculty),
                        String(item.qr),
                        String(item.total)
                    ]);

                    doc.autoTable({
                        startY: currentY,
                        head: [["Rank", "Research Document Title", "Category", "Faculty Portal", "QR Hard-Copy", "Total Accesses"]],
                        body: dlRows,
                        theme: "striped",
                        margin: { left: marginX, right: marginX },
                        styles: { fontSize: 7.5, cellPadding: 2 },
                        headStyles: { fillColor: [79, 70, 229], textColor: [255, 255, 255], fontStyle: "bold" },
                        columnStyles: {
                            0: { cellWidth: 14, halign: "center", fontStyle: "bold" },
                            1: { cellWidth: 82 },
                            2: { cellWidth: 32 },
                            3: { cellWidth: 18, halign: "center" },
                            4: { cellWidth: 18, halign: "center" },
                            5: { cellWidth: 18, halign: "center", fontStyle: "bold", textColor: [30, 58, 138] }
                        }
                    });

                    currentY = doc.lastAutoTable.finalY + 12;
                } else {
                    doc.setFont("helvetica", "italic");
                    doc.setFontSize(8);
                    doc.setTextColor(148, 163, 184);
                    doc.text("No document download interactions recorded yet.", marginX, currentY);
                    currentY += 10;
                }
            }

            // -------------------------------------------------------------
            // MODULE D: FACULTY & DEPARTMENT PRODUCTIVITY
            // -------------------------------------------------------------
            if (config.modules.faculty) {
                drawSectionHeading("Module D: Faculty & Departmental Research Productivity");

                // Group by department
                const deptStats = {};
                allFiles.forEach(f => {
                    const dept = (f.department || "Unassigned / General").trim();
                    if (!deptStats[dept]) {
                        deptStats[dept] = { total: 0, approved: 0, pending: 0, rejected: 0 };
                    }
                    deptStats[dept].total++;
                    if (f.status === "approved") deptStats[dept].approved++;
                    else if (f.status === "rejected") deptStats[dept].rejected++;
                    else deptStats[dept].pending++;
                });

                const deptRows = Object.entries(deptStats).map(([name, s]) => {
                    const rate = Math.round((s.approved / (s.total || 1)) * 100) + "%";
                    return [name, String(s.total), String(s.approved), String(s.pending), String(s.rejected), rate];
                });

                if (deptRows.length > 0) {
                    doc.autoTable({
                        startY: currentY,
                        head: [["Academic Department / Strand", "Submissions", "Approved", "Pending", "Rejected", "Approval Rate"]],
                        body: deptRows,
                        theme: "striped",
                        margin: { left: marginX, right: marginX },
                        styles: { fontSize: 7.5, cellPadding: 2 },
                        headStyles: { fillColor: [15, 118, 110], textColor: [255, 255, 255], fontStyle: "bold" },
                        columnStyles: {
                            0: { cellWidth: 72, fontStyle: "bold" },
                            1: { cellWidth: 22, halign: "center" },
                            2: { cellWidth: 22, halign: "center", textColor: [22, 163, 74] },
                            3: { cellWidth: 22, halign: "center", textColor: [217, 119, 6] },
                            4: { cellWidth: 22, halign: "center", textColor: [148, 163, 184] },
                            5: { cellWidth: 22, halign: "center", fontStyle: "bold", textColor: [15, 118, 110] }
                        }
                    });

                    currentY = doc.lastAutoTable.finalY + 12;
                }
            }

            // -------------------------------------------------------------
            // RUNNING HEADERS & FOOTERS ON ALL PAGES
            // -------------------------------------------------------------
            const totalPages = doc.internal.getNumberOfPages();

            for (let i = 1; i <= totalPages; i++) {
                doc.setPage(i);

                // Running Header on Page 2 and above
                if (i > 1) {
                    doc.setFont("helvetica", "normal");
                    doc.setFontSize(7);
                    doc.setTextColor(148, 163, 184);
                    doc.text("REFMANSY • EXECUTIVE REPORT", marginX, 9);
                    doc.text("CONFIDENTIAL", pageWidth - marginX, 9, { align: "right" });

                    doc.setDrawColor(226, 232, 240);
                    doc.setLineWidth(0.3);
                    doc.line(marginX, 11, pageWidth - marginX, 11);
                }

                // Running Footer on every page
                const footerY = pageHeight - 9;
                doc.setDrawColor(226, 232, 240);
                doc.setLineWidth(0.3);
                doc.line(marginX, footerY - 3, pageWidth - marginX, footerY - 3);

                doc.setFont("helvetica", "normal");
                doc.setFontSize(7);
                doc.setTextColor(148, 163, 184);
                doc.text("Refmansy Reference Management System • Executive Report", marginX, footerY);

                const pageStr = `Page ${i} of ${totalPages}`;
                doc.text(pageStr, pageWidth - marginX, footerY, { align: "right" });
            }

            // -------------------------------------------------------------
            // TRIGGER FILE DOWNLOAD
            // -------------------------------------------------------------
            const fileDate = new Date().toISOString().split("T")[0];
            const fileName = `REFMANSY_Report_${fileDate}.pdf`;
            doc.save(fileName);
        }

        // Expose on global window object
        window.refmansyPdfGenerator = {
            generateModularPdfReport
        };
    }) ();
