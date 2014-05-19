module.exports = function(sequelize, DataTypes) {
  var fields = { name: DataTypes.STRING };
  var options = { timestamps: false, underscored: true };
  var models = {};

  function define(name, schema, options) {
    var model = sequelize.define(name, schema, options);
    models[name] = model;
  }

  define('Catalog', {
    name: { type: DataTypes.STRING, allowNull: false },
    description: { type: DataTypes.STRING, allowNull: true }
  }, options);

  define('Manufacturer', fields, options);
  define('Group', fields, options);
  define('Supplier', fields, options);
  define('CatalogItemsGroups', {}, options);

  models.Catalog.belongsTo(models.Supplier,
                           { foreignKey: 'supplier_id', as: 'supplier' });
  models.Catalog.belongsTo(models.Manufacturer,
                           { foreignKey: 'manufacturer_id', as: 'manufacturer' });
  models.Catalog.belongsTo(models.Catalog,
                           { foreignKey: 'parent_id', as: 'parent' });
  models.Catalog.hasMany(models.Catalog,
                         { foreignKey: 'parent_id', as: 'children', through: null });
  models.Catalog.hasMany(models.Group,
                         { through: models.CatalogItemsGroups, as: 'groups' });
  models.Group.hasMany(models.Catalog,
                       { through: models.CatalogItemsGroups, as: 'catalog' });

  return models;
};
