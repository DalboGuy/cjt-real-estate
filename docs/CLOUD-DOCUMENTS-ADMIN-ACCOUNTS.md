# CJT Cloud Documents, Admin Portal, and Accounts Notes

Status: **Architecture notes recorded during Platform v1 reorganization**

These notes preserve the product direction agreed during the Owner Portal redesign. They are planning requirements, not a claim that all features are implemented yet.

## Cloud-first document principle

The CJT platform should make documents easy to find and use without turning the application database or Vercel deployment into the primary file store.

Preferred model:

1. The authoritative document remains in a connected cloud storage provider.
2. The CJT portal stores lightweight metadata, relationships, tags, status and the cloud object/link identifier.
3. The same cloud document can appear in multiple business contexts without duplicating the underlying file.
4. Manual upload remains available as an exception, but hands-off intake is the preferred workflow.

Potential cloud providers include Google Drive, Dropbox and OneDrive/SharePoint. Provider selection can remain configurable while the indexing model stays provider-neutral.

## Hands-off document intake

Priority intake methods:

### Email attachments

Gmail automation should identify useful attachments such as:

- vendor invoices
- receipts
- booking/OTA statements
- signed rental agreements
- insurance documents
- warranties
- maintenance/service records
- tax/compliance documents

The automation should:

1. detect the incoming document;
2. classify its document type;
3. resolve the related property/reservation/vendor/financial period when confidence is sufficient;
4. save or confirm the authoritative file in the configured cloud location;
5. create/update the CJT document index record;
6. surface the document in the appropriate Owner Portal modules.

### System-generated documents

When CJT generates owner statements, exports, reports or other durable documents, the system should be able to save a copy to the configured cloud location automatically and index it in the portal.

### Signed agreements

Signed booking/rental documents should be linked automatically to the reservation whenever the signing source exposes enough metadata to make that association safely.

### Connected cloud folders

The architecture should allow selected cloud folders to be watched/indexed so documents placed there outside the portal can still become searchable in CJT.

### Manual upload

Manual upload/linking should exist as a fallback for exceptions but should not become the routine operating method.

## Document categories

Initial categories:

- Reservations
- Financial
- Property
- Maintenance
- Vendors
- Taxes & Compliance
- Operations
- Marketing
- System-generated reports

A document should be linkable to one or more business records such as property, reservation, guest, vendor, maintenance task or financial record.

## Suggested document index fields

Future document metadata may include:

- document id
- property id
- category / document type
- title / filename
- cloud provider
- cloud object id
- cloud URL
- source type (email, generated, cloud sync, manual)
- source message id when applicable
- reservation id
- vendor id
- financial period/reference
- received/generated date
- tags
- status
- sensitivity/access classification
- created/updated timestamps

Do not store large normal document payloads directly in Neon unless a specific future requirement justifies it.

## Admin Portal direction

The Admin Portal manages the platform itself, separate from normal Owner Operations.

Target areas:

- Admin Dashboard
- Users & Access
- Roles & Permissions
- Properties
- Integrations
- Documents & Cloud Automation
- Notifications
- Audit Log
- Sessions
- System & Data

The current preview uses the existing Owner Portal passcode only as a temporary development bridge. Production Admin access must require named accounts and administrator authorization.

## Accounts and authentication direction

Replace the shared Owner Portal passcode with individual accounts.

Initial roles:

- Administrator
- Owner
- Property Manager
- Co-host
- Accounting
- Read Only

Account surfaces should include:

- login
- accept invitation
- forgot password
- reset password
- profile
- security/password
- active sessions
- notification preferences
- role and property access summary

Admins should invite users; admins should never need to know or set another user's permanent password.

## Permission model

Access should be driven by both role and assigned property scope.

Examples:

- Administrators: platform-wide control.
- Owners: assigned property operations plus financial/document access.
- Property Managers: assigned property reservations, communications, calendar, pricing and operations.
- Co-hosts: communications/reservations/calendar as configured.
- Accounting: financials, payouts and related documents.
- Read Only: view-only access to assigned areas.

Document access must respect the same permission model, especially for financial, guest and sensitive property records.

## Audit direction

Important actions should be attributable to a named user, including:

- login/logout/session revocation
- invitations and role changes
- reservation lifecycle changes
- pricing changes
- document filing/linking/access events where appropriate
- integration changes
- system/admin configuration changes

## Preview routes created to preserve the idea

During Platform v1 development, planning previews are available at:

- `/owner-v1/documents` — cloud-first Documents planning module
- `/admin-v1` — Admin Portal planning shell
- `/account-v1` — Account Center planning shell

These preview pages intentionally record the direction before the underlying authentication, cloud document indexing and automation systems are implemented.

## Build-order note

Before expanding many additional modules, prioritize:

1. shared Owner/Admin shell conventions;
2. named account/authentication foundation;
3. role/property authorization;
4. Admin users/access surface;
5. cloud document index model;
6. Gmail/cloud document automation;
7. then deeper Calendar, Pricing, Financials, Maintenance and Analytics functionality.
