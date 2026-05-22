function mkdirp(client, path, callback) {
  const parts = path.split('/').filter(Boolean);
  let current = '';

  function createNext(index) {
    if (index >= parts.length) return callback(null);

    current += '/' + parts[index];
    client.exists(current, (err, stat) => {
      if (err) return callback(err);
      if (stat) {
        createNext(index + 1);
      } else {
        client.create(current, (err2) => {
          if (err2 && err2.getCode && err2.getCode() !== -110) {
            // -110 = NODE_EXISTS
            return callback(err2);
          }
          createNext(index + 1);
        });
      }
    });
  }

  createNext(0);
}

module.exports = mkdirp;
