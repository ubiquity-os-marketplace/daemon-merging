import type { Issue, PullRequestConnection } from "@octokit/graphql-schema";

export const QUERY_LINKED_PULL_REQUESTS = /* GraphQL */ `
  query collectLinkedPullRequests($owner: String!, $repo: String!, $issueNumber: Int!, $cursor: String) {
    repository(owner: $owner, name: $repo) {
      issue(number: $issueNumber) {
        id
        closedByPullRequestsReferences(first: 10, includeClosedPrs: false, after: $cursor) {
          edges {
            node {
              id
              title
              number
              url
              state
              isDraft
              author {
                login
              }
              repository {
                id
                owner {
                  id
                  login
                }
                name
              }
            }
          }
          pageInfo {
            hasNextPage
            endCursor
          }
        }
      }
    }
  }
`;

export interface LinkedPullRequestsResponse {
  repository?: {
    issue?: Pick<Issue, "id"> & {
      closedByPullRequestsReferences?: PullRequestConnection;
    };
  };
}
