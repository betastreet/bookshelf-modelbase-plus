'use strict';

const db = require('../');

const ModelBase = require('bookshelf-modelbase')(db.bookshelf);

module.exports = ModelBase.extend({
    tableName: 'users',
    hasTimestamps: true,
    softDelete: true,
});

module.exports.columns = ['id', 'first_name', 'last_name', 'email', 'address', 'balance', 'created_at', 'updated_at', 'deleted_at'];
module.exports.compositePKey = ['email'];
