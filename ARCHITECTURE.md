# QA Test Management System Architecture

## Implementation boundary

This workspace implementation is a runnable local reference application: React (Vite) UI, a Node/Express REST API, and SQLite persistence. It is intentionally self-contained for evaluation and small-team use. SQLite is a single-file database and is not the recommended shared production store for concurrent enterprise users. The Microsoft 365 target architecture below is the production recommendation; connecting it requires a Microsoft tenant, SharePoint site, Entra app registration, and Power Platform/Power BI licensing and configuration.

## Recommended Microsoft 365 production architecture

| Concern | Recommended service | Responsibility and limitation |
| --- | --- | --- |
| Identity and authorization | Microsoft Entra ID + Power Apps roles / SharePoint groups | Sign-in uses organizational identity. Enforce access at the data source as well as hiding UI actions. |
| Relational operational data | SharePoint Lists / Microsoft Lists | Practical low-code store for projects, plans, requirements, suites, cases, runs, executions, and defects. Use lookup columns sparingly; index project, status, and foreign-key columns and plan around list view thresholds. |
| App interface | Power Apps Canvas app | Best fit for deeply integrated M365 forms and delegated access. A custom React app can instead call Microsoft Graph/SharePoint APIs, but needs Entra OAuth, permission consent, token handling, and tenant configuration. |
| Workflow | Power Automate | Assignment and failure notifications, deadline reminders, approvals, and Teams/email messages. Flow retries and duplicate delivery must be handled. |
| Analytics | Power BI | Reports over SharePoint/Dataverse data with refresh and row-level security configured. Do not treat the local demo's summary endpoints as enterprise analytics. |
| Evidence | SharePoint document library | Store files and metadata separately; link evidence to execution steps/defects rather than storing file bytes in list rows. |
| External issue tracking | Jira REST API via Power Automate custom connector or secured integration service | URL/key linking works without API access. Creating/syncing Jira issues requires credentials, field mapping, and an approved connector; never put Jira secrets in a browser app. |
| Automation ingestion | Authenticated API endpoint or Azure Function / Power Automate HTTP trigger | CI systems (GitHub Actions, Azure DevOps, Jenkins, GitLab) send run results and external execution URLs. Validate service identity, project access, payload schema, and idempotency. |

The React/Express/SQLite implementation in this repository does not claim to provide M365 sign-in, SharePoint synchronization, Power Automate flows, Power BI publishing, Jira API access, or CI result ingestion. These require tenant/credentialed integrations. The data boundaries and external-reference fields are designed to accommodate them later.

## Data model and relationships

All records use stable prefixed IDs (for example `PROJ-001`, `PLAN-001`, `TC-001`). The local SQLite schema is the executable source for the reference app.

- `projects` 1-to-many `test_plans`, `requirements`, `test_cases`, `test_runs`, and `defects`.
- `test_plans` 1-to-many `test_suites`, `test_cases`, `test_runs`, and `plan_milestones`.
- `test_suites` are self-referencing by `parent_suite_id`; a suite has many `test_cases` and can contain child suites.
- `test_cases` belong to a project and optionally a plan, suite, and requirement; they have many `test_case_steps` and many `requirement_test_cases` links.
- `requirements` belong to a project and link many-to-many to cases through `requirement_test_cases`.
- `test_runs` belong to a project and optionally a plan/suite; `test_run_cases` stores the selected case and an immutable JSON snapshot at run creation.
- `test_executions` link a run to a case snapshot; `test_execution_steps` store step result, actual result, comment, and evidence reference.
- `defects` link to project, case, run, execution, requirement, and failed step where available; external Jira URL/key are optional.
- `audit_logs` capture record type, ID, action, actor, timestamp, and changed fields. `users` represent role/assignment references in this local reference app.

Production evidence files should live in a SharePoint document library, with attachment metadata and links in the data store. Tagging can be normalized to `tags` plus a many-to-many case/tag link table when advanced tag administration is needed.

## Screens and navigation

Dashboard; Projects; Test Plans; Test Suites; Test Cases; Test Runs; Test Execution; Defects / Issues; Requirements; Reports & Analytics; Team; Settings. Project selection scopes all project-specific views. Test execution is optimized for a focused run/case/step workflow; failed execution offers a prefilled defect flow. Reports are filterable by project/plan/run/tester/environment/date and exportable in the production Power BI or Excel implementation.

## Roles and permissions

- QA Administrator: full project/data/user/settings administration.
- Test Lead: plans, suites, cases, assignments, runs, defect triage, reports.
- QA Engineer: assigned case execution, step results, comments/evidence, defect creation.
- Developer: assigned defect updates/comments and related failure/evidence review.
- Viewer / Manager: read-only dashboards, plans, results, defects, and reports.

The local reference app provides role-aware UI affordances for demonstration, not a security boundary. Production permissions must be enforced by Entra, SharePoint/Dataverse permissions, and API authorization; a hidden button is not authorization.

## Power Apps and Power Automate components

Recommended Canvas app components: project switcher; reusable entity list/search/filter; plan editor with milestone timeline; suite tree; case/step editor and history; run builder and snapshot service; execution workbench with step results and evidence links; defect form; traceability matrix; responsive dashboards. Flows: assignment notification, failed-test/critical-defect notification, defect assignment/status updates, plan/milestone reminders, and scheduled report distribution. Use Teams and email actions with retry/idempotency controls.

## Power BI reporting

Model project, plan, suite, requirement, case, run, execution, defect, user, and date dimensions around operational facts. Derive pass/fail rates, execution progress, requirement coverage, automation coverage, defect density, closure rate, and release quality from explicit denominator definitions. Filter by project, plan, suite, run, release, tester, environment, and date. Treat tester activity as workload/flow visibility, not an employee ranking. Configure refresh and row-level security before publishing.

## Jira and automation integration

Start with external URL/key capture and clickable links. A future secured integration service can create/update Jira issues after administrator configuration and map Jira status/severity without exposing credentials to React. Automation adapters should normalize framework output to a versioned payload containing project/run/case IDs, result, timestamps, step details, evidence URLs, and an idempotency key. Keep external runner execution separate from this application's manual execution engine.

## Native capability boundaries

Lists, Entra identity, Teams/email, Power Automate, Power Apps, and Power BI are native M365 building blocks. Hierarchical suite editing, immutable run snapshots, detailed step-level execution, version comparison, safe bulk operations, large-scale traceability, and reliable CI/Jira synchronization require custom app logic, careful SharePoint schema design, premium/licensed connectors, or an external service. Validate list thresholds, API throttling, attachment limits, licensing, data residency, and tenant security before production rollout.
