## Usage

To use, you need an adapter. An adapter for [Bookshelf](http://bookshelfjs.org/) is provided, and a probably highly broken skeleton for a [Sequelize](http://sequelizejs.com) adapter is also in the repository.

    var adapter = require('graphixture/bookshelf.adapter');

Then, initialize the Fixtures object with a reference to Bookshelf, a list of models, and the adapter.

    var Bookshelf = require('bookshelf').DB;
    var Graphixture = require('graphixture').Graphixture;
    var fixtures = new Graphixture(Bookshelf, Bookshelf.models, adapter);

Now you can load a fixture graph that looks like this, assuming the relationships are correctly drawn up in your models:

    var data = {
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

Call the library like this (in a promise aware test-runner):

    before(function() {
      return fixtures.clearAndLoad(data);
    });

Or, in a callback-based test runner:

    before(function(done) {
      fixtures.clearAndLoad(data).nodeify(done);
    });

## TODO

* test bookshelf `hasOne` and `hasMany` relationships
* implement and test bookshelf `morph` relationships
* fix tests to support various async orders (i.e., sometimes, drink gets loaded with id 2, not id 1)
