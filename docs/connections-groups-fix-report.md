# Connections and group-chat fixes

Implemented and verified locally on 2026-09-14. Not deployed. The configured deployment database was queried read-only; its schema, users, connections, groups, memberships, and messages were not changed.

## Root causes and fixes

1. **Cancellation:** the connection API only allowed the recipient to accept/decline. Sent requests had a status label without an action. `DELETE /connections/:id` now checks the active sender and pending state in the existing Serializable transaction, removes the pending request and its notification, and refreshes both users. An accepted connection cannot be cancelled. The pair becomes available for a later request.
2. **Group creation from connections:** the only creation endpoint/UI was tied to an idea and required resonance. Accepted connections alone had no general group-creation flow. Messages now offers a named, multi-select group form backed by a paginated eligible-connection endpoint and `POST /messages/groups`. It respects the existing group-key database constraint and existing verification, profile, invitation, visibility, and blocking rules.
3. **Administration:** conversations/memberships had no ownership/role field; the group modal only offered safety controls and leaving. Added a single nullable `Conversation.ownerId` foreign key, creator-only backend add/remove operations, and corresponding UI. No role-edit endpoint exists. Membership remains the existing composite-key model; removal sets `leftAt`, retaining messages. The creator cannot remove themselves or voluntarily leave.
4. **Duplicate idea groups:** the old unique key hashed the idea plus the selected member list. Changing the selection changed group identity. The canonical key is now `idea:<ideaId>`, protected by the existing unique group-key index. The existing Serializable transaction and unique/conflict retries make concurrent creation idempotent. Later eligible resonators join that group; repeated requests do not duplicate membership or initial context messages.

The author still chooses when to create the initial idea group. Resonance automatically joins an **already-created** group, subject to eligibility and the existing 20-person limit. It never silently reinstates someone who left, was removed, or was removed by safety/moderation. The creator can explicitly re-add an eligible former member. Existing view/send authorization and Socket.IO delivery continue through the original policy/message services.

Safety/moderation can still force the creator out. Their ownership identity is retained, and ordinary members cannot take it over. Such a group cannot automatically admit new resonators or be administered by a nonmember creator; recovery requires an explicit future ownership/reinstatement decision. No automatic ownership transfer was added.

## Database migration and existing data

Migration: `Backend/prisma/migrations/20260914120000_group_ownership/migration.sql`.

- Adds `Conversation.ownerId` referencing `User`, without creating another group/member model.
- Backfills idea-group owners from the idea author; for deleted ideas, uses the initial system-message sender when available.
- Assigns the oldest group for each idea the canonical idea-only key, using creation time and ID as a deterministic tie-breaker.
- Preserves all groups, memberships, message history, names, and timestamps. Later duplicate groups retain their prior keys and access.
- Reuses `ideaId`, the unique `groupKey`, and the composite membership primary key. A global unique constraint on `ideaId` would conflict with the requirement to preserve existing duplicates; no such constraint is added.

Read-only audit of the configured database found **2 groups for 1 idea: 1 duplicate idea and 1 excess group**. Both groups have their original idea author as an active member.

| Idea | Group | Members | Messages | Migration result |
| --- | --- | ---: | ---: | --- |
| `cmtzwimbe000vds2du2s98muv` | `cmu04u0ju004jil1vfnlhbl2x` | 3 | 2 | Oldest; becomes canonical |
| same idea | `cmu06m6p60061il1voj6z8jef` | 2 | 1 | Preserved legacy duplicate |

No groups were merged/deleted, and no members were moved. Keep the second group for its history. After deployment, the creator can explicitly add any missing eligible people to the canonical group. Merging or deleting the legacy group remains a separate decision requiring approval. New ideas should have exactly one group; this existing idea will deliberately retain two historical groups while only one receives automatic new joins.

## Changed files

Application and schema:

- `Backend/prisma/schema.prisma`
- `Backend/prisma/migrations/20260914120000_group_ownership/migration.sql`
- `Backend/src/services/groups.ts`
- `Backend/src/routes/connections.routes.ts`
- `Backend/src/routes/ideas.routes.ts`
- `Backend/src/routes/messages.routes.ts`
- `Frontend/src/types.ts`
- `Frontend/src/components/GroupEditor.tsx`
- `Frontend/src/components/Resonators.tsx`
- `Frontend/src/pages/Connections.tsx`
- `Frontend/src/pages/Messages.tsx`

Verification and report:

- `Backend/tests/community.test.ts`
- `Backend/scripts/audit-idea-groups.ts`
- `Backend/scripts/group-test-db.mjs`
- `Backend/scripts/run-group-check.mjs`
- `Backend/scripts/group-migration-check.mjs`
- `Backend/scripts/groups-browser-qa.mjs`
- `docs/connections-groups-fix-report.md`

