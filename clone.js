#!/usr/bin/env node

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
var crypto = require('crypto');
var streamToSink = require('min-stream-node/common.js').streamToSink;

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


function onStream(err, sources) {
  if (err) throw err;
  var gitDir = pathJoin(options.target, ".git");
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
  streamToSink(process.stdout, false)(sources.progress);
  streamToSink(process.stderr, false)(sources.error);
  var total;
  var num = 0;
  consume(sources.objects, function (object, callback) {
    if (total === undefined) total = object.num + 1;
    ++num;
    process.stdout.write("Receiving objects: " + Math.round(100 * num / total) + "% (" + num + "/" + total + ")\r");
    saveObject(gitDir, object, callback);
    // Stop reading when we've got all the objects.
    if (num === total) return false;
  }, function (err) {
    if (err) throw err;
    console.log("Receiving objects: 100% (" + total + "/" + total + "), done.");
    checkout(gitDir, "HEAD", checkError);
  });
}

function checkError(err) {
  if (err) throw err;
}

// Eat all events in an async stream with optional onData callback.
function consume(read, onItem, callback) {
  var close;
  if (!callback) {
    callback = checkError;
  }

  start();

  function start() {
    if (close === false) {
      callback();
    }
    else if (close) {
      read(close, callback);
    }
    else {
      read(null, onRead);
    }
  }

  function onRead(err, item) {
    if (item === undefined) {
      callback(err);
    }
    else {
      if (onItem) {
        close = onItem(item, onWrite);
      }
      else {
        start();
      }
    }
  }

  function onWrite(err) {
    if (err) {
      callback(err);
    }
    else {
      start();
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

function writeFile(path, data, callback) {
  if (!callback) callback = checkError;
  mkdirp(dirname(path), function (err) {
    if (err) return callback(err);
    fs.writeFile(path, data, callback);
  });
}

function sha1(buf) {
  return crypto
    .createHash('sha1')
    .update(buf)
    .digest('hex')
}

function hashToPath(gitDir, hash) {
  return pathJoin(gitDir, "objects", hash.substr(0, 2), hash.substr(2));
}

// Load the hash for a ref, supports recursive symbolic refs
function loadRef(gitDir, ref, callback) {
  fs.readFile(pathJoin(gitDir, ref), 'utf8', function (err, hash) {
    if (err) return callback(err);
    hash = hash.trim();
    if (hash.substr(0, 5) === "ref: ") {
      loadRef(gitDir, hash.substr(5), callback);
    }
    else {
      callback(null, hash);
    }
  });
}


// Save an object to the git filesystem, callback(err, hash) when done
function saveObject(gitDir, object, callback) {
  var body = bops.join([bops.from(object.type + " " + object.data.length + "\0"), object.data]);
  var hash = sha1(body);
  var path = hashToPath(gitDir, hash);
  zlib.deflate(body, function (err, data) {
    if (err) return callback(err);
    writeFile(path, data, function (err) {
      if (err) return callback(err);
      callback(null, hash);
    });
  });
}

// load a git object by hash, callback(err, object) when done
function loadObject(gitDir, hash, callback) {
  var path = hashToPath(gitDir, hash);
  fs.readFile(path, function (err, body) {
    if (err) return callback(err);
    zlib.inflate(body, function (err, body) {
      if (err) return callback(err);
      if (sha1(body) !== hash) return callback(new Error("SHA1 mismatch for " + path));
      var i = 0;
      var start = i;
      while (body[i++] !== 0x20);
      var type = bops.to(bops.subarray(body, start, i - 1));
      start = i;
      while (body[i++] !== 0x00);
      var size = parseInt(bops.to(bops.subarray(body, start, i - 1)), 10);
      callback(null, {
        hash: hash,
        type: type,
        size: size,
        data: bops.subarray(body, i)
      });
    });
  });

}


function checkout(gitDir, ref, callback) {
  loadRef(gitDir, ref, function (err, hash) {
    if (err) return callback(err);
    loadObject(gitDir, hash, function (err, object) {
      if (err) return callback(err);
      object = parseObject(object);
      loadObject(gitDir, object.commit.tree, function (err, object) {
        if (err) return callback(err);
        object = parseObject(object);
        loadTree(gitDir, dirname(gitDir), object.tree, callback);
      });
    });
  });
}

function loadTree(gitDir, base, files, callback) {
  var done = false;
  function finish(err) {
    if (done) return;
    done = true;
    callback(err);
  }
  var left = files.length;
  files.forEach(function (file) {
    loadObject(gitDir, file.hash, function (err, object) {
      if (err) return finish(err);
      var parsed = parseObject(object);
      var path = pathJoin(base, file.path);
      if (parsed.tree) {
        loadTree(gitDir, path, parsed.tree, onDone);
      }
      else if (parsed.blob) {
        mkdirp(dirname(path), function (err) {
          if (err) return finish(err);
          fs.writeFile(path, parsed.blob, {mode:file.mode}, onDone);
        });
      }
      else {
        finish(new Error("Invalid type found in tree: " + object.type));
      }
      function onDone(err) {
        if (err) return finish(err);
        if (!--left) finish();
      }
    });
  });
}

