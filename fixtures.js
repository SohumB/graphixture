var Bluebird = require( 'bluebird' );
var _ = require( 'lodash' );

/**
 * Adapters for different ORMs
 * @interface
 * @template Model
 */
exports.Adapter = function Adapter() {};

/**
 * Adapter function to retrieve a name -> model mapping
 * @param {Model} model - The model to retrieve associations for
 * @return {function(string): Model.Association} An object mapping potential names used in fixtures to associations
 */
exports.Adapter.prototype.associations = function(model) {};

/**
 * Adapter function to destroy a table's data
 * @param {?} db - Database instance, for additional hackery if need be
 * @param {Model|Array.<Model>} model - The model to destroy the table for
 * @return {Promise} A promise just for success/failure
 */
exports.Adapter.prototype.truncate = function(db, model) {};

/**
 * Adapter function to begin a transaction on the current connection
 * @param {?} db - Database instance, for adapter-specific behaviour
 * @return {Promise} A promise just for success/failure
 */
exports.Adapter.prototype.beginTransaction = function(db) {};

/**
 * Adapter function to rollback a transaction on the current connection
 * @param {?} db - Database instance, for adapter-specific behaviour
 * @return {Promise} A promise just for success/failure
 */
exports.Adapter.prototype.rollbackTransaction = function(db) {};

/**
 * Adapter function to create, touching the database, an instance
 * @param {?} db - Database instance, for additional hackery if need be
 * @param {Model} model - The model to create a row on
 * @param {Object} instance - The data to insert into the table
 * @param {Object.<string, Object>} assocs - The associations to add. Includes in-table belongsTo style associations.
 * @param {Object.<string, Promise.<!Model>>} incoming - Incoming already-created promises for instances
 * @return {Promise.<!Model>} a promise for an instance
 */
exports.Adapter.prototype.create = function(db, model, instance, assocs, incoming) {};

/**
 * @constructor
 * @template Model
 * @param {?} db - Database instance, for additional hackery if need be
 * @param {Object.<string, Model>} models
 * @param {Adapter.<Model>} adapter
 * @return {Fixtures.<Model>}
 */
exports.Fixtures = function Fixtures(db, models, adapter, options) {
  this.db = db;
  this.models = models;
  this.adapter = adapter;
  this.options = options || {};
  _.defaults(this.options, {
    clearStrategy: 'truncateIndividually'
  });
  return this;
};

/**
 * Build promise dependency graph with late binding
 * @param {Array.<{name: string, fn: function(Object.<string, A>):A, dependencies: Array.<string>, built: bool}>} tasks
 * @param {<Object.<string, !Model>>} [results] Optionally provide an object with the same
 * data structure as the return type of #load, allows the fixture graph to be added to.
 * @return {<Object.<string, Promise.<A>>}
 */
exports.buildGraph = function(tasks, results) {
  results = results || {};
  var undone = tasks.length;
  var lastUndone = undone;

  // essentially, we loop through the task list continuously,
  // looking for things whose dependency promises have been built
  // It will loop continuously on a circular graph. Don't do circular graphs!
  function buildTask(task) {
    // if we haven't built the task yet, and all its dependencies are ready
    if (!task.built && _.all(_.at(results, task.dependencies)))  {
      results[task.name] = task.fn(results);
      task.built = true;
      undone--;
    }
  }
  while (undone > 0) {
    _.each(tasks, buildTask);
    if (undone === lastUndone) {
      var unbuilt = _(tasks).filter(function(task) { return !task.built; }).map('name').value();
      throw new Error('Unsatisfiable dependency in fixture graph ' +
          '(unresolved tasks: ' + unbuilt.join(', ') + ')');
    }
    lastUndone = undone;
  }

  return results;
};

