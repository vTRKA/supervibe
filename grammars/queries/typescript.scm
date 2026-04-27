; TypeScript / TSX symbol + edge queries.
; Captures: @symbol.<kind> for symbol declarations, @name for names,
;           @edge.<kind> for edges, @target for edge targets.

; Function declarations
(function_declaration
  name: (identifier) @name) @symbol.function

; Method definitions (in classes)
(method_definition
  name: (property_identifier) @name) @symbol.method

; Class declarations
(class_declaration
  name: (type_identifier) @name) @symbol.class

; Interface declarations
(interface_declaration
  name: (type_identifier) @name) @symbol.interface

; Type alias
(type_alias_declaration
  name: (type_identifier) @name) @symbol.type

; Enum
(enum_declaration
  name: (identifier) @name) @symbol.enum

; Calls
(call_expression
  function: (identifier) @target) @edge.calls

(call_expression
  function: (member_expression
    property: (property_identifier) @target)) @edge.calls

; Imports
(import_statement
  source: (string (string_fragment) @target)) @edge.imports

; Class extends
(class_declaration
  (class_heritage
    (extends_clause
      value: (identifier) @target))) @edge.extends

; Class implements (interface)
(class_declaration
  (class_heritage
    (implements_clause
      (type_identifier) @target))) @edge.implements
