'use strict';

exports.up = (knex) => knex.schema.createTable('budgets', (table) => {
    table.binary('id', 18).primary();
    table.binary('external_id', 18).nullable().defaultTo(null);
    table.string('type', 50).notNull();
    table.decimal('budget', 12, 2).notNull().defaultTo(100);
});

exports.down = (knex) => knex.schema.dropTable('budgets');
