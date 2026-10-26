# REFMANSY: Modular PDF Report Export Specification & Technical Design

## 1. Overview
This specification details the architecture, user interface, and client-side vector PDF generation engine for the **Modular PDF Report Export Feature** in the REFMANSY (Research & Reference Management System) administration portal (`admin-reports.html`).

The feature enables school administrators to configure, assemble, and export publication-ready institutional research reports for school leadership, research coordinators, and DepEd evaluators.

---

## 2. Understanding Summary
* **Feature Name**: Modular PDF Report Builder & Exporter.
* **Target Users**: School administrators, research coordinators, and institutional reviewers.
* **Core Purpose**: Transform platform data (research submissions, approval statuses, category distributions, download analytics, and faculty productivity) into customizable, multi-page vector PDF documents.
* **Key Constraints**:
  * Purely client-side execution in vanilla JavaScript via `jsPDF` and `jspdf-autotable` CDN libraries (no backend server or Node.js rendering process required).
  * Strict access control restricted to authenticated administrators via `auth-guard.js`.
  * Preserves existing CSV export and native browser print functionality.
* **Explicit Non-Goals**:
  * No database schema alterations or Supabase Edge Functions.
  * No modifications to faculty submission workflows or review pipelines.

---

## 3. Assumptions & Constraints
1. **Performance**: Vector PDF generation and chart rendering will execute in under 2–3 seconds on standard client devices; a loading indicator will inform the administrator during document compilation.
2. **Branding & Assets**: Official institutional assets (`LOGO LCNHS.png` and `RESPROGRAM.png`) will be converted to high-quality base64 images for crisp embedding in the PDF header.
3. **Data Scope**: Module B (Research Catalog) dynamically reflects active UI filters (search term, category filter, status filter, and date range) or can toggle to export all records.
4. **Signatory Lines**: "Prepared by" automatically binds to the active administrator's full name and role; "Noted by" reserves a formal signature block for the school's Research Coordinator / Principal.

---

## 4. Complete Decision Log

| # | Decision Topic | Choice | Considered Alternatives | Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **1** | **Report Architecture** | Modular Export Builder (Modal-based) | Monolithic single PDF, simple browser print | Allows admins to customize exported documents for different institutional audiences. |
| **2** | **Included Modules** | All 4 Core System Modules (A, B, C, D) | Research-only focus (Modules A & B) | Provides a comprehensive overview of research inventory, readership, and departmental output. |
| **3** | **PDF Engine** | Client-Side Vector (`jsPDF` + `jspdf-autotable`) | `window.print()` only, `html2pdf.js` DOM snapshot | Instant browser download, crisp vector text, no row clipping across page breaks, zero server cost. |
| **4** | **Branding & Format** | Clean Executive Report (No Signatures) | Formal DepEd hierarchy with dual signatures | Streamlines header to prominent "EXECUTIVE REPORT" title between logos and eliminates unnecessary signature lines. |
| **5** | **Design Pattern** | Modal-Driven Builder with Quick Presets | Live A4 preview modal, dropdown menu without modal | Optimal balance between customization flexibility, clean UX, and straightforward maintenance. |

---

## 5. UI / UX Design Specifications

### 5.1 Header Action Bar (`admin-reports.html`)
A primary action button is added to the header controls:
* **Label**: `<i class="fa-solid fa-file-pdf"></i> Export PDF`
* **Trigger**: Opens `#exportReportModal`.

### 5.2 Export Configuration Modal (`#exportReportModal`)
The modal consists of:
1. **Modal Header**: Title (*"Export PDF Report"*) with subtitle and close button.
2. **Simple Instructions Bar**: Clean guidance explaining how to pick sections and export.
3. **Module Selection Cards**:
   * **Module A (Executive Summary & Analytics)**: KPI stat cards, status donut chart, and category distribution bar chart.
   * **Module B (Research Submissions)**: Table of research submissions with sub-option toggle:
     * *Approved Submissions (Approved count)*
     * *Pending Submissions (Pending count)*
     * *All Submissions (Total count)*
   * **Module C (Download & Readership Audit)**: Total paper downloads, top 5 most read papers, and physical hard-copy QR scan metrics vs. faculty portal downloads.
   * **Module D (Faculty & Department Productivity)**: Submission counts by academic department/strand and active researcher contributor tally.
