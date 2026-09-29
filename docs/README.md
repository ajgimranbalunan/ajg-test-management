# AJG QA Test Management

A connected QA test-management starter built with React, Vite, Express, and SQLite. It includes seeded sample data and a persistent local API. The recommended Microsoft 365 production architecture and the integration boundaries are in [ARCHITECTURE.md](ARCHITECTURE.md).

## Run locally

1. Install Node.js 22 LTS (npm is included). Verify in a new terminal with `node --version` and `npm --version`.
2. Open this project folder in VS Code and run `npm install` in its terminal.
3. Run `npm run dev`.
4. Open the Vite URL printed by the command, normally `http://localhost:5173`. The API listens on `http://localhost:4000`.

The environment used to create this project does not currently have Node.js/npm installed, so the install, build, and runtime checks still need to be run after installing Node.js.

## Database setup

No separate database server or account is needed for local use. On first API start, `server/database.js` creates the `data/` folder, initializes the relational schema, and inserts demonstration records into `data/qa-management.sqlite`. The database remains on disk between restarts.

The sample workspace has two projects, three plans, five suites, 15 cases with steps, five requirements, three runs with case/step snapshots and execution results, and five linked defects. Stable IDs use prefixes such as `PROJ-001`, `TC-001`, `RUN-001`, and `BUG-001`.

- Inspect or edit the file with DB Browser for SQLite, or another SQLite client. Stop the API before making manual schema changes.
- Back up the SQLite file while the API is stopped. The `data/` folder is excluded from Git.
- `npm run db:reset` **deletes all local records** and recreates the sample database. Do not run it if you need to keep your data.
- Attachments in this local starter are stored as small data URLs in execution-step rows and capped at 4 MB. For shared production use, store files in a SharePoint document library and retain links/metadata in the database.

## Included workflows

Project-scoped dashboard, plans, nested suites, case/step creation, custom case views, requirements, run creation with immutable snapshots, step-by-step execution, outcome roll-up, evidence attachment, Jira ticket and comment capture on failed executions, searchable/filterable lists, and CSV exports. The role selector changes the displayed role context only; it does not authenticate users or enforce permissions. Audit records are captured for API create/update operations.

## MCP continuous-learning setup

`.vscode/mcp.json` configures the `@modelcontextprotocol/server-memory` MCP server, with its knowledge graph saved to `.mcp/project-memory.json` in this workspace. In VS Code, install Node.js first, open the project, then start the `project-memory` server from the MCP server controls. The server persists only information explicitly written to its memory tools; `.github/copilot-instructions.md` tells coding sessions to retrieve and update durable project learnings. Keep credentials and sensitive company/customer information out of memory.

## Production direction

SQLite is a local/small-team evaluation database, not a multi-user enterprise deployment. For production, follow [ARCHITECTURE.md](ARCHITECTURE.md): use Entra ID for identity, SharePoint Lists or Dataverse for shared structured data, a SharePoint document library for evidence, Power Automate for workflows, and Power BI for governed analytics. Jira API access and CI result ingestion need separately secured integrations and tenant configuration.
