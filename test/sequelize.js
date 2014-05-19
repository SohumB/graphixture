var _ = require('lodash');
var Promise = require('bluebird');

var helpers = require('./helpers');
var adapter = require('../sequelize.adapter.js');

var sq = helpers.sequelize;
var data = helpers.data;

var Fixtures = require('../fixtures').Fixtures;

describe('Sequelize tests', function() {
  beforeEach(function() {
    return sq.setup().tap(function() {
      sq.Fixtures = new Fixtures(sq.db, sq.models, adapter);
      return sq.Fixtures;
    });
  });

  it('#load should load fixtures', function() {
    var ret = sq.Fixtures.load(data.fixtures)
                         .then(_.partialRight(_.mapValues, 'dataValues'));

    return ret.should.eventually.deep.equal(data.jsoned.sequelize);
  });

  it('#clear should clear the database', function() {
    var firstCount = sq.Fixtures.load(data.fixtures).then(function() {
      return sq.models.CatalogItemsGroups.count({});
    });
    var secondCount = firstCount.then(function() {
      return sq.Fixtures.clear();
    }).then(function() {
      return sq.models.CatalogItemsGroups.count({});
    });

    return Promise.all([
      firstCount.should.eventually.equal(2),
      secondCount.should.eventually.equal(0)
    ]);
  });

});
