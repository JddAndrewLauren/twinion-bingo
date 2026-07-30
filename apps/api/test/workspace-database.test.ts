import { describe, expect, it } from 'vitest';

import {
  databaseNameFromUrl,
  workspaceDatabaseName,
} from '../src/db/workspace-database.js';

/**
 * The derivation both the provisioner and the truncate guard depend on. It is
 * pure, so it is tested as arithmetic rather than against a container.
 */

describe('workspaceDatabaseName', () => {
  it('is undefined outside a Conductor workspace, so CI has nothing to enforce', () => {
    expect(workspaceDatabaseName({})).toBeUndefined();
    expect(
      workspaceDatabaseName({ CONDUCTOR_WORKSPACE_PATH: undefined }),
    ).toBeUndefined();
    expect(workspaceDatabaseName({ CONDUCTOR_WORKSPACE_PATH: '' })).toBeUndefined();
  });

  it('derives from the workspace directory basename', () => {
    expect(
      workspaceDatabaseName({
        CONDUCTOR_WORKSPACE_PATH: '/Users/john/conductor/workspaces/twinion-bingo/gwangju',
      }),
    ).toBe('bingo_gwangju');
  });

  it('ignores trailing slashes', () => {
    expect(
      workspaceDatabaseName({ CONDUCTOR_WORKSPACE_PATH: '/tmp/workspaces/belmopan///' }),
    ).toBe('bingo_belmopan');
  });

  it('folds case, because unquoted identifiers are lower case', () => {
    expect(workspaceDatabaseName({ CONDUCTOR_WORKSPACE_PATH: '/tmp/Gwangju' })).toBe(
      'bingo_gwangju',
    );
  });

  it('folds anything outside [a-z0-9_] to an underscore', () => {
    expect(workspaceDatabaseName({ CONDUCTOR_WORKSPACE_PATH: '/tmp/my-branch' })).toBe(
      'bingo_my_branch',
    );
    // The documented, accepted collision: hyphen and underscore land together.
    expect(workspaceDatabaseName({ CONDUCTOR_WORKSPACE_PATH: '/tmp/my_branch' })).toBe(
      'bingo_my_branch',
    );
  });

  it('caps at NAMEDATALEN - 1 rather than letting Postgres truncate silently', () => {
    const name = workspaceDatabaseName({
      CONDUCTOR_WORKSPACE_PATH: `/tmp/${'a'.repeat(100)}`,
    });

    expect(name).toHaveLength(63);
    expect(name).toBe(`bingo_${'a'.repeat(57)}`);
  });

  it('throws when the basename sanitises to nothing', () => {
    expect(() => workspaceDatabaseName({ CONDUCTOR_WORKSPACE_PATH: '/' })).toThrow(
      /no usable directory name/,
    );
  });
});

describe('databaseNameFromUrl', () => {
  it('round-trips the name the provisioner writes into a connection string', () => {
    const name = workspaceDatabaseName({ CONDUCTOR_WORKSPACE_PATH: '/tmp/gwangju' });

    expect(
      databaseNameFromUrl(`postgres://postgres:postgres@127.0.0.1:55432/${name}`),
    ).toBe('bingo_gwangju');
  });

  it('reads the shared maintenance database as itself', () => {
    expect(
      databaseNameFromUrl('postgres://postgres:postgres@127.0.0.1:55432/postgres'),
    ).toBe('postgres');
  });
});
