# REFMANSY System Backup & Disaster Recovery Design Specification

**Document Version:** 1.0  
**Status:** Approved / Validated Design  
**Date:** September 13, 2026  
**Target Module:** Admin System Backup & Disaster Recovery (`admin-backup.html`)

---

## 1. Executive Summary

This specification outlines the architecture, data structures, security controls, and user experience for the **REFMANSY System Backup & Disaster Recovery** module.

The feature enables administrators to:
1. Generate and download complete, self-contained, and integrity-verified system backups (`.zip` archives) directly to their local machine.
2. Restore the full system state—including all database tables, foreign key relationships, historical analytics, download activity logs, user feedback, and raw PDF research documents—in a disaster recovery scenario.

---

## 2. Understanding Summary

* **Objective:** Provide a reliable, zero-extra-infrastructure backup and disaster recovery tool for REFMANSY.
* **Target Users:** REFMANSY System Administrators (`role = 'admin'`).
* **Backup Scope:** 
  * All database tables (`profiles`, `categories`, `tags`, `research_files`, `download_records`, `feedback`).
  * All research PDF documents in Supabase Storage (`research-documents` bucket).
  * 100% of historical analytics, metrics, and download timestamps.
  * A cryptographic `manifest.json` containing metadata, row counts, and SHA-256 hashes for every file.
* **Restore Strategy:** Clean full-system disaster recovery with pre-restore inspection, SHA-256 hash verification, and an explicit administrative safety confirmation barrier (`"RESTORE-CONFIRM"`).
* **UI Location:** Dedicated `admin-backup.html` page accessible from the admin sidebar navigation.

### Explicit Non-Goals
* Automated cron cloud storage backups (this is an on-demand, local-storage offline preservation tool).
* Partial/differential merge backups (full system snapshots ensure clean relational integrity without orphaned files or keys).

---

## 3. Assumptions & Risk Analysis

| # | Item | Description | Mitigation |
|---|---|---|---|
| **A1** | **Client-Side Compression** | The browser can orchestrate compression and decompression of database JSON and PDF blobs using JSZip. | Controlled batching (e.g., 5 concurrent PDF streams) to prevent excessive browser memory consumption. |
| **A2** | **Disaster Recovery Isolation** | Restoring is a destructive action that replaces existing records. | Multi-layer validation: SHA-256 integrity check, staging inspection preview, and requiring the admin to type `"RESTORE-CONFIRM"`. |
| **A3** | **Security & RLS** | Only active administrators can perform backups or restore operations. | Enforced by client auth-guard, Supabase session validation, and database security definer functions / RLS. |

---

## 4. Decision Log

| # | Topic | Decision | Alternatives Considered | Rationale |
|---|---|---|---|---|
| **D1** | Backup Scope | All-in-One `.zip` (Database JSON + Storage PDFs + Manifest) | Database only, Storage only, Separate tarballs | Bundling ensures database records and file attachments are strictly aligned in time and structure. |
| **D2** | Restore Strategy | Full Disaster Recovery / Clean Restore | Upsert / In-place merge | Prevents orphaned foreign keys, duplicate records, or mismatched document IDs. |
| **D3** | Security & Integrity | SHA-256 Manifest + `"RESTORE-CONFIRM"` Safety Phrase | Passphrase encryption, plain zip | Guarantees tamper protection and data integrity without risking forgotten archive passwords. |
| **D4** | UI Placement | Dedicated `admin-backup.html` in Sidebar Navigation | Tab in admin reports or settings | Provides prominent visibility, live storage stats, and step-by-step progress tracking. |
| **D5** | Architecture | Client-Side JSZip Orchestration + Supabase Batching | Supabase Edge Function worker | Avoids Edge Function timeout limits (150s) and memory constraints when handling multi-megabyte research PDF archives. |

---

## 5. Architectural Specification

### 5.1 Archive File Structure
```text
REFMANSY_BACKUP_YYYY-MM-DD_HHMMSS.zip
├── manifest.json              <-- System metadata, row counts & SHA-256 hashes
├── database/
│   ├── profiles.json          <-- User accounts & roles
│   ├── categories.json        <-- Research categories
│   ├── tags.json              <-- Tags & taxonomy
│   ├── research_files.json    <-- Research metadata, review logs, file pointers
│   ├── download_records.json  <-- Download analytics logs & timestamps
│   └── feedback.json          <-- User feedback, ratings & admin replies
└── storage/
    └── research-documents/    <-- Raw PDF files preserving bucket path hierarchy
        └── <owner_id>/
            └── <file_uuid>.pdf
```

