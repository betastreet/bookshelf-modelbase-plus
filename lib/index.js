const _ = require('lodash');
const EventEmitter = require('events');

class BookshelfModelBasePlusEventEmitter extends EventEmitter {}
// A static event emitter
const eventEmitter = new BookshelfModelBasePlusEventEmitter();

module.exports = (bookshelf) => {
    // Extends the default model class
    bookshelf.Model = bookshelf.Model.extend({
        saveAttributes: function (attrs) {
            this._savedAttributes = Object.assign(
                {}, attrs !== undefined ? attrs : this.attributes
            );
            return Object.assign({}, this._savedAttributes);
        },
        getSavedAttribues: function () {
            if (this._savedAttributes === undefined) {
                this._savedAttributes = {};
            }
            return Object.assign({}, this._savedAttributes);
        },
        getAttributes: function () {
            return Object.assign({}, this.attributes);
        },
    }, {
        EMPTY_REQUEST: 'EMPTY_REQUEST',
        SERVER_ERROR: 'SERVER_ERROR',
        NOT_FOUND: 'NOT_FOUND',
        VALIDATION_ERROR: 'VALIDATION_ERROR',
        columnsError: 'Columns should be an array like [\'id\', \'name\', \'status\']',
        compositePKey: ['id'],
        eventEmitter,
        getList: function (options, columns) {
            return new Promise((resolve, reject) => {
                if (!columns || !Array.isArray(columns)) {
                    reject(this.columnsError);
                }
                options = options || {};
                // pagination
                const pageSize = options.limit || 10;
                const page = options.page || 1;
                // 'column_name' (ASC) or '-column_name' (DESC)
                const orderBy = options.order_by || 'id';
                // allowed columns
                const filter = _.pick(options, columns);
                let opts = _.pick(options, ['withRelated', 'debug']);
                this
                    .where(filter)
                    .orderBy(orderBy)
                    .fetchPage(_.extend({ pageSize, page }, opts))
                    .then((models) => {
                        resolve(models);
                    })
                    .catch(reject);
            });
        },

        createOne: function (options, createColumns) {
            return new Promise((resolve, reject) => {
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
                if (!updateColumns || !Array.isArray(updateColumns)) {
                    reject(this.updateColumns);
                }
                const data = _.pick(options, updateColumns);
                const findByKeys =  options.findByCompositePKey ? this.compositePKey : ['id'];
                const findArgs = _.pick(options, findByKeys);
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
                            model.set(updatedAtColumn, undefined);
                        }
                        return model
                            .save(toSave, { method: 'update', patch: true, require: true });
                    })
                    .then((model) => {
                        return this.query({ where: findArgs }).fetch();
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
            const updateColumns = _.filter(columns, col => ['id'].indexOf(col) === -1);
            return new Promise((resolve, reject) => {
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
                                .forge({ id: existingModel.get('id') })
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

        bulkInsert: function(rows, { transacting, returnInserted } = {}) {
            if (!Array.isArray(rows)) {
                return Promise.reject(new Error('`rows` is not an array'));
            }
            const model = new this();
            const idAttribute = model.idAttribute || 'id';

            if (returnInserted && (_.isEmpty(model.orderedUuids) || !(idAttribute in model.orderedUuids))) {
                return Promise.reject(new Error('Could not return bulk-inserted rows with autoincremented PK in MySQL'));
            }

            if (model.validate && model.validateSave) {
                const validationErrors = rows
                    .map((row) => {
                        try {
                            const mod = this.forge(row);
                            mod.validateSave(mod, row, { method: 'insert', patch: false });
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
            }
            const data = rows.map(row => transformPOUUIDtoBinary(bookshelf, model, row));

            return this.transactionAsync(transacting)
                .then(t => transacting = t)
                .then(bookshelf.knex(model.tableName).transacting(transacting))
                .insert(data)
                .then(() => {
                    if (returnInserted) {
                        return bookshelf.knex(model.tableName).transacting(transacting)
                            .select()
                            .whereIn(idAttribute, _.map(data, idAttribute))
                            .then((insertedRows) => {
                                return insertedRows.map((r) => {
                                    if (!_.isEmpty(model.orderedUuids)) {
                                        for (let k in model.orderedUuids) {
                                            if (model.orderedUuids.hasOwnProperty(k) && r.hasOwnProperty(k) && Buffer.isBuffer(r[k])) {
                                                r[k] = bookshelf.Model.binaryToPrefixedUuid(r[k], 2);
                                            }
                                        }
                                    }
                                    return r;
                                });
                            });
                    }
                    return rows.length;
                });
        },

        bulkSync: function(existingCollection, desiredRows, columns) {
            const model = new this();
            const idAttribute = model.idAttribute || 'id';
            columns = _.filter(columns, col => [idAttribute].indexOf(col) === -1);
            const results = {
                inserts: [],
                updates: [],
                destroys: [],
                unchanged: [],
            };
            _.forEach(desiredRows, (item) => {
                const existing = existingCollection.get(item[idAttribute]);
                if (!existing) {
                    results.inserts.push(item);
                } else {
                  let needsUpdate = false;
                  _.forEach(columns, (col) => {
                      if (col in item && item[col] !== existing.get(col)) {
                        existing.set(col, item[col]);
                        needsUpdate = true;
                      }
                  });
                  results[needsUpdate ? 'updates' : 'unchanged'].push(existing);
                  existingCollection.remove(existing);
                }
            });
            _.forEach(existingCollection, item => results.destroys.push(item));

            return this.transactionAsync()
              .then(transacting => Promise.all([
                results.inserts.length ? this.bulkInsert(results.inserts, {transacting, returnInserted: true}) : null,
                results.updates.length ? results.updates.invokeThen('save', {transacting}).then(updated => results.updates = updated) : null,
                results.destroys.length ? results.destroys.invokeThen('destroy', {transacting}) : null,
              ]))
              .then(() => results);
        },

        bulkDestroy: function(where, { transacting } = {}) {
            const wherePOUUID = transformPOUUIDtoBinary(bookshelf, new this(), where, false);
            const model = new this();
            return this.transactionAsync(transacting)
                .then(t => bookshelf.knex(model.tableName).transacting(t)
                    .where(wherePOUUID)
                    .del());
        },

        transactionAsync: function(transacting = null) {
            return transacting ? Promise.resolve(transacting) : new Promise(resolve => bookshelf.transaction(t => resolve(t)));
        }
    });
};

function transformPOUUIDtoBinary(bookshelf, model, row, generateId = true) {
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
}
