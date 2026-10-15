# Staff accounts and approvals

Both administrator and staff sign in at `/admin/login`. Staff accounts have no registration page or public creation endpoint. The administrator creates each account under **Staff**, supplying a name, unique email, and password of at least 16 characters. Share credentials privately.

Staff can view the dashboard, packages, project demos, questions, and the shared enquiry inbox, including private notes and CSV export. Staff cannot manage accounts, approve changes, or publish directly.

## Submitting and reviewing changes

Staff choose **Submit for approval** when editing packages, demos, questions, enquiry statuses, or private notes. The submission appears under **My submissions**. The public website and the approved enquiry record keep their existing values until the administrator approves the request.

The administrator opens **Approvals**, reviews the previous and proposed values, and approves or rejects the request. A review note provides feedback. Project proposals can be previewed inside the private review dialog. Approved website content publishes immediately; approved enquiry changes update the shared inbox. Rejected requests leave both unchanged.

Each request records its author, submission time, previous/proposed values, decision, reviewer, and review note. Proposals and review notes are encrypted in MySQL. Lists show bounded metadata; the detailed proposal is loaded only when opened.

If the approved record changes after a staff member starts editing, submission or approval is refused rather than overwriting the newer version. Refresh the approved content and submit a revised proposal. Requests cannot be approved twice. A disabled or removed author's pending requests must be rejected or the account re-enabled before approval.

## Managing access

Only the administrator can create accounts, edit staff names/emails, reset passwords, disable/re-enable access, or remove accounts. Account changes revoke that staff member's sessions. Re-enabling requires a fresh sign-in. Removed accounts retain their identity in review history, and their email remains reserved. Disable an account if the person may return later.

Admin password resets revoke admin sessions while preserving staff sessions. Account status, role, session identity, and credential versions are checked on the server. An account change also invalidates an in-flight mutation waiting to commit. Client-supplied roles cannot grant access.

## Existing database upgrade

From the project root, with the MySQL administrator password entered privately:

```powershell
node scripts/upgrade-staff.mjs
node scripts/upgrade-staff.mjs --check
```

This adds the staff, approval, and session ownership schema and verifies that existing admin credentials, website content, and enquiries remain unchanged. It does not create default staff accounts or alter passwords. New installations receive this schema during normal database setup.

For isolated tests, provision the temporary QA database as documented in [MySQL setup](mysql-setup.md), then run `node scripts/check-staff.mjs` after a production build. These checks use synthetic accounts and never the website database. Rebuild the public page cache and remove the temporary QA database afterward.

Implementation guidance: [OWASP authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html) and [MySQL locking reads](https://dev.mysql.com/doc/refman/8.0/en/innodb-locking-reads.html).
