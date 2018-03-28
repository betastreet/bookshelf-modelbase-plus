'use strict';

const db = require('../');

db.bookshelf.plugin(require('bookshelf-prefixed-ordered-uuid'));

const ModelBase = require('bookshelf-modelbase')(db.bookshelf);

module.exports = ModelBase.extend({
    tableName: 'budgets',
    hasTimestamps: false,
    orderedUuids: {
        id: 'BU',
        external_id: 'EX',
    },
    //validate: {},
});

module.exports.columns = ['id', 'external_id', 'type', 'budget'];

