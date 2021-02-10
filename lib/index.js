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
            const baseValidation = {
              // id might be number or string, for optimization
              id: Joi.any().optional(),
              created_at: Joi.date().timestamp('javascript').iso().optional(),
              updated_at: Joi.date().timestamp('javascript').iso().optional(),
            };

            this.validate = this.validate.isJoi
              ? this.validate.keys(baseValidation)
              : Joi.object(this.validate).keys(baseValidation);

            if (this.validateSave) {
              // it's impossible to override the Modelbase.validateSave method using same name
              // (we should set method context via .bind(this) but it seems like Bookshelf does that automatically)
              this.removeListener('saving', this.validateSave);
            }
            this.on('saving', this.validateSaveAdvanced);
            this.validateSave = this.validateSaveAdvanced;
          }
        },
        hasTimestamps: ['created_at', 'updated_at'],

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
          'MATCH': 'MATCH',
          'NOT MATCH': 'NOT MATCH',
          'NOT_MATCH': 'NOT MATCH',
          'MATCH_NATURAL': 'MATCH',
          'NOT_MATCH_NATURAL': 'NOT MATCH',
          'NOT MATCH NATURAL': 'NOT MATCH',
          'MATCH_BOOL': 'MATCH,IN BOOLEAN MODE',
          'MATCH BOOL': 'MATCH,IN BOOLEAN MODE',
          'NOT_MATCH_BOOL': 'NOT MATCH,IN BOOLEAN MODE',
          'NOT MATCH BOOL': 'NOT MATCH,IN BOOLEAN MODE',
          'MATCH_QUERY': 'MATCH,WITH QUERY EXPANSION',
          'MATCH QUERY': 'MATCH,WITH QUERY EXPANSION',
          'NOT_MATCH_QUERY': 'NOT MATCH,WITH QUERY EXPANSION',
          'NOT MATCH QUERY': 'NOT MATCH,WITH QUERY EXPANSION',
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
            const paginate = _.isNil(options.paginate) || (options.paginate && options.paginate !== '0');
            return new Promise((resolve, reject) => {
              this.getListQuery(options, columns, !paginate)
                  .then((q) => {
                    const limited = `${options.limit}` !== '-1';
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

        getListQuery: function (options, columns, includeLimit = true) {
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
                  const order = _.castArray(options.order_by || new this().idAttribute || 'id')
                    .forEach((column) => {
                      if (column) {
                        if (column[0] === '-') {
                          q.query(qb => qb.orderBy(this.tableKey(column.slice(1)), 'desc'));
                        } else {
                          q.query(qb => qb.orderBy(this.tableKey(column), 'asc'));
                        }
                      }
                    });
                }
                if (options.select) {
                  const selectArr = _.isString(options.select) ? options.select.split(',') : _.castArray(options.select);
                  q.query(qb => selectArr.forEach(s => qb.select(s)));
                }
                if (includeLimit && `${options.limit}` !== '-1') {
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
              return searchChain[searchMethod](this.tableKey(key), value);
            }
            if (operator.includes('MATCH')) {
              const matchParts = operator.split(',');
              return searchChain[options._logic === 'or' ? 'orWhereRaw' : 'andWhereRaw'](
                `${matchParts[0]} (??) AGAINST (? ${matchParts[1] || ''})`, [this.tableKey(key), value]);
            }
            return searchChain[options._logic === 'or' ? 'orWhere' : 'andWhere'](this.tableKey(key), operator, value);
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
          const chainMethod = (logic === 'or') ? 'orWhere' : 'where';
          return _.reduce(whereVals, (chain, v, k) => chain[chainMethod](this.tableKey(k), v), searchChain);
        },

        tableKey: function(key, tableName = this.prototype.tableName) {
          return key.includes('.') ? key : `${tableName}.${key}`;
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
            const str = val.toLowerCase();
            const maps = {
              'null': null,
              'true': true,
              'false': false,
            };
            const safeVal = _.has(maps, str) ? maps[str] : val;
            if (this.prototype.orderedUuids && key in this.prototype.orderedUuids) {
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
                    .create(data, { method: 'insert', autoRefresh: false, debug: _.get(options, 'debug') })
                    .then((model) => {
                        if (model) {
                            return this.findById(model.get(model.idAttribute), options);
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
                  : options.findByKeys || [this.prototype.idAttribute || 'id'];
                const findArgs = options.findBy || _.pick(options, findByKeys);
                if (!Object.keys(findArgs).length) {
                  return reject(this.NOT_FOUND);
                }
                const debug = options.debug;
                let previousAttrs = null;
                let unchanged = false;
                this
                    .query({where: findArgs})
                    .fetch({ require: true, debug })
                    .then((model) => {
                        if (_.isEmpty(data)) {
                            reject(this.EMPTY_REQUEST);
                        }
                        let existing = {};
                        for (const col of updateColumns) {
                            // get current model data
                            const value = model.get(col);
                            if (value !== undefined) {
                                existing[col] = value;
                            }
                        }

                        let toSave = _.extend({}, existing, data);
                        if (model.validate) {
                          try {
                            // validate both to ensure they are both coerced to their types (i.e. 0 vs false)
                            const clone = model.clone();
                            existing = clone.validateSave(null, existing, { method: 'update', patch: true }); // coerce values
                            toSave = clone.validateSave(null, toSave, { method: 'update', patch: true });
                          } catch (validationError) {
                            throw Object.assign(new Error(`Validation error: ${validationError}`), { name: this.VALIDATION_ERROR });
                          }
                        }

                        previousAttrs = model.saveAttributes();
                        if (_.isEqual(existing, toSave)) {
                          unchanged = true;
                          return model;
                        }

                        // set updated_at column automatically
                        if (model.hasTimestamps) {
                            let updatedAtColumn = 'updated_at';
                            if (Array.isArray(model.hasTimestamps) && model.hasTimestamps.length > 1) {
                                updatedAtColumn = model.hasTimestamps[1];
                            }
                        }
                        return model
                            .save(toSave, { method: 'update', patch: true, require: true, autoRefresh: false, debug });
                    })
                    .then((model) => {
                        if (unchanged) {
                          return model;
                        }
                        const newWhere = _.mapValues(findArgs, (v, k) => _.has(data, k) ? data[k] : v);
                        return this.query({ where: newWhere }).fetch({ softDelete: false, require: true, debug });
                    })
                    .then((model) => {
                        if (!model.unchanged) {
                          model.saveAttributes(previousAttrs);
                        }
                        resolve(model);
                    })
                    .catch((err) => {
                        if (err.message && err.message === 'EmptyResponse') {
                            return reject(this.NOT_FOUND);
                        }
                        if (err.code && err.code !== 'ER_SIGNAL_EXCEPTION') {
                            return reject(err.code);
                        }
                        reject(err);
                    });
            });
        },

        updateOneById: function (options, id, updateColumns) {
            options = _.extend({ id, autoRefresh: false }, options);
            return this.updateOne(options, updateColumns);
        },

        updateOneByCompositePKey: function (options, updateColumns) {
            options = _.extend({ findByCompositePKey: true, autoRefresh: false }, options);
            return this.updateOne(options, updateColumns);
        },

        destroyOneByCompositePKey: function (options) {
            return new Promise((resolve, reject) => {
                const findArgs = _.pick(options, this.compositePKey);
                const debug = _.get(options, 'debug');
                this
                    .query({where: findArgs})
                    .fetch({ require: true, debug })
                    .then((model) => {
                        model
                            .destroy({ debug })
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
            const idAttribute = this.prototype.idAttribute || 'id';
            const updateColumns = _.filter(columns, col => [idAttribute].indexOf(col) === -1);
            const debug = _.get(options, 'debug');
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
                                .fetch({ softDelete: false, require: false, debug })
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
                                .save(null, { transacting: t, method: 'insert', autoRefresh: false, debug })
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
                                if (value !== undefined && !(col in updateData)) {
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
                                .save(toSave, { transacting: t, autoRefresh: false, debug })
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
            .query(_.pick(options, ['where', 'debug']))
            .fetchAll()
            .then((models) => {
                return bookshelf
                .transaction(t => Promise.all( models.map(m => m.destroy({ transacting: t, debug: options.debug })) ))
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
            if (existingCollection instanceof this.prototype.Collection) {
              existingCollection = existingCollection.serialize();
            }
            const idAttribute = this.prototype.idAttribute || 'id';
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
                              beforeUpdates[item[idAttribute]] = _.clone(existing);
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

            return Promise.resolve(bookshelf.transaction((transacting) =>
              Promise.all([
                  !noInsert && results.inserted.length ? this.bulkInsert(results.inserted, { transacting, returnInserted: true }) : [],
                  !noUpdate && results.updated.length ? this.bulkUpdate(results.updated, cols, { transacting, returnInserted: true, previous: beforeUpdates }) : [],
                  !noDestroy && results.destroyed.length ? this.bulkDestroyIn(results.destroyed, { transacting }) : [],
              ])))
              .then(([inserted, updated, destroyed]) => {
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
          const idAttribute = this.prototype.idAttribute || 'id';
          const autoInc = returnInserted && (_.isEmpty(this.prototype.orderedUuids) || !(idAttribute in this.prototype.orderedUuids));

          return Promise
            .resolve()
            .then(() => this.bulkValidateSave(rows))
            .then(() => rows = rows.map(row => this.transformPouuidToBinary(row)))
            .then(() => this.triggerThenOnAll('creating', rows))
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
                return Promise.resolve(query
                  .limit(rows.length)
                  .select())
                  .then(rows => rows.map(r => this.transformBinaryToPouuid(r)))
                  .then(rows => this.triggerThenOnAll('created', rows));
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
          const idAttribute = this.prototype.idAttribute || 'id';
          return Promise
            .resolve()
            .then(() => this.triggerThenOnAll('destroying', whereIn))
            .then(() => this
              .knext(transacting)
              .whereIn(idAttribute, whereIn.map(w => this.transformPouuidToBinary(w, false)[idAttribute]))
              .del()
            )
            .then(result => this.triggerThenOnAll('destroyed', whereIn)
              .then(() => result));
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
          const idAttribute = this.prototype.idAttribute || 'id';
          let prevRows;

          if (returnInserted && (_.isEmpty(this.prototype.orderedUuids) || !(idAttribute in this.prototype.orderedUuids))) {
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
            .then(existingRows => rows.map(rowWithUpdates => {
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
          const idAttribute = this.prototype.idAttribute || 'id';
          let data;

          return Promise
            .resolve(rows)
            .then(rows => rows.map(row => this.transformBinaryToPouuid(row)))
            .then(updatedRowsNotSaved => this.bulkValidateSave(updatedRowsNotSaved, columns))
            .then((rows) => {
              if (this.prototype.hasTimestamps) {
                const key = _.isArray(this.hasTimestamps) ? this.hasTimestamps[1] : DEFAULT_TIMESTAMP_KEYS[1];
                const now = new Date();
                rows.forEach(r => r[key] = now);
              }
              return rows;
            })
            .then(rows => rows.map(row => this.transformPouuidToBinary(row)))
            .then(rows => this.triggerThenOnAll('updating', rows))
            .then((rows) => {
              const updateColumns = this.columnFilter(columns.length ? columns : Object.keys(rows[0]));
              if (this.prototype.hasTimestamps) {
                updateColumns.push(_.isArray(this.prototype.hasTimestamps) ? this.prototype.hasTimestamps[1] : DEFAULT_TIMESTAMP_KEYS[1]);
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
              const q = bookshelf.knex.raw(query);
              return transacting ? q.transacting(transacting) : q;
            })
            .then((/*queryStats*/) => {
              if (returnInserted) {
                return Promise.resolve(this
                  .knext(transacting)
                  .select()
                  .whereIn(idAttribute, _.map(data, idAttribute)))
                  .then(rows => rows.map((r) => {
                    const transformed = this.transformBinaryToPouuid(r);
                    const item = this.forge(transformed);
                    item._savedAttributes = transformed;
                    item._previousAttributes = previous && previous[item[idAttribute]];
                    return item;
                  }))
                  .then(rows => this.triggerThenOnAll('updated', rows));
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
         * @returns {Array<*>}
         */
        bulkValidateSave: function(rows, validateColumns = null, validateSaveOptions = { method: 'insert', patch: false }) {
          if (!this.prototype.validate) {
            return rows;
          }
          const cols = validateColumns || this.columns;
          const idCol = this.prototype.idAttribute || 'id';
          if (!_.includes(cols, idCol)) {
            cols.push(idCol);
          }
          const validationErrors = rows
            .map((row, i) => {
              const rowToValidate = _.pick(row, cols);
              try {
                const m = this.forge(rowToValidate);
                rows[i] = m.validateSave(m, rowToValidate, validateSaveOptions);
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
            throw error;
          }
          return rows;
        },

        /**
         * A knex wrapper that supports transactions
         * @param {*} transacting An external transaction object
         * @returns {*}
         */
        knext: function(transacting = null) {
          const tableName = this.prototype.tableName;
          return transacting ? bookshelf.knex(tableName).transacting(transacting) : bookshelf.knex(tableName);
        },

        columnFilter: function(columns, filter = null) {
          if (!filter) {
            const timeKeys = _.isArray(this.prototype.hasTimestamps) ? this.prototype.hasTimestamps : DEFAULT_TIMESTAMP_KEYS;
            filter = [this.prototype.idAttribute || 'id', 'version', timeKeys[0], timeKeys[1]];
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
          const r = Object.assign({}, row);
          const idAttribute = this.prototype.idAttribute || 'id';
          if (!_.isEmpty(this.prototype.orderedUuids)) {

            if (typeof bookshelf.Model.prefixedUuidToBinary !== 'function') {
              throw new Error('bookshelf-prefixed-ordered-uuid is not installed but the model has orderedUuids');
            }
            for (let k in this.prototype.orderedUuids) {
              if (!this.prototype.orderedUuids.hasOwnProperty(k)) {
                continue;
              }
              if (!(k in r) && k === idAttribute && generateId) {
                // generate id
                r[k] = bookshelf.Model.prefixedUuidToBinary(bookshelf.Model.generateUuid(this.prototype.orderedUuids[k]), 2);
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
          if (_.isEmpty(this.prototype.orderedUuids)) {
            return row;
          }
          const newRow = Object.assign({}, row);
          Object.keys(newRow).forEach((k) => {
            if (k in this.prototype.orderedUuids && Buffer.isBuffer(newRow[k])) {
              newRow[k] = bookshelf.Model.binaryToPrefixedUuid(newRow[k], 2);
            }
          });
          return newRow;
        },

      /**
       * Select a collection based on a query
       * @param {Object} [filter]
       * @param {Object} [options] Options used of model.fetchAll
       * @return {Promise(bookshelf.Collection)} Bookshelf Collection of Models
       */
      findAll: function (filter, options) {
        return this.forge().where(filter || {}).fetchAll(options)
      },

      /**
       * Find a model based on it's ID
       * @param {String} id The model's ID
       * @param {Object} [options] Options used of model.fetch
       * @return {Promise(bookshelf.Model)}
       */
      findById: function (id, options) {
        return this.findOne({ [this.prototype.idAttribute]: id }, options)
      },

      /**
       * Select a model based on a query
       * @param {Object} [query]
       * @param {Object} [options] Options for model.fetch
       * @param {Boolean} [options.require=false]
       * @return {Promise(bookshelf.Model)}
       */
      findOne: function (query, options = {}) {
        options = Object.assign({ require: true }, options)
        return this.forge(query).fetch(options)
      },

      /**
       * Insert a model based on data
       * @param {Object} data
       * @param {Object} [options] Options for model.save
       * @return {Promise(bookshelf.Model)}
       */
      create: function (data, options) {
        return this.forge(data)
          .save(null, options)
      },

      /**
       * Update a model based on data
       * @param {Object} data
       * @param {Object} options Options for model.fetch and model.save
       * @param {String|Integer} options.id The id of the model to update
       * @param {Boolean} [options.patch=true]
       * @param {Boolean} [options.require=true]
       * @return {Promise(bookshelf.Model)}
       */
      update: function (data, options = {}) {
        options = Object.assign({ patch: true, require: true }, options)
        return this.forge({ [this.prototype.idAttribute]: options.id }).fetch(options)
          .then(function (model) {
            return model ? model.save(data, options) : undefined
          })
      },

      /**
       * Destroy a model by id
       * @param {Object} options
       * @param {String|Integer} options.id The id of the model to destroy
       * @param {Boolean} [options.require=true]
       * @return {Promise(bookshelf.Model)} empty model
       */
      destroy: function (options = {}) {
        options = Object.assign({ require: true }, options)
        return this.forge({ [this.prototype.idAttribute]: options.id })
          .destroy(options)
      },

      /**
       * Select a model based on data and insert if not found
       * @param {Object} data
       * @param {Object} [options] Options for model.fetch and model.save
       * @param {Object} [options.defaults] Defaults to apply to a create
       * @return {Promise(bookshelf.Model)} single Model
       */
      findOrCreate: function (data, options = {}) {
        return this.findOne(data, Object.assign({}, options, { require: false }))
          .bind(this)
          .then(function (model) {
            var defaults = (options && options.defaults) || {}
            return model || this.create(Object.assign(defaults, data), options)
          })
      },

      /**
       * Select a model based on data and update if found, insert if not found
       * @param {Object} selectData Data for select
       * @param {Object} updateData Data for update
       * @param {Object} [options] Options for model.save
       */
      upsert: function (selectData, updateData, options = {}) {
        return this.findOne(selectData, Object.assign({}, options, { require: false }))
          .bind(this)
          .then(function (model) {
            return model
              ? model.save(
                updateData,
                Object.assign({ patch: true, method: 'update' }, options)
              )
              : this.create(
                Object.assign({}, selectData, updateData),
                Object.assign({}, options, { method: 'insert' })
              )
          })
      },

      triggerThenOnAll(event, rows) {
        return Promise.all(rows.map((row) => {
          const m = this.forge(row);
          return m.triggerThen(event, m);
        }))
          .then(() => rows);
      }
    });

    return bookshelf.Model;
};

module.exports.pluggable = function (bookshelf, params) {
  bookshelf.Model = module.exports.apply(null, arguments)
}
