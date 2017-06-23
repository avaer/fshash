const path = require('path');

const fshash = require('.');

fshash({
  dataPath: path.join('/', 'tmp', 'fshash-test.json'),
}).then(fsHash => {
  fsHash.update(__dirname, (newHash, oldHash) => {
    console.log('update', {newHash, oldHash});
  });
}).catch(err => {
  console.warn(err);
  process.exit(1);
});
