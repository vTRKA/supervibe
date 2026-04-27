; Python symbol + edge queries.

(function_definition
  name: (identifier) @name) @symbol.function

(class_definition
  name: (identifier) @name) @symbol.class

; Calls
(call
  function: (identifier) @target) @edge.calls

(call
  function: (attribute
    attribute: (identifier) @target)) @edge.calls

; Imports
(import_statement
  name: (dotted_name) @target) @edge.imports

(import_from_statement
  module_name: (dotted_name) @target) @edge.imports

; Inheritance
(class_definition
  superclasses: (argument_list
    (identifier) @target)) @edge.extends
