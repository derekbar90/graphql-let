module.exports = function alert() {
  console.error(`[graphql-let] Please compile the source by Babel to inject the result of Graphql Code Generator. Configure it as:
{
  "plugins": [ "graphql-let/babel" ]
}
`)
};