/**
 * Load fixtures from a fixtures object
 * @param {Object.<string, Object.<string, Object.<string, ?>>>} fixtures
 * @param {<Object.<string, !Model>>} [results] Optionally provide an object with the same
 * data structure as the return type, allows the fixture graph to be added to.
 * @return {Promise.<Object.<string, !Model>>}
 */
exports.Fixtures.prototype.load = function loadFixtures(fixtures, results) {
  var delegateClone = function(obj) {
    if (obj && _.isFunction(obj.clone)) {
      return obj.clone();
    }
    return undefined;
  };

  var allDependencies = function(obj) {
    if (_.isString(obj)) { return obj; }
    if (_.isArray(obj)) { return _.flatten(_.map(obj, allDependencies)); }
    if (_.isPlainObject(obj)) { return allDependencies(_.values(obj)); }
    return [];
  };

  var tasks = [];
  var cloned = _.cloneDeep(fixtures, delegateClone);
  var self = this;

  _.forEach(cloned, function(rows, modelName) {
    var model = self.models[modelName];

    var modelAssociations = self.adapter.associations(model);

    _.forEach(rows, function(row, rowName) {
      var assocs = [];

      // This is one specific row, on the Model table
      /** @type Object.<string, ?> **/
      var data = _.cloneDeep(row, delegateClone);

      // Find any fields that need to be set via associations
      // Remove them from the data we create, so as to not try to set them directly
      _.forEach(data, function(fieldData, fieldName) {
        var assocObj = modelAssociations(fieldName);
        if (assocObj) {
          assocs.push({
            isMulti: _.isArray(fieldData),
            association: assocObj,
            dependencies: allDependencies(fieldData),
            data: fieldData,
            name: fieldName
          });
          delete data[fieldName];
        }
      });

      // Build our tasklist, for `buildGraph`
      tasks.push({
        name: rowName,
        fn: _.partial(self.adapter.create.bind(self.adapter), self.db, model, data, assocs),
        dependencies: _.flatten(_.map(assocs, 'dependencies')),
        built: false
      });
    });
  });

  return Bluebird.props(exports.buildGraph(tasks, results));
};

/**
 * Clear all tables in the list of models provided
 * Truncate tables individually, waiting on each return
 * @return {Promise}
 */
exports.Fixtures.prototype.truncateIndividually = function truncateIndividually() {
  var self = this;
  return Bluebird.reduce(_.values(self.models), function(accum, model) {
    return self.adapter.truncate(self.db, model);
  }, 0);
};

/**
 * Clear all tables in the list of models provided
 * Truncate all tables at once
 * @return {Promise}
 */
exports.Fixtures.prototype.truncateAll = function truncateAll() {
  return this.adapter.truncate(this.db, _.values(this.models));
};

/**
 * Use rollbacks for database clearing.
 * Assumes only one database connection
 * We don't track state, so every call of clear() just becomes a "rollback; begin;" call
 * So we ignore errors on the "rollback;" line, for the first time it's called
 * @return {Promise}
 */
exports.Fixtures.prototype.rollback = function rollback() {
  var self = this;
  var begin = function() { return self.adapter.beginTransaction(self.db); };

  return self.adapter.rollbackTransaction(self.db).then(begin, begin);
};

/**
 * Clear all tables in the list of models provided
 * Dispatches based on `this.options.clearStrategy`
 * @return {Promise}
 */
exports.Fixtures.prototype.clear = function clearFixtures() {
  return this[this.options.clearStrategy].call(this);
};

/**
 * Sequence calls to clear and load
 * @param {Object.<string, Object.<string, Object.<string, ?>>>} data
 * @param {<Object.<string, !Model>>} [results] Optionally provide an object with the same
 * data structure as the return type, allows the fixture graph to be added to.
 * @return {Promise.<Object.<string, !Model>>}
 */
exports.Fixtures.prototype.clearAndLoad = function clearAndLoadFixtures(data, results) {
  var self = this;
  return self.clear().then(function() {
    return self.load(data, results);
  });
};
