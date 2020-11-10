# bookshelf-modelbase-plus
[![Version](https://badge.fury.io/js/bookshelf-modelbase-plus.svg)](http://badge.fury.io/js/bookshelf-modelbase-plus)
[![Build Status](https://travis-ci.org/betastreet/bookshelf-modelbase-plus.svg?branch=main)](https://travis-ci.org/betastreet/bookshelf-modelbase-plus)

## Why
[Bookshelf modelbase](https://github.com/bsiddiqui/bookshelf-modelbase) plugin offers good functionality, however when dealing with a number of similar REST microservices
it is good to have shared codebase for common operations like paginated list, updating the records with validation,
importing set of records and etc.

## Install
```shell
npm i --save bookshelf-modelbase-plus
```

## Setup
```javascript
    const db        = require(knex)(require('./knexfile'));
    const bookshelf = require('bookshelf')(db);
    const modelbase = require('bookshelf-modelbase-plus');

    // load plugin
    bookshelf.plugin(require('bookshelf-modelbase-plus'));
    // needs also pagination plugin (older versions of bookshelf)
    // bookshelf.plugin('pagination');
    const ModelBase = modelbase(bookshelf);

    var Budget = ModelBase.extend({
        tableName: 'budgets',
        validationOptions: {}, // Joi options (default options: { abortEarly: false })
    });
```

## API
### model.getList
```js
    /**
     * Get sorted, ordered, filtered, paginated list of records. Good for GET params object passing
     * i.e. /?limit=5&page=1&order_by=-id&status=enabled
     * @param {Object} data
     * @param {Array} columns All table columns
     * @return {Promise(bookshelf.Collection)} Bookshelf Collection of all Models
     */
    var data = {
        status: 'enabled',   // where status = enabled
        order_by: '-id', // order by id desc
        limit: 5,
        page: 1,         // 1 based page number
    }
    Budget
        .getList(data, ['id', 'name', 'status'])
        .then(function(models) {
            //
        })
        .catch(function(err) { });
```
#### Complex Queries:
- Supports Arrays for key operator/value, like
```js
  Budget.getList(status: ['=', 'enabled'], ['status'])
```
- Supports specifying logic, like
```js
  Budget.getList({a: 2, b: 3, _logic: 'or'})
```
- Supports Objects, like:
```js
  Budget.getList({
    status: {
      operator: 'LIKE',
      value: '%enabled%',
    }}).then(models => {});
```
- Supports array values, like:
```js
  Budget.getList(status: ['IN', ['enabled', 'disabled']], ['status'])
```
- Supports or/and nesting, like:
```js
  Budget.getList({name: 'name0', _or: {name: 'name1', _and: {status: 'enabled'}}}, ['name', 'status'])
  Budget.getList({name: 'name0', _or: [{name: 'name1'}, {status: 'enabled'}]}, ['name', 'status'])
```

#### Supported Operators
- \!=
- NOT_EQUAL_TO
- \<
- LESS_THAN
- \<
- LESS_THAN_OR_EQUAL_TO
- \>
- GREATER_THAN
- \>
- GREATER_THAN_OR_EQUAL_TO
- \=
- EQUAL_TO
- IS
- IS_NOT
- LIKE
- NOT_LIKE
- BETWEEN
- NOT_BETWEEN
- IN
- NOT_IN
- MATCH
- NOT_MATCH
- MATCH_BOOL
- NOT_MATCH_BOOL
- MATCH_QUERY
- NOT_MATCH_QUERY

#### Special queries
A function may optionally be defined on the model to be used when
specifying `withQuery` in the getList options, similar to `withRelated`.
This function will then be called with the knex query builder so that
the model can define custom code to refine the search
(i.e. join, convert values, etc.)

Example:
```js
    var Budget = ModelBase.extend({
        tableName: 'budgets'
        fancy: (qb, options) => {
          return qb.where({name: options.name + options.name2});
        },
    });
    Budget.getList({name: 'first', name2: 'last', withQuery: 'fancy'})
```

Use the optional `select` param in the getList options to only return specific columns.
The value should be a comma-separated string or an array of strings.

Use the `getListQuery` method to get the underlying getList query without executing
anything. This is useful in case you want to do something custom with the query,
such as stream to a CSV somewhere instead of fetching a list of Bookshelf models.

### model.createOne
```js
/**
     * Create and save model and return all attributes
     * @param {Object} data
     * @param {Array} columns The set of columns will be used to fetch attribute values from the *data* object
     * @return {Promise(bookshelf.Model)} Bookshelf Collection of all Models
     */
    Budget
        .createOne(data, ['id', 'name', 'status'])
        .then((model) => {
            //
        })
        .catch((err) => {

        });
```

### model.updateOneById
```js
    /**
     * Update model through ID and revalidate all attributes before saving with modelbase Joi validation (if set)
     * returns model with all attributes
     * @param {Object} data
     * @param {Number} id
     * @param {Array} columns data The set of columns will be used to fetch attribute values from the *data* object
     * @return {Promise(bookshelf.Model)} Bookshelf Collection of all Models
     */
    Budget
        .updateOneById(data, id, ['id', 'name', 'status'])
        .then((model) => {
            //
        });
```

### model.updateOneByCompositePKey
```js
    /**
     * Update model through composite pKEY lookup and revalidate all attributes before saving with modelbase Joi validation (if set)
     * returns model with all attributes
     * @param {Object} data
     * @param {Array} columns data The set of columns will be used to fetch attribute values from the *data* object including the composite key
     * @return {Promise(bookshelf.Model)} Bookshelf Collection of all Models
     */
    Budget
        .updateOneByCompositePKey(data, ['id', 'name', 'status'])
        .then((model) => {
            //
        });
```

### model.destroyOneByCompositePKey
```js
    /**
     * Destroys  model through composite pKEY lookup
     * @param {Object} options should have the composite key fields
     */
    Budget
        .destroyOneByCompositePKey(options)
        .then((cnt) => {
            //
        });
```

### model.importMany
```js
    /**
     * Update model and revalidate all attributes before saving with modelbase Joi validation (if set)
     * returns model with all attributes
     * @param {Array} data Array of records to import
     * @param {Array} columns data The set of columns will be used to fetch attribute values from the *data* object
     * @param {Function} callback Optional callback with *bookshelf.Model* and *Object* params to restore soft-deleted records
     * @return {Promise(bookshelf.Model)} Bookshelf Collection of all Models
     */
    Budget
        .importMany([
            { id: 120, name: 'Test name 00' },
            { id: 139, name: 'Test name 01', status: 'enabled' },
            {
                // this will be definetely inserted
                name: 'Test name 02', status: 'disabled',
            },
        ],
        columns,
        (existingModel, updateData) => {
            if (existingModel.get('status') === 'deleted' && !updateData.status) {
                // in this particular example a callback has been raised cause one of the imported record with id = 120
                // is already in the table, so we check it's attribute *status* (might by any soft-deleting logic) and
                // decide to restore soft deleted record and clean *old* values before save new one
                updateData.status = 'enabled';
                // clear existing model attributes, since they were set before deleting the record,
                // now are obsolete
                existingModel.set('name', null);
                return true;
            } else {
                // wasn't restored
                return false;
            }
        })
        .then((rowCount) => {
            res.data = { rows: rowCount };
            return next();
        })
        .catch(err => next(err));
```

###### Import Events
```js
Model.eventEmitter.on('import.created', function(createdModel) {...});
Model.eventEmitter.on('import.updated', function(updatedModel, prevModel) {...});
```

### model.destroyMany
```js
    /**
     * Destroys a set of model through where condition
     * @param {Object} options.where should have the where condtions for destroy
     */
    Budget
        .destroyMany(options)
        .then((cnt) => {
            //
        });
```

### model.bulkSync
```js
    /**
     * Synchronizes an existing collection to a desired collection
     * @param {Array<*>} existing Collection (or array)
     * @param {Array<*>} desired collection
     * @param {Array<string>} columns to update
     * @param options.noInsert - prevents inserting new records (default inserts)
     * @param options.noUpdate - prevents updating existing records (default updates)
     * @param options.noDestroy - prevents destroying existing records (default destroys)
     * @param options.isMatch - comparison function called with existing row and desired row. Default: (a,b) => a.id === b.id
     * @return Promise<*>
     *   {Array<*>} inserted
     *   {Array<*>} updated (models with getSavedAttributes accessible)
     *   {Array<*>} destroyed
     *   {Array<*>} unchanged
     */
  const isMatch = (a, b) => (a.id && a.id === b.id) || (a.type === b.type);

  Budget
    .fetchAll()
    .then(existing => Budget.bulkSync(existing, data, Budget.columns, { isMatch }))
    .then((synced) => {
      synced.inserted.forEach(i => events.emit('exchangeCreated', i, req));
      synced.updated.forEach(i => events.emit('exchangeUpdated', i, req));
      synced.destroyed.forEach(i => events.emit('exchangeDestroyed', i, req));
    });
```

### model.bulkDestroyIn
```js
    /**
     * Destroys all matching models by ID
     * @param {Array<*>} array of models with IDs to destroy
     * @param options.transacting
     * @return Promise<number> number of rows deleted
     */
  Budget
    .bulkDestroyIn({id: 1}, {id: 2})
    .then(rows => console.log(`deleted ${rows}`));
```