### 5.2 Manifest Specification (`manifest.json`)
```json
{
  "system": "REFMANSY",
  "version": "1.0",
  "createdAt": "2026-09-13T08:05:00.000Z",
  "createdBy": {
    "adminId": "c89b4f91-...",
    "adminName": "System Administrator",
    "adminEmail": "admin@lcnhs.edu.ph"
  },
  "tables": {
    "profiles": 15,
    "categories": 9,
    "tags": 12,
    "research_files": 48,
    "download_records": 134,
    "feedback": 22
  },
  "storageFilesCount": 48,
  "storageTotalSizeBytes": 45281920,
  "checksums": {
    "database/profiles.json": "f3b4c...",
    "database/categories.json": "8a2e1...",
    "database/tags.json": "91d4e...",
    "database/research_files.json": "a3f8c...",
    "database/download_records.json": "1290f...",
    "database/feedback.json": "c049e...",
    "storage/research-documents/...": "e7b19..."
  }
}
```

---

## 6. Execution Workflows

### 6.1 Backup (Export) Sequence
1. **Admin Trigger:** Admin clicks `[ Create & Download System Backup ]`.
2. **Snapshot Extraction:**
   * Query all rows from `profiles`, `categories`, `tags`, `research_files`, `download_records`, and `feedback`.
   * List all objects in the `research-documents` bucket from Supabase Storage.
3. **Document Streaming:**
   * Download each PDF blob in parallel batches of 5.
   * Update real-time progress indicators: `"Downloading files (24/48)..."`.
4. **Integrity Hashing:**
   * Compute SHA-256 for all database JSON strings and storage blobs via `window.crypto.subtle.digest('SHA-256', ...)`.
   * Assemble `manifest.json`.
5. **Archive Packaging:**
   * Build the `.zip` archive via `JSZip`.
   * Trigger local browser download: `REFMANSY_BACKUP_<TIMESTAMP>.zip`.

### 6.2 Restore (Disaster Recovery) Sequence
1. **File Staging & Pre-Inspection:**
   * Admin drags/drops `.zip` archive onto `admin-backup.html`.
   * Parse `manifest.json` and verify all SHA-256 checksums against archive files.
   * Render **Staging Inspection Summary**:
     * Snapshot Timestamp & Author.
     * Record Counts for all tables.
     * Document count and total file size.
     * Integrity Status: `✅ Passed (All Hashes Match)`.
2. **Safety Barrier:**
   * Display danger confirmation modal.
   * Require typing `"RESTORE-CONFIRM"`.
3. **Execution Phase (Foreign-Key Ordered):**
   * **Reverse-Dependency Purge:**
     1. Delete from `download_records`
     2. Delete from `feedback`
     3. Delete from `research_files`
     4. Delete from `tags`
     5. Delete from `categories`
     6. Delete/reconcile non-admin rows from `profiles`
   * **Primary Dependency Restoration:**
     1. Upsert/Insert `profiles`
     2. Insert `categories` & `tags`
     3. Insert `research_files`
     4. Insert `download_records` & `feedback`
   * **Storage Restoration:**
     * Clean existing storage files and upload PDF blobs into `research-documents` under matching paths.
4. **Post-Restore Verification:**
   * Verify row counts in database match `manifest.json`.
   * Display success celebration toast and reload page.

---

## 7. User Interface Specification (`admin-backup.html`)

### 7.1 Key UI Modules
1. **System Health & Storage Overview Cards:**
   * Live Database Rows counter.
   * Document Storage Volume (Count + MB).
   * Total Download Analytics records.
   * Last Backup Snapshot timestamp.
2. **Backup Generation Card:**
   * Summary checklist of included items.
   * Large action button with loading spinner & multi-stage progress meter.
3. **Disaster Recovery Restore Card:**
   * Interactive drag-and-drop dropzone.
   * Staging preview card with table-by-table row count chips and checksum badge.
   * Restore action button opening safety modal.
4. **Disaster Recovery Best Practices Section:**
   * Tips for secure offline storage (external SSD, secure school network share).
5. **Sidebar Navigation Update:**
   * Add `"Backup & Recovery"` link across all admin pages with shield/database icon.

---

## 8. Implementation Deliverables

1. `admin-backup.html` — Dedicated Backup & Disaster Recovery management dashboard.
2. `admin-backup.css` — Modern, responsive, card-based interface adhering to REFMANSY design tokens.
3. `admin-backup.js` — Client-side orchestration logic (Supabase batching, JSZip integration, SHA-256 validation).
4. `supabase-client.js` — Extended helper methods for bulk table exports/imports and storage bucket synchronization.
5. All Admin HTML templates (`admin-dashboard.html`, `research-files.html`, `pending-files.html`, `approved-files.html`, `rejected-files.html`, `categories.html`, `manage-users.html`, `feedback.html`, `admin-reports.html`) updated with the new navigation link.
