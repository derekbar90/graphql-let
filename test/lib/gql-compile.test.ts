import '../../src/lib/gql-compile';
import { generate } from '@graphql-codegen/cli';
import { Types } from '@graphql-codegen/plugin-helpers';
import makeDir from 'make-dir';
import { join as pathJoin, extname, basename, dirname } from 'path';
import { existsSync } from 'fs';
import { genDts } from '../../src/lib/dts';
import { rimraf, withHash } from '../../src/lib/file';
import mkdirp from 'mkdirp';
import { stripIgnoredCharacters } from 'graphql';
import { parse } from '@babel/parser';
import { readFile } from '../__tools/file';
import { join } from 'path';
import createCodegenOpts from '../../src/lib/create-codegen-opts';
import { writeFile } from '../../src/lib/file';
import { processGraphQLCodegen } from '../../src/lib/graphql-codegen';
import { createHash } from '../../src/lib/hash';
import loadConfig from '../../src/lib/load-config';
import { ConfigTypes } from '../../src/lib/types';

const cwd = pathJoin(__dirname, '../__fixtures/gql-compile');
const rel = (relPath: string) => pathJoin(cwd, relPath);

const dtsRelDir = 'node_modules/@types/graphql-let';
const libRelDir = 'node_modules/graphql-let';
const packageJsonContent = JSON.stringify({ types: 'index' }, null, 2);

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

const getPaths = (sourceRelPath: string, hash: string) => {
  const tsxGenFullDir = pathJoin(rel(libRelDir), '__generated__');
  const dtsGenFullDir = rel(dtsRelDir);
  // sourceRelPath: "pages/index.tsx"
  // "pages"
  const relDir = dirname(sourceRelPath);
  // ".tsx"
  const ext = extname(sourceRelPath);
  // "${cwd}/pages/index.tsx"
  const sourceFullPath = rel(sourceRelPath);
  // "index"
  const base = basename(sourceRelPath, ext);

  // "index-2345.tsx"
  const tsxBasename = `${base}-${hash}${ext}`;
  // "pages/index-2345.tsx"
  const tsxRelPath = pathJoin(relDir, tsxBasename);
  // "/Users/.../node_modules/graphql-let/__generated__/pages/index-2345.d.ts"
  const tsxFullPath = pathJoin(tsxGenFullDir, tsxRelPath);

  // "index-2345.d.ts"
  const dtsBasename = `${base}-${hash}.d.ts`;
  // "pages/index-2345.d.ts"
  const dtsRelPath = pathJoin(relDir, dtsBasename);
  // "/Users/.../node_modules/@types/graphql-let/pages/index-2345.d.ts"
  const dtsFullPath = pathJoin(dtsGenFullDir, dtsRelPath);
  // TODO
  return {
    sourceRelPath,
    sourceFullPath,
    tsxRelPath,
    tsxFullPath,
    dtsRelPath,
    dtsFullPath,
  };
};

describe('gql-compile', () => {
  it(
    'compiles',
    async () => {
      // throw new Error()

      // Prepare
      await mkdirp(join(cwd, dtsRelDir));
      await writeFile(join(cwd, dtsRelDir, 'package.json'), packageJsonContent);

      // Fixtures
      const schemaHashFixture = '234';
      const gqlContentsFixture = [
        `query Viewer {
    viewer {
        id
        name
        status
    }
}`,
      ];
      const sourceRelPath = 'pages/index.tsx';

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

      // Processes inside a sub-process of babel-plugin
      const storeFullPath = pathJoin(rel(dtsRelDir), 'store.json');
      const store = existsSync(storeFullPath)
        ? JSON.parse(await readFile(storeFullPath))
        : {};
      const targetStore = store[sourceRelPath] || (store[sourceRelPath] = {});

      type CodegenContext = {
        gqlContent: string;
        strippedGqlContent: string;
        gqlContentHash: string;
        sourceRelPath: string;
        sourceFullPath: string;
        tsxRelPath: string;
        tsxFullPath: string;
        dtsRelPath: string;
        dtsFullPath: string;
      }[];

      const codegenContext: CodegenContext = [];
      const skippedContext: CodegenContext = [];

      for (const gqlContent of gqlContentsFixture) {
        const strippedGqlContent = stripIgnoredCharacters(gqlContent);
        const gqlContentHash = createHash(
          schemaHashFixture + strippedGqlContent,
        );
        const context = {
          gqlContent,
          strippedGqlContent,
          gqlContentHash,
          ...getPaths(sourceRelPath, gqlContentHash),
        };
        if (targetStore[gqlContentHash]) {
          skippedContext.push(context);
        } else {
          codegenContext.push(context);
        }
      }

      // Codegen
      if (codegenContext.length) {
        for (const { strippedGqlContent, tsxFullPath } of codegenContext) {
          await generate(
            {
              cwd,
              schema: config.schema,
              documents: [strippedGqlContent],
              generates: {
                [tsxFullPath]: {
                  plugins: config.plugins,
                  config: config.config,
                },
              },
            },
            true,
          );
        }

        // Dts
        const dtsContents = genDts(
          codegenContext.map(({ tsxFullPath }) => tsxFullPath),
          config,
        );
        await makeDir(dirname(codegenContext[0].dtsFullPath));
        for (const [i, dtsContent] of dtsContents.entries()) {
          const {
            dtsFullPath,
            strippedGqlContent,
            gqlContentHash,
          } = codegenContext[i]!;
          targetStore[gqlContentHash] = strippedGqlContent;
          // const content = withHash(gqlHash, dtsContent);
          await writeFile(dtsFullPath, dtsContent);
        }
      }

      // Remove old caches
      for (const { gqlContentHash } of skippedContext) {
        delete targetStore[gqlContentHash];
        const { dtsFullPath } = getPaths(sourceRelPath, gqlContentHash);
        if (existsSync(dtsFullPath)) {
          await rimraf(dtsFullPath);
        }
      }

      await writeFile(storeFullPath, JSON.stringify(store, null, 2));

      // for (let {content} of codegenResults) {
      //   debugger
      // }

      // for (let hash of Object.keys(targetStore)) {
      //
      // }

      // const codegenOpts = await createCodegenOpts(config);

      //       const gqlContent = stripIgnoredCharacters(`query Viewer {
      //     viewer {
      //         id
      //         name
      //         status
      //     }
      // }`);

      // const gqlHash = createHash(schemaHashFixture + gqlContent);

      // const [ { content } ] = await generate(
      //   {
      //     cwd,
      //     schema: config.schema,
      //     documents: [ gqlContent ],
      //
      //     generates: {
      //       "boom.tsx": {
      //         plugins: config.plugins,
      //         config: config.config
      //       }
      //     }
      //   },
      //   false
      // );

      // await writeFile('out.tsx', content)

      // const ast = parse(content, {
      //     sourceType: "module",
      //     plugins: [ "typescript", "jsx" ]
      //   });
      // console.log(ast);
    },
    1000 * 1000,
  );
});
