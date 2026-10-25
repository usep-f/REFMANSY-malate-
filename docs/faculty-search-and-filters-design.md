# REFMANSY: Faculty Dashboard, Search Files & Download Records Extensive Search & Filters Specification

## 1. Overview
This specification details the technical architecture, UI layout, CSS design tokens, and client-side filtering pipeline for implementing the **Admin-Grade Search and Filter Suite** across the Faculty portal in REFMANSY:
1. **Faculty Dashboard** (`faculty-dashboard.html`)
2. **Search Files** (`search-files.html`)
3. **Download Records** (`download-records.html`)

---

## 2. Understanding Summary
* **Feature Name**: Faculty Portal Extensive Research Search & Filters Suite.
* **Target Users**: Faculty members, academic researchers, and teaching staff.
* **Core Purpose**: Provide faculty users with the same multi-field query capabilities (by Research ID, title, author, co-author, keywords), category selection, date range filtering, and single-click reset functionality currently available to administrators in `research-files.html`.
* **Key Constraints**:
  * Pure client-side execution in Vanilla JavaScript, HTML5, and CSS with instant typing feedback (<16ms).
  * Seamless responsive design aligning with Refmansy's design tokens and existing CSS conventions.
  * Preserves existing table behaviors (file views, downloads, download tracking, review comments).
  * Zero modifications to Supabase database schemas or remote APIs.
* **Explicit Non-Goals**:
  * No database schema migrations or remote RLS changes.
  * No modifications to review approval workflows or PDF generation engines.
  * No modifications to non-target pages (`submission-status.html`, `my-research-files.html`) in this phase.

---

## 3. Assumptions & Constraints
1. **Performance**: In-memory array filtering executing on `input` and `change` events with sub-16ms response times for instant feedback.
2. **Stable Display ID Persistence**: Each document receives a canonical, persistent `displayId` (e.g., `RF-0001`, `RF-0002`) upon initial data fetch based on its array index, preventing ID shifting during filtering.
3. **Date Boundary Semantics**:
   * "From" (`startDate`) starts at `00:00:00` of the chosen date.
   * "To" (`endDate`) spans through `23:59:59` of the chosen date (`endDate + "T23:59:59"`).
   * Comparison date field uses `file.createdAt || file.dateUploaded`.
