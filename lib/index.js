const _ = require('lodash');
const EventEmitter = require('events');
const Promise = require('bluebird');
const Joi = require('joi');

class BookshelfModelBasePlusEventEmitter extends EventEmitter {}
// A static event emitter
const eventEmitter = new BookshelfModelBasePlusEventEmitter();
const DEFAULT_TIMESTAMP_KEYS = ['created_at', 'updated_at'];


/**
 * @param {Bookshelf} bookshelf
 */
module.exports = (bookshelf) => {
    // Extends the default model class
    const bookshelfModel = bookshelf.Model;
    bookshelf.Model = bookshelf.Model.extend({
        constructor: function () {
          bookshelfModel.apply(this, arguments);
          // modelbase plugin adds a 'saving' listener this.validateSave
          // and transforms the this.validate object if exists, so that here we have validation rules compatible with Joi
          if (this.validate) {
            this.removeListener('saving', this.validateSave);
            this.on('saving', this.validateSaveAdvanced);
            // it's impossible to override the validateSave method using same name
            // (we should set method context via .bind(this) but it seems like Bookshelf does that automatically)
            this.validateSave = this.validateSaveAdvanced;
          }
        },
        saveAttributes: function (attrs) {
            this._savedAttributes = Object.assign(
                {}, attrs !== undefined ? attrs : this.attributes
            );
            this._previousAttributes = Object.assign({}, this._savedAttributes);
            this.changed = Object.create(null);
            this.set(this.attributes); /* to rebuild 'changed' */
            return Object.assign({}, this._savedAttributes);
        },
        getSavedAttribues: function() { return this.getSavedAttributes(); }, /* backward compatibility for typo */
        getSavedAttributes: function () {
            if (this._savedAttributes === undefined) {
                this._savedAttributes = Object.assign({}, this._previousAttributes || {});
            }
            return Object.assign({}, this._savedAttributes);
        },
        getAttributes: function () {
            return Object.assign({}, this.attributes);
        },
        validateSaveAdvanced: function (model, attrs_bs, options) {
          const attrs = _.get(model, 'changed', attrs_bs); // https://github.com/bookshelf/bookshelf/pull/1934
          let validation;
          // we'll set { abortEarly: false } Joi option by default
          const validationOptions = Object.assign({ abortEarly: false }, this.validationOptions || {});
          // model is not new or update method explicitly set
          if ((model && !model.isNew() && _.get(options, 'method') !== 'insert') || (options && (options.method === 'update' || options.patch === true))) {
            const schemaKeys = this.validate._inner.children.map(function (child) {
              return child.key
            });
            const presentKeys = Object.keys(attrs);
            const optionalKeys = _.difference(schemaKeys, presentKeys);
            // only validate the keys that are being updated
            validation = Joi.validate(
              attrs,
              optionalKeys.length
                // optionalKeys() doesn't like empty arrays
                ? this.validate.optionalKeys(optionalKeys)
                : this.validate,
              validationOptions
            );
          } else {
            validation = Joi.validate(this.attributes, this.validate, validationOptions);
          }

          if (validation.error) {
            validation.error.tableName = this.tableName;

            throw validation.error
          } else {
            this.set(validation.value);
            return validation.value
          }
        }
    }, {
        EMPTY_REQUEST: 'EMPTY_REQUEST',
        SERVER_ERROR: 'SERVER_ERROR',
        NOT_FOUND: 'NOT_FOUND',
        VALIDATION_ERROR: 'VALIDATION_ERROR',
        columnsError: 'Columns should be an array like [\'id\', \'name\', \'status\']',
        compositePKey: ['id'],
        operators: {
          '!=': '!=',
          'NOT_EQUAL_TO': '!=',
          '<': '<',
          'LESS_THAN': '<',
          '<=': '<=',
          'LESS_THAN_OR_EQUAL_TO': '<=',
          '>': '>',
          'GREATER_THAN': '>',
          '>=': '>=',
          'GREATER_THAN_OR_EQUAL_TO': '>=',
          '=': '=',
          'EQUAL_TO': '=',
          'IS': 'IS',
          'IS_NOT': 'IS NOT',
          'IS NOT': 'IS NOT',
          'LIKE': 'LIKE',
          'NOT_LIKE': 'NOT LIKE',
          'NOT LIKE': 'NOT LIKE',
          'BETWEEN': 'andWhereBetween',
          'NOT_BETWEEN': 'andWhereNotBetween',
          'NOT BETWEEN': 'andWhereNotBetween',
          'IN': 'IN',
          'NOT_IN': 'NOT IN',
          'NOT IN': 'NOT IN',
        },
        getListParams: [
          'withRelated',
          'debug',
          'limit',
          'page',
          'paginate',
          'order_by',
          'withQuery',
          'select',
        ],
        eventEmitter,
        getList: function (options, columns) {
            options = options || {};
            return new Promise((resolve, reject) => {
              this.getListQuery(options, columns)
                  .then((q) => {
                    const limited = `${options.limit}` !== '-1';
                    const paginate = _.isNil(options.paginate) || (options.paginate && options.paginate !== '0');
                    return q[(!limited || !paginate) ? 'fetchAll' : 'fetchPage'](_.extend({
                      pageSize: options.limit || 10,
                      page: options.page || 1,
                      // columns: set by toSearch() using knex.select
                    }, _.pick(options, ['withRelated', 'debug'])));
                  })
                  .then(models => resolve(models))
                  .catch(reject);
            });
        },

        getListQuery: function (options, columns) {
            return new Promise((resolve, reject) => {
                columns = columns || this.columns;
                if (!columns || !Array.isArray(columns)) {
                    reject(this.columnsError);
                }
                options = options || {};
                options.order_by = options.order_by || '';
                const q = this
                    .query(qb => this.toSearch(options, columns, qb));
                if (options.order_by || options.order_by === '') {
                  q.orderBy(options.order_by || new this().idAttribute || 'id');
                }
                if (options.select) {
                  const selectArr = _.isString(options.select) ? options.select.split(',') : _.castArray(options.select);
                  q.query(qb => selectArr.forEach(s => qb.select(s)));
                }
                if (`${options.limit}` !== '-1') {
                  q.query((qb) => {
                    const limit = options.limit || 10;
                    return qb.limit(limit).offset(limit * ((options.page || 1) - 1));
                  });
                }
                if (options.debug) {
                  q.query(qb => console.log(qb.toString()));
                }
                resolve(q);
            });
        },

        toSearch: function(options, columns, searchChain) {
          columns = columns || this.columns;
          const tableName = (new this()).tableName;
          const orAnd = ['_or', '_and'];
          const filterNested = _.pick(options, columns.concat(orAnd, 'withQuery'));
          const filter = _.pick(filterNested, columns);
          const whereVals = _.pickBy(filter, c => !_.isPlainObject(c) && !_.isArray(c));
          _.forEach(whereVals, (v, k) => whereVals[k] = this.sanitizeVal(k, v));
          const search = _.reduce(filterNested, (chain, item, key) => {
            let operator, value;
            if (orAnd.indexOf(key) >= 0) {
              const bsThis = this;
              const orAndItems = _.isArray(item) ? item : [item];
              return _.reduce(orAndItems, (c, i) => c[key === orAnd[0] ? 'orWhere' : 'andWhere'](function () {
                return bsThis.toSearch(i, columns, this);
              }), chain);
            } else if (key === 'withQuery') {
              return this.withQuery(searchChain, options, item);
            } else if (_.isPlainObject(item)) {
              operator = item.operator;
              value = item.value;
            } else if (_.isArray(item) && item.length == 2) {
              operator = item[0];
              value = item[1];
            }
            operator = `${operator}`.toUpperCase();
            if (!(operator in this.operators) || value === undefined) {
              return chain;
            }
            operator = this.operators[operator];
            value = this.sanitizeVal(key, value, operator);
            // between is special:
            if (_.isArray(value) && operator in searchChain) {
              const searchMethod = options._logic === 'or' ? operator.replace('and', 'or') : operator;
              return searchChain[searchMethod](`${tableName}.${key}`, value);
            }
            return searchChain[options._logic === 'or' ? 'orWhere' : 'andWhere'](`${tableName}.${key}`, operator, value);
          }, this.whereQuery(searchChain, whereVals, options._logic));
          return search;
        },

        withQuery: function(searchChain, options, specialFn) {
          const model = new this();
          specialFn = _.isString(specialFn) ? specialFn.split(',') : specialFn;
          return _.reduce(specialFn, (chain, fn) => {
            if (fn in model) {
              return model[fn](chain, options);
            }
            throw new Error(`could not search withQuery ${fn}`);
          }, searchChain);
        },

        whereQuery: function(searchChain, whereVals, logic) {
          if (logic === 'none') {
            return searchChain;
          }
          const tableName = (new this()).tableName;
          const chainMethod = (logic === 'or') ? 'orWhere' : 'where';
          return _.reduce(whereVals, (chain, v, k) => chain[chainMethod](`${tableName}.${k}`, v), searchChain);
        },

        sanitizeVal: function(key, val, operator = null) {
          if (_.isString(val) && ['IN', 'NOT IN', 'andWhereBetween', 'andWhereNotBetween'].indexOf(operator) >= 0) {
            // split on ',' but exclude '\,'
            const parts = val.match(/(?:[^,\\]|\\.)+/g);
            if (parts.length > 1) {
              val = parts.map(p => p.trim()).filter(p => !!p);
            } else {
              val = [val];
            }
          }

          if (['IN', 'NOT IN'].indexOf(operator) >= 0 && !_.isArray(val)) {
            val = [val];
          }

          if (_.isArray(val)) {
            return val.map(v => this.sanitizeVal(key, v));
          } else if (_.isString(val)) {
            const model = new this();
            const str = val.toLowerCase();
            const maps = {
              'null': null,
              'true': true,
              'false': false,
            };
            const safeVal = str in maps ? maps[str] : val;
            if (model.orderedUuids && key in model.orderedUuids) {
              return safeVal ? bookshelf.Model.prefixedUuidToBinary(safeVal, 2) : null;
            }
            return safeVal;
          }
          return val;
        },

        createOne: function (options, createColumns) {
            return new Promise((resolve, reject) => {
                createColumns = createColumns || this.columns;
                if (!createColumns || !Array.isArray(createColumns)) {
                    reject(this.columnsError);
                }
                const data = _.pick(options, createColumns);
                this
                    .create(data, { method: 'insert' })
                    .then((model) => {
                        if (model) {
                            return this.findById(model.get(model.idAttribute));
                        }
                        return model;
                    })
                    .then((model) => {
                        resolve(model);
                    })
                    .catch(reject);
            });
        },

        updateOne: function (options, updateColumns) {
            return new Promise((resolve, reject) => {
                updateColumns = updateColumns || this.columns;
                if (!options || !updateColumns || !Array.isArray(updateColumns)) {
                    reject(this.updateColumns);
                }
                const data = _.pick(options, updateColumns);
                const findByKeys = options.findByCompositePKey
                  ? this.compositePKey
                  : options.findByKeys || [new this().idAttribute || 'id'];
                const findArgs = options.findBy || _.pick(options, findByKeys);
                if (!Object.keys(findArgs).length) {
                  return reject(this.NOT_FOUND);
                }
                let previousAttrs = null;
                this
                    .query({where: findArgs})
                    .fetch({ require: true })
                    .then((model) => {
                        if (_.isEmpty(data)) {
                            reject(this.EMPTY_REQUEST);
                        }
                        const existing = {};
                        for (const col of updateColumns) {
                            // get current model data
                            const value = model.get(col);
                            if (value !== null) {
                                existing[col] = value;
                            }
                        }
                        previousAttrs = model.saveAttributes();
                        // modify columns from the request payload
                        const toSave = _.extend({}, existing, data);
                        // set updated_at column automatically
                        if (model.hasTimestamps) {
                            let updatedAtColumn = 'updated_at';
                            if (Array.isArray(model.hasTimestamps) && model.hasTimestamps.length > 1) {
                                updatedAtColumn = model.hasTimestamps[1];
                            }
                        }
                        return model
                            .save(toSave, { method: 'update', patch: true, require: true });
                    })
                    .then((model) => {
                        return this.query({ where: findArgs }).fetch({ softDelete: false });
                    })
                    .then((model) => {
                        model.saveAttributes(previousAttrs);
                        resolve(model);
                    })
                    .catch((err) => {
                        if (err.message && err.message === 'EmptyResponse') {
                            return reject(this.NOT_FOUND);
                        }
                        if (err.code) {
                            return reject(err.code);
                        }
                        reject(err);
                    });
            });
        },

        updateOneById: function (options, id, updateColumns) {
            options = _.extend({ id }, options);
            return this.updateOne(options, updateColumns);
        },

        updateOneByCompositePKey: function (options, updateColumns) {
            options = _.extend({ findByCompositePKey: true }, options);
            return this.updateOne(options, updateColumns);
        },

        destroyOneByCompositePKey: function (options) {
            return new Promise((resolve, reject) => {
                const findArgs = _.pick(options, this.compositePKey);
                this
                    .query({where: findArgs})
                    .fetch({ require: true })
                    .then((model) => {
                        model
                            .destroy()
                            .then(() => resolve(1))
                            .catch(reject);
                    })
                    .catch((err) => {
                        if (err.message && err.message === 'EmptyResponse') {
                            return reject(this.NOT_FOUND);
                        }
                        reject(err);
                    });
            });
        },

        importMany: function (options, columns, restoreModel = function() { return false; }) {
            // column names of the table that might be set/updated during import
            const idAttribute = new this().idAttribute || 'id';
            const updateColumns = _.filter(columns, col => [idAttribute].indexOf(col) === -1);
            return new Promise((resolve, reject) => {
                columns = columns || this.columns;
                if (!columns || !Array.isArray(columns)) {
                    reject(this.updateColumns);
                }
                const Model = this;
                if (options.length === 0) {
                    resolve(0);
                    return;
                }
                let rowCnt = 0;

                bookshelf
                    .transaction(t => Promise.all(
                        _.map(options, row => executor(_.pick(row, columns), t)))
                    )
                    .then(() => {
                        resolve(rowCnt);
                    })
                    .catch(reject);

                function executor(rowToImport, t) {
                    return new Promise((resolveOne, rejectOne) => {
                        if (rowToImport.id) {
                            Model
                                .forge({ id: rowToImport.id })
                                .fetch({ softDelete: false })
                                .then((existingModel) => {
                                    if (existingModel) {
                                        update(existingModel);
                                    } else {
                                        create();
                                    }
                                })
                                .catch((err) => {
                                    rejectOne(err);
                                });
                        } else {
                            create();
                        }

                        function create() {
                            // create a new record
                            Model
                                .forge(rowToImport)
                                .save(null, { transacting: t, method: 'insert' })
                                .then((createdModel) => {
                                    rowCnt += 1;
                                    setImmediate(() => {
                                        eventEmitter.emit('import.created', createdModel);
                                    });
                                    resolveOne(createdModel);
                                })
                                .catch((err) => {
                                    rejectOne(err);
                                });
                        }

                        /**
                         * Update existing record with new data
                         * @param {bookshelf.Model} existingModel
                         */
                        function update(existingModel) {
                            const updateData = _.pick(rowToImport, updateColumns);
                            let existing = {};
                            for (const col of updateColumns) {
                                // get current model data
                                const value = existingModel.get(col);
                                if (value !== null && !(col in updateData)) {
                                    existing[col] = value;
                                }
                            }

                            // restore the advertiser
                            if (restoreModel(existingModel, updateData)) {
                                // existingModel should be cleaned in the callback function like
                                // if (existingModel.get('status') === 'deleted' && !updateData.status) {
                                //     // restore soft deleted record when update
                                //     updateData.status = 'enabled';
                                //     // clear existing model attributes, since they were set before deleting the record,
                                //     // now are obsolete
                                //     existingModel.resetAttributes();
                                //     return true;
                                // } else {
                                //     // wasn't restored
                                //     return false;
                                // }
                                //
                                // clean existing fields
                                updateColumns.forEach((col) => {
                                    existing[col] = existingModel.get(col);
                                });
                            }

                            // modify columns from the request payload
                            const toSave = _.extend({}, existing, updateData);
                            Model
                                .forge({ id: existingModel.get(idAttribute) })
                                .save(toSave, { transacting: t })
                                .then((updatedModel) => {
                                    rowCnt += 1;
                                    setImmediate(() => {
                                        eventEmitter.emit('import.updated', updatedModel, existingModel);
                                    });
                                    resolveOne(updatedModel);
                                })
                                .catch((err) => {
                                    rejectOne(err);
                                });
                        }
                    });
                }
            });
        },

        destroyMany: function (options) {
            options = _.extend({ require: true }, options)
            return this
            .query({ where: options.where })
            .fetchAll()
            .then((models) => {
                return bookshelf
                .transaction(t => Promise.all( models.map(m => m.destroy({ transacting: t })) ))
                .then(() => models.length)
            })
            .catch((err) => {
                if (err.message && err.message === 'EmptyResponse') {
                    return Promise.reject(this.NOT_FOUND);
                }
                return Promise.reject(err);
            });
        },

        /**
         * Bulk Sync
         * @param {Array<*>} existingCollection
         * @param {Array<*>} desiredRows
         * @param {Array<string>} [columns]
         * @param options.noInsert - prevents inserting new records (default inserts)
         * @param options.noUpdate - prevents updating existing records (default updates)
         * @param options.noDestroy - prevents destroying existing records (default destroys)
         * @param options.isMatch - comparison function called with existing row and desired row. Default: (a,b) => a.id === b.id
         * @return Promise<*>
         *   {Array<*>} inserted
         *   {Array<*>} updated
         *   {Array<*>} destroyed
         *   {Array<*>} unchanged
         */
        bulkSync: function(existingCollection, desiredRows, columns, {noInsert, noUpdate, noDestroy, isMatch} = {}) {
            const model = new this();
            if (existingCollection instanceof model.Collection) {
              existingCollection = existingCollection.serialize();
            }
            const idAttribute = model.idAttribute || 'id';
            const cols = this.columnFilter(columns);
            const beforeUpdates = {};
            const results = {
                inserted: [],
                updated: [],
                destroyed: [],
                unchanged: [],
            };
            if (!isMatch) {
              isMatch = (a, b) => a[idAttribute] === b[idAttribute];
            }
            _.forEach(desiredRows, (item) => {
                const existing = _.find(existingCollection, val => isMatch(val, item));
                if (!existing) {
                    results.inserted.push(item);
                } else {
                    let needsUpdate = false;
                    _.forEach(cols, (col) => {
                        if (col in item && item[col] != existing[col]) {
                            if (!beforeUpdates[item[idAttribute]]) {
                              beforeUpdates[item[idAttribute]] = existing;
                            }
                            existing[col] = item[col];
                            needsUpdate = true;
                        }
                    });
                    results[needsUpdate ? 'updated' : 'unchanged'].push(existing);
                    _.remove(existingCollection, existing);
                }
            });
            results.destroyed = existingCollection;

            return bookshelf.transaction((transacting) =>
              Promise.all([
                  !noInsert && results.inserted.length ? this.bulkInsert(results.inserted, { transacting, returnInserted: true }) : [],
                  !noUpdate && results.updated.length ? this.bulkUpdate(results.updated, cols, { transacting, returnInserted: true, previous: beforeUpdates }) : [],
                  !noDestroy && results.destroyed.length ? this.bulkDestroyIn(results.destroyed, { transacting }) : [],
              ]))
              .spread((inserted, updated, destroyed) => {
                results.inserted = inserted;
                results.updated = updated;
                return results;
              });
        },

        /**
         * Bulk Insert
         * @param {Array<*>} rows
         * @param {*} transacting
         * @param {boolean} returnInserted
         * @returns {number|Array<*>}
         */
        bulkInsert: function(rows, { transacting, returnInserted } = {}) {
          if (!Array.isArray(rows)) {
            return Promise.reject(new Error('`rows` is not an array'));
          }
          const model = new this();
          const idAttribute = model.idAttribute || 'id';
          const autoInc = returnInserted && (_.isEmpty(model.orderedUuids) || !(idAttribute in model.orderedUuids));

          return Promise
            .resolve()
            .then(() => this.bulkValidateSave(rows))
            .then(() => rows = rows.map(row => this.transformPouuidToBinary(row)))
            .then(() => this
              .knext(transacting)
              .insert(rows)
            )
            .then((lastId) => {
              if (returnInserted) {
                let query = this.knext(transacting);
                query = autoInc
                  ? query.where(idAttribute, '>=', lastId)
                  : query.whereIn(idAttribute, _.map(rows, idAttribute));
                return query
                  .limit(rows.length)
                  .select()
                  .map(r => this.transformBinaryToPouuid(r));
              }
              return rows.length;
            });
        },

        /**
         * Bulk Destroy
         * @param {Function|Object|*} where
         * @param {*} transacting
         * @returns {Promise<number>}
         */
        bulkDestroy: function(where, { transacting } = {}) {
          return Promise
            .resolve()
            .then(() => this
              .knext(transacting)
              .where(this.transformPouuidToBinary(where, false))
              .del()
            );
        },

      /**
       * Bulk Destroy
       * @param {Function|Object|*} whereIn
       * @param {*} transacting
       * @returns {Promise<number>}
       */
        bulkDestroyIn: function(whereIn, { transacting } = {}) {
          const idAttribute = new this().idAttribute || 'id';
          return Promise
            .resolve()
            .then(() => this
              .knext(transacting)
              .whereIn(idAttribute, whereIn.map(w => this.transformPouuidToBinary(w, false)[idAttribute]))
              .del()
            );
        },

        /**
         * Bulk Update
         * @param {Array<*>} rows
         * @param {Array<string>} [columns]
         * @param {*} transacting
         * @param {boolean} returnInserted
         * @returns {Promise<number|Array<*>>}
         */
        bulkUpsert: function(rows, columns = this.columns, { transacting, returnInserted } = {}) {
          if (!Array.isArray(rows)) {
            return Promise.reject(new Error('`rows` is not an array'));
          }
          const model = new this();
          const idAttribute = model.idAttribute || 'id';
          let prevRows;

          if (returnInserted && (_.isEmpty(model.orderedUuids) || !(idAttribute in model.orderedUuids))) {
            return Promise.reject(new Error('Could not return bulk-inserted rows with autoincremented PK in MySQL'));
          }

          const data = rows.map(row => this.transformPouuidToBinary(row));
          // read existing rows
          return Promise
            .resolve()
            .then(() => this
              .knext(transacting)
              .select()
              .whereIn(idAttribute, _.map(data, idAttribute))
            )
            .each(row => prevRows[row[idAttribute]] = row)
            .then(existingRows => existingRows.map(e => this.transformBinaryToPouuid(e)))
            .map(existingRows => rows.map(rowWithUpdates => {
              // find in existing row and merge or just leave new row
              const found = _.find(existingRows, {[idAttribute]: rowWithUpdates[idAttribute]});
              if (!found) {
                return rowWithUpdates;
              }
              return Object.assign(found, columns.length ? _.pick(rowWithUpdates, columns) : rowWithUpdates);
            }))
            .then(upserts => this.bulkUpdate(upserts, columns, { transacting, returnInserted, prevRows }));
        },

        /**
         * Bulk Update
         * @param {Array<*>} rows
         * @param {Array<string>} columns
         * @param {*} transacting
         * @param {boolean} returnInserted
         * @returns {Promise<number|Array<*>>}
         */
        bulkUpdate: function(rows, columns = this.columns, { transacting, returnInserted, previous } = {}) {
          const model = new this();
          const idAttribute = model.idAttribute || 'id';
          let data;

          return Promise
            .resolve(rows)
            .map(row => this.transformBinaryToPouuid(row))
            .tap(updatedRowsNotSaved => this.bulkValidateSave(updatedRowsNotSaved, columns))
            .tap((rows) => {
              if (model.hasTimestamps) {
                const key = _.isArray(this.hasTimestamps) ? this.hasTimestamps[1] : DEFAULT_TIMESTAMP_KEYS[1];
                const now = new Date();
                rows.forEach(r => r[key] = now);
              }
            })
            .map(row => this.transformPouuidToBinary(row))
            .then((rows) => {
              const updateColumns = this.columnFilter(columns.length ? columns : Object.keys(rows[0]));
              if (model.hasTimestamps) {
                updateColumns.push(_.isArray(model.hasTimestamps) ? model.hasTimestamps[1] : DEFAULT_TIMESTAMP_KEYS[1]);
              }
              const updateColArr = updateColumns.map(e => `${e}=values(${e})`);
              data = rows;

              let query = this
                .knext(transacting)
                .insert(rows)
                .toString();
              query += ` on duplicate key update ${bookshelf.knex.raw(
                updateColArr.join(',')
              )}`;
              return bookshelf.knex.raw(query).transacting(transacting);
            })
            .then((/*queryStats*/) => {
              if (returnInserted) {
                return this
                  .knext(transacting)
                  .select()
                  .whereIn(idAttribute, _.map(data, idAttribute))
                  .map(r => this.transformBinaryToPouuid(r))
                  .map(r => {
                    const item = this.forge(r);
                    item._savedAttributes = previous && previous[item[idAttribute]];
                    return item;
                  })
              } else {
                return rows.length;
              }
            });
        },

        /**
         * Validate multiple rows
         * @param {Array<*>} rows
         * @param {Array<string>|null} [validateColumns]
         * @param {{ method: string, patch: boolean }} [validateSaveOptions]
         * @returns {Promise<void>}
         */
        bulkValidateSave: function(rows, validateColumns = null, validateSaveOptions = { method: 'insert', patch: false }) {
          const model = new this();
          if (!(model.validate && model.validateSave)) {
            return Promise.resolve();
          }
          const validationErrors = rows
            .map((row) => {
              const rowToValidate = validateColumns ? _.pick(row, validateColumns) : row;
              try {
                const m = this.forge(rowToValidate);
                m.validateSave(m, rowToValidate, validateSaveOptions);
                return { error: null };
              } catch (validationError) {
                return { error: validationError };
              }
            })
            .map((result, i) => (result.error ? `Row (${i}): ${result.error}` : null))
            .filter(e => e);
          if (validationErrors.length > 0) {
            const error = new Error(`Validation error: ${validationErrors.join('; ')}`);
            error.name = this.VALIDATION_ERROR;
            return Promise.reject(error);
          }
          return Promise.resolve();
        },

        /**
         * A knex wrapper that supports transactions
         * @param {*} transacting An external transaction object
         * @returns {*}
         */
        knext: function(transacting = null) {
          const model = new this();
          return transacting ? bookshelf.knex(model.tableName).transacting(transacting) : bookshelf.knex(model.tableName);
        },

        columnFilter: function(columns, filter = null) {
          if (!filter) {
            const model = new this();
            const timeKeys = _.isArray(model.hasTimestamps) ? model.hasTimestamps : DEFAULT_TIMESTAMP_KEYS;
            filter = [model.idAttribute || 'id', 'version', timeKeys[0], timeKeys[1]];
          }
          return _.filter(columns || this.columns || [], col => filter.indexOf(col) === -1);
        },

        /**
         * Convert POUUID model attributes to binary
         * (bookshelf-prefixed-ordered-uuid plugin support)
         * @param {*} row
         * @param {boolean} generateId
         * @returns {*}
         */
        transformPouuidToBinary: function(row, generateId = true) {
          const model = new this();
          const r = Object.assign({}, row);
          const idAttribute = model.idAttribute || 'id';
          if (!_.isEmpty(model.orderedUuids)) {

            if (typeof bookshelf.Model.prefixedUuidToBinary !== 'function') {
              throw new Error('bookshelf-prefixed-ordered-uuid is not installed but the model has orderedUuids');
            }
            for (let k in model.orderedUuids) {
              if (!model.orderedUuids.hasOwnProperty(k)) {
                continue;
              }
              if (!(k in r) && k === idAttribute && generateId) {
                // generate id
                r[k] = bookshelf.Model.prefixedUuidToBinary(bookshelf.Model.generateUuid(model.orderedUuids[k]), 2);
                continue;
              }

              if (r[k] && !Buffer.isBuffer(r[k])) {
                // convert
                r[k] = bookshelf.Model.prefixedUuidToBinary(r[k], 2);
              }
            }
          }
          return r;
        },

        /**
         * Convert binary model attributes to string POUUIDs
         * (bookshelf-prefixed-ordered-uuid plugin support)
         * @param {*} row
         * @returns {*}
         */
        transformBinaryToPouuid: function(row) {
          const model = new this();
          if (_.isEmpty(model.orderedUuids)) {
            return row;
          }
          const newRow = Object.assign({}, row);
          Object.keys(newRow).forEach((k) => {
            if (k in model.orderedUuids && Buffer.isBuffer(newRow[k])) {
              newRow[k] = bookshelf.Model.binaryToPrefixedUuid(newRow[k], 2);
            }
          });
          return newRow;
        },
    });
};
