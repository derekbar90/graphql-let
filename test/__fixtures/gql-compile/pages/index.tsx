import gql from 'graphql-let';

const { useViewerQuery } = gql(`query Viewer {
    viewer {
        id
        name
        status
    }
}`);