No dependency, authentication, Prisma-provider, Supabase-provider, Socket.IO, profile, deployment-configuration, or `.env` changes.

## Verification results

| Check | Result |
| --- | --- |
| Frontend and backend typecheck | Passed |
| Frontend and backend lint | Passed |
| Frontend tests | 10/10 passed |
| Backend tests | 39/39 passed on isolated local PostgreSQL |
| Frontend production build | Passed |
| Backend Prisma generation and production build | Passed |
| Migration applied to fresh local database | Passed |
| Migration against temporary duplicate-group/deleted-idea fixtures | Passed; rolled back all temporary fixtures |
| Browser flow in installed Edge through Playwright | Passed; no page errors |
| Desktop and 390px mobile visual inspection | Passed after fixing member-action wrapping |

New backend regressions cover cancellation authorization/re-request/accepted protection, cancel-vs-accept concurrency, accepted-connection group creation, admin authorization and permission-injection rejection, member removal/access revocation, duplicate membership, changed idea selections, concurrent initial group creation, concurrent later resonance, retained history, privacy/blocked pairs, and no automatic re-entry after leave/removal.

Browser verification used four local temporary users and actual React, Express, PostgreSQL, and Socket.IO paths. It verified pending requests disappearing live for both users, re-request/acceptance, multi-select creation, selected users receiving messages, creator add/remove, normal-member controls, removal refreshing the removed user's view, and B/C/D joining the same idea history. Initial fixture requests/connections and idea creation used authenticated API calls; cancellation, acceptance, group creation, member management, messaging, and resonance were exercised through UI controls. This was automated browser verification with screenshot inspection, not manual testing of the deployed site.

An initial backend build encountered a Windows Prisma DLL lock while tests were running; it passed after the tests finished. The first new general-group test identified the existing non-null group-key constraint; the implementation was corrected and the full suite passed.

Screenshots: `work/qa/groups/create-group.png`, `creator-members.png`, `creator-members-mobile.png`, `persistent-idea.png`.

### Reproduce isolated checks

From the repository root, start `node Backend/scripts/group-test-db.mjs` in a separate terminal. The helper uses only a dedicated local database on port 55439. Then run:

```powershell
node Backend/scripts/run-group-check.mjs Backend/node_modules/prisma/build/index.js migrate deploy --schema Backend/prisma/schema.prisma
node Backend/scripts/run-group-check.mjs --import tsx --test --test-concurrency=1 Backend/tests/*.test.ts
node Backend/scripts/run-group-check.mjs Backend/scripts/group-migration-check.mjs
node Backend/scripts/run-group-check.mjs --import tsx Backend/scripts/groups-browser-qa.mjs
npm --prefix Frontend test
npm run typecheck
npm run lint
npm run build
```

Run the build after tests finish because Windows can lock Prisma's loaded native DLL. `run-group-check.mjs` overrides deployment database, storage, and email settings for its child process. No demo/database seeding is needed. Browser QA starts and closes its own API and frontend on ports 55440/55441 and cleans up its users. Stop the local database helper when finished.

## Deployment and production acceptance

1. Review/apply the migration using the existing deployment workflow (`npm --prefix Backend run db:migrate` with deployment configuration). Briefly pause group creation/resonance writes during the migration/backend rollout so an old backend cannot continue writing membership-based keys. Deploy the updated backend and frontend together. The new backend requires the migration.
2. Run `node --import tsx Backend/scripts/audit-idea-groups.ts` read-only to confirm the two historical groups remain. Check their messages and creator controls; do not expect this migration to remove the historical duplicate.
3. With controlled production accounts, repeat A requests B → B sees pending → A cancels → B loses pending without reload → A requests again. Verify the accepted connection cannot be cancelled.
4. Create a named group with multiple accepted connections; confirm every selected member sees it and receives messages. Verify pending/nonconnections/private or blocked users cannot be added through a forged API request.
5. As creator, add/remove a member; verify immediate message/access revocation and absence of duplicates. As normal member, confirm direct add/remove API calls fail. Confirm creator self-removal/leave fail.
6. Use a **new test idea**: B resonates, author creates its group, C and D resonate later. Verify the same conversation ID and retained messages, one group, and one membership per user. Repeat with two concurrent resonators/group requests. Verify leaving/removal is not undone by another resonance.
7. Verify Socket.IO refresh/delivery through the deployed proxy and across separate browser sessions. Production HTTPS/proxy behavior was not exercised by the local checks.

The Sites manifest in this repository has no registered project; no new hosting target was created. Existing deployed infrastructure is preserved.
