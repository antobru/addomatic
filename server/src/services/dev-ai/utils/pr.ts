export interface PullRequestParams {
  platform: 'github' | 'gitlab' | 'bitbucket';
  apiToken: string;
  apiBaseUrl?: string;
  repoUrl: string;
  branchName: string;
  baseBranch: string;
  title: string;
  body: string;
  draft: boolean;
  labels?: string[];
}

export interface PullRequestResult {
  prUrl: string;
  prId: string | number;
}

export async function createPullRequest(params: PullRequestParams): Promise<PullRequestResult> {
  switch (params.platform) {
    case 'github': return createGitHubPR(params);
    case 'gitlab': return createGitLabMR(params);
    case 'bitbucket': return createBitbucketPR(params);
  }
}

async function createGitHubPR(params: PullRequestParams): Promise<PullRequestResult> {
  const { owner, repo } = extractGitHubInfo(params.repoUrl);

  const response = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiToken}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      title: params.title,
      body: params.body,
      head: params.branchName,
      base: params.baseBranch,
      draft: params.draft,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`GitHub API ${response.status}: ${err}`);
  }

  const data = await response.json() as { html_url: string; number: number };

  if (params.labels?.length) {
    await fetch(`https://api.github.com/repos/${owner}/${repo}/issues/${data.number}/labels`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiToken}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ labels: params.labels }),
    }).catch(() => { /* labels are non-critical */ });
  }

  return { prUrl: data.html_url, prId: data.number };
}

async function createGitLabMR(params: PullRequestParams): Promise<PullRequestResult> {
  const base = params.apiBaseUrl ?? 'https://gitlab.com';
  const projectPath = extractGitLabPath(params.repoUrl);

  const response = await fetch(
    `${base}/api/v4/projects/${encodeURIComponent(projectPath)}/merge_requests`,
    {
      method: 'POST',
      headers: {
        'PRIVATE-TOKEN': params.apiToken,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        source_branch: params.branchName,
        target_branch: params.baseBranch,
        title: params.draft ? `Draft: ${params.title}` : params.title,
        description: params.body,
      }),
    },
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`GitLab API ${response.status}: ${err}`);
  }

  const data = await response.json() as { web_url: string; iid: number };
  return { prUrl: data.web_url, prId: data.iid };
}

async function createBitbucketPR(params: PullRequestParams): Promise<PullRequestResult> {
  const { workspace, repo } = extractBitbucketInfo(params.repoUrl);

  const response = await fetch(
    `https://api.bitbucket.org/2.0/repositories/${workspace}/${repo}/pullrequests`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${params.apiToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: params.title,
        description: params.body,
        source: { branch: { name: params.branchName } },
        destination: { branch: { name: params.baseBranch } },
      }),
    },
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Bitbucket API ${response.status}: ${err}`);
  }

  const data = await response.json() as { links: { html: { href: string } }; id: number };
  return { prUrl: data.links.html.href, prId: data.id };
}

function extractGitHubInfo(url: string): { owner: string; repo: string } {
  const cleaned = url.replace(/\.git$/, '');
  const sshMatch = cleaned.match(/github\.com[:/]([\w.-]+)\/([\w.-]+)/);
  if (sshMatch) return { owner: sshMatch[1]!, repo: sshMatch[2]! };
  const parts = new URL(cleaned).pathname.split('/').filter(Boolean);
  return { owner: parts[0]!, repo: parts[1]! };
}

function extractGitLabPath(url: string): string {
  const cleaned = url.replace(/\.git$/, '');
  const sshMatch = cleaned.match(/gitlab[^:/]*[:/](.+)/);
  if (sshMatch) return sshMatch[1]!;
  return new URL(cleaned).pathname.replace(/^\//, '');
}

function extractBitbucketInfo(url: string): { workspace: string; repo: string } {
  const cleaned = url.replace(/\.git$/, '');
  const sshMatch = cleaned.match(/bitbucket\.org[:/]([\w.-]+)\/([\w.-]+)/);
  if (sshMatch) return { workspace: sshMatch[1]!, repo: sshMatch[2]! };
  const parts = new URL(cleaned).pathname.split('/').filter(Boolean);
  return { workspace: parts[0]!, repo: parts[1]! };
}
