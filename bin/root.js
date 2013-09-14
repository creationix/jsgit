var path = require('path');
var existsSync = require('fs').existsSync;
var readFileSync = require('fs').readFileSync;
module.exports = function (program) {
  var target = path.resolve(process.cwd(), program.gitDir || '.');
  var head = path.join(target, "HEAD");
  if (!(existsSync(head) && (/^ref: /).test(readFileSync(head, "utf8")))) {
    console.error("Can't find bare repo at %s", target);
    process.exit(-1);
  }
  return target;  
};
