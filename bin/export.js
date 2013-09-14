#!/usr/bin/env node
var git = require('git-node');
var program = require('commander');
var fs = require('fs');
var pathJoin = require('path').join;

program
  .usage('[options] [--] <dir>')
  .option('--ref <branch/tag/ref>', 'export from a specefic local branch, tag, or ref')
  .option('-q', 'Be quiet; don\t show progress')
  .option('--git-dir <dir>', 'Use custom git dir instead of cwd')
  .parse(process.argv);

if (program.args.length !== 1) {
  program.outputHelp();
  process.exit(1);
}

var target = program.args[0];
var ref = program.ref || "HEAD";
var source = require('./root.js')(program);
var repo = git.repo(source);
var read;
repo.treeWalk(ref, function (err, stream) {
  if (err) throw err;
  read = stream.read;
  return read(onEntry);
});

function onEntry(err, entry) {
  if (err) throw err;
  if (!entry) return;
  var path = pathJoin(target, entry.path);
  if (!program.Q) {
    var colorPath = "\x1B[34m" + path.replace(/\//g, "\x1B[1;34m/\x1B[0;34m") + "\x1B[0m";
    console.log("%s %s", entry.hash, colorPath);
  }
  if (entry.type === "tree") {
    return fs.mkdir(path, onDone);
  }
  if (entry.type === "blob") {
    return fs.writeFile(path, entry.body, onDone);
  }
  return read(onEntry);
}

function onDone(err) {
  if (err) throw err;
  return read(onEntry);
}
