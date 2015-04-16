var Adapter = require('./graphixture').Adapter;
var _ = require('lodash');
var Promise = require('bluebird');

/**
 * @constructor
 * @implements {Adapter}
 */
var adapter = {};

/**
 * @param {Sequelize.Model} model
 * @return {function(string): Sequelize.Model}
 */
adapter.associations = function(model) {
  var hash = _.reduce(model.associations, function(result, value, key) {
    result[key] = value;
    result[value.as] = value;
    return result;
  }, {});
  return function(name) {
    return _.has(hash, name) ? hash[name] : undefined;
  };
};

/**
 * @param {Sequelize} db
 * @param {Sequelize.Model} model
 * @return {Promise}
 */
adapter.truncate = function(db, model) {
  // major hack warning, warning
  var quote = db.options.dialect === 'postgres' || db.options.dialect === 'sqlite' ? '"' : '`';
  var process = function(model) { return quote + model.tableName + quote; };

  var names = _.isArray(model) ? _.map(model, process).join(", ") : process(model);
  return Promise.cast(db.query('TRUNCATE ' + names + ' CASCADE;'));
  // this will hopefully become: return Promise.cast(model.destroy({}, { truncate: true, cascade: true }));
};

/**
 * @param {Sequelize} db
 * @return {Promise}
 */
adapter.beginTransaction = function(db) {
  return Promise.cast(db.query('BEGIN;'));
};

/**
 * @param {Sequelize} db
 * @return {Promise}
 */
adapter.rollbackTransaction = function(db) {
  return Promise.cast(db.query('ROLLBACK;'));
};


/**
 * @param {Sequelize} db
 * @param {Sequelize.Model} model
 * @param {Object} instance
 * @param {Object.<string, Object>} assocs
 * @param {Object.<string, Promise.<!Sequelize.Model>>} incoming

 * @return {Promise.<!Sequelize.Model>}
 */
adapter.create = function(db, model, data, assocs, incoming) {
  var base = Promise.cast(model.create(data));
  var deps = _.map(assocs, function(assoc) {
    var linked = assoc.isMulti ? Promise.all(_.at(incoming, assoc.dependencies)) : incoming[assoc.dependencies];
    return Promise.join(base, linked).spread(function(obj, linkedObjs) {
      return Promise.cast(obj[assoc.association.accessors.set].call(obj, linkedObjs));
    });
  });
  return Promise.all([base].concat(deps)).get('0');
};

module.exports = adapter;
