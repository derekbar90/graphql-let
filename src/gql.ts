import { types, ConfigAPI, PluginObj, NodePath } from '@babel/core';
import * as t from '@babel/types';
import { relative, dirname } from 'path';
import { declare } from '@babel/helper-plugin-utils';
import { parseExpression } from '@babel/parser';
import doSync from 'do-sync';
// import parseLiteral from 'babel-literal-to-ast';
// import gql from 'graphql-tag';
import createDebug from 'debug';
import { GqlCodegenContext, GqlCompileArgs } from './lib/gql-compile';
// import { stripIgnoredCharacters } from 'graphql';

// import * as xx from './lib/file';

// const { readFile } = xx;

const debug = createDebug('babel-plugin-graphql-tag');
const {
  cloneDeep,
  isIdentifier,
  isMemberExpression,
  isImportDefaultSpecifier,
  variableDeclaration,
  variableDeclarator,
  memberExpression,
  callExpression,
  identifier,
  importDeclaration,
  importNamespaceSpecifier,
  valueToNode,
} = types;

// eslint-disable-next-line no-restricted-syntax
const uniqueFn = parseExpression(`
  (definitions) => {
    const names = {};
    return definitions.filter(definition => {
      if (definition.kind !== 'FragmentDefinition') {
        return true;
      }
      const name = definition.name.value;
      if (names[name]) {
        return false;
      } else {
        names[name] = true;
        return true;
      }
    });
  }
`);

