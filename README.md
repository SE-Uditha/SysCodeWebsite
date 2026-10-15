# SysCode Software Solutions

Responsive Next.js website with a private admin dashboard backed by **MySQL Server 8+**. Use **Node.js 22.13 or newer**. MySQL Workbench is the desktop tool for viewing and managing the database; the website connects directly to MySQL Server.

## Development and first setup

```sh
npm install
node scripts/setup-mysql.mjs
node scripts/setup-admin.mjs --email you@example.com
npm run dev
```

Stop the website before database setup. Enter the MySQL administrator password privately when prompted. Setup creates the `syscode` database and a randomly named, limited website account, imports existing JSON content, enquiries, and administrator credentials when present, and activates the connection only after verification. Existing JSON files remain intact as a migration backup. If an administrator was imported, the second command is needed only to change that login.

Admin password input is hidden and requires at least 16 characters. Open **http://localhost:3000/admin/login** after starting or restarting the website. There are no default website credentials. Database connection settings and encryption/session keys live in ignored, permission-restricted `.env.local`; the website administrator email and scrypt password hash live in MySQL. Never share that file or place passwords in command arguments.

For setup details, MySQL Workbench, backups, and deployment, see [docs/mysql-setup.md](docs/mysql-setup.md). On Windows, use `npm.cmd` if PowerShell blocks `npm.ps1`.

## Website and dashboard

Public pages live under `app/(site)` without changing their URLs. The responsive design uses Inter, Space Grotesk, pure white surfaces, and brand orange. The dashboard manages:

- Enquiries and quote requests: search, status filters, private notes, CSV export.
- Packages: names, prices, descriptions, audiences, features, button labels, and popular selection.
- Project demos: descriptions, categories, technologies, live website previews, optional screenshot URLs, and ordering.
- Questions and answers: create, edit, reorder, and remove FAQs.
- Staff accounts: administrator-created logins, access controls, and password resets; no public registration.
- Approvals: every staff content or enquiry edit waits for an administrator decision before it takes effect.

Administrator edits publish when you choose **Save changes**. Staff choose **Submit for approval**; packages, demos, questions, enquiry statuses, and private notes remain unchanged until approval. **Approvals** shows previous/proposed values and feedback; staff track their own requests under **My submissions**. Stable package identities preserve quote selections after price or name edits. Private enquiry data never enters the public content cache. See [staff accounts and approvals](docs/staff-approvals.md).

A **Live demo URL** shows a scaled website preview on the homepage and portfolio. Use **Check project preview** before saving. If a website blocks embedding or needs features restricted by the preview sandbox, set **Preview screenshot URL** to a direct image URL or local `/images/` path. The screenshot takes priority; invalid images fall back to the live preview. Previews load directly in the browser near the viewport, without a server-side URL fetch or third-party screenshot service.

## Data and hosting

MySQL stores the administrator account, packages, projects, FAQs, encrypted enquiries, hashed session records, and persistent sign-in limits. Enquiry payloads use authenticated AES-256-GCM encryption with `ADMIN_STORAGE_KEY`, kept separately in server configuration. Passwords use salted scrypt hashes; raw passwords and session tokens are not stored in the database.

Runtime SQL uses prepared values, InnoDB transactions, and row locks. The generated website database account has only `SELECT`, `INSERT`, `UPDATE`, and `DELETE` access to its own schema. It cannot create or drop databases or users. Database errors and incomplete migrations fail closed; runtime requests never fall back to legacy JSON files. With no MySQL configuration, public pages can show default content, but enquiries and admin access require database setup.

Host the Node application behind HTTPS and use a persistent MySQL service. Remote MySQL connections require verified TLS. Keep secure database backups and an independent backup of `ADMIN_STORAGE_KEY`; losing the key makes encrypted enquiries unreadable. Multi-instance web deployments also need shared Next.js cache invalidation so published edits reach every instance.

```sh
npm run build
npm start
```

Enquiries are saved before optional email notification. Configure `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`, and `CONTACT_EMAIL` for notifications. Sign-in protections include signed expiring HttpOnly sessions, Secure cookies in production, revocation, same-origin mutation checks, persistent throttling, bounded request bodies, and anti-framing headers. They do not provide multi-factor authentication. Cryptographic choices follow [OWASP storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Cryptographic_Storage_Cheat_Sheet.html) and [password-storage guidance](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html).

## Validation

```powershell
npm.cmd run lint
npm.cmd run build
node scripts/provision-mysql-qa.mjs
$env:MYSQL_QA_CONFIG_FILE = "$PWD/.admin-test-data/mysql-qa/config.json"
node scripts/test-mysql-storage.mjs
node scripts/check-admin.mjs
node scripts/check-staff.mjs
node scripts/provision-mysql-qa.mjs --cleanup
npm.cmd run build
```

Test provisioning is separate from website migration and prompts privately for the MySQL administrator password. Both database checks require a dedicated local `syscode_qa_*` schema and limited `syscode_qa_*` account. They reset only that isolated fixture; never substitute the website database. Cleanup checks the test-only schema marker before removing the temporary database/account and private configuration. The final build restores the website's published page cache after isolated browser tests. The storage check covers encryption, tampering, concurrent processes, sessions, and persistent throttling. The admin check starts its own production server on port 3110, disables SMTP, and uses an isolated headless Edge profile. Set `ADMIN_BROWSER` to another Chromium executable if needed.

Additional browser checks are documented in [docs/scroll-collection.md](docs/scroll-collection.md). Image provenance is in [docs/theme-imagery.md](docs/theme-imagery.md).
