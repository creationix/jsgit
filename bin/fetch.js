#!/usr/bin/env node
var git = require('git-node');
var program = require('commander');

program
  .usage('[options] [--] <url>')
  .option('--git-dir <dir>', 'Use custom git dir instead of cwd')
  .option('-q', 'Be quiet; don\t show progress')
  .parse(process.argv);

if (program.args.length !== 1) {
  program.outputHelp();
  process.exit(1);
}

var url = program.args[0];
var remote = git.remote(url);
var target = require('./root.js')(program);

var repo = git.repo(target);
var opts = {};
if (!program.Q) opts.onProgress = onProgress;
if (!program.Q) console.log("Fetching updates from %s to %s..", url, target);
repo.fetch(remote, opts, onDone);

function onProgress(progress) {
  process.stderr.write(progress);
}

function onDone() {
  if (!program.Q) console.log("Done.");
}
