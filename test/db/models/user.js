'use strict';

const { ModelBase } = require('../');

module.exports = ModelBase.extend({
    tableName: 'users',
    hasTimestamps: true,
    softDelete: true,
    firstName: (qb, query) => {
      return qb.where({first_name: query.fancy});
    },
});

module.exports.columns = ['id', 'first_name', 'last_name', 'email', 'address', 'balance', 'created_at', 'updated_at', 'deleted_at'];
module.exports.compositePKey = ['email'];
