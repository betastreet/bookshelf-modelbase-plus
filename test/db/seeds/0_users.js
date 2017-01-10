'use strict'

const bookshelf = require('../').bookshelf;

exports.seed = (knex, Promise) => {
    let users = [
        {
            first_name: 'First Name User 0',
            last_name: 'Last Name User 0',
            email: 'email@user0.com',
            address: 'Address 0',
        },
        {
            first_name: 'First Name User 1',
            last_name: 'Last Name User 1',
            email: 'email@user1.com',
            balance: 100,
        },
        {
            first_name: 'First Name User 2',
            last_name: 'Last Name User 2',
            email: 'email@user2.com',
            address: 'Address 2'
        },
    ];

    return Promise.join(
        knex('users').del(),
        knex('users').insert(users)
    );
}
