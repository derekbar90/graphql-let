import { join as pathJoin } from 'path';
import gqlCompile from '../../src/lib/gql-compile';

const dtsRelDir = 'node_modules/@types/graphql-let';
const libRelDir = 'node_modules/graphql-let';

const cwd = pathJoin(__dirname, '../__fixtures/gql-compile');

describe('gql-compile', () => {
  it(
    'compiles',
    async () => {
      await gqlCompile({
        cwd,
        dtsRelDir,
        libRelDir,
      });
    },
    1000 * 1000,
  );
});
