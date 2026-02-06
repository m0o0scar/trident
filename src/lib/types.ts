
export interface Repository {
  path: string;
  name: string;
  credentialId?: string | null;
}

export interface GitStatus {
  current: string | null;
  tracking: string | null;
  ahead: number;
  behind: number;
  conflicted: string[];
  created: string[];
  deleted: string[];
  modified: string[];
  not_added: string[];
  renamed: Array<{ from: string; to: string }>;
  staged: string[];
  files: GitFileStatus[];
}

export interface GitFileStatus {
  path: string;
  index: string;
  working_dir: string;
}

export interface Commit {
  hash: string;
  date: string;
  message: string;
  refs: string;
  body: string;
  author_name: string;
  author_email: string;
  parents: string[];
}

export interface GitLog {
  all: Commit[];
  total: number;
  latest: Commit | null;
}
