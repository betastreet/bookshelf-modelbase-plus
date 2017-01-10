'use strict';

exports.up = (knex) => knex.schema.createTable('users', (table) => {
    table.integer('id').primary()
    table.string('first_name')
    table.string('last_name')
    table.string('email').notNullable().unique()
    table.string('address')
    table.integer('balance').unsigned()
    table.timestamp('created_at').nullable().defaultTo(knex.fn.now())
    table.timestamp('updated_at').nullable().defaultTo(knex.fn.now())
    table.timestamp('deleted_at').nullable().defaultTo(knex.fn.now())
})

exports.down = (knex) => knex.schema.dropTable('users')
