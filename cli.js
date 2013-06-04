#!/usr/bin/env node

var program = require('commander');

program
  .version(require('./package.json').version)
  .command("clone [url] [options]", "Clone a remote repository from [url]")
  .command("checkout [ref]", "Checkout working directory to a named branch or tag for [ref]")
  .parse(process.argv);

