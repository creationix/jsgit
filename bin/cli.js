#!/usr/bin/env node

var program = require('commander');

program
  .version(require('git-node').version)
  .command("ls-remote <url>", "List remote refs")
  .command("clone <url>", "Clone a repository into a new directory")
  .command("log", "Show local history")
  .command("export <target>", "Export tree at HEAD as real files to target")
  .command("fetch <url>", "Fetch updates from remote")
  .command("switch <branch>", "Switch branch HEAD points to")
  .parse(process.argv);

if (process.argv.length < 3) {
  program.outputHelp();
  process.exit(1);
}

