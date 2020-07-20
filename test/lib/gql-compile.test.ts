import '../../src/lib/gql-compile';
import { generate } from '@graphql-codegen/cli';
import { Types } from '@graphql-codegen/plugin-helpers';
import { join as pathJoin, extname, basename, dirname } from 'path';
import mkdirp from 'mkdirp';
import { stripIgnoredCharacters } from 'graphql';
import { parse } from '@babel/parser';

const cwd = pathJoin(__dirname, '../__fixtures/gql-compile');
const rel = (relPath: string) => pathJoin(cwd, relPath);

import { join } from 'path';
import createCodegenOpts from '../../src/lib/create-codegen-opts';
import { writeFile } from '../../src/lib/file';
import { processGraphQLCodegen } from '../../src/lib/graphql-codegen';
import { createHash } from '../../src/lib/hash';
import loadConfig from '../../src/lib/load-config';
import { ConfigTypes } from '../../src/lib/types';

const dtsRelDir = 'node_modules/@types/graphql-let';
const packageJsonContent = JSON.stringify({ types: 'index' }, null, 2);

export const prepare = async (cwd: string) => {
  await mkdirp(join(cwd, dtsRelDir));
  await writeFile(join(cwd, dtsRelDir, 'package.json'), packageJsonContent);

  // const [config, configHash] = await loadConfig(cwd, configFilePath);
  const config: ConfigTypes = {
    schema: 'schema/type-defs.graphqls',
    plugins: ['typescript', 'typescript-operations', 'typescript-react-apollo'],
    documents: [],
    respectGitIgnore: true,
    config: {
      reactApolloVersion: '3',
      withHOC: false,
      withHooks: true,
    },
  };
  const schemaHash = '234';

  const codegenOpts = await createCodegenOpts(config);

  const gqlContent = stripIgnoredCharacters(`query Viewer {
    viewer {
        id
        name
        status
    }
}`);
  const gqlContentHash = createHash(gqlContent);

  const gqlHash = createHash(schemaHash + gqlContent);

  const [{ content }] = await generate(
    {
      cwd,
      schema: config.schema,
      documents: [gqlContent],

      generates: {
        'boom.tsx': {
          plugins: config.plugins,
          config: config.config,
        },
      },
    },
    false,
  );

  /**
   */

  /**
   * 0. Shape of storage
   * {
   *   "userRelPath.tsx": {
   *     "gqlContentHash1": "query{\n}",
   *     "gqlContentHash2": "query{\n}",
   *   }
   * }
   * 1. take care all multiple gql() in file. Check gqlContentHash and generate if not exists.
   * 2. All done. remove all old dts.
   * 3. Store the latest dts paths.
   * 4. Print index.d.ts from the entire storage
   *
   * 5. Write .tsx to cacheDir
   * 6. Import it from babel target by inserting a "import" line
   *
   * 7. Done.
   */

  // const filename = rel('pages/index.tsx');
  // const ext = extname(filename);
  // const tsxFullPath = pathJoin(dirname(filename), `${basename(filename, ext)}-${gqlContentHash}${ext}`)
  //
  // await writeFile('out.tsx', content)

  const ast = parse(content, {
    sourceType: 'module',
    plugins: ['typescript', 'jsx'],
  });
  console.log(ast);
};

describe('gql-compile', () => {
  it(
    'compiles',
    async () => {
      await prepare(cwd);
    },
    1000 * 1000,
  );
});
