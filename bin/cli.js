#!/usr/bin/env node

var program = require('commander');

program
  .version(require('js-git/package.json').version)
  .command("clone <url>", "Clone a repository into a new directory")
  .command("ls-remote <url>", "List remote refs")
  .parse(process.argv);

if (process.argv.length < 3) {
  program.outputHelp();
  process.exit(1);
}