4. **Footer Action Bar**:
   * Cancel button.
   * **Generate & Download PDF** primary button with progress spinner state (`<i class="fa-solid fa-spinner fa-spin"></i> Generating PDF...`).

---

## 6. Report Modules & Content Details

### Module A: Executive Summary & Visual Analytics
* **Header**: Institutional dual logos (`LOGO LCNHS.png` & `RESPROGRAM.png`), centered bold title (*"EXECUTIVE REPORT"*), and metadata (Generated Date/Time, Prepared By).
* **Summary KPI Cards**:
  * Total Uploaded Submissions
  * Total Approved Papers
  * Pending Review Queue
  * Rejected Submissions
  * Total Download Volume
* **Visual Charts (Rendered via High-DPI Off-screen HTML5 Canvas)**:
  * **Status Distribution Donut**: Approved (`#16a34a`), Pending (`#d97706`), Rejected (`#64748b`) with center total count and legend.
  * **Category Distribution Bar Chart**: Clean horizontal bars showing paper counts per research category.

### Module B: Research Catalog & Submissions Table
* Formatted using `jspdf-autotable`.
* **Columns**: ID, Research Title, Researcher, Category, Year, Status, Reviewed Date.
* **Styling**: Distinctive header band (`#1e3a8a`), zebra row striping, status badge coloring, text auto-wrapping for lengthy titles.
* **Pagination**: Table headers repeat automatically on subsequent pages.

### Module C: Readership & Physical QR Scan Audit
* **Summary Metrics**: Total downloads, faculty portal downloads, physical QR code guest scans (`qr-guest@refmansy.local`).
* **Top Downloaded Papers Table**: Top 5 or Top 10 most accessed research titles with category and download counts.
* **Access Type Comparison**: Breakdown table or visual comparison of online downloads vs. physical QR sticker scans.

### Module D: Faculty & Department Productivity
* **Departmental Output Table**: Total submissions and approval rates grouped by academic department/strand (e.g., STEM, TVL, HUMSS, Junior High, Senior High).
* **Faculty Activity Highlights**: Summary of active research contributors and submission volumes.

### Page Footers & Running Headers
* **Running Headers (Page 2+)**: *"REFMANSY • EXECUTIVE REPORT"* with confidentiality notice.
* **Running Footers (All Pages)**: Added via `didDrawPage` hook:
  * Left: *"Refmansy Reference Management System • Executive Report"*
  * Right: *"Page X of Y"*

---

## 7. Technical Implementation Details

### 7.1 Dependencies
Loaded via CDN in `admin-reports.html`:
```html
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js"></script>
```

### 7.2 File Architecture
* **`admin-reports.html`**: Export PDF button and `#exportReportModal` dialog markup.
* **`admin-reports.css`**: Styling for the modular cards, preset pills, and modal layout.
* **`admin-reports.js`**: Modal open/close handling, preset selection logic, and integration hook.
* **`admin-pdf-generator.js`** *(or modular function)*: Encapsulates canvas chart drawing, base64 image loading, data aggregation, and `jsPDF` document assembly.

---

## 8. Error Handling & Edge Cases
1. **Zero Matching Records**: Displays an informative banner within the autotable container instead of failing.
2. **Missing Module Selection**: Inline alert prevents submission if all modules are deselected.
3. **Logo Loading Fallback**: Gracefully degrades to text-only school heading if image assets cannot be loaded.
4. **Data Failure**: Supplemental queries (e.g., download logs) are caught gracefully, generating available sections without crash.

---

## 9. Verification & Acceptance Criteria
1. **Modal Functionality**: Admin can open modal, toggle presets, check/uncheck individual modules, and choose catalog scope.
2. **PDF Integrity**:
   * PDF downloads with proper file naming (`REFMANSY_Report_YYYY-MM-DD.pdf`).
   * Visual charts render sharp without pixelation.
   * Tables paginate cleanly without cut-off rows or overlapping headers.
   * Page numbers show accurate totals (*"Page X of Y"*).
   * Signatory section prints on the final page with correct admin name.
