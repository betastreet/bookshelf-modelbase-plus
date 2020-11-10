'use strict'

const fs = require('fs');
const config = require('./knexfile');
const knex = require('knex')(config.development);
const bookshelf = require('bookshelf')(knex);
const modelbase = require('../../lib');

// Install all necessary plugins
bookshelf.plugin(require('../../lib'));
bookshelf.plugin('pagination');
bookshelf.plugin(require('bookshelf-prefixed-ordered-uuid'));
const ModelBase = modelbase(bookshelf);

module.exports = {
  knex,
  bookshelf,
  ModelBase,
};

// Load all models
fs.readdirSync(`${__dirname}/models`)
  .forEach((model) => require(`${__dirname}/models/${model}`));
