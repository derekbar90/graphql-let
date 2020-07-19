import { join } from 'path';
import runner from '@babel/helper-transform-fixture-test-runner';

runner(
  join(__dirname, '__fixtures/gql'),
  'gql',
  {},
  { sourceType: 'unambiguous' },
);
