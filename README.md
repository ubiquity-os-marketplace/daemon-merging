# `@ubiquity-os/daemon-merging`

Automatically merge pull-requests based on the reviewer count, the time elapsed since the last activity, depending
on the association of the pull-request author.

## Configuration example

```yml
- plugin: ubiquity-os-marketplace/daemon-merging
  with:
    approvalsRequired:
      collaborator: 1 # defaults to 1
      contributor: 2 # defaults to 2
    mergeTimeout:
      collaborator: "3.5 days" # defaults to 3.5 days
      contributor: "7 days" # defaults to 7 days
    excludedRepos: ["owner/repo", "another-org/specific-repo"]
    allowedReviewerRoles: ["COLLABORATOR", "MEMBER", "OWNER"]
```

## Testing

```shell
bun run test
```

## Technical Architecture

### System Components

#### GitHub Action Integration

- Built on TypeScript with strict type checking
- Integrates with GitHub's Actions runtime environment
- Processes webhooks for 'push' and 'issue_comment.created' events
- Manages PR lifecycle through GitHub's REST API

#### Plugin System

The core logic is implemented as a plugin system that:

- Evaluates PRs against configurable rules
- Manages approval workflows
- Handles state transitions
- Processes merge operations

#### Event Processing

- **GitHub Events Handler**: Processes incoming webhooks for:
  - Push events (for base branch updates)
  - Issue comment events (for approval tracking)
- **Summary Generator**: Creates visual PR status reports with:
  - Merge status indicators (🔵 merged, ⚫️ unmerged)
  - Repository monitoring status
  - Configuration overview

### Configuration System

#### Approval Requirements

Configurable thresholds based on contributor status:

```typescript
approvalsRequired: {
  collaborator: number; // Default: 1
  contributor: number; // Default: 2
}
```

#### Merge Timeouts

Customizable waiting periods:

```typescript
mergeTimeout: {
  collaborator: string; // Default: "3.5 days"
  contributor: string; // Default: "7 days"
}
```

#### Repository Exclusion

Repositories to exclude from monitoring:

```typescript
excludedRepos: string[]; // Repositories in "owner/repo" format to exclude
```

#### Reviewer Roles

Role-based access control:

```typescript
allowedReviewerRoles: string[]; // Default: ["COLLABORATOR", "MEMBER", "OWNER"]
```

### Type System

The project uses a comprehensive type system built on TypeScript:

- **Context Types**: Extends `@ubiquity-os/plugin-sdk` base context
- **Environment Configuration**: Validated through TypeBox schemas
- **Plugin Settings**: Strictly typed configuration options
- **Event Types**: Typed webhook event handling

### Runtime Environment

#### Development

- Bun for testing and development
- TypeScript with strict mode
- Jest for testing framework

#### Production

- Runs in GitHub Actions environment
- Node.js compatibility mode
- TypeBox for runtime type validation

### Data Flow

1. **Event Reception**

   - GitHub webhook triggers Action
   - Event type and payload validated

2. **Configuration Loading**

   - Settings loaded from yml config
   - Environment variables processed
   - Type validation performed

3. **PR Evaluation**

   - Find PRs linked to the specific issue from the payload
   - Author association checked
   - Review counts tallied
   - Time thresholds evaluated

4. **Merge Processing**

   - Conditions verified
   - Merge operation executed
   - Status updated

5. **Reporting**
   - Summary generated
   - Status posted to PR
   - Monitoring updates logged

This architecture ensures reliable, type-safe automated PR management with configurable rules and comprehensive status reporting.

## Scheduled Auto-Merge (cron)

- Purpose: Automatically merges the repository’s default branch (usually `development`) into `main` when the default branch has been inactive (no non-bot commits) for a configurable number of days.
- Schedule: Runs weekly on Mondays at 06:00 UTC via GitHub Actions, and can also be triggered manually (`workflow_dispatch`). See `.github/workflows/auto-merge-development.yml`.
- Scope: Processes all repositories across configured organizations.
- Behavior:
  - Skips active branches; only merges if inactivity threshold is met (default 90 days).
  - If `main` does not exist, creates it from the default branch and retries the merge.
  - On merge conflicts, opens an automated PR (`<defaultBranch> -> main`) instead of force merging.
  - Includes a fork-safety guard to avoid operating on forks that have open PRs upstream.
- Configuration (env/vars):
  - `APP_ID`, `APP_PRIVATE_KEY` (GitHub App credentials) — from repository secrets.
  - `TARGET_ORGS` (JSON array of orgs to scan) — repository variables; defaults to `["ubiquity", "ubiquity-os", "ubiquity-os-marketplace", "ubiquity-research", "devpool-directory"]`.
  - `INACTIVITY_DAYS` (number) — repository variable; defaults to `90`.
- Implementation: Executed by Bun via `bun run CI/src/cli.ts`, which authenticates the app, lists repos, evaluates inactivity, merges default → `main`, and writes a job summary.
