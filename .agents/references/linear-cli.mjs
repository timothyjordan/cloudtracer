#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_API_URL = 'https://api.linear.app/graphql';

const BOOLEAN_FLAGS = new Set(['json', 'help']);
const VALUE_FLAGS = new Set([
  'team',
  'project',
  'state',
  'assignee',
  'limit',
  'title',
  'description',
  'description-file',
  'priority',
  'parent',
]);

function printUsage() {
  const lines = [
    'Usage: linear <command> [options]',
    '',
    'Commands:',
    '  auth-key <YOUR_LINEAR_API_KEY>               Verify key and save linear-token (0600)',
    '  me | whoami [--json]                         Show authenticated Linear user',
    '  teams [--json]                               List workspace teams',
    '  projects [--json]                            List workspace projects',
    '  states [--team <KEY>] [--json]               List workflow states',
    '  issues | list [filters] [--json]             List issues (--project, --team, --state, --assignee, --limit)',
    '  view <ISSUE-ID> [--json]                     View full issue details and comments',
    '  create --title <text> [options] [--json]     Create an issue (defaults: --state Todo, --assignee me)',
    '  state <ISSUE-ID> "<state-name>" [--json]     Transition issue state on its team',
    '  update <ISSUE-ID> [options] [--json]         Update issue fields',
    '  comment <ISSUE-ID> "<text>" [--json]         Add a comment to an issue',
    '  graphql "<query>" [\'{"var":"val"}\']          Execute raw GraphQL query or mutation',
  ];
  process.stdout.write(`${lines.join('\n')}\n`);
}

function parseCliArgs(argv) {
  const flags = {};
  const positionals = [];
  let passthrough = false;

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (passthrough) {
      positionals.push(token);
      continue;
    }
    if (token === '--') {
      passthrough = true;
      continue;
    }
    if (token === '-h') {
      flags.help = true;
      continue;
    }
    if (token.startsWith('--')) {
      const eqIdx = token.indexOf('=');
      const rawName = eqIdx === -1 ? token.slice(2) : token.slice(2, eqIdx);
      const inlineValue = eqIdx === -1 ? undefined : token.slice(eqIdx + 1);

      if (BOOLEAN_FLAGS.has(rawName)) {
        flags[rawName] =
          inlineValue === undefined ? true : inlineValue !== 'false';
        continue;
      }
      if (VALUE_FLAGS.has(rawName)) {
        if (inlineValue !== undefined) {
          flags[rawName] = inlineValue;
        } else {
          if (i + 1 >= argv.length) {
            throw new Error(`Missing value for flag --${rawName}.`);
          }
          i += 1;
          flags[rawName] = argv[i];
        }
        continue;
      }
      throw new Error(`Unknown flag: --${rawName}`);
    }
    positionals.push(token);
  }

  return { flags, positionals };
}

function resolveEnvPaths() {
  const apiUrl = (process.env.LINEAR_API_URL || DEFAULT_API_URL).trim();
  const appDataDir =
    (process.env.ANTIGRAVITY_APP_DATA_DIR || '').trim() ||
    path.join(os.homedir(), '.gemini', 'jetski');
  const tokenPath = path.join(appDataDir, 'linear-token');
  return { apiUrl, appDataDir, tokenPath };
}

function resolveApiKey(tokenPath) {
  const envKey = (process.env.LINEAR_API_KEY || '').trim();
  if (envKey.length > 0) {
    return envKey;
  }
  try {
    const fileKey = fs.readFileSync(tokenPath, 'utf8').trim();
    if (fileKey.length > 0) {
      return fileKey;
    }
  } catch (err) {
    if (!err || err.code !== 'ENOENT') {
      throw new Error(`Unable to read ${tokenPath}: ${err.message}`);
    }
  }
  throw new Error(
    'No Linear API key found. Set LINEAR_API_KEY or run: linear auth-key <YOUR_LINEAR_API_KEY>',
  );
}

