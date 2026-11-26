# PROOFLYN State

- **Current Phase**: M4 (REST API, Auth, Secure Upload, Layered Extraction, Human Verification, Integration Tests)
- **Active Branch**: `overnight/prooflyn`
- **Last Verified Command**: `npm run typecheck`, `npm run lint`, `npm test` (18/18 passed), `npm run mcp:smoke` (PASSED)
- **Next Action**: Implement `src/server/auth.ts`, `src/server/rate-limit.ts`, `src/server/upload.ts`, `src/server/extraction.ts`, `src/server/api-helpers.ts`, all `/api/v1/...` route handlers under `src/app/api/v1/`, and M4 integration tests.
