#!/usr/bin/env node

var program = require('commander');

program
  .version(require('./package.json').version)
  .command("clone <repo>", "Clone a repository into a new directory")
  .command("checkout <ref>", "Checkout a branch to the working tree")
  .parse(process.argv);