4. **Author Scope**: Text search matches Research ID, Title, Primary Researcher (`file.researcher`), Co-Researchers (`file.coResearchers`), and Keywords (`file.keywords`).
5. **Status Filter Relevance**: The Status filter (`All Statuses`, `Pending`, `Approved`, `Rejected`) applies to the Faculty Dashboard table (which holds the user's submissions), while Search Files and Download Records exclusively display approved documents.
6. **Role Guarding**: Strictly protected behind `window.refmansyAuthGuard.init("faculty", ...)`.

---

## 4. Complete Decision Log

| # | Decision Topic | Choice | Considered Alternatives | Rationale |
| :--- | :--- | :--- | :--- | :--- |
| **D1** | **Target Scope** | Faculty Dashboard, Search Files, and Download Records | Dashboard only; Search/Download only; All faculty tables | User confirmed applying extensive filtering across all three primary faculty discovery touchpoints. |
| **D2** | **Faculty Dashboard Table Behavior** | Filter existing "My Uploaded Research Files" table | Create new repository archive table; Leave dashboard untouched | Keeps dashboard focused on user's submissions while giving them powerful tools to isolate submissions by status, category, date, and keyword. |
| **D3** | **Architecture Approach** | **Page-Tailored Native Integration (Option 1)** | Shared filter helper (`filter-helper.js`), URL Query-Param Synced Engine | Preserves simplicity, avoids shared-script coupling, and matches Refmansy's vanilla architecture perfectly. |
| **D4** | **Filter Layout Structure** | Responsive Flex Wrap (`.table-controls` / `.search-filters`) | Collapsible Drawer / Modal | Inline controls provide zero-click visibility and immediate desktop/mobile ergonomics. |
| **D5** | **Date Comparison Field** | Primary fallback `file.createdAt || file.dateUploaded` | Review date only | Submissions track primary upload/creation date, aligning with Admin portal metrics. |
| **D6** | **Reset Mechanism** | Dedicated "Clear Filters" Button (`.clear-button`) | Manual input-by-input reset only | Provides instant one-click restoration of all controls (search text, dates, category, and status). |

---

## 5. UI / UX Design Specifications

### 5.1 Faculty Dashboard (`faculty-dashboard.html`)
Add the `.table-controls` bar directly above the table in `.uploaded-files-card`:
```html
<div class="table-controls">
    <div class="search-box">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input
            type="search"
            id="searchInput"
            placeholder="Search by ID, title, or keyword..."
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

<div class="table-meta" style="margin: 0.5rem 0 1rem; color: #64748b; font-size: 0.85rem;">
    <span id="resultCount">Showing 0 submissions</span>
</div>
```

### 5.2 Search Files (`search-files.html`)
Upgrade `.search-filters` to include date range inputs alongside existing category, type, and year filters:
```html
<div class="date-filter">
    <label for="startDate">From</label>
    <input type="date" id="startDate">
</div>

<div class="date-filter">
    <label for="endDate">To</label>
    <input type="date" id="endDate">
</div>
```

### 5.3 Download Records (`download-records.html`)
Upgrade `.table-controls` above the downloadable table:
```html
<div class="table-controls">
    <div class="search-box">
        <i class="fa-solid fa-magnifying-glass"></i>
        <input
            type="search"
            id="searchInput"
            placeholder="Search by ID, title, researcher, or keyword..."
        >
    </div>

    <select id="categoryFilter">
        <option value="all">All Categories</option>
    </select>

    <select id="yearFilter">
        <option value="all">All Years</option>
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

### 5.4 CSS Styling Patterns (`faculty-dashboard.css`, `search-files.css`, `download-records.css`)
* Standardize `.table-controls` with `display: flex; flex-wrap: wrap; gap: 0.75rem; align-items: center; margin-bottom: 1.25rem;`.
* `.date-filter`: Integrated flex container with light slate borders (`#cbd5e1`), border radius (`6px`), padding (`0.45rem 0.75rem`), and `--primary-blue` outline focus states.
* `.clear-button`: Secondary action button with subtle hover transition (`background: #f1f5f9; color: #0f172a;`).

---

## 6. Data Flow & Filtering Logic

### 6.1 Stable Display ID Pre-Assignment
```javascript
// Pre-assign persistent display ID upon data fetch
files.forEach((file, index) => {
    file.displayId = "RF-" + String(index + 1).padStart(4, "0");
});
```

### 6.2 Filter Pipeline Implementation
```javascript
function filterFiles() {
    const term = (searchInput?.value || "").trim().toLowerCase();
    const cat = categoryFilter?.value || "all";
    const stat = (statusFilter?.value || "all").toLowerCase();
    const yr = yearFilter?.value || "all";
    const rType = researchTypeFilter?.value || "all";
    const start = startDate?.value || "";
    const end = endDate?.value || "";

    const filtered = allFiles.filter(file => {
        // Multi-field search
        const matchesTerm =
            !term ||
            (file.displayId && file.displayId.toLowerCase().includes(term)) ||
            (file.title && file.title.toLowerCase().includes(term)) ||
            (file.researcher && file.researcher.toLowerCase().includes(term)) ||
            (file.coResearchers && file.coResearchers.toLowerCase().includes(term)) ||
            (file.keywords && file.keywords.toLowerCase().includes(term)) ||
            (file.department && file.department.toLowerCase().includes(term));

        // Category filter
        const matchesCat = cat === "all" || file.category === cat;

        // Status filter (where applicable)
        const matchesStat = stat === "all" || file.status === stat;

        // Year filter (where applicable)
        const matchesYr = yr === "all" || String(file.publicationYear) === String(yr);

        // Research Type filter (where applicable)
        const matchesType = rType === "all" || file.researchType === rType;

        // Date Range (From / To)
        const fileDateStr = file.createdAt || file.dateUploaded;
        let matchesDate = true;
        if (start && fileDateStr) {
            matchesDate = matchesDate && new Date(fileDateStr) >= new Date(start);
        }
        if (end && fileDateStr) {
            matchesDate = matchesDate && new Date(fileDateStr) <= new Date(end + "T23:59:59");
        }

        return matchesTerm && matchesCat && matchesStat && matchesYr && matchesType && matchesDate;
    });

    if (resultCount) {
        resultCount.textContent = `Showing ${filtered.length} of ${allFiles.length} files`;
    }

    renderTableOrResults(filtered);
}
```

### 6.3 Clear Filters Handler
```javascript
function clearFilters() {
    if (searchInput) searchInput.value = "";
    if (categoryFilter) categoryFilter.value = "all";
    if (statusFilter) statusFilter.value = "all";
    if (yearFilter) yearFilter.value = "all";
    if (researchTypeFilter) researchTypeFilter.value = "all";
    if (startDate) startDate.value = "";
    if (endDate) endDate.value = "";
    filterFiles();
}
```

---

## 7. Edge Cases & Resilience
1. **Case-Insensitive Substring Match**: Matches `RF-0001`, `rf-0001`, or `0001`.
2. **Missing Properties Safe Guards**: Optional chaining and string checks protect against missing co-authors, keywords, or upload dates without console errors.
3. **Inverted Date Boundaries**: If `startDate > endDate`, filter yields 0 matches and displays the empty state gracefully.
4. **Responsive Flex Wrap**: On mobile and tablet screens, the controls wrap cleanly without horizontal blowout.

---

## 8. Verification & QA Plan
* [ ] Verify multi-field search matches Research ID, Title, Primary Author, Co-Researchers, and Keywords on all 3 pages.
* [ ] Verify category filtering populates dynamically and filters correctly.
* [ ] Verify date range inputs ("From" and "To") accurately isolate records by upload date.
* [ ] Verify status filter on Faculty Dashboard isolates Pending, Approved, and Rejected files.
* [ ] Verify "Clear" button resets all filters and restores full lists.
* [ ] Verify responsive layout across desktop, tablet, and mobile views.
