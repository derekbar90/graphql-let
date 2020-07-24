import * as V481393 from "./node_modules/graphql-let/__generated__/input-481393.tsx";
// @ts-ignore
const {
  useViewerQuery
} = V481393;
export default function Viewer() {
  const {
    data
  } = useViewerQuery();
  if (data) return <div>{data.viewer.name}</div>;
}
