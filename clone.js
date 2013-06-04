
var tcp = require('min-stream-node/tcp.js');
var fetch = require('git-fetch');
var cat = require('min-stream/cat.js');
var pktLine = require('git-pkt-line');
var urlParse = require('url').parse;
var pathJoin = require('path').join;
var dirname = require('path').dirname;
var mkdirp = require('mkdirp');
var fs = require('fs');
var zlib = require('zlib');
var bops = require('bops');

if (process.argv.length < 3) {
  console.log("Usage: %s %s repo [target]\n", process.argv[0], process.argv[1]);
  process.exit(1);
}

var options = urlParse(process.argv[2]);
options.port = options.port ? parseInt(options.port, 10) : 9418;

if (options.protocol !== "git:") {
  throw new Error("Sorry, only git:// protocol is implemented so far");
}


var baseExp = /([^\/.]*)(\.git)?$/;
options.target = process.argv[3] || options.pathname.match(baseExp)[1];

console.log("Cloning into '%s'...", options.target);
tcp.connect(options.hostname, options.port, function (err, socket) {
  if (err) throw err;

  var request = "git-upload-pack " + options.pathname + "\0host=" + options.hostname + "\0";
  socket.sink(
    cat(
      [pktLine.frameHead(request), request],
      fetch(options, onStream)(
        socket.source
      )
    )
  );
});

function writeFile(path, data, callback) {
  if (!callback) callback = checkError;
  mkdirp(dirname(path), function (err) {
    if (err) return callback(err);
    fs.writeFile(path, data, callback);
  });
}

function onStream(err, sources) {
  if (err) throw err;
  var gitDir = pathJoin(options.target + ".git");
  var HEAD;
  Object.keys(sources.refs).forEach(function (ref) {
    var hash = sources.refs[ref];
    if (ref === "HEAD") {
      HEAD = hash;
      return;
    }
    if (/\^\{\}$/.test(ref)) return;
    writeFile(pathJoin(gitDir, ref), hash + "\n");
    if (hash === HEAD) {
      writeFile(pathJoin(gitDir, "HEAD"), "ref: " + ref + "\n");
      HEAD = undefined;
    }
  });
  consume(sources.line);
  consume(sources.progress, process.stdout.write.bind(process.stdout));
  consume(sources.error, process.stderr.write.bind(process.stderr));
  var total;
  var num = 0;
  consume(sources.objects, function (object, callback) {
    if (total === undefined) total = object.num + 1;
    ++num;
    // console.log(object);
    process.stdout.write("Receiving objects: " + Math.round(100 * num / total) + "% (" + num + "/" + total + ")\r");
    var dir = pathJoin(gitDir, "objects", object.hash.substr(0, 2));
    var path = pathJoin(dir, object.hash.substr(2));
    var body = bops.join([bops.from(object.type + " " + object.data.length + "\0"), object.data]);
    zlib.deflate(body, function (err, data) {
      if (err) return callback(err);
      writeFile(path, data, callback);
    });
  }, function (err) {
    if (err) throw err;
    throw "M"
    console.log("Receiving objects: 100% (" + total + "/" + total + "), done.\n");
  });
}

function checkError(err) {
  if (err) throw err;
}

// Eat all events in an async stream with optional onData callback.
function consume(read, onItem, callback) {
  if (!callback) {
    callback = checkError;
  }
  read(null, onRead);
  function onRead(err, item) {
    if (item === undefined) {
      callback(err);
    }
    else {
      if (onItem) {
        onItem(item, onWrite);
      }
      else {
        read(null, onRead);
      }
    }
  }
  function onWrite(err) {
    console.log("\nonWrite", err)
    if (err) {
      callback(err);
    }
    else {
      read(null, onRead);
    }
  }
}


var parsers = {
  tree: function (item) {
    var list = [];
    var data = item.data;
    var hash;
    var mode;
    var path;
    var i = 0, l = data.length;
    while (i < l) {
      var start = i;
      while (data[i++] !== 0x20);
      mode = parseInt(bops.to(bops.subarray(data, start, i - 1)), 8);
      start = i;
      while (data[i++]);
      path = bops.to(bops.subarray(data, start, i - 1));
      hash = bops.to(bops.subarray(data, i, i + 20), "hex");
      i += 20;
      list.push({
        mode: mode,
        path: path,
        hash: hash
      });
    }
    return list;
  },
  blob: function (item) {
    return item.data;
  },
  commit: function (item) {
    var data = item.data;
    var i = 0, l = data.length;
    var key;
    var items = {};
    while (i < l) {
      var start = i;
      while (data[i++] !== 0x20);
      key = bops.to(bops.subarray(data, start, i - 1));
      start = i;
      while (data[i++] !== 0x0a);
      items[key] = bops.to(bops.subarray(data, start, i - 1));
      if (data[i] === 0x0a) {
        items.message = bops.to(bops.subarray(data, i + 1)).trim();
        break;
      }
    }
    return items;
  },
};
parsers.tag = parsers.commit;

function parseObject(item) {
  var obj = {
    hash: item.hash
  };
  obj[item.type] = parsers[item.type](item);
  return obj;
}
