// Fallback debug module for when the main debug package fails
module.exports = function(namespace) {
  return function() {
    // Simple fallback debug function that does nothing in production
    if (process.env.NODE_ENV !== 'production') {
      console.log.apply(console, [namespace, ...arguments]);
    }
  };
};

module.exports.enable = function() {};
module.exports.disable = function() {};
module.exports.enabled = function() { return false; };
module.exports.log = console.log.bind(console); 