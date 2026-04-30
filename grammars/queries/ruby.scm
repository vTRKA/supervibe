; Ruby symbol + edge queries.

(method
  name: (identifier) @name) @symbol.method

(singleton_method
  name: (identifier) @name) @symbol.method

(class
  name: (constant) @name) @symbol.class

(class
  superclass: (superclass (constant) @target)) @edge.extends

(module
  name: (constant) @name) @symbol.class

; Calls
(call
  method: (identifier) @target) @edge.calls
