const path = require('path');
const fs = require('fs');

const murmur = require('murmurhash');
const MultiMutex = require('multimutex');

class FileStat {
  constructor(name, timestamp) {
    this.name = name;
    this.timestamp = timestamp;
  }
}

const _requestHash = p => new Promise((accept, reject) => {
  const fileStats = [];
  let pending = 0;
  const pend = () => {
    if (--pending === 0) {
      _done();
    }
  };
  const _done = () => {
    const sortedFileStats = fileStats.sort((a, b) => a.name.localeCompare(b.name));
    const sortedFileTimestamps = sortedFileStats.map(fileStat => fileStat.timestamp);
    const s = sortedFileTimestamps.join(':');
    const h = murmur(s);
    accept(h);
  };
  const _recurseDirectory = p => {
    pending++;

    fs.readdir(p, (err, nodes) => {
      if (!err) {
        for (let i = 0; i < nodes.length; i++) {
          const node = nodes[i];
          _recurseNode(path.join(p, node));
        }

        pend();
      } else {
        reject(err);
      }
    });
  };
  const _recurseNode = p => {
    pending++;

    fs.lstat(p, (err, stats) => {
      if (!err) {
        if (stats.isFile()) {
          const fileStat = new FileStat(p, stats.mtime.getTime());
          fileStats.push(fileStat);
        } else if (stats.isDirectory()) {
          _recurseDirectory(p);
        }

        pend();
      } else {
        reject(err);
      }
    });
  };

  _recurseDirectory(p);
});

class FsHash {
  constructor({dataPath = path.join(__dirname, 'data.json')} = {}) {
    this.dataPath = dataPath;

    this.save = _debounce(this.save);

    this._data = {};
    this._mutex = new MultiMutex();
  }

  update(p, fn) {
    const {_data: data} = this;

    return this._mutex.lock(p)
      .then(unlock => _requestHash(p)
        .then(newHash => {
          const oldHash = data[p];

          if (newHash !== oldHash) {
            return Promise.resolve(fn(newHash, oldHash))
              .then(() => {
                data[p] = newHash;

                this.save();

                unlock();
              })
              .cache(err => {
                unlock();

                return Promise.reject(err);
              });
          } else {
            unlock();
          }
        })
      );
  }

  load() {
    return new Promise((accept, reject) => {
      const {dataPath} = this;

      fs.readFile(dataPath, 'utf8', (err, s) => {
        if (!err) {
          const j = JSON.parse(s);
          this._data = j;

          accept();
        } else {
          reject(err);
        }
      });
    });
  }

  save(next) {
    const {dataPath, _data: data} = this;

    fs.writeFile(dataPath, JSON.stringify(data), err => {
      if (err) {
        console.warn(err);
      }

      next();
    });
  }
}

const _debounce = fn => {
  let running = false;
  let queued = false;

  const _go = () => {
    if (!running) {
      running = true;

      fn(() => {
        running = false;

        if (queued) {
          queued = false;

          _go();
        }
      });
    } else {
      queued = true;
    }
  };
  return _go;
};

const _fshash = opts => {
  const fsHash = new FsHash(opts);

  return fsHash.load()
    .then(() => fsHash);
};

module.exports = _fshash;
