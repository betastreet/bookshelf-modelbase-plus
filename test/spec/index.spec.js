/* global jest */
/* global describe */
/* global beforeAll */
/* global beforeEach */
/* global it */
/* global expect */

jest.disableAutomock();

const mockDb = require('mock-knex');
const tracker = require('mock-knex').getTracker();

const bookshelf = require('../db').bookshelf;
const User = require('../db/models/user');
const Budget = require('../db/models/budget');
const _ = require('lodash');

User.eventEmitter.on('import.created', function(createdModel) {
    console.log('import.created fired: ', JSON.stringify(createdModel));
});

User.eventEmitter.on('import.updated', function(updatedModel, prevModel) {
    console.log('import.updated fired: ', JSON.stringify(updatedModel), JSON.stringify(prevModel));
});

describe('database querying', () => {

    describe('base operations', () => {
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

        it('should update an entry by composite pKey', (done) => {
            User
                .updateOneByCompositePKey({ email: 'emailtest@user1.com', address: 'Address to delete'}, User.columns)
                .then((updatedModel) => {
                    expect(updatedModel.get('address')).toBe('Address to delete');
                    done();
                })
                .catch((err) => {
                    expect(1).toBe(err);
                    done();
                });
        });

        it('should not update an entry by composite pKey when no corresponding record exists', (done) => {
            User
                .updateOneByCompositePKey({ email: 'emailtestNONEXISTING@user1.com', address: 'Address to delete'}, User.columns)
                .then((updatedModel) => {
                    expect(updatedModel.get('address')).toBe('Address to delete');
                    done();
                })
                .catch((err) => {
                    expect(err).toBe("NOT_FOUND");
                    done();
                });
        });

        it('should update an entry by id', (done) => {
            User
                .getList({ email: 'emailtest@user2.com', limit: 1 }, User.columns)
                .then((models) => {
                     User
                        .updateOneById({ address: 'Address to delete' }, models.at(0).get('id'), User.columns)
                        .then((updatedModel) => {
                            expect(updatedModel.get('address')).toBe('Address to delete');
                            done();
                        })
                        .catch((err) => {
                            expect(1).toBe(err);
                            done();
                        });
                })
                .catch((err) => {
                    expect(1).toBe(err);
                    done();
                });
        });


        it('should destroy an entry by composite key', (done) => {
            User
                .destroyOneByCompositePKey({ email: 'emailtest@user0.com'})
                .then((cnt) => {
                    expect(1).toBe(cnt);
                    done();
                })
                .catch((err) => {
                    expect(1).toBe(err);
                    done();
                });
        });

        it('should reject with NOT_FOUND error when deleting a nonexistent entry by composite key', (done) => {
            User
                .destroyOneByCompositePKey({ email: 'unknown-emailtest@user0.com'})
                .then(() => {
                    expect(true).toBeFalsy();
                    done();
                })
                .catch((err) => {
                    expect(err).toBe('NOT_FOUND');
                    done();
                });
        });

        it('should destroy many entries by where clause', () =>
            expect(User.destroyMany({where: { address: 'Address to delete'}})).resolves.toBe(2)
        );
    });

    describe('bulk operations', () => {
      beforeEach(() => Budget.bulkDestroy({ /* remove all */ }) );

      const data = [
        { type: 'daily', external_id: 'EX11e7e55461949330ae6cf929028983d1', budget: 100 },
        { type: 'monthly', external_id: 'EX11e7e55461949330ae6cf929028983d1', budget: 200 },
      ];

      describe('bulkInsert()', () => {
        it('should do bulk insertion', async () => {
          await Budget.bulkInsert(_.cloneDeep(data));
          const inserted = (await new Budget().fetchAll()).serialize();
          expect(inserted).toMatchObject([
            { type: 'daily', external_id: 'EX11e7e55461949330ae6cf929028983d1', budget: 100 },
            { type: 'monthly', external_id: 'EX11e7e55461949330ae6cf929028983d1', budget: 200 },
          ]);
        });

        it('should return a number of inserted rows', async () => {
          const insertedCount = await Budget.bulkInsert(_.cloneDeep(data));
          expect(insertedCount).toBe(2);
        });

        it('should return inserted records as objects in an array', async () => {
          const inserted = await Budget.bulkInsert(_.cloneDeep(data), { returnInserted: true });
          expect(inserted).toMatchObject([
            { type: 'daily', external_id: 'EX11e7e55461949330ae6cf929028983d1', budget: 100 },
            { type: 'monthly', external_id: 'EX11e7e55461949330ae6cf929028983d1', budget: 200 },
          ]);
        });
      });

      describe('bulkDestroy()', () => {
        it('should destroy multiple rows', async () => {
          await Budget.bulkInsert(_.cloneDeep(data));
          const inserted = (await new Budget().fetchAll()).serialize();
          // an intermediate check that records have been created
          expect(inserted).toMatchObject([
            { type: 'daily', external_id: 'EX11e7e55461949330ae6cf929028983d1', budget: 100 },
            { type: 'monthly', external_id: 'EX11e7e55461949330ae6cf929028983d1', budget: 200 },
          ]);
          await Budget.bulkDestroy({ external_id: 'EX11e7e55461949330ae6cf929028983d1' });
          const destroyed = (await new Budget().fetchAll()).serialize();
          expect(destroyed).toMatchObject([]);
        });
      });

      describe('bulkUpdate()', () => {
        it('should do bulk updating', () => {
          const budgets = [
            { id: 'BU11e71949330aee55466cf929028983d1', type: 'daily', budget: 100 },
            { id: 'BU11e7194ee56cf92902899546330a83d1', type: 'monthly', budget: 200 },
            { type: 'weekly', budget: 300 },
          ];
          mockDb.mock(bookshelf.knex);
          tracker.install();

          tracker.on('query', function checkResult(query, num) {
            // console.log(query, num);
            switch(num) {
              case 1:
                return query.response(budgets);
              case 2:
                return query.response(budgets);
              case 3:
                expect(query.sql).toMatch('on duplicate key update id=values(id),type=values(type),budget=values(budget)');
                return query.response(true);
            }
          });

          return Budget
            .fetchAll()
            // .tap(models => console.log(models.serialize()))
            .then(models => {
              const data = models.serialize();
              data[0].budget = 120;
              data[1].budget = 230;
              return data;
            })
            .then(data => Budget.bulkUpdate(data));
        });
      });

      describe('transactions', () => {
        it('should do many bulk operations in a transaction', async () => {
          const err = await bookshelf.knex
            .transaction(t => {
              return Budget
                .bulkDestroy(
                  { external_id: bookshelf.Model.prefixedUuidToBinary('EX11e7e55461949330ae6cf929028983d1', 2) },
                  { transacting: t }
                )
                .then(() => Promise.reject(new Error('whoops')))
                .then(() => Budget.bulkInsert(data, {transacting: t, returnInserted: true}))
            })
            .catch(e => e);
          expect(err.message).toBe('whoops');
        });
      });
    });
});
