#!/usr/bin/env node

var program = require('commander');

program
  .version(require('git-node').version)
  .command("ls-remote <url>", "List remote refs")
  .command("fetch <url>", "Clone or fetch updates from remote")
  .command("log", "Show local history")
  .command("export <target>", "Export tree at HEAD as real files to target")
  .command("switch <branch>", "Switch branch HEAD points to")
  .parse(process.argv);

if (process.argv.length < 3) {
  program.outputHelp();
  process.exit(1);
}

