# REFMANSY: Research Files Date Range Filter & Enhanced Search Specification

## 1. Overview
This specification details the technical architecture, UI layout, and client-side filtering engine for adding a **Date Range Filter** and an **Enhanced Multi-Field Search** (by Research ID, Research Title, and Authors/Co-Authors) to the **Research Files** management table in the REFMANSY administration portal (`research-files.html`).

---

## 2. Understanding Summary
* **Feature Name**: Research Files Date Range Filter & Enhanced Search Engine.
* **Target Users**: School administrators and research coordinators managing the institutional repository.
* **Core Purpose**: Empower administrators to rapidly query and isolate research files using official tracking/display IDs (e.g. `RF-0001`), document titles, primary researcher names, co-author names, or specific submission date windows.
* **Key Constraints**:
  * Purely client-side execution using Vanilla JavaScript, HTML, and CSS (matching Refmansy's existing architecture and styling patterns).
  * Consistent UI design aligned with the date filter controls in `admin-reports.html`.
  * Preserves existing table capabilities including review modal, file downloads, status badges, and deletion actions.
* **Explicit Non-Goals**:
  * No database schema alterations or remote Supabase query rewrites.
  * No modifications to faculty submission workflows or review pipelines.

---

## 3. Assumptions & Constraints
1. **Performance**: Real-time client-side array filtering executing on `input` and `change` events with sub-16ms response times for snappy typing feedback.
2. **Stable ID Persistence**: Each document receives a canonical, persistent `displayId` (e.g., `RF-0001`, `RF-0002`) upon initial data fetch based on its repository index, preventing ID shifting when filters are applied.
3. **Date Boundary Semantics**: 
   * "From" (`startDate`) starts at `00:00:00` of the chosen date.
   * "To" (`endDate`) spans through `23:59:59` of the chosen date (`endDate + "T23:59:59"`).
4. **Author Scope**: Searches encompass both primary `file.researcher` and comma-separated `file.coResearchers`.
5. **Auth & Access**: Remains strictly protected behind `window.refmansyAuthGuard.init("admin", ...)` with zero change to roles or RLS policies.

---

## 4. Complete Decision Log

| # | Decision Topic | Choice | Considered Alternatives | Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **D1** | **Date Filter UI** | Inline Date Range with "From" and "To" native date pickers | Dropdown presets, Collapsible drawer, Single date picker | Matches established `admin-reports.html` pattern, highly intuitive, and eliminates extra clicks. |
| **D2** | **Search Field Matching** | Formatted Display ID + Title + Primary Researcher + Co-Researchers | Title-only, ID-only, UUID search | Satisfies administrator need to search by document ID badge, paper title, or any participating researcher/author. |
| **D3** | **Display ID Indexing** | Stable Pre-Assignment upon data loading | Dynamic indexing (`index + 1` in filtered array) | Eliminates the issue where document IDs re-number on every keystroke, ensuring searching for `RF-0003` reliably finds paper #3. |
| **D4** | **Filter Reset Mechanism** | Dedicated "Clear Filters" Button (`.clear-button`) | Manual input-by-input reset only | Provides instant one-click restoration of all controls (search text, dates, category, and status). |

---

## 5. UI / UX Design Specifications

### 5.1 Controls Bar Layout (`research-files.html`)
The `.table-controls` bar will be updated to host all controls in a cohesive, responsive flow:

```html
<div class="table-controls">

    <div class="search-box">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input
            type="search"
            id="searchInput"
            placeholder="Search by ID, title, or author..."
        >
    </div>

    <select id="categoryFilter">
        <option value="all">All Categories</option>
    </select>

    <select id="statusFilter">
        <option value="all">All Statuses</option>
        <option value="pending">Pending</option>
        <option value="approved">Approved</option>
        <option value="rejected">Rejected</option>
    </select>

    <div class="date-filter">
        <label for="startDate">From</label>
        <input type="date" id="startDate">
    </div>

    <div class="date-filter">
        <label for="endDate">To</label>
        <input type="date" id="endDate">
    </div>

    <button
        type="button"
        id="clearFiltersButton"
        class="clear-button"
        title="Reset all filters"
    >
        <i class="fa-solid fa-rotate-left"></i> Clear
    </button>

</div>
```

### 5.2 CSS Styling (`research-files.css`)
* `.table-controls`: Updated to use `display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center;`.
* `.date-filter`: Integrated flex container with light gray borders, matching typography (`0.85rem`), and `--primary-blue` outline focus states.
* `.clear-button`: Styled as a subtle secondary button with hover transition and clear contrast.

---

## 6. Data Flow & Filtering Logic (`research-files.js`)

### 6.1 Stable ID Indexing
In `loadResearchFiles()`:
```javascript
const [files, categories] = await Promise.all([
    window.refmansyApi.research.getAllFiles(),
    window.refmansyApi.categories.getAll()
]);

// Assign stable, permanent displayId to each file
files.forEach((file, index) => {
    file.displayId = "RF-" + String(index + 1).padStart(4, "0");
});

researchFiles = files;
```

### 6.2 Filter Evaluation Pipeline
In `filterResearchFiles()`:
```javascript
function filterResearchFiles() {
    const term = (searchInput?.value || "").trim().toLowerCase();
    const cat = categoryFilter?.value || "all";
    const stat = (statusFilter?.value || "all").toLowerCase();
    const start = startDate?.value || "";
    const end = endDate?.value || "";

    const filtered = researchFiles.filter(file => {
        // Multi-field search
        const matchesTerm =
            !term ||
            file.displayId.toLowerCase().includes(term) ||
            file.title.toLowerCase().includes(term) ||
            file.researcher.toLowerCase().includes(term) ||
            (file.coResearchers && file.coResearchers.toLowerCase().includes(term)) ||
            file.uploadedBy.toLowerCase().includes(term) ||
            (file.keywords && file.keywords.toLowerCase().includes(term));

        // Category & Status
        const matchesCat = cat === "all" || file.category === cat;
        const matchesStat = stat === "all" || file.status === stat;

        // Date Range
        let matchesDate = true;
        if (start && file.createdAt) {
            matchesDate = matchesDate && new Date(file.createdAt) >= new Date(start);
        }
        if (end && file.createdAt) {
            matchesDate = matchesDate && new Date(file.createdAt) <= new Date(end + "T23:59:59");
        }

        return matchesTerm && matchesCat && matchesStat && matchesDate;
    });

    if (resultCount) {
        resultCount.textContent = `Showing ${filtered.length} of ${researchFiles.length} files`;
    }

    renderTable(filtered);
}
```

### 6.3 Clear Filters Handler
```javascript
function clearFilters() {
    if (searchInput) searchInput.value = "";
    if (categoryFilter) categoryFilter.value = "all";
    if (statusFilter) statusFilter.value = "all";
    if (startDate) startDate.value = "";
    if (endDate) endDate.value = "";
    filterResearchFiles();
}
```

---

## 7. Edge Cases & Resilience
1. **Case-Insensitive Substring ID Match**: Users can type `RF-0001`, `rf-0001`, or `0001`, and the substring match resolves the document immediately.
2. **Missing Co-Authors**: Guarded by `(file.coResearchers && file.coResearchers.toLowerCase().includes(term))` so files without co-authors evaluate without errors.
3. **Inverted Date Pickers**: If `startDate > endDate`, array filter yields 0 matches and displays the empty state gracefully without crashing.
4. **Responsive Flex Wrap**: On smaller screens, the date pickers and Clear button wrap cleanly beneath the search box and dropdowns.

---

## 8. Verification Plan
* [ ] Search by ID (`RF-0002` and `0002`) and confirm exact row isolation with matching badge.
* [ ] Search by primary researcher (`User`, `akiya`, `Joey odnimer`) and verify accurate results.
* [ ] Search by co-author name from `coResearchers` and verify correct row display.
* [ ] Pick *From* date and *To* date spanning an upload date; verify correct filtering.
* [ ] Click **Clear** button and ensure search query, dropdowns, and date fields reset, restoring all rows.
