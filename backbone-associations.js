//
// Backbone-associations.js 0.3.0
//
// (c) 2012 Dhruva Ray, Jaynti Kanani
// Backbone-associations may be freely distributed under the MIT license;
// see the accompanying LICENSE.txt.
// Depends on [Backbone](https://github.com/documentcloud/backbone)
// and [Underscore](https://github.com/documentcloud/underscore/) as well.
// A complete [Test & Benchmark Suite](../test/test-suite.html) is included for your perusal.

// Initial Setup
// --------------
(function () {
    "use strict";

    // The top-level namespace. All public Backbone classes and modules will be attached to this.
    // Exported for the browser and CommonJS.
    var _, Backbone, BackboneModel, defaultEvents, AssociatedModel;
    if (typeof require !== 'undefined') {
        _ = require('underscore');
        Backbone = require('backbone');
        exports = module.exports = Backbone;
    } else {
        _ = window._;
        Backbone = window.Backbone;
    }
    // Create local reference `Model` prototype.
    BackboneModel = Backbone.Model.prototype;
    // Built-in Backbone `events`.
    defaultEvents = ["change", "add", "remove", "reset", "destroy", "sync", "error", "sort", "request"];

    // Backbone.AssociatedModel
    // --------------

    //Add `Many` and `One` relations to Backbone Object.
    Backbone.Many = "Many";
    Backbone.One = "One";
    // Define `AssociatedModel` (Extends Backbone.Model).
    AssociatedModel = Backbone.AssociatedModel = Backbone.Model.extend({
        // Define relations with Associated Model.
        relations:undefined,
        // Define `Model` property which can keep track of already fired `events`,
        // and prevent redundant event to be triggered in case of circular model graph.
        _proxyCalls:undefined,

         // Get the value of an attribute.
        get: function(attr){
            return this.getAttr.apply(this, arguments);
        },

        // Set a hash of model attributes on the object,
        // fire Backbone `event` with options.
        // It maintains relations between models during the set operation.
        // It also bubbles up child events to the parent.
        set:function (key, value, options) {
            var attributes, processedRelations, tbp, attr;
            // Duplicate backbone's behavior to allow separate key/value parameters,
            // instead of a single 'attributes' object.
            if (_.isObject(key) || key == null) {
                attributes = key;
                options = value;
            } else {
                attributes = {};
                attributes[key] = value;
            }
            // Extract attributes and options.
            options || (options = {});
            if (!attributes) return this;
            if (options.unset) for (attr in attributes) attributes[attr] = void 0;

            if (this.relations) {
                // Iterate over `this.relations` and `set` model and collection values
                // if `relations` are available.
                _.each(this.relations, function (relation) {
                    var relationKey = relation.key, relatedModel = relation.relatedModel,
                        collectionType = relation.collectionType,
                        val, relationOptions, data;
                    if (attributes[relationKey]) {
                        //Get value of attribute with relation key in `val`.
                        val = _.result(attributes, relationKey);
                        // Get class if relation is stored as a string.
                        relatedModel && _.isString(relatedModel) && (relatedModel = eval(relatedModel));
                        collectionType && _.isString(collectionType) && (collectionType = eval(collectionType));
                        // Merge in `options` specific to this relation.
                        relationOptions = relation.options ? _.extend({}, relation.options, options) : options;
                        // If `relation.type` is `Backbone.Many`,
                        // create `Backbone.Collection` with passed data and perform Backbone `set`.
                        if (relation.type === Backbone.Many) {
                            // `collectionType` of defined `relation` should be instance of `Backbone.Collection`.
                            if (collectionType && !collectionType.prototype instanceof Backbone.Collection) {
                                throw new Error('collectionType must inherit from Backbone.Collection');
                            }

                            if (val instanceof Backbone.Collection) {
                                BackboneModel.set.call(this, relationKey, val, relationOptions);
                            } else if (!this.attributes[relationKey]) {
                                // If `attributes` has no property present,
                                // create `Collection` having `relation.collectionType` as type and
                                // `relation.Model` as model reference, and perform Backbone `set`.
                                data = collectionType ? new collectionType() : this._createCollection(relatedModel);
                                data.add(val, relationOptions);
                                BackboneModel.set.call(this, relationKey, data, relationOptions);
                            } else {
                                this.attributes[relationKey].reset(val, relationOptions);
                            }

                        } else if (relation.type === Backbone.One && relatedModel) {
                            // If passed data is not instance of `Backbone.AssociatedModel`,
                            // create `AssociatedModel` and perform backbone `set`.
                            data = val instanceof AssociatedModel ? val : new relatedModel(val);
                            BackboneModel.set.call(this, relationKey, data, relationOptions)
                        }

                        // Add proxy events to respective parents.
                        // Only add callback if not defined.
                        if (!this.attributes[relationKey]._proxyCallback) {
                            this.attributes[relationKey]._proxyCallback = function () {
                                var args = arguments,
                                    opt = args[0].split(":"),
                                    eventType = opt[0],
                                    eventObject = args[1],
                                    indexEventObject = -1,
                                    _proxyCalls = this.attributes[relationKey]._proxyCalls,
                                    eventPath,
                                    eventAvailable;

                                // Change the event name to a fully qualified path.
                                if (_.contains(defaultEvents, eventType)) {
                                    if (opt && _.size(opt) > 1) {
                                        eventPath = opt[1];
                                    }
                                    // Find the specific object in the collection which has changed.
                                    if (this.attributes[relationKey] instanceof Backbone.Collection && "change" === eventType) {
                                        indexEventObject = _.indexOf(this.attributes[relationKey].models, eventObject);
                                    }
                                    // Manipulate `eventPath`.
                                    eventPath = relationKey + (indexEventObject !== -1 ?
                                        "[" + indexEventObject + "]" : "") + (eventPath ? "." + eventPath : "");
                                    args[0] = eventType + ":" + eventPath;

                                    if (_proxyCalls) {
                                        // If event has been already triggered as result of same source `eventPath`,
                                        // no need to re-trigger event to prevent cycle.
                                        eventAvailable = _.find(_proxyCalls, function (value, eventKey) {
                                            // `event` ends with eventKey.
                                            var d = eventPath.length - eventKey.length;
                                            return eventPath.indexOf(eventKey, d) !== -1;
                                        });
                                        if (eventAvailable) {
                                            return this;
                                        }
                                    } else {
                                        _proxyCalls = this.attributes[relationKey]._proxyCalls = {};
                                    }
                                    // Add `eventPath` in `_proxyCalls` to keep track of already triggered `event`.
                                    _proxyCalls[eventPath] = true;
                                }

                                // Bubble up event to parent `model` with new changed arguments.
                                this.trigger.apply(this, args);

                                // Remove `eventPath` from `_proxyCalls`,
                                // if `eventPath` and `_proxCalls` are available,
                                // which allow event to be triggered on for next operation of `set`.
                                if (eventPath && _proxyCalls) {
                                    delete _proxyCalls[eventPath];
                                }
                                return this;
                            };
                            this.attributes[relationKey].on("all", this.attributes[relationKey]._proxyCallback, this);
                        }

                        // Create a local `processedRelations` array to store the relation key which has been processed.
                        // We cannot use `this.relations` because if there is no value defined for `relationKey`,
                        // it will not get processed by either `BackboneModel` `set` or the `AssociatedModel` `set`.
                        !processedRelations && (processedRelations = []);
                        if (_.indexOf(processedRelations, relationKey) === -1) {
                            processedRelations.push(relationKey);
                        }
                    }
                }, this);
            }
            if (processedRelations) {
                // Find attributes yet to be processed - `tbp`.
                tbp = {};
                for (attr in attributes) {
                    if (_.indexOf(processedRelations, attr) === -1) {
                        tbp[attr] = attributes[attr];
                    }
                }
            } else {
                // Set all `attributes` to `tbp`.
                tbp = attributes;
            }
            // Return results for `BackboneModel.set`.
            return BackboneModel.set.call(this, tbp, options);
        },
        // Returns New `collection` of type `relation.relatedModel`.
        _createCollection:function (type) {
            var collection, relatedModel = type;
            _.isString(relatedModel) && (relatedModel = eval(relatedModel));
            // Creates new `Backbone.Collection` and defines model class.
            if (relatedModel && relatedModel.prototype instanceof AssociatedModel) {
                collection = new Backbone.Collection();
                collection.model = relatedModel;
            } else {
                throw new Error('type must inherit from Backbone.AssociatedModel');
            }
            return collection;
        },
        // Has the model changed. Traverse the object hierarchy to compute dirtyness.
        hasChanged:function (attr) {
            var isDirty, relation, attrValue, i, dirtyObjects;
            // To prevent cycles, check if this node is visited.
            if (!this.visitedHC) {
                this.visitedHC = true;
                isDirty = BackboneModel.hasChanged.apply(this, arguments);
                if (!isDirty && this.relations) {
                    // Go down the hierarchy to see if anything has `changed`.
                    for (i = 0; i < this.relations.length; ++i) {
                        relation = this.relations[i];
                        attrValue = this.attributes[relation.key];
                        if (attrValue) {
                            if (attrValue instanceof Backbone.Collection) {
                                dirtyObjects = attrValue.filter(function (m) {
                                    return m.hasChanged() === true;
                                });
                                _.size(dirtyObjects) > 0 && (isDirty = true);
                            } else {
                                isDirty = attrValue.hasChanged && attrValue.hasChanged();
                            }
                            if (isDirty) {
                                break;
                            }
                        }
                    }
                }
                delete this.visitedHC;
            }
            return !!isDirty;
        },
        // Returns a hash of the changed attributes.
        changedAttributes:function (diff) {
            var delta, relation, attrValue, changedCollection, i;
            // To prevent cycles, check if this node is visited.
            if (!this.visited) {
                this.visited = true;
                delta = BackboneModel.changedAttributes.apply(this, arguments);
                if (this.relations) {
                    for (i = 0; i < this.relations.length; ++i) {
                        relation = this.relations[i];
                        attrValue = this.attributes[relation.key];
                        if (attrValue) {
                            if (attrValue instanceof Backbone.Collection) {
                                changedCollection = _.filter(attrValue.map(function (m) {
                                    return m.changedAttributes();
                                }), function (m) {
                                    return !!m;
                                });
                                if (_.size(changedCollection) > 0) {
                                    delta[relation.key] = changedCollection;
                                }
                            } else if (attrValue instanceof AssociatedModel && attrValue.hasChanged()) {
                                delta[relation.key] = attrValue.toJSON();
                            }
                        }
                    }
                }
                delete this.visited;
            }
            return !delta ? false : delta;
        },
        // Returns the hash of the previous attributes of the graph.
        previousAttributes:function () {
            var pa, attrValue, pattrValue, pattrJSON;
            // To prevent cycles, check if this node is visited.
            if (!this.visited) {
                this.visited = true;
                pa = BackboneModel.previousAttributes.apply(this, arguments);
                if (this.relations) {
                    _.each(this.relations, function (relation) {
                        attrValue = this.attributes[relation.key];
                        pattrValue = pa[relation.key];
                        pattrJSON = pattrValue ? pattrValue.toJSON() : undefined;
                        if (pattrValue && pattrValue == attrValue) {
                            if (attrValue instanceof AssociatedModel) {
                                pa[relation.key] = attrValue.previousAttributes();
                            } else if (attrValue instanceof Backbone.Collection) {
                                pa[relation.key] = attrValue.map(function (m) {
                                    return m.previousAttributes();
                                });
                            }
                        } else {
                            if (pattrValue)
                                pa[relation.key] = pattrJSON;
                        }
                    }, this);
                }
                delete this.visited;
            }
            return pa;
        },
        // Return the previous value of the passed in attribute.
        previous:function (attr) {
            return this.previousAttributes()[attr];
        },
        // The JSON representation of the model.
        toJSON:function (options) {
            var json, aJson;
            if (!this.visited) {
                this.visited = true;
                // Get json representation from `BackboneModel.toJSON`.
                json = BackboneModel.toJSON.apply(this, arguments);
                // If `this.relations` is defined, iterate through each `relation`
                // and added it's json representation to parents' json representation.
                if (this.relations) {
                    _.each(this.relations, function (relation) {
                        var attr = this.attributes[relation.key];
                        if (attr) {
                            aJson = attr.toJSON(options);
                            json[relation.key] = _.isArray(aJson) ? _.compact(aJson) : aJson;
                        }
                    }, this);
                }
                delete this.visited;
            }
            return json;
        },
        // Deep `clone` the model.
        clone:function () {
            var cloneObj, newCollection;
            if (!this.visited) {
                this.visited = true;
                // Get shallow clone from `BackboneModel.clone`.
                cloneObj = BackboneModel.clone.apply(this, arguments);
                // If `this.relations` is defined, iterate through each `relation` and `clone`.
                if (this.relations) {
                    _.each(this.relations, function (relation) {
                        if (this.attributes[relation.key]) {
                            var sourceObj = cloneObj.attributes[relation.key];
                            if (sourceObj instanceof Backbone.Collection) {
                                // Creates new `collection` using `relation`.
                                newCollection = relation.collectionType ? new relation.collectionType() :
                                    this._createCollection(relation.relatedModel);
                                // Added each `clone` model to `newCollection`.
                                sourceObj.each(function (model) {
                                    var mClone = model.clone();
                                    mClone && newCollection.add(mClone);
                                });
                                cloneObj.attributes[relation.key] = newCollection;
                            } else if (sourceObj instanceof Backbone.Model) {
                                cloneObj.attributes[relation.key] = sourceObj.clone();
                            }
                        }
                    }, this);
                }
                delete this.visited;
            }
            return cloneObj;
        },

        // Get the value of an attribute with `path`.
        getAttr: function (path, iterator) {
            var result = this,
                attrs = getPathArray(path),
                key,
                i;
            iterator || (iterator = function (memo, key) {
                return memo instanceof Backbone.Collection && _.isNumber(key) ? memo.at(key) : memo.attributes[key];
            });
            for (i = 0; i < attrs.length; i++) {
                key = attrs[i];
                if (!result) break;
                result = iterator.call(this, result, key, attrs);
            }
            return result;
        }
    });

    // Get Path `attrs` as Array
    // Example:
    //  'employee.works_for.locations[2].name' -> ['employee', 'works_for', 'locations', 2, 'name']
    var getPathArray = function (path, iterator, context) {
        if (_.isString(path)) {
            iterator || (iterator = function (value) {
                return value.match(/^\d+$/) ? parseInt(value, 10) : value;
            });
            return _.map(path.match(/[^\.\[\]]+/g) || [], iterator, context);
        }
        return path || [];
    }
})();