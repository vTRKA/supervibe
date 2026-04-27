; Go symbol + edge queries.

(function_declaration
  name: (identifier) @name) @symbol.function

(method_declaration
  name: (field_identifier) @name) @symbol.method

(type_declaration
  (type_spec
    name: (type_identifier) @name
    type: (struct_type))) @symbol.class

(type_declaration
  (type_spec
    name: (type_identifier) @name
    type: (interface_type))) @symbol.interface

; Calls
(call_expression
  function: (identifier) @target) @edge.calls

(call_expression
  function: (selector_expression
    field: (field_identifier) @target)) @edge.calls

; Imports
(import_spec
  path: (interpreted_string_literal) @target) @edge.imports
