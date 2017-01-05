# bookshelf-modelbase-plus

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

### API
#### model.getList
```js
    /**
     * Get sorted, ordered, filtered, paginated list of records. Good for GET params object passing.
     * @param {Object} data
     * @param {Array} columns
     * @return {Promise(bookshelf.Collection)} Bookshelf Collection of all Models
     */
    var data = {
        name: 'Jimmy',   // where name = Jimmy
        order_by: '-id', // order by id desc
        limit: 10,
        page: 2,         // 1 based page number
    }
    Budget
        .getList(data, ['id', 'name', 'status'])
        .then(function(models) {
            
        })
        .catch(function(err) { });
```
