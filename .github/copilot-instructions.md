# Project Guidance

- Read `ARCHITECTURE.md` and `README.md` before changing architecture, persistence, or integration behavior.
- This is a React/Vite frontend with an Express API and SQLite persistence. Keep the app usable without Microsoft tenant credentials.
- Prefer extending the existing normalized SQLite entities and API. Preserve prefixed IDs, foreign-key relationships, audit history, and immutable test-run snapshots.
- At the start of a substantial task, use the `project-memory` MCP server's `search_nodes` tool to retrieve relevant project learnings. After validating a durable discovery or architecture decision, add it with `create_entities` or `add_observations` so future sessions can reuse it.
- Do not store credentials, personal data, customer data, or confidential company information in MCP memory.
- The demo role selector is not authentication. Never describe UI-only role selection as authorization or production security.
- Run focused checks after edits. The app's normal commands are `npm run dev`, `npm run build`, and `npm run db:reset` (the last command deletes and recreates local sample data).
