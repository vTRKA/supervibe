; JavaScript symbol + edge queries (subset of TypeScript — no interfaces/types/enums).

(function_declaration
  name: (identifier) @name) @symbol.function

(method_definition
  name: (property_identifier) @name) @symbol.method

(class_declaration
  name: (identifier) @name) @symbol.class

(call_expression
  function: (identifier) @target) @edge.calls

(call_expression
  function: (member_expression
    property: (property_identifier) @target)) @edge.calls

(import_statement
  source: (string (string_fragment) @target)) @edge.imports

(class_declaration
  (class_heritage
    (identifier) @target)) @edge.extends
