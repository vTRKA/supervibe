; JavaScript symbol + edge queries (subset of TypeScript — no interfaces/types/enums).

(function_declaration
  name: (identifier) @name) @symbol.function

(variable_declarator
  name: (identifier) @name
  value: (arrow_function)) @symbol.function

(variable_declarator
  name: (identifier) @name
  value: (function_expression)) @symbol.function

(variable_declarator
  name: (identifier) @name
  value: (call_expression
    arguments: (arguments
      [(arrow_function) (function_expression)]))) @symbol.wrapped_function

(variable_declarator
  name: (identifier) @name
  value: (call_expression
    arguments: (arguments
      (call_expression
        arguments: (arguments
          [(arrow_function) (function_expression)]))))) @symbol.wrapped_function

(field_definition
  property: (property_identifier) @name
  value: [(arrow_function) (function_expression)]) @symbol.field_function

(method_definition
  name: (property_identifier) @name) @symbol.method

(class_declaration
  name: (identifier) @name) @symbol.class

(call_expression
  function: (identifier) @target) @edge.calls

(call_expression
  function: (member_expression
    property: (property_identifier) @target)) @edge.calls

(jsx_self_closing_element
  name: (identifier) @target) @edge.jsx_reference

(jsx_opening_element
  name: (identifier) @target) @edge.jsx_reference

(import_statement
  source: (string (string_fragment) @target)) @edge.imports

(class_declaration
  (class_heritage
    (identifier) @target)) @edge.extends
