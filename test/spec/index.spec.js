'use strict'

jest.autoMockOff();

const bookshelf = require('../db').bookshelf;
const User = require('../db/models/user');

describe('database querying', () => {

    beforeAll((done) => {
        // making sure test data is removed, afterAll will not trigger in case
        // of test faliures
        bookshelf.knex('users').whereIn('email', [
            'emailtest@user0.com',
            'emailtest@user1.com',
            'emailtest@user2.com',
            'emailtest@user3.com',
        ])
        .del()
        .then(() => {
            done();
        });
    });

    let id = null;
    it('should create a record', (done) => {
        User
            .createOne({
                first_name: 'Peter',
                last_name: 'Gregory',
                balance: 16000,
                address: 'Mountain View, CA',
                email: 'emailtest@user3.com',
            }, User.columns)
            .then((model) => {
                id = model.get('id');
                expect(model.get('first_name')).toBe('Peter');
                expect(model.get('last_name')).toBe('Gregory');
                expect(model.get('balance')).toBe(16000);
                done();
            });
    });


    it('should import set of records', (done) => {
        let users = [
            {
                first_name: 'First Name User 0 Test',
                last_name: 'Last Name User 0 Test',
                email: 'emailtest@user0.com',
                address: 'Address 0',
            },
            {
                first_name: 'First Name User 1 Test',
                last_name: 'Last Name User 1 Test',
                email: 'emailtest@user1.com',
                balance: 100,
            },
            {
                first_name: 'First Name User 2 Test',
                last_name: 'Last Name User 2 Test',
                email: 'emailtest@user2.com',
                address: 'Address 2'
            },
        ];

        User
            .importMany(users, User.columns)
            .then((rowsCount) => {
                expect(rowsCount).toBe(3);
                done();
            })
            .catch((err) => {
                expect(1).toBe(err);
                done();
            });
    });

    it('should get list of a records', (done) => {
        User
            .getList({}, User.columns)
            .then((models) => {
                expect(models.length).toBe(7);
                done();
            })
            .catch((err) => {
                expect(1).toBe(err);
                done();
            });
    });

    it('should get filtered list of a records', (done) => {
        User
            .getList({ email: 'emailtest@user1.com', limit: 1 }, User.columns)
            .then((models) => {
                expect(models.length).toBe(1);
                expect(models.at(0).get('first_name')).toBe('First Name User 1 Test');
                done();
            })
            .catch((err) => {
                expect(1).toBe(err);
                done();
            });
    });
});
