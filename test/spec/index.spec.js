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
    // console.log('import.created fired: ', JSON.stringify(createdModel));
});

User.eventEmitter.on('import.updated', function(updatedModel, prevModel) {
    // console.log('import.updated fired: ', JSON.stringify(updatedModel), JSON.stringify(prevModel));
});

Array.prototype.it = function (description, testCaseFunction) {
  this.forEach((innerArray) => {
    it(description + ' ' + JSON.stringify(innerArray), () => {
      return testCaseFunction.apply(this, innerArray);
    });
  });
};

describe('database querying', () => {

    describe('base operations', () => {
        beforeEach(() => {
            return bookshelf.knex('users')
                .where('email', 'like', 'emailtest%')
                .del();
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

        it('should get list of a records', () => {
            return User
                .getList({}, User.columns)
                .then(models => expect(models.length).toBe(3));
        });

        it('should get filtered list of a records', (done) => {
            User
                .getList({ email: 'email@user1.com', limit: 1 }, User.columns)
                .then((models) => {
                    expect(models.length).toBe(1);
                    expect(models.at(0).get('first_name')).toBe('First Name User 1');
                    done();
                })
                .catch((err) => {
                    expect(1).toBe(err);
                    done();
                });
        });

        it('should get by null', () => {
          return User.getList({balance: null}, User.columns)
            .then(models => models.serialize())
            .then(users => expect(users).toHaveLength(2));
        });

        describe('complex filters', () => {
          const mapToEmailNum = u => parseInt(u.email.replace('email@user', '').replace('.com', ''));
          const userGetExp = (q, exp) => User.getList(q, User.columns)
            .then(models => expect(models
              .serialize()
              .map(u => mapToEmailNum(u)))
              .toEqual(exp));

          [
            ['email', '!=', 'email@user0.com', [1, 2]],
            ['email', 'NOT_EQUAL_TO', 'email@user0.com', [1, 2]],
            ['balance', '<', 101, [1]],
            ['balance', '<', 100, []],
            ['balance', 'LESS_THAN', 101, [1]],
            ['balance', 'LESS_THAN', 100, []],
            ['balance', '<=', 100, [1]],
            ['balance', '<=', 99, []],
            ['balance', 'LESS_THAN_OR_EQUAL_TO', 100, [1]],
            ['balance', 'LESS_THAN_OR_EQUAL_TO', 99, []],
            ['balance', '>', 99, [1]],
            ['balance', '>', 100, []],
            ['balance', 'GREATER_THAN', 99, [1]],
            ['balance', 'GREATER_THAN', 100, []],
            ['balance', '>=', 100, [1]],
            ['balance', '>=', 101, []],
            ['balance', 'GREATER_THAN_OR_EQUAL_TO', 100, [1]],
            ['balance', 'GREATER_THAN_OR_EQUAL_TO', 101, []],
            ['balance', '=', 100, [1]],
            ['balance', '=', 99, []],
            ['balance', 'EQUAL_TO', 100, [1]],
            ['balance', 'EQUAL_TO', 99, []],
            ['email', 'EQUAL_TO', 'email@user0.com', [0]],
            ['email', 'EQUAL_TO', 'email@u.com', []],
            ['email', 'LIKE', 'email%.com', [0,1,2]],
            ['email', 'LIKE', 'email@user0%', [0]],
            ['email', 'NOT_LIKE', 'email%.com', []],
            ['email', 'NOT_LIKE', 'email@user0%', [1, 2]],
            ['balance', 'between', [99, 101], [1]],
            ['balance', 'BETWEEN', [98, 99], []],
            ['balance', 'NOT_BETWEEN', [99, 101], []],
            ['balance', 'not_BETWEEN', [98, 99], [1]],
            ['email', 'IN', ['email@user0.com', 'email@user1.com'], [0, 1]],
            ['email', 'IN', ['email@.com'], []],
            ['email', 'NOT_IN', ['email@user0.com', 'email@user1.com'], [2]],
            ['email', 'NOT_IN', ['email@.com'], [0,1,2]],
          ].
          it('should filter operator', (key, operator, value, exp) => {
            return userGetExp({[key]: {operator, value}}, exp);
          });

          [
            ['balance', 'between', '99, 101', [1]],
            ['balance', 'BETWEEN', '98,99', []],
            ['balance', 'NOT_BETWEEN', '99, 101', []],
            ['balance', 'not_BETWEEN', '98, 99', [1]],
            ['email', 'IN', 'email@user0.com, , email@user1.com', [0, 1]],
            ['email', 'IN', 'email@.com,  ', []],
            ['email', 'NOT_IN', 'email@user0.com, email@user1.com', [2]],
            ['email', 'NOT_IN', 'email@.com', [0,1,2]],
          ].
          it('should split comma values to an array', (key, operator, value, exp) => {
            return userGetExp({[key]: {operator, value}}, exp);
          });

          it('should ignore unknown operators', () => {
            return userGetExp({email: ['unknown', 'email@user0.com'], balance: 100}, [1]);
          });

          [
            [['=', 100], [1]],
            [['=', 101], []],
            [['BETWEEN', [99, 200]], [1]],
          ].
          it('should filter with array instead of object', (balance, exp) => {
            return userGetExp({balance}, exp);
          });

          [
            [{email: 'email@user0.com', balance: ['=', 100]}, []],
            [{email: 'email@user1.com', balance: ['=', 100]}, [1]],
          ].
          it('should mix regular and complex search', (query, exp) => {
            return userGetExp(query, exp);
          });

          [
            [{email: 'email@user0.com', balance: 100, _logic: 'and'}, []],
            [{email: 'email@user0.com', balance: 100, _logic: 'UNKNOWN'}, []],
            [{email: 'email@user0.com', balance: 100}, []],
            [{email: 'email@user0.com', balance: 100, _logic: 'or' }, [0, 1]],
            [{email: 'email@user0.com', balance: ['between', [98, 101]], _logic: 'or' }, [0, 1]],
            [{email: 'email@user0.com', balance: ['between', [98, 101]], _logic: 'and' }, []],
            [{email: 'email@user0.com', balance: 100, address: 'Address 2', _logic: 'or' }, [0, 1, 2]],
          ].
          it('should support or/and logic', (query, exp) => {
            return userGetExp(query, exp);
          });

          [
            [{email: 'email@user0.com', _or: {email: 'email@user1.com'}}, [0, 1]],
            [{email: 'email@.com', _or: {email: 'email@user1.com'}}, [1]],
            [{email: 'email@user1.com', _and: {balance: ['!=', 100]}}, []],
            [{email: 'email@user1.com', _and: {balance: ['=', 100]}}, [1]],
            [{email: 'email@user0.com', _or: {email: 'email@user1.com', _and: {balance: 100}}}, [0, 1]],
            [{email: 'email@user0.com', _or: {email: 'email@user1.com', _and: {balance: 101}}}, [0]],
          ].
          it('should support nested or/and', (query, exp) => {
            return userGetExp(query, exp);
          });

          it('should support special withQuery functions', () => {
            return userGetExp({withQuery: 'firstName', fancy: 'First Name User 2'}, [2]);
          });
        });

        describe('update', () => {
          beforeEach(() => {
            const users = [
              {
                first_name: 'First Name User 0 Test',
                last_name: 'Last Name User 0 Test',
                email: 'emailtest@user0.com',
                address: 'Address Test 0',
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
                address: 'Address Test 2'
              },
            ];
            return User.importMany(users, User.columns);
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

          it('should not update an entry by composite pKey when no corresponding record exists', () => {
            return expect(User
              .updateOneByCompositePKey({ email: 'emailtestNONEXISTING@user1.com', address: 'Address to delete'}, User.columns))
              .rejects.toBe('NOT_FOUND');
          });

          it('should update an entry by id', () => {
            return User
              .getList({ email: 'emailtest@user2.com', limit: 1 }, User.columns)
              .then(models => User.updateOneById({ address: 'Address to delete' }, models.at(0).get('id'), User.columns))
              .then(updatedModel => expect(updatedModel.get('address')).toBe('Address to delete'));
          });

          it('should destroy an entry by composite key', () => {
            return User
              .destroyOneByCompositePKey({ email: 'emailtest@user0.com'})
              .then(cnt => expect(cnt).toBe(1));
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
            expect(User.destroyMany({where: { address: 'Address Test 0'}})).resolves.toBe(1)
          );
        });
    });

    describe('bulk operations', () => {
      beforeEach(() => Budget.bulkDestroy({ /* remove all */ }) );

      let data;
      beforeEach(() => {
        data = [
          { type: 'daily', external_id: 'EX11e7e55461949330ae6cf929028983d1', budget: 100 },
          { type: 'monthly', external_id: 'EX11e7e55461949330ae6cf929028983d1', budget: 200 },
        ];
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

      describe('bulkSync()', () => {
        it('should do bulk insert', async () => {
          const existing = await new Budget().fetchAll();
          const sync = await Budget.bulkSync(existing, _.cloneDeep(data), Budget.columns);
          expect(sync).toMatchObject({
            inserted: data,
            updated: [],
            destroyed: [],
            unchanged: [],
          });
          const rows = (await new Budget().fetchAll()).serialize();
          expect(rows).toMatchObject(data);
        });

        it('should do bulk destroy', async () => {
          await Budget.bulkInsert(_.cloneDeep(data));
          const existing = await new Budget().fetchAll();
          const existingRaw = existing.serialize();
          const sync = await Budget.bulkSync(existing, [existingRaw[0]], Budget.columns);
          expect(sync).toEqual({
            inserted: [],
            updated: [],
            destroyed: [existingRaw[1]],
            unchanged: [existingRaw[0]],
          });
          const rows = (await new Budget().fetchAll()).serialize();
          expect(rows).toMatchObject([existingRaw[0]]);
        });

        it('should do bulk update', async () => {
          await Budget.bulkInsert(_.cloneDeep(data));
          const existing = await new Budget().fetchAll();
          const updates = existing.serialize();
          updates[0].budget = 101;
          updates[1].external_id = 'EX11e7e55461949330ae6cf929028983d2';

          mockDb.mock(bookshelf.knex);
          tracker.install();
          tracker.on('query', function checkResult(query, num) {
            // console.log(query, num);
            switch(num) {
              case 1:
              case 2:
              case 3: return query.response(updates);
              case 4: return query.response(true);
            }
          });

          const sync = await Budget.bulkSync(existing, updates, Budget.columns);
          mockDb.unmock(bookshelf.knex);
          expect(JSON.stringify(sync)).toEqual(JSON.stringify({
            inserted: [],
            updated: updates,
            destroyed: [],
            unchanged: [],
          }));
        });
      });

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
        beforeAll(() => {
          mockDb.mock(bookshelf.knex);
          tracker.install();
        });
        afterAll(() => mockDb.unmock(bookshelf.knex));

        it('should do bulk updating', () => {
          const budgets = [
            { id: 'BU11e71949330aee55466cf929028983d1', type: 'daily', budget: 100 },
            { id: 'BU11e7194ee56cf92902899546330a83d1', type: 'monthly', budget: 200 },
            { type: 'weekly', budget: 300 },
          ];

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
    });
});
