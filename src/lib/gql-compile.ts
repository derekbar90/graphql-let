import { generate } from '@graphql-codegen/cli';
// import { Types } from "@graphql-codegen/plugin-helpers";
import traverse from '@babel/traverse';
import makeDir from 'make-dir';
import { join as pathJoin, extname, basename, dirname } from 'path';
import { existsSync } from 'fs';
import { genDts } from './dts';
import { rimraf } from './file';
import mkdirp from 'mkdirp';
// TODO
import { createWriteStream } from 'fs';
import { stripIgnoredCharacters } from 'graphql';
import { parse, ParserOptions } from '@babel/parser';
import { readFile } from './file';
import { join } from 'path';
import createCodegenOpts from '../../src/lib/create-codegen-opts';
import { writeFile } from './file';
import { createHash } from './hash';
import loadConfig from '../../src/lib/load-config';
import { ConfigTypes } from './types';

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

const getPaths = (
  sourceRelPath: string,
  hash: string,
  dtsRelDir: string,
  libRelDir: string,
  cwd: string,
) => {
  const abs = (relPath: string) => pathJoin(cwd, relPath);

  const tsxGenFullDir = pathJoin(abs(libRelDir), '__generated__');
  const dtsGenFullDir = abs(dtsRelDir);
  // sourceRelPath: "pages/index.tsx"
  // "pages"
  const relDir = dirname(sourceRelPath);
  // ".tsx"
  const ext = extname(sourceRelPath);
  // "${cwd}/pages/index.tsx"
  const sourceFullPath = abs(sourceRelPath);
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
const parserOption: ParserOptions = {
  sourceType: 'module',
  plugins: ['typescript', 'jsx'],
};

import generator from '@babel/generator';

function appendExportAsObject(dtsContent: string) {
  const exportNames: string[] = [];

  function pushExportNames({ node }: any) {
    exportNames.push(node.id.name);
  }

  const dtsAST = parse(dtsContent, parserOption);
  traverse(dtsAST, {
    ExportNamedDeclaration(path: any) {
      path.traverse({
        VariableDeclarator: pushExportNames,
        TSTypeAliasDeclaration: pushExportNames,
        FunctionDeclaration: pushExportNames,
      });
    },
    Program: {
      exit(path) {
        const pairs = exportNames.map((e) => `${e}:${e}`).join(',');
        traverse(
          parse(
            `export declare type __AllExports = { ${pairs} };`,
            parserOption,
          ),
          {
            ExportNamedDeclaration({ node }) {
              const body = path.get('body');
              body[body.length - 1].insertAfter(node);
            },
          },
        );
      },
    },
  });

  const { code } = generator(dtsAST);
  return code;
}

export default async function gqlCompile({
  cwd,
  dtsRelDir,
  libRelDir,
}: {
  cwd: string;
  dtsRelDir: string;
  libRelDir: string;
}) {
  const abs = (relPath: string) => pathJoin(cwd, relPath);

  // throw new Error()
  // 'export declare type __ExportAsObject = {Maybe:Maybe,Exact:Exact,Omit:Omit,Scalars:Scalars,Query:Query,User:User,ViewerQueryVariables:ViewerQueryVariables,ViewerQuery:ViewerQuery,ViewerDocument:ViewerDocument,ViewerComponentProps:ViewerComponentProps,ViewerComponent:ViewerComponent,ViewerQueryHookResult:ViewerQueryHookResult,ViewerLazyQueryHookResult:ViewerLazyQueryHookResult,ViewerQueryResult:ViewerQueryResult};'

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
  const storeFullPath = pathJoin(abs(dtsRelDir), 'store.json');
  const store = existsSync(storeFullPath)
    ? JSON.parse(await readFile(storeFullPath, 'utf-8'))
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
    const gqlContentHash = createHash(schemaHashFixture + strippedGqlContent);
    const context = {
      gqlContent,
      strippedGqlContent,
      gqlContentHash,
      ...getPaths(sourceRelPath, gqlContentHash, dtsRelDir, libRelDir, cwd),
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
      const content = appendExportAsObject(dtsContent);
      await writeFile(dtsFullPath, content);
    }
  }

  // Remove old caches
  for (const { gqlContentHash } of skippedContext) {
    delete targetStore[gqlContentHash];
    const { dtsFullPath } = getPaths(
      sourceRelPath,
      gqlContentHash,
      dtsRelDir,
      libRelDir,
      cwd,
    );
    if (existsSync(dtsFullPath)) {
      await rimraf(dtsFullPath);
    }
  }

  // Update index.d.ts
  const dtsEntryFullPath = pathJoin(abs(dtsRelDir), 'index.d.ts');
  const writeStream = createWriteStream(dtsEntryFullPath);
  for (const { gqlContent, gqlContentHash, dtsRelPath } of codegenContext) {
    const chunk = `import T${gqlContentHash} from './${dtsRelPath}';
export declare function gql(gql: \`${gqlContent}\`): T${gqlContentHash}.__AllExports;
`;
    await new Promise((resolve) => writeStream.write(chunk, resolve));
  }

  // Update storeJson
  await writeFile(storeFullPath, JSON.stringify(store, null, 2));

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
}