const gqlCompileSync = doSync(
  async ({
    hostDirname,
    ...gqlCompileArgs
  }: GqlCompileArgs & { hostDirname: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { join } = require('path');
    const modulePath = join(hostDirname, '../dist/lib/gql-compile');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { gqlCompile } = require(modulePath);
    return await gqlCompile(gqlCompileArgs);
  },
);

// function compile(...args: any[]): any {}

const configFunction = (api: ConfigAPI, options: any): PluginObj<any> => {
  api.assertVersion(7);
  const {
    importName = 'graphql-let',
    onlyMatchImportSuffix = false,
    // strip = false,
  } = options;

  // return {
  //   visitor: {
  //     Program(_path: any) {
  //       const x = timeoutSync(__dirname);
  //       console.log(x);
  //     },
  //   },
  // };

  // const compile = (path: any, uniqueId) => {
  //   const source = path.node.quasis.reduce((head, quasi) => {
  //     return head + quasi.value.raw;
  //   }, '');
  //
  //   const expressions = path.get('expressions');
  //
  //   expressions.forEach((expr) => {
  //     if (!isIdentifier(expr) && !isMemberExpression(expr)) {
  //       throw expr.buildCodeFrameError(
  //         'Only identifiers or member expressions are allowed by this plugin as an interpolation in a graphql template literal.',
  //       );
  //     }
  //   });
  //
  //   debug('compiling a GraphQL query', source);
  //
  //   const queryDocument = gql(strip ? stripIgnoredCharacters(source) : source);
  //
  //   // If a document contains only one operation, that operation may be unnamed:
  //   // https://facebook.github.io/graphql/#sec-Language.Query-Document
  //   if (queryDocument.definitions.length > 1) {
  //     for (const definition of queryDocument.definitions) {
  //       if (!definition.name) {
  //         throw new Error('GraphQL query must have name.');
  //       }
  //     }
  //   }
  //
  //   const body = parseLiteral(queryDocument);
  //   let uniqueUsed = false;
  //
  //   if (expressions.length) {
  //     const definitionsProperty = body.properties.find((property) => {
  //       return property.key.value === 'definitions';
  //     });
  //
  //     const definitionsArray = definitionsProperty.value;
  //
  //     const extraDefinitions = expressions.map((expr) => {
  //       return memberExpression(expr.node, identifier('definitions'));
  //     });
  //
  //     const allDefinitions = callExpression(
  //       memberExpression(definitionsArray, identifier('concat')),
  //       extraDefinitions,
  //     );
  //
  //     definitionsProperty.value = callExpression(uniqueId, [allDefinitions]);
  //
  //     uniqueUsed = true;
  //   }
  //
  //   debug('created a static representation', body);
  //
  //   return [body, uniqueUsed];
  // };

  return {
    visitor: {
      Program(programPath: NodePath<t.Program>, state: any) {
        const { cwd } = state;
        const sourceFullPath = state.file.opts.filename;
        const sourceRelPath = relative(cwd, sourceFullPath);

        const tagNames: string[] = [];
        const pendingDeletion: any[] = [];
        const gqlCallExpressionPaths: [
          NodePath<t.CallExpression>,
          string,
        ][] = [];
        const uniqueId = programPath.scope.generateUidIdentifier('unique');
        const uniqueUsed = false;
        let hasError = false;

        programPath.traverse({
          ImportDeclaration(path: NodePath<t.ImportDeclaration>) {
            const pathValue = path.node.source.value;
            if (
              onlyMatchImportSuffix
                ? pathValue.endsWith(importName)
                : pathValue === importName
            ) {
              const defaultSpecifier = path.node.specifiers.find(
                (specifier: any) => {
                  return isImportDefaultSpecifier(specifier);
                },
              );

              if (defaultSpecifier) {
                tagNames.push(defaultSpecifier.local.name);
                pendingDeletion.push({
                  defaultSpecifier,
                  path,
                });
              }
            }
          },
          CallExpression(path: NodePath<t.CallExpression>) {
            if (
              tagNames.some((name) => {
                return isIdentifier(path.node.callee, { name });
              })
            ) {
              try {
                const args = path.get('arguments');
                if (args.length !== 1)
                  throw new Error(
                    `The argument must be a single string value.`,
                  );
                let value = '';
                path.traverse({
                  TemplateLiteral(path: NodePath<t.TemplateLiteral>) {
                    if (path.node.quasis.length !== 1)
                      throw new Error(
                        `TemplateLiteral of the argument must not contain arguments.`,
                      );
                    value = path.node.quasis[0].value.raw;
                  },
                  StringLiteral(path: NodePath<t.StringLiteral>) {
                    value = path.node.value;
                  },
                });
                if (!value) throw new Error('never');
                gqlCallExpressionPaths.push([path, value]);
                // debug('quasi', path.node.quasi);
                // const [body, used] = compile(path.get('quasi'), uniqueId);
                // uniqueUsed = uniqueUsed || used;
                // path.replaceWith(body);
              } catch (error) {
                // eslint-disable-next-line no-console
                console.error('error', error);
                hasError = true;
              }
            }
          },
        });

        // TODO: Handle error

        const rv: GqlCodegenContext = gqlCompileSync({
          cwd,
          sourceRelPath,
          hostDirname: __dirname,
          gqlContents: gqlCallExpressionPaths.map(([_, value]) => value),
          libRelDir: 'node_modules/graphql-let',
          dtsRelDir: 'node_modules/@types/graphql-let',
          schemaHash: 'TODO',
        });
        if (gqlCallExpressionPaths.length !== rv.length)
          throw new Error('what');

        for (const [
          i,
          [callExpressionPath],
        ] of gqlCallExpressionPaths.entries()) {
          const { gqlContentHash, tsxFullPath } = rv[i]!;
          const tsxRelPathFromSource =
            './' + relative(dirname(sourceFullPath), tsxFullPath);

          const localVarName = `V${gqlContentHash}`;

          const importNode = importDeclaration(
            [importNamespaceSpecifier(identifier(localVarName))],
            valueToNode(tsxRelPathFromSource),
          );

          programPath.unshiftContainer('body', importNode);
          callExpressionPath.replaceWithSourceString(localVarName);
        }

        console.log(rv);

        // Only delete import statement or specifier when there is no error
        if (!hasError) {
          for (const {
            defaultSpecifier,
            path: pathForDeletion,
          } of pendingDeletion) {
            if (pathForDeletion.node.specifiers.length === 1) {
              pathForDeletion.remove();
            } else {
              // TODO what's going on
              pathForDeletion.node.specifiers = pathForDeletion.node.specifiers.filter(
                (specifier: any) => {
                  return specifier !== defaultSpecifier;
                },
              );
            }
          }
        }

        // if (uniqueUsed) {
        //   programPath.unshiftContainer(
        //     'body',
        //     variableDeclaration('const', [
        //       variableDeclarator(uniqueId, cloneDeep(uniqueFn)),
        //     ]),
        //   );
        // }
      },
    },
  };
};

export default declare(configFunction);
