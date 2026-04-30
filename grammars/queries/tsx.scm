; TSX symbol + edge queries.
; Extends TypeScript with JSX component references.

; Function declarations
(function_declaration
  name: (identifier) @name) @symbol.function

; Const/let arrow functions and hooks/components:
;   const useUserQuery = (...) => {...}
;   export const IdeasPage: FC = () => {...}
(variable_declarator
  name: (identifier) @name
  value: (arrow_function)) @symbol.function

; Function expressions assigned to variables:
;   const handler = function (...) {...}
(variable_declarator
  name: (identifier) @name
  value: (function_expression)) @symbol.function

; Function wrappers such as memo/forwardRef/debounce:
;   const Component = memo(() => {...})
;   const handler = debounce(function () {...})
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

; Class-field methods:
;   loadUser = async () => {...}
(public_field_definition
  name: (property_identifier) @name
  value: [(arrow_function) (function_expression)]) @symbol.field_function

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

; JSX component references
(jsx_self_closing_element
  name: (identifier) @target) @edge.jsx_reference

(jsx_opening_element
  name: (identifier) @target) @edge.jsx_reference

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
