; Rust symbol + edge queries.

(function_item
  name: (identifier) @name) @symbol.function

(struct_item
  name: (type_identifier) @name) @symbol.class

(enum_item
  name: (type_identifier) @name) @symbol.enum

(trait_item
  name: (type_identifier) @name) @symbol.interface

; Calls
(call_expression
  function: (identifier) @target) @edge.calls

(call_expression
  function: (field_expression
    field: (field_identifier) @target)) @edge.calls

(call_expression
  function: (scoped_identifier
    name: (identifier) @target)) @edge.calls

; Imports
(use_declaration
  argument: (scoped_identifier) @target) @edge.imports

(use_declaration
  argument: (identifier) @target) @edge.imports