async function graphqlRequest({ apiUrl, apiKey, query, variables }) {
  const requestBody =
    variables !== undefined ? { query, variables } : { query };

  let res;
  try {
    res = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: apiKey,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (err) {
    const causeMsg = err?.cause?.message ? ` (${err.cause.message})` : '';
    throw new Error(`Linear network error: ${err.message}${causeMsg}`);
  }

  const rawText = await res.text();
  let payload = null;
  try {
    payload = JSON.parse(rawText);
  } catch {
    payload = null;
  }

  if (Array.isArray(payload?.errors) && payload.errors.length > 0) {
    const messages = payload.errors
      .map((entry) => entry?.message || JSON.stringify(entry))
      .join('; ');
    throw new Error(`Linear GraphQL error: ${messages}`);
  }

  if (!res.ok) {
    throw new Error(
      `Linear HTTP ${res.status} ${res.statusText}: ${rawText.slice(0, 300)}`,
    );
  }

  if (!payload || typeof payload !== 'object') {
    throw new Error('Linear API returned an invalid JSON payload.');
  }

  return payload;
}

async function fetchViewer(ctx) {
  const payload = await graphqlRequest({
    ...ctx,
    query: 'query Viewer { viewer { id name email } }',
  });
  if (!payload.data?.viewer) {
    throw new Error('Linear viewer query returned empty viewer.');
  }
  return payload.data.viewer;
}

async function fetchTeams(ctx) {
  const payload = await graphqlRequest({
    ...ctx,
    query: 'query Teams { teams(first: 250) { nodes { id key name } } }',
  });
  return payload.data?.teams?.nodes ?? [];
}

async function fetchProjects(ctx) {
  const payload = await graphqlRequest({
    ...ctx,
    query:
      'query Projects { projects(first: 250) { nodes { id name state slugId teams(first: 50) { nodes { id key name } } } } }',
  });
  return payload.data?.projects?.nodes ?? [];
}

async function fetchWorkflowStates(ctx, teamId = null) {
  const filter = teamId ? { team: { id: { eq: teamId } } } : undefined;
  const payload = await graphqlRequest({
    ...ctx,
    query: `query WorkflowStates($filter: WorkflowStateFilter) {
      workflowStates(first: 250, filter: $filter) {
        nodes {
          id
          name
          type
          team {
            id
            key
            name
          }
        }
      }
    }`,
    variables: filter ? { filter } : undefined,
  });
  return payload.data?.workflowStates?.nodes ?? [];
}

async function resolveTeam(ctx, teamRef) {
  const target = teamRef.trim().toLowerCase();
  const teams = await fetchTeams(ctx);
  const match = teams.find(
    (t) =>
      t.key?.toLowerCase() === target ||
      t.id?.toLowerCase() === target ||
      t.name?.toLowerCase() === target,
  );
  if (!match) {
    const available = teams.map((t) => t.key).join(', ') || 'none';
    throw new Error(`Team "${teamRef}" not found. Available teams: ${available}`);
  }
  return match;
}

async function resolveProject(ctx, projectRef) {
  const target = projectRef.trim().toLowerCase();
  const projects = await fetchProjects(ctx);
  const match = projects.find(
    (p) =>
      p.id?.toLowerCase() === target ||
      p.slugId?.toLowerCase() === target ||
      p.name?.toLowerCase() === target,
  );
  if (!match) {
    const available = projects.map((p) => p.name).join(', ') || 'none';
    throw new Error(
      `Project "${projectRef}" not found. Available projects: ${available}`,
    );
  }
  return match;
}

async function resolveStateOnTeam(ctx, teamId, stateName, preloadedStates = null) {
  let teamStates = Array.isArray(preloadedStates) ? preloadedStates : null;
  if (!teamStates || teamStates.length === 0) {
    teamStates = await fetchWorkflowStates(ctx, teamId);
  }
  const target = stateName.trim().toLowerCase();
  const match = teamStates.find((s) => s.name?.trim().toLowerCase() === target);
  if (!match) {
    const available = teamStates.map((s) => s.name).join(', ') || 'none';
    throw new Error(
      `Workflow state "${stateName}" not found on team ${teamId}. Available states: ${available}`,
    );
  }
  return match;
}

async function resolveAssigneeId(ctx, assigneeRef, { allowNullForNone = false } = {}) {
  const trimmed = assigneeRef.trim();
  const lower = trimmed.toLowerCase();
  if (lower === 'none') {
    return allowNullForNone ? null : undefined;
  }
  if (lower === 'me') {
    const viewer = await fetchViewer(ctx);
    return viewer.id;
  }
  if (trimmed.includes('@')) {
    const payload = await graphqlRequest({
      ...ctx,
      query: 'query Users { users(first: 250) { nodes { id name email } } }',
    });
    const users = payload.data?.users?.nodes ?? [];
    const match = users.find((u) => u.email?.toLowerCase() === lower);
    if (!match) {
      throw new Error(`No Linear user found with email "${trimmed}".`);
    }
    return match.id;
  }
  return trimmed;
}

function parsePriority(rawPriority) {
  const num = Number(rawPriority);
  if (!Number.isInteger(num) || num < 0 || num > 4) {
    throw new Error(
      `Invalid --priority "${rawPriority}". Expected an integer from 0 to 4.`,
    );
  }
  return num;
}

function readDescriptionFlag(flags) {
  if (
    flags.description !== undefined &&
    flags['description-file'] !== undefined
  ) {
    throw new Error(
      'Specify either --description or --description-file, not both.',
    );
  }
  if (flags['description-file'] !== undefined) {
    return fs.readFileSync(flags['description-file'], 'utf8');
  }
  if (flags.description !== undefined) {
    return flags.description;
  }
  return undefined;
}

async function resolveIssueWithTeam(ctx, issueRef) {
  const payload = await graphqlRequest({
    ...ctx,
    query: `query IssueWithTeam($id: String!) {
      issue(id: $id) {
        id
        identifier
        title
        team {
          id
          key
          name
          states(first: 100) {
            nodes {
              id
              name
              type
            }
          }
        }
      }
    }`,
    variables: { id: issueRef },
  });
  const issue = payload.data?.issue;
  if (!issue) {
    throw new Error(`Issue not found: ${issueRef}`);
  }
  return issue;
}

function writeJson(value) {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

async function run() {
  const { flags, positionals } = parseCliArgs(process.argv.slice(2));
  const command = positionals[0];

  if (flags.help || !command || command === 'help') {
    printUsage();
    return;
  }

  const { apiUrl, appDataDir, tokenPath } = resolveEnvPaths();

  if (command === 'auth-key') {
    const rawKey = (positionals[1] || '').trim();
    if (!rawKey) {
      throw new Error('Usage: linear auth-key <YOUR_LINEAR_API_KEY>');
    }
    const viewer = await fetchViewer({ apiUrl, apiKey: rawKey });
    fs.mkdirSync(appDataDir, { recursive: true });
    fs.writeFileSync(tokenPath, `${rawKey}\n`, {
      encoding: 'utf8',
      mode: 0o600,
    });
    try {
      fs.chmodSync(tokenPath, 0o600);
    } catch {
      // Ignore chmod errors on platforms without POSIX mode bits.
    }
    if (flags.json) {
      writeJson({ viewer, tokenPath });
    } else {
      process.stdout.write(
        `Authenticated as ${viewer.name} <${viewer.email}> (${viewer.id}). Saved token to ${tokenPath}\n`,
      );
    }
    return;
  }

  const apiKey = resolveApiKey(tokenPath);
  const ctx = { apiUrl, apiKey };

  if (command === 'me' || command === 'whoami') {
    const viewer = await fetchViewer(ctx);
    if (flags.json) {
      writeJson(viewer);
    } else {
      process.stdout.write(`${viewer.name} <${viewer.email}> (${viewer.id})\n`);
    }
    return;
  }

  if (command === 'teams') {
    const teams = await fetchTeams(ctx);
    if (flags.json) {
      writeJson(teams);
    } else {
      for (const team of teams) {
        process.stdout.write(`${team.key}\t${team.name}\t(${team.id})\n`);
      }
    }
    return;
  }

  if (command === 'projects') {
    const projects = await fetchProjects(ctx);
    if (flags.json) {
      writeJson(projects);
    } else {
      for (const proj of projects) {
        const teamKeys = (proj.teams?.nodes ?? []).map((t) => t.key).join(',');
        process.stdout.write(
          `${proj.name}\t[${proj.state ?? ''}]\tslug:${proj.slugId ?? ''}\tteams:${teamKeys}\t(${proj.id})\n`,
        );
      }
    }
    return;
  }

  if (command === 'states') {
    let teamFilterId = null;
    if (flags.team !== undefined) {
      const team = await resolveTeam(ctx, flags.team);
      teamFilterId = team.id;
    }
    const states = await fetchWorkflowStates(ctx, teamFilterId);
    if (flags.json) {
      writeJson(states);
    } else {
      for (const st of states) {
        process.stdout.write(
          `${st.team?.key ?? ''}\t${st.name}\t[${st.type ?? ''}]\t(${st.id})\n`,
        );
      }
    }
    return;
  }

  if (command === 'issues' || command === 'list') {
    const first = flags.limit !== undefined ? Number(flags.limit) : 50;
    if (!Number.isInteger(first) || first < 1 || first > 250) {
      throw new Error(
        `Invalid --limit "${flags.limit}". Expected an integer from 1 to 250.`,
      );
    }

    const filter = {};
    if (flags.project !== undefined) {
      const project = await resolveProject(ctx, flags.project);
      filter.project = { id: { eq: project.id } };
    }
    if (flags.team !== undefined) {
      const team = await resolveTeam(ctx, flags.team);
      filter.team = { id: { eq: team.id } };
    }
    if (flags.state !== undefined) {
      filter.state = { name: { eqIgnoreCase: flags.state.trim() } };
    }
    if (flags.assignee !== undefined) {
      if (flags.assignee.trim().toLowerCase() === 'none') {
        filter.assignee = { null: true };
      } else {
        const assigneeId = await resolveAssigneeId(ctx, flags.assignee);
        filter.assignee = { id: { eq: assigneeId } };
      }
    }

    const variables =
      Object.keys(filter).length > 0 ? { first, filter } : { first };
    const payload = await graphqlRequest({
      ...ctx,
      query: `query Issues($first: Int!, $filter: IssueFilter) {
        issues(first: $first, filter: $filter) {
          nodes {
            id
            identifier
            title
            priority
            url
            state { id name type }
            team { id key name }
            project { id name }
            assignee { id name email }
          }
        }
      }`,
      variables,
    });
    const issues = payload.data?.issues?.nodes ?? [];
    if (flags.json) {
      writeJson(issues);
    } else {
      for (const issue of issues) {
        process.stdout.write(
          `${issue.identifier}\t[${issue.state?.name ?? ''}]\t${issue.title}\t(${issue.url ?? issue.id})\n`,
        );
      }
    }
    return;
  }

  if (command === 'view') {
    const issueRef = positionals[1];
    if (!issueRef) {
      throw new Error('Usage: linear view <ISSUE-ID> [--json]');
    }
    const payload = await graphqlRequest({
      ...ctx,
      query: `query ViewIssue($id: String!) {
        issue(id: $id) {
          id
          identifier
          title
          url
          branchName
          priority
          description
          state { id name type }
          team { id key name }
          project { id name }
          assignee { id name email }
          comments {
            nodes {
              id
              body
              createdAt
              user { id name email }
            }
          }
        }
      }`,
      variables: { id: issueRef },
    });
    const issue = payload.data?.issue;
    if (!issue) {
      throw new Error(`Issue not found: ${issueRef}`);
    }
    if (flags.json) {
      writeJson(issue);
      return;
    }

    const lines = [
      `${issue.identifier}: ${issue.title}`,
      `URL: ${issue.url ?? ''}`,
      `State: ${issue.state?.name ?? ''}`,
      `Team: ${issue.team ? `${issue.team.name} (${issue.team.key})` : ''}`,
      `Project: ${issue.project?.name ?? 'none'}`,
      `Assignee: ${issue.assignee ? `${issue.assignee.name} <${issue.assignee.email}>` : 'unassigned'}`,
      `Branch: ${issue.branchName ?? ''}`,
      '',
      'Description:',
      issue.description || '(no description)',
    ];

    const comments = issue.comments?.nodes ?? [];
    if (comments.length > 0) {
      lines.push('', 'Comments:');
      for (const comment of comments) {
        const author = comment.user?.name ?? 'Unknown';
        lines.push(`[${comment.createdAt ?? ''}] ${author}: ${comment.body}`);
      }
    }
    process.stdout.write(`${lines.join('\n')}\n`);
    return;
  }

  if (command === 'create') {
    const title = (flags.title || '').trim();
    if (!title) {
      throw new Error('Usage: linear create --title <text> [options]');
    }
    const description = readDescriptionFlag(flags);

    let resolvedProject = null;
    if (flags.project !== undefined) {
      resolvedProject = await resolveProject(ctx, flags.project);
    }

    let teamId = null;
    if (flags.team !== undefined) {
      const team = await resolveTeam(ctx, flags.team);
      teamId = team.id;
    } else if (resolvedProject) {
      teamId = resolvedProject.teams?.nodes?.[0]?.id ?? null;
      if (!teamId) {
        throw new Error(
          `Project "${resolvedProject.name}" has no associated team; pass --team <KEY>.`,
        );
      }
    } else {
      const teams = await fetchTeams(ctx);
      if (teams.length === 1) {
        teamId = teams[0].id;
      } else {
        throw new Error(
          'Pass --team <KEY> or --project <name-or-id> to select the target Linear team.',
        );
      }
    }

    const stateName = flags.state ?? 'Todo';
    const matchedState = await resolveStateOnTeam(ctx, teamId, stateName);

    const assigneeArg = flags.assignee ?? 'me';
    const assigneeId = await resolveAssigneeId(ctx, assigneeArg, {
      allowNullForNone: false,
    });

    const input = {
      title,
      teamId,
      stateId: matchedState.id,
    };
    if (description !== undefined) {
      input.description = description;
    }
    if (resolvedProject) {
      input.projectId = resolvedProject.id;
    }
    if (assigneeId !== undefined) {
      input.assigneeId = assigneeId;
    }
    if (flags.priority !== undefined) {
      input.priority = parsePriority(flags.priority);
    }
    if (flags.parent !== undefined) {
      const parentIssue = await resolveIssueWithTeam(ctx, flags.parent);
      input.parentId = parentIssue.id;
    }

    const payload = await graphqlRequest({
      ...ctx,
      query: `mutation IssueCreate($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue {
            id
            identifier
            title
            url
            state { id name }
            team { id key name }
            project { id name }
            assignee { id name email }
          }
        }
      }`,
      variables: { input },
    });
    const created = payload.data?.issueCreate?.issue;
    if (!payload.data?.issueCreate?.success || !created) {
      throw new Error('Linear issueCreate did not succeed.');
    }
    if (flags.json) {
      writeJson(created);
    } else {
      process.stdout.write(
        `Created ${created.identifier}: ${created.title} (${created.url ?? created.id})\n`,
      );
    }
    return;
  }

  if (command === 'state') {
    const issueRef = positionals[1];
    const targetStateName = positionals[2];
    if (!issueRef || !targetStateName) {
      throw new Error('Usage: linear state <ISSUE-ID> "<state-name>" [--json]');
    }
    const issue = await resolveIssueWithTeam(ctx, issueRef);
    const matchedState = await resolveStateOnTeam(
      ctx,
      issue.team.id,
      targetStateName,
      issue.team?.states?.nodes,
    );

    const payload = await graphqlRequest({
      ...ctx,
      query: `mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          success
          issue {
            id
            identifier
            title
            url
            state { id name }
            team { id key name }
            project { id name }
            assignee { id name email }
          }
        }
      }`,
      variables: {
        id: issue.id,
        input: { stateId: matchedState.id },
      },
    });
    const updated = payload.data?.issueUpdate?.issue;
    if (!payload.data?.issueUpdate?.success || !updated) {
      throw new Error('Linear issueUpdate did not succeed.');
    }
    if (flags.json) {
      writeJson(updated);
    } else {
      process.stdout.write(
        `Updated ${updated.identifier} state to ${updated.state?.name ?? matchedState.name}\n`,
      );
    }
    return;
  }

  if (command === 'update') {
    const issueRef = positionals[1];
    if (!issueRef) {
      throw new Error('Usage: linear update <ISSUE-ID> [options] [--json]');
    }
    const description = readDescriptionFlag(flags);
    const issue = await resolveIssueWithTeam(ctx, issueRef);
    const input = {};

    if (flags.title !== undefined) {
      const trimmedTitle = flags.title.trim();
      if (!trimmedTitle) {
        throw new Error('--title cannot be empty.');
      }
      input.title = trimmedTitle;
    }
    if (description !== undefined) {
      input.description = description;
    }
    if (flags.state !== undefined) {
      const matchedState = await resolveStateOnTeam(
        ctx,
        issue.team.id,
        flags.state,
        issue.team?.states?.nodes,
      );
      input.stateId = matchedState.id;
    }
    if (flags.project !== undefined) {
      if (flags.project.trim().toLowerCase() === 'none') {
        input.projectId = null;
      } else {
        const proj = await resolveProject(ctx, flags.project);
        input.projectId = proj.id;
      }
    }
    if (flags.assignee !== undefined) {
      input.assigneeId = await resolveAssigneeId(ctx, flags.assignee, {
        allowNullForNone: true,
      });
    }
    if (flags.priority !== undefined) {
      input.priority = parsePriority(flags.priority);
    }

    if (Object.keys(input).length === 0) {
      throw new Error(
        'No update fields provided. Pass --state, --title, --description, --project, --assignee, or --priority.',
      );
    }

    const payload = await graphqlRequest({
      ...ctx,
      query: `mutation IssueUpdate($id: String!, $input: IssueUpdateInput!) {
        issueUpdate(id: $id, input: $input) {
          success
          issue {
            id
            identifier
            title
            url
            state { id name }
            team { id key name }
            project { id name }
            assignee { id name email }
          }
        }
      }`,
      variables: { id: issue.id, input },
    });
    const updated = payload.data?.issueUpdate?.issue;
    if (!payload.data?.issueUpdate?.success || !updated) {
      throw new Error('Linear issueUpdate did not succeed.');
    }
    if (flags.json) {
      writeJson(updated);
    } else {
      process.stdout.write(`Updated ${updated.identifier}: ${updated.title}\n`);
    }
    return;
  }

  if (command === 'comment') {
    const issueRef = positionals[1];
    const body = positionals[2];
    if (!issueRef || !body) {
      throw new Error('Usage: linear comment <ISSUE-ID> "<text>" [--json]');
    }
    const issue = await resolveIssueWithTeam(ctx, issueRef);
    const payload = await graphqlRequest({
      ...ctx,
      query: `mutation CommentCreate($input: CommentCreateInput!) {
        commentCreate(input: $input) {
          success
          comment {
            id
            body
            url
            createdAt
          }
        }
      }`,
      variables: {
        input: {
          issueId: issue.id,
          body,
        },
      },
    });
    const comment = payload.data?.commentCreate?.comment;
    if (!payload.data?.commentCreate?.success || !comment) {
      throw new Error('Linear commentCreate did not succeed.');
    }
    if (flags.json) {
      writeJson(comment);
    } else {
      process.stdout.write(
        `Added comment to ${issue.identifier} (${comment.id})\n`,
      );
    }
    return;
  }

  if (command === 'graphql') {
    const query = positionals[1];
    if (!query) {
      throw new Error('Usage: linear graphql "<query>" [\'{"var":"val"}\']');
    }
    let variables;
    if (positionals[2] !== undefined) {
      try {
        variables = JSON.parse(positionals[2]);
      } catch (err) {
        throw new Error(`Invalid GraphQL variables JSON: ${err.message}`);
      }
      if (
        typeof variables !== 'object' ||
        variables === null ||
        Array.isArray(variables)
      ) {
        throw new Error('GraphQL variables argument must be a JSON object.');
      }
    }
    const payload = await graphqlRequest({
      ...ctx,
      query,
      variables,
    });
    writeJson(payload);
    return;
  }

  throw new Error(
    `Unknown command "${command}". Run "linear --help" for available commands.`,
  );
}

run().catch((err) => {
  process.stderr.write(`${err?.message || String(err)}\n`);
  process.exit(1);
});
