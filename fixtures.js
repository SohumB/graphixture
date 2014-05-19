var Promise = require( 'bluebird' );
var _ = require( 'lodash' );

var exports;

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
 * @param {Model} model - The model to destroy the table for
 * @return {Promise} A promise just for success/failure
 */
exports.Adapter.prototype.truncate = function(db, model) {};

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
exports.Fixtures = function Fixtures(db, models, adapter) {
  this.db = db;
  this.models = models;
  this.adapter = adapter;
  return this;
};

/**
 * Build promise dependency graph with late binding
 * @param {Array.<{name: string, fn: function(Object.<string, A>):A, dependencies: Array.<string>, built: bool}>} tasks
 * @return {<Object.<string, Promise.<A>>}
 */
exports.buildGraph = function(tasks) {
  var results = {};
  var undone = tasks.length;

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
  }

  return results;
};

/**
 * Load fixtures from a fixtures object
 * @param {Object.<string, Object.<string, Object.<string, ?>>>} fixtures
 * @return {Promise.<Object.<string, !Model>>}
 */
exports.Fixtures.prototype.load = function loadFixtures(fixtures) {
  var tasks = [];
  var cloned = _.cloneDeep(fixtures);
  var self = this;

  _.forEach(cloned, function(rows, modelName) {
    var model = self.models[modelName];

    var modelAssociations = self.adapter.associations(model);

    _.forEach(rows, function(row, rowName) {
      var assocs = [];

      // This is one specific row, on the Model table
      /** @type Object.<string, ?> **/
      var data = _.cloneDeep(row);

      // Find any fields that need to be set via associations
      // Remove them from the data we create, so as to not try to set them directly
      _.forEach(data, function(fieldData, fieldName) {
        var assocObj = modelAssociations(fieldName);
        if (assocObj) {
          assocs.push({
            isMulti: _.isArray(fieldData),
            association: assocObj,
            dependencies: fieldData,
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

  return Promise.props(exports.buildGraph(tasks));
};

/**
 * Clear all tables in the list of models provided
 * @return {Promise}
 */
exports.Fixtures.prototype.clear = function clearFixtures() {
  var self = this;
  var tasks = _.map(self.models, function(model) {
    return self.adapter.truncate(self.db, model);
  });
  return Promise.all(tasks);
};

/**
 * Sequence calls to clear and load
 * @param {Object.<string, Object.<string, Object.<string, ?>>>} data
 * @return {Promise.<Object.<string, !Model>>}
 */
exports.Fixtures.prototype.clearAndLoad = function clearAndLoadFixtures(data) {
  var self = this;
  return self.clear().then(function() {
    return self.load(data);
  });
};

module.exports = exports;
