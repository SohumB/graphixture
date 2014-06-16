var Fixtures = require('./fixtures');
var _ = require('lodash');
var Promise = require('bluebird');
var util = require('util');

/**
 * @constructor
 * @implements {Fixtures.Adapter}
 */
var adapter = {};

/**
 * @param {Bookshelf.Model} model
 * @return {function(string): Bookshelf.Model}
 */
adapter.associations = function(model) {
  return function(name) {
    if (_.isFunction(model.prototype[name])) {
      var result = model.forge({})[name]();
      if (result.relatedData) { return result.relatedData; }
    }
    return undefined;
  };
};

/**
 * @param {Bookshelf} db
 * @param {Bookshelf.Model} model
 * @return {Promise}
 */
adapter.truncate = function(db, model) {
  // minor hack warning, warning
  var client = db.knex.client;
  var unwrapped = model.prototype.tableName;

  var wrap;
  if (client.grammar) { // old version of knex
    wrap = client.grammar.wrapTable.bind(client.grammar);
  } else {
    var fmt = new client.Formatter();
    wrap = fmt.wrap.bind(fmt);
  }

  return db.knex.raw(util.format('truncate %s cascade', wrap(unwrapped)));
};


/**
 * @param {Bookshelf} db
 * @param {Bookshelf.Model} model
 * @param {Object} instance
 * @param {Object.<string, Object>} assocs
 * @param {Object.<string, Promise.<!Bookshelf.Model>>} incoming
 * @return {Promise.<!Bookshelf.Model>}
 */
adapter.create = function(db, model, data, assocs, incoming) {
  var base = model.forge(data);
  var deps = _.map(assocs, function(assoc) {
    var linked = assoc.isMulti ? Promise.all(_.at(incoming, assoc.dependencies)) : incoming[assoc.dependencies];
    return linked.then(function(linkedObjs) {
      switch (assoc.association.type) {
        case 'belongsTo':
          var toSet = {};
          toSet[assoc.association.foreignKey] = linkedObjs.id;
          base.set(toSet);
          return undefined;
          break;
        case 'belongsToMany':
          return function(saved) { return saved.related(assoc.name).attach(linkedObjs); };
          break;
        case 'hasMany':
        case 'hasOne':
          // untested
          return function(saved) { return saved.related(assoc.name).set(linkedObjs); };
        break;
        default:
          var msg = 'bookshelf.adapter does not know how to associate a ' + assoc.association.type + ' relation';
          return Promise.reject(new Error(msg));
      }
    });
  });
  return Promise.all(deps).bind({}).then(function(depArr) {
    this.asyncDeps = _.compact(depArr);
    return base.save({}, { method: 'insert' });
  }).then(function(saved) {
    return Promise.map(this.asyncDeps, function(fn) { return fn(saved); });
  }).return(base);
};

module.exports = adapter;
