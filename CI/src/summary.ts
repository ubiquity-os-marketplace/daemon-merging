import * as core from "@actions/core";
import { MergeOutcome, MergeError } from "./types";

const UP_TO_DATE = "up-to-date";

export function writeGithubSummary(outcomes: MergeOutcome[], errorCount: number, errorsDetail: MergeError[] = []): Promise<void> | void {
  // If not running inside GitHub Actions, skip silently.
  if (!process.env.GITHUB_STEP_SUMMARY || typeof core.summary?.addHeading !== "function") {
    return;
  }

  const counts = {
    merged: outcomes.filter((o) => o.status === "merged").length,
    upToDate: outcomes.filter((o) => o.status === UP_TO_DATE).length,
    conflicts: outcomes.filter((o) => o.status === "conflict").length,
    skipped: outcomes.filter((o) => o.status === "skipped").length,
  };

  core.summary
    .addHeading("Auto-Merge Summary")
    .addRaw(`Processed <b>${outcomes.length}</b> repositories with <b>${errorCount}</b> errors.`)
    .addBreak()
    .addTable([
      ["Status", "Count"],
      ["✅ Merged", counts.merged.toString()],
      ["ℹ️ Up-to-date", counts.upToDate.toString()],
      ["⚠️ Conflicts", counts.conflicts.toString()],
      ["⏭️ Skipped", counts.skipped.toString()],
    ])
    .addBreak()
    .addHeading("Repository Outcomes", 2)
    .addTable([
      ["Org", "Repo", "Default Branch", "Outcome", "Details"],
      ...outcomes.map((o) => [o.org, o.repo, o.defaultBranch, statusIcon(o.status), detailsFor(o)]),
    ]);

  if (errorsDetail.length > 0) {
    core.summary
      .addBreak()
      .addHeading("Failures", 2)
      .addTable([
        ["Severity", "Scope", "Org", "Repo", "Stage", "Reason", "URL"],
        ...errorsDetail.map((e) => [
          e.severity === "warning" ? "⚠️ Warning" : "❌ Error",
          e.scope,
          e.org,
          e.repo ?? "—",
          e.stage,
          e.reason,
          `<a href="${e.url}">link</a>`,
        ]),
      ]);

    // Emit GitHub Annotations for quick visibility
    for (const e of errorsDetail) {
      if (e.severity === "error") {
        core.error(`${e.reason} — ${e.url}`, { title: `[${e.org}${e.repo ? "/" + e.repo : ""}] ${e.stage}` });
      } else {
        core.warning(`${e.reason} — ${e.url}`, { title: `[${e.org}${e.repo ? "/" + e.repo : ""}] ${e.stage}` });
      }
    }
  }

  core.summary.write().catch(console.error);
}

function statusIcon(status: MergeOutcome["status"]): string {
  switch (status) {
    case "merged":
      return "✅ merged";
    case UP_TO_DATE:
      return "ℹ️ up-to-date";
    case "conflict":
      return "⚠️ conflict";
    case "skipped":
      return "⏭️ skipped";
  }
}

function detailsFor(o: MergeOutcome): string {
  switch (o.status) {
    case "merged":
      return `SHA: <code>${o.sha.substring(0, 7)}</code> - <a href="https://github.com/${o.org}/${o.repo}/commit/${o.sha}">view commit</a>`;
    case UP_TO_DATE:
      return "Already contained";
    case "conflict":
      return "Merge conflict detected; PR opened";
    case "skipped":
      return o.reason;
  }
}
