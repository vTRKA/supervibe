; PHP symbol + edge queries.

(function_definition
  name: (name) @name) @symbol.function

(method_declaration
  name: (name) @name) @symbol.method

(class_declaration
  name: (name) @name) @symbol.class

(interface_declaration
  name: (name) @name) @symbol.interface

(trait_declaration
  name: (name) @name) @symbol.interface

(enum_declaration
  name: (name) @name) @symbol.enum

; Calls
(function_call_expression
  function: (name) @target) @edge.calls

(member_call_expression
  name: (name) @target) @edge.calls

(scoped_call_expression
  name: (name) @target) @edge.calls

; Imports (use)
(namespace_use_declaration
  (namespace_use_clause
    (qualified_name) @target)) @edge.imports

; Inheritance
(base_clause
  (name) @target) @edge.extends

(class_interface_clause
  (name) @target) @edge.implements
