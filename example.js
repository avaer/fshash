const path = require('path');

const fshash = require('.');

fshash({
  dataPath: path.join('/', 'tmp', 'fshash-test.json'),
}).update(__dirname, (newHash, oldHash) => {
  console.log('update', {newHash, oldHash});
});
