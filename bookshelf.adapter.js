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
 * @param {Bookshelf.Model} Model
 * @return {function(string): Bookshelf.Model}
 */
adapter.associations = function(Model) {
  return function(name) {
    if (_.isFunction(Model.prototype[name])) {
      var result = Model.forge({})[name]();
      if (result.relatedData) { return result.relatedData; }
    }
    return undefined;
  };
};

function getWrap(db) {
  // minor hack warning, warning
  var client = db.knex.client;

  if (client.grammar) { // old version of knex
    return client.grammar.wrapTable.bind(client.grammar);
  } else {
    var fmt = new client.Formatter();
    return fmt.wrap.bind(fmt);
  }
}

/**
 * @param {Bookshelf} db
 * @param {Bookshelf.Model|Array.<Bookshelf.Model>} model
 * @return {Promise}
 */
adapter.truncate = function(db, model) {
  var wrap = getWrap(db);
  var getTables = function(model) { return model.prototype.underlyingTables ||
                             [model.prototype.tableName]; };
  var process = function(name) { return wrap(name); };

  model = _.isArray(model) ? model : [model];
  var tableNames = _(model).map(getTables).flatten().map(process).value();

  return db.knex.raw(util.format('truncate %s cascade', tableNames.join(", ")));
};

/**
 * @param {Bookshelf} db
 * @return {Promise}
 */
adapter.beginTransaction = function(db) {
  return db.knex.raw('begin;');
};

/**
 * @param {Bookshelf} db
 * @return {Promise}
 */
adapter.rollbackTransaction = function(db) {
  return db.knex.raw('rollback;');
};


function extractId(thing) {
  if (thing && _.isFunction(thing.get) && thing.get('id')) { return thing.get('id'); }
  if (thing && thing.id) { return thing.id; }
  return thing;
};

function deepReplace(replaceWith) {
  return function(thing) {
    if (_.isString(thing) && replaceWith[thing]) { return extractId(replaceWith[thing]); }
    if (_.isArray(thing)) { return _.map(thing, deepReplace(replaceWith)); }
    if (_.isPlainObject(thing)) { return _.mapValues(thing, deepReplace(replaceWith)); }
    return thing;
  };
}

/**
 * @param {Bookshelf} db
 * @param {Bookshelf.Model} Model
 * @param {Object} instance
 * @param {Object.<string, Object>} assocs
 * @param {Object.<string, Promise.<!Bookshelf.Model>>} incoming
 * @return {Promise.<!Bookshelf.Model>}
 */
adapter.create = function(db, Model, data, assocs, incoming) {
  var base = Model.forge(data);
  var deps = _.compact(_.map(assocs, function(assoc) {
    var depPromises = _.pick(incoming, assoc.dependencies);
    if (_.isEmpty(depPromises)) { return undefined; }
    return Promise.props(_.pick(incoming, assoc.dependencies)).then(function(linked) {
      switch (assoc.association.type) {
        case 'belongsTo':
          var toSet = {};
          toSet[assoc.association.foreignKey] = extractId(linked[assoc.dependencies]);
          base.set(toSet);
          return undefined;
        case 'belongsToMany':
          return function(saved) {
            var toAttach = _.map(assoc.data, deepReplace(linked));
            return saved.related(assoc.name).attach(toAttach);
          };
        case 'hasMany':
        case 'hasOne':
          // untested
          return function(saved) { return saved.related(assoc.name)
                            .set(_.pick(linked, assoc.dependencies)); };
        default:
          var msg = 'bookshelf.adapter does not know how to associate a '
              + assoc.association.type + ' relation';
          return Promise.reject(new Error(msg));
      }
    });
  }));
  return Promise.all(deps).bind({}).then(function(depArr) {
    this.asyncDeps = _.compact(depArr);
    return base.save({}, { method: 'insert' });
  }).then(function(saved) {
    return Promise.map(this.asyncDeps, function(fn) { return fn(saved); });
  }).return(base);
};

module.exports = adapter;
