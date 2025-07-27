import { StaticDecode, Type as T } from "@sinclair/typebox";

export const approvalsRequiredSchema = T.Object(
  {
    /**
     * The amount of validations needed to consider a pull-request by a collaborator to be deemed eligible for
     * merge, defaults to 1.
     */
    collaborator: T.Number({
      default: 1,
      minimum: 1,
      description: "The amount of validations needed to consider a pull-request by a collaborator to be deemed eligible for merge",
    }),
    /**
     * The amount of validations needed to consider a pull-request by a contributor to be deemed eligible for merge,
     * defaults to 2.
     */
    contributor: T.Number({
      default: 2,
      minimum: 1,
      description: "The amount of validations needed to consider a pull-request by a contributor to be deemed eligible for merge",
    }),
  },
  { default: {} }
);

export const mergeTimeoutSchema = T.Object(
  {
    /**
     * The timespan to wait before merging a collaborator's pull-request, defaults to 3.5 days.
     */
    collaborator: T.String({
      default: "3.5 days",
      description: "The timespan to wait before merging a collaborator's pull-request",
      examples: ["1 day", "3.5 days"],
    }),
  },
  { default: {} }
);

export const excludedReposSchema = T.Array(
  T.String({
    pattern: "^[a-zA-Z0-9._-]+/[a-zA-Z0-9._-]+$",
    minLength: 3,
    description: "Repository in the format 'owner/repo'",
  }),
  {
    default: [],
    description:
      "Repositories to exclude from monitoring. Must be in the format 'owner/repo' to avoid mistakenly ignoring repositories with the same name in different organizations.",
    examples: ["owner/repo", "another-org/repo"],
  }
);

const allowedReviewerRoles = T.Array(T.String(), {
  default: ["COLLABORATOR", "MEMBER", "OWNER"],
  description: "When considering a user for a task: which roles should be considered as having review authority? All others are ignored.",
  examples: [
    ["COLLABORATOR", "MEMBER", "OWNER"],
    ["MEMBER", "OWNER"],
  ],
});

export const pluginSettingsSchema = T.Object({
  approvalsRequired: T.Optional(approvalsRequiredSchema),
  mergeTimeout: T.Optional(mergeTimeoutSchema),
  /**
   * Repositories to exclude from monitoring.
   */
  excludedRepos: T.Optional(excludedReposSchema),
  allowedReviewerRoles: T.Optional(
    T.Transform(allowedReviewerRoles)
      .Decode((roles) => roles.map((role) => role.toUpperCase()))
      .Encode((roles) => roles.map((role) => role.toUpperCase()))
  ),
});

export type PluginSettings = StaticDecode<typeof pluginSettingsSchema>;
export type ExcludedRepos = StaticDecode<typeof excludedReposSchema>;
