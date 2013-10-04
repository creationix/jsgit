#!/usr/bin/env node
var git = require('git-node');
var program = require('commander');
var basename = require('path').basename;
var existsSync = require('fs').existsSync;

program
  .usage('[options] [--] <url> [<dir>]')
  .option('--ref <branch/tag/ref>', 'checkout to specefic branch, tag, or ref')
  .option('--depth <num>', 'do a shallow clone with num commits deep')
  .option('-q', 'Be quiet; don\'t show progress')
  .parse(process.argv);

if (program.args.length < 1 || program.args.length > 2) {
  program.outputHelp();
  process.exit(1);
}

var url = program.args[0];
var remote = git.remote(url);
var target = program.args[1] || basename(remote.pathname, ".git") + ".git";
var repo = git.repo(target);
var opts = {};
if (!program.Q) opts.onProgress = onProgress;
if (program.ref) opts.want = program.ref;
if (program.depth) opts.depth = parseInt(program.depth, 10);
if (!program.Q) {
  if (existsSync(target)) {
    console.error("Fetching updates from %s to %s", url, target);
  }
  else {
    console.log("Cloning %s to %s..", url, target);
  }
}
repo.fetch(remote, opts, onDone);

function onProgress(progress) {
  process.stderr.write(progress);
}

function onDone() {
  if (program.ref) {
    repo.resolveHashish(program.ref, function (err, hash) {
      if (err) throw err;
      repo.updateHead(hash, function (err) {
        if (err) throw err;
      });
    });
  }
  if (!program.Q) console.log("Done.");
}
