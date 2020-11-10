'use strict';

const { ModelBase } = require('../');

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

