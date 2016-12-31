const path = require('path');
const fs = require('fs');
const events = require('events');
const EventEmitter = events.EventEmitter;

const murmur = require('murmurhash3');
const chokidar = require('chokidar');

class FileStat {
  constructor(name, timestamp) {
    this.name = name;
    this.timestamp = timestamp;
  }
}

const _watch = (p, lastHash = null) => {
  let live = true;

  let running = false;
  let queued = false;
  const _check = () => {
    if (!running) {
      running = true;

      const fileStats = [];
      let pending = 0;
      const pend = () => {
        if (--pending === 0) {
          done();
        }
      };
      const done = () => {
        const sortedFileStats = fileStats.sort((a, b) => a.name.localeCompare(b.name));
        const sortedFileTimestamps = sortedFileStats.map(fileStat => fileStat.timestamp);
        const s = sortedFileTimestamps.join(':');
        murmur.murmur32Hex(s, (err, h) => {
          if (live) {
            if (!err) {
              if (h !== lastHash) {
                result.emit('change', h);

                lastHash = h;
              }
            } else {
              console.warn(err);
            }

            running = false;
            if (queued) {
              queued = false;

              _check();
            }
          }
        });
      };
      const _recurseDirectory = p => {
        pending++;

        fs.readdir(p, (err, nodes) => {
          if (live) {
            if (err) {
              console.warn(err);

              nodes = [];
            }

            for (let i = 0; i < nodes.length; i++) {
              const node = nodes[i];
              _recurseNode(path.join(p, node));
            }

            pend();
          }
        });
      };
      const _recurseNode = p => {
        pending++;

        fs.lstat(p, (err, stats) => {
          if (live) {
            if (!err) {
              if (stats.isFile()) {
                const fileStat = new FileStat(p, stats.mtime.getTime());
                fileStats.push(fileStat);
              } else if (stats.isDirectory()) {
                _recurseDirectory(p);
              }
            } else {
              console.warn(err);
            }

            pend();
          }
        });
      };

      _recurseDirectory(p);
    } else {
      queued = true;
    }
  };

  const watcher = chokidar.watch(p);
  watcher.on('all', _check);

  _check();

  const result = new EventEmitter();
  result.destroy = () => {
    watcher.close();

    live = false;
  };
  return result;
};

module.exports = {
  watch: _watch,
};
