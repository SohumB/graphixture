var Sequelize = require('sequelize');
var Bookshelf = require('bookshelf');
var _ = require('lodash');
var Promise = require('bluebird');
var Config = require('config-node');

var loadSequelize = require( './models/sequelize' );
var loadBookshelf = require( './models/bookshelf' );

var sequelize = {
  db: null,
  models: null,

  setup: function() {
    sequelize.db = new Sequelize(Config.database, Config.user, Config.password, {
      logging: false,
      host: Config.host,
      dialect: 'postgres'
    });

    return Promise.cast(sequelize.db.authenticate()).then(function() {
      sequelize.models = loadSequelize(sequelize.db, Sequelize);
      return sequelize.db.sync({force: true});
    });
  }
};

var bookshelf = {
  db: null,
  models: null,
  setup: function() {
    bookshelf.db = Bookshelf.initialize({
      client: 'pg',
      connection: Config,
      debug: false
    });
    bookshelf.db.plugin('registry');
    return loadBookshelf(bookshelf.db).tap(function(models) {
      bookshelf.models = models;
    });
  }
};

var fixtures = {
  Catalog: {
    cola: {
      name: 'Cola',
      description: 'Fizzy cola-flavoured drinks',
      groups: [ 'drink', 'fizzy' ]
    },
    coke: {
      name: 'Coca Cola',
      description: 'The one and only cola',
      manufacturer: 'cokecorp',
      supplier: 'amatil',
      parent: 'cola'
    }
  },
  Manufacturer: {
    cokecorp: { name: 'Coca Cola Corporation' }
  },
  Supplier: {
    amatil: { name: 'Amatil' }
  },
  Group: {
    drink: { name: 'Drink' },
    fizzy: { name: 'Fizzy' }
  }
};

var jsoned = {
  sequelize: {
    cokecorp: { name: 'Coca Cola Corporation', id: 1 },
    amatil: { name: 'Amatil', id: 1 },
    drink: { name: 'Drink', id: 1 },
    fizzy: { name: 'Fizzy', id: 2 },
    cola:
    { name: 'Cola',
      description: 'Fizzy cola-flavoured drinks',
      id: 1,
      supplier_id: null,
      manufacturer_id: null,
      parent_id: null },
    coke:
    { name: 'Coca Cola',
      description: 'The one and only cola',
      id: 2,
      supplier_id: 1,
      manufacturer_id: 1,
      parent_id: 1 } } };
jsoned.bookshelf = _.merge(_.cloneDeep(jsoned.sequelize), { cola:
                                                            { groups: [
                                                              jsoned.sequelize.drink,
                                                              jsoned.sequelize.fizzy
                                                            ] }
                                                          });
delete jsoned.bookshelf.cola.manufacturer_id;
delete jsoned.bookshelf.cola.supplier_id;
delete jsoned.bookshelf.cola.parent_id;

exports.sequelize = sequelize;
exports.bookshelf = bookshelf;
exports.data = {
  fixtures: fixtures,
  jsoned: jsoned
};
