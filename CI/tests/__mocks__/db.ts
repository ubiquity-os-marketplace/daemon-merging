// cSpell:disable
import { factory, primaryKey, nullable } from "@mswjs/data";

export const db = factory({
  users: {
    id: primaryKey(Number),
    name: String,
  },
  repos: {
    id: primaryKey(Number),
    owner: String,
    name: String,
    archived: Boolean,
    fork: Boolean,
    default_branch: String,
    parent: {
      full_name: nullable(String),
    },
  },
  branches: {
    id: primaryKey(Number),
    owner: String,
    repo: String,
    name: String,
    commitDate: String,
    sha: String,
  },
  installations: {
    id: primaryKey(Number),
    org: String,
    app_id: Number,
  },
  merges: {
    id: primaryKey(Number),
    owner: String,
    repo: String,
    base: String,
    head: String,
    status: Number,
    sha: nullable(String),
    message: nullable(String),
  },
  pulls: {
    id: primaryKey(Number),
    owner: String,
    repo: String,
    number: Number,
    state: String,
    head: String,
  },
});

export const state = {
  mergeStatus: 201 as 201 | 204 | 409,
  shouldFailMerge: false,
  shouldFailInstallation: false,
  shouldFailRepoList: false,
};

export function setMergeStatus(s: 201 | 204 | 409) {
  state.mergeStatus = s;
}

export function setShouldFailMerge(fail: boolean) {
  state.shouldFailMerge = fail;
}

export function setShouldFailInstallation(fail: boolean) {
  state.shouldFailInstallation = fail;
}

export function setShouldFailRepoList(fail: boolean) {
  state.shouldFailRepoList = fail;
}

export function resetState() {
  state.mergeStatus = 201;
  state.shouldFailMerge = false;
  state.shouldFailInstallation = false;
  state.shouldFailRepoList = false;
}
