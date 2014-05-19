var chai = require('chai');
var chaiAsPromised = require('chai-as-promised');

chai.use(chaiAsPromised);

global.should = chai.should();

require('config-node')({
  dir: 'test/config'
});
