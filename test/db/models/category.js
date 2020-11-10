'use strict';

const { ModelBase } = require('../');
const Joi = require('joi');

module.exports = ModelBase.extend({
  tableName: 'categories',
  hasTimestamps: false,
  validate: {
    external_id: Joi.number().min(1).required(),
    name: Joi.string().required(),
  },
});

module.exports.columns = ['id', 'external_id', 'name'];

