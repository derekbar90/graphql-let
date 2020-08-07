/* eslint-disable @typescript-eslint/no-non-null-assertion */

import { ok } from 'assert';
import { join as pathJoin } from 'path';
import gen from '../src/gen';
import { CodegenContext } from '../src/lib/types';
import { cleanup, rename } from './__tools/file';
import pick from 'lodash.pick';
import { matchPathsAndContents } from './__tools/match-paths-and-contents';

const cwd = pathJoin(__dirname, '__fixtures/gen');
const rel = (relPath: string) => pathJoin(cwd, relPath);

describe('"graphql-let" command', () => {
  beforeAll(async () => {
    await rename(rel('_gitignore'), rel('.gitignore'));
  });

  beforeEach(() => cleanup(cwd));

  afterAll(async () => {
    await rename(rel('.gitignore'), rel('_gitignore'));
    // await cleanup();
  });

  test(`generates number of .d.ts ignoring specified files as expected
* ignoring "!" paths in "schema" and "documents" of graphql-let.yml
* ignoring files specified in .gitignore
`, async () => {
    await gen({ cwd });
    await matchPathsAndContents(
      ['**/*.graphql.d.ts', '**/*.graphqls.d.ts', '__generated__/**/*.tsx'],
      cwd,
    );
  });

  test(`runs twice and keeps valid caches`, async () => {
    const pickProperties = (context: CodegenContext) =>
      pick(context, ['gqlRelPath', 'tsxRelPath', 'dtsRelPath', 'gqlHash']);
    const result1 = await gen({ cwd });
    for (const { skip, dtsRelPath } of result1)
      ok(!skip, `${dtsRelPath} should be newly created!`);
    expect(result1.map(pickProperties)).toMatchSnapshot();
    await matchPathsAndContents(['__generated__/**/*.tsx'], cwd);

    const result2 = await gen({ cwd });
    for (const { skip, dtsRelPath } of result2)
      ok(skip, `${dtsRelPath} should be cached!`);

    expect(result2.map(pickProperties)).toMatchSnapshot();
    await matchPathsAndContents(['__generated__/**/*.tsx'], cwd);
  });

  test(`passes config to graphql-codegen as expected
* "useIndexSignature: true" in config effect to result having "WithIndex<TObject>" type
`, async () => {
    await gen({ cwd });
    await matchPathsAndContents(['schema/type-defs.graphqls.d.ts'], cwd);
  });

  test(`documents: **/*.tsx generates .d.ts for babel`, async () => {
    await gen({ cwd, configFilePath: '.graphql-let-babel.yml' });
    await matchPathsAndContents(['__generated__', 'node_modules'], cwd);
  });
});
