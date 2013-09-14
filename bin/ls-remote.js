#!/usr/bin/env node
var git = require('git-node');
var program = require('commander');

program
  .usage('<url>')
  .parse(process.argv);

if (program.args.length < 1 || program.args.length > 2) {
  program.outputHelp();
  process.exit(1);
}

if (program.args.length != 1) {
  program.outputHelp();
  process.exit(1);
}

var url = program.args[0];
var remote = git.remote(url);
remote.discover(function (err, refs) {
  if (err) throw err;
  Object.keys(refs).forEach(function (ref) {
    console.log(refs[ref] + "\t" + ref);
  });
  remote.close(function (err) {
    if (err) throw err;
  });
});
