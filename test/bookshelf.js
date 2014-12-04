var _ = require('lodash');
var Bluebird = require('bluebird');
var util = require('util');

var helpers = require('./helpers');
var adapter = require('../bookshelf.adapter.js');

var bk = helpers.bookshelf;
var data = helpers.data;

var Fixtures = require('../fixtures').Fixtures;

describe('Bookshelf tests', function() {
  beforeEach(function() {
    return bk.setup().tap(function() {
      bk.Fixtures = new Fixtures(bk.db, bk.models, adapter);
      return bk.Fixtures;
    });
  });

  it('#load should load fixtures', function() {
    var ret = bk.Fixtures.load(data.fixtures)
                         .then(_.partialRight(_.mapValues, function(obj) { return obj.toJSON(); }));

    return ret.should.eventually.deep.equal(data.jsoned.bookshelf);
  });

  it('#clear should clear the database', function() {
    var firstCount = bk.Fixtures.load(data.fixtures).then(function() {
      return bk.db.knex('catalogGroup').count('*');
    });
    var secondCount = firstCount.then(function() {
      return bk.Fixtures.clear();
    }).then(function() {
      return bk.db.knex('catalogGroup').count('*');
    });

    return Bluebird.all([
      firstCount.should.eventually.deep.equal([ { count: '2' } ]),
      secondCount.should.eventually.deep.equal([ { count: '0' } ])
    ]);
  });

});
