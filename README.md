# bookshelf-modelbase-plus
[![Build Status](https://travis-ci.org/Wirnex/bookshelf-modelbase-plus.svg?branch=master)](https://travis-ci.org/Wirnex/bookshelf-modelbase-plus)

## Why
[Bookshelf modelbase](https://github.com/bsiddiqui/bookshelf-modelbase) plugin offers good functionality, however when dealing with a number of similar REST microservieces
it is good to have shared codebase for common operations like paginated list, updating the records with validation,
importing set of records and etc.

## Install
```shell
npm i --save bookshelf-modelbase-plus
```

## Setup
```javascript
    var db        = require(knex)(require('./knexfile'));
    var bookshelf = require('bookshelf')(db);
    var ModelBase = require('bookshelf-modelbase')(bookshelf);

    // load plugin
    bookshelf.plugin(require('bookshelf-modelbase-plus'));
    // needs also pagination plugin
    bookshelf.plugin('pagination');

    var Budget = ModelBase.extend({
        tableName: 'budgets'
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

### model.updateOne
```js
    /**
     * Update model and revalidate all attributes before saving with modelbase Joi validation (if set)
     * returns model with all attributes
     * @param {Object} data
     * @param {Number} id
     * @param {Array} columns data The set of columns will be used to fetch attribute values from the *data* object
     * @return {Promise(bookshelf.Model)} Bookshelf Collection of all Models
     */
    Budget
        .updateOne(data, id, ['id', 'name', 'status'])
        .then((model) => {
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
