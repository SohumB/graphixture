var _ = require('lodash');
var Promise = require('bluebird');

module.exports = function(DB) {
  var schema = DB.knex.schema;
  var fields = function(table) {
    table.increments('id');
    table.string('name').notNullable();
  };
  var drops = Promise.reduce(['manufacturer', 'supplier', 'group', 'catalog', 'catalogGroup'],
                             function(accum, name) {
      return DB.knex.raw('drop table if exists "' + name + '" cascade');
  }, 0);

  var models = {};
  var migrations = {};

  function capitalise(str) {
    return str.charAt(0).toUpperCase() + str.substr(1);
  }

  function define(name, fn, opts, deps) {
    deps = deps || [];
    migrations[name] = drops.then(function() {
      return Promise.all(_.at(migrations, deps));
    }).then(function() {
      return schema.createTable(name, fn);
    });
    var modelOpts = _.defaults({ tableName: name }, opts);
    models[capitalise(name)] = DB.model(name, DB.Model.extend(modelOpts));
    return migrations[name];
  }

  define('manufacturer', fields);
  define('supplier', fields);

  define('group', fields, {
    catalog: function() {
      return this.belongsToMany('catalog', 'catalogGroup', 'group_id', 'catalog_id');
    }
  });

  define('catalog', function(table) {
    fields(table);
    table.string('description');
    table.integer('manufacturer_id').references('id').inTable('manufacturer');
    table.integer('supplier_id').references('id').inTable('supplier');
    table.integer('parent_id').references('id').inTable('catalog');
  }, {
    manufacturer: function() {
      return this.belongsTo('manufacturer', 'manufacturer_id');
    },
    supplier: function() {
      return this.belongsTo('supplier', 'supplier_id');
    },
    parent: function() {
      return this.belongsTo('catalog', 'parent_id');
    },
    groups: function() {
      return this.belongsToMany('group', 'catalogGroup', 'catalog_id', 'group_id');
    }
  }, ['manufacturer', 'supplier']);

  define('catalogGroup', function(table) {
    table.integer('catalog_id').notNullable().references('id').inTable('catalog');
    table.integer('group_id').notNullable().references('id').inTable('group');
    table.primary(['group_id', 'catalog_id']);
  }, {}, ['catalog', 'group']);

  return Promise.props(migrations).return(models);
};
