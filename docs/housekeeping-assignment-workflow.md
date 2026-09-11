# Production housekeeping assignment workflow

## Previous gap

The Housekeeping view could render an `assignedTo` name, but production had no authoritative employee selector or assign/reassign mutation. `housekeeping_tasks.assigned_to` was only a text snapshot. Production checkout dirtied the room without creating an actionable cleaning task.

## Dirty room lifecycle and task creation

Both Front Desk checkout and financial checkout now set the room to `VACANT_DIRTY` and insert one `CHECKOUT_CLEANING` task in the same PostgreSQL transaction. The task starts `UNASSIGNED`, has high priority, identifies the room and reservation, and is protected by a reservation/task-type unique index. Checkout state/version guards and `ON CONFLICT DO NOTHING` prevent duplicate active cleaning work on retries.

Existing inspection handling remains intact. A cleared checkout inspection also creates the same unassigned cleaning task, while room-out-of-order damage policy continues to suppress cleaning and create maintenance work.

## Eligible assignees

The `/api/operations` response includes a minimal `housekeepingStaff` directory only for actors with `housekeeping.assign`. Each entry contains ID, display name and role. The database query permits only active `HOUSEKEEPING` users in the authenticated organisation whose assigned property is the current property. Free-text names and manually entered IDs are not used.

## Assignment and reassignment

`POST /api/operations` accepts:

```json
{
  "action": "ASSIGN_HOUSEKEEPING_TASK",
  "taskId": "task-id",
  "assigneeId": "user-id",
  "expectedVersion": 1,
  "surface": "PROPERTY"
}
```

The same mutation handles initial assignment and reassignment. It stores `assigned_user_id`, updates the compatible `assigned_to` display snapshot, changes `UNASSIGNED` to `ASSIGNED`, and increments the task version. The UI submits and then refreshes authoritative production state.

## Authorization and property scoping

The shared `housekeeping.assign` permission belongs to Owner, Manager and Reception. Housekeeping, Accounts, Restaurant and reporting roles cannot assign. The backend derives actor, organisation and property from the authenticated session; it scopes the task to the selected accessible property and validates the assignee's organisation, property, role and active status. Completed/cancelled tasks and stale versions return structured conflicts.

## Housekeeping employee queue

Management receives the full current-property housekeeping queue. A `HOUSEKEEPING` user receives only tasks whose `assigned_user_id` equals the authenticated user ID. Outcome and inspection mutations repeat this ownership check, so frontend filtering cannot be bypassed by sending another task ID.

## Cleaning completion and room state

Existing `DONE`, `GUEST_REFUSED`, `COME_LATER`, checkout inspection, damage report and damage review behavior remains in the operations service. Completing a checkout-cleaning task with `DONE` marks the task completed and moves the room from `VACANT_DIRTY` to the project's ready state, `CLEAN`.

## Offline limitation

`ASSIGN_HOUSEKEEPING_TASK` is intentionally absent from the Step 7 offline allowlist. When offline the shared Hotel command boundary reports `Requires an online connection.` Existing offline housekeeping outcomes, walk-in sync, offline billing and Device Status behavior are unchanged.

## Audit

Initial assignment emits `HOUSEKEEPING_TASK_ASSIGNED`; reassignment emits `HOUSEKEEPING_TASK_REASSIGNED`. Audit metadata includes task, property, room number, previous/new assignee identity snapshot, actor and timestamp. Authentication secrets and unrelated employee data are not recorded.

## Database migration

Migration `0008_housekeeping_assignment.sql` adds nullable `assigned_user_id` with an `app_users` foreign key using `ON DELETE SET NULL`, an assignee queue index and a unique checkout-cleaning index. Existing rows and `assigned_to` values remain valid. Migrations 0000–0007 were not changed.

## UI behavior

Every active task displays either `Unassigned` or `Assigned to <name>`. Authorized online users see `Assign housekeeper` or `Reassign housekeeper`. The existing modal styling provides the authoritative staff dropdown, loading data as part of the operations snapshot, and handles empty staff, submission, refresh and API error states.

## Validation

Automated coverage verifies permission roles, assignee eligibility, terminal/stale task rejection, selector/labels/command payload, successful refresh, API error behavior, route integration, queue scoping, checkout task generation, completion transition, migration shape and existing regression suites. Frontend passed 5 files/54 tests, backend passed 17 files/237 tests, and shared passed 1 file/13 tests. All typechecks, lint with zero errors, and both production builds passed. A local PostgreSQL smoke verified directory lookup, assignment, reassignment, invalid assignee rejection, worker queue isolation, version increments, both audit events and `VACANT_DIRTY -> CLEAN`.

## Remaining limitations

Each application user currently has one nullable `property_id`, so staff eligibility follows that existing single-property access model. Assignment remains online-only. Unassignment is not included because the requested workflow covers assign and reassign.
