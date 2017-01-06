const _ = require('lodash');

module.exports = (bookshelf) => {
    // Extends the default model class
    bookshelf.Model = bookshelf.Model.extend({ }, {
        EMPTY_REQUEST: 'EMPTY_REQUEST',
        SERVER_ERROR: 'SERVER_ERROR',
        NOT_FOUND: 'NOT_FOUND',
        columnsError: 'Columns should be an array like [\'id\', \'name\', \'status\']',
        getList: function (options, columns) {
            return new Promise((resolve, reject) => {
                if (!columns || !Array.isArray(columns)) {
                    reject(this.columnsError);
                }
                // pagination
                const pageSize = options.limit || 10;
                const page = options.page || 1;
                // 'column_name' (ASC) or '-column_name' (DESC)
                const orderBy = options.order_by || 'id';
                // allowed columns
                const filter = _.pick(options, columns);

                this
                    .where(filter)
                    .orderBy(orderBy)
                    .fetchPage({ pageSize, page })
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
                            return this.findById(model.get('id'));
                        }
                        return model;
                    })
                    .then((model) => {
                        resolve(model);
                    })
                    .catch(reject);
            });
        },

        updateOne: function (options, id, updateColumns) {
            return new Promise((resolve, reject) => {
                if (!updateColumns || !Array.isArray(updateColumns)) {
                    reject(this.updateColumns);
                }
                const data = _.pick(options, updateColumns);
                this
                    .findById(id, { require: true })
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
                        // modify columns from the request payload
                        const toSave = _.extend({}, existing, data);
                        return this.update(toSave, { require: true, id });
                    })
                    .then((model) => {
                        return this.findById(model.get('id'));
                    })
                    .then((model) => {
                        resolve(model);
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
    });
};
