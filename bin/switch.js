#!/usr/bin/env node

var program = require('commander');

program
  .version(require('./package.json').version)
  .usage('ref')
  .parse(process.argv);

throw new Error("TODO: Implement checkout command");