const {default: generator} = require('@babel/generator');
const {types} = require('@babel/core');
const {
  importDeclaration, importSpecifier, valueToNode, identifier,
  importDefaultSpecifier,
  importNamespaceSpecifier,
} = types;

const v = importDeclaration([
  importNamespaceSpecifier(identifier('blaa'))
], valueToNode('./xx/yeah'));

const {code} = generator(v);
console.log(code);
