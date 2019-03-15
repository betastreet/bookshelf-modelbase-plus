'use strict';

const db = require('../');
const Joi = require('joi');

db.bookshelf.plugin(require('bookshelf-prefixed-ordered-uuid'));

const ModelBase = require('bookshelf-modelbase')(db.bookshelf);

module.exports = ModelBase.extend({
  tableName: 'categories',
  hasTimestamps: false,
  validate: {
    external_id: Joi.number().min(1).required(),
    name: Joi.string().required(),
  },
});

module.exports.columns = ['id', 'external_id', 'name'];

